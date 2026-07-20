#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureDir,
  parseArgs,
  probeVideo,
  projectRoot,
  readCaptionStyleConfig,
  readCaptions,
  requireArg,
  run,
  videoToSrc,
} from './lib.mjs';

const usage = `
Usage:
  npm run render:clip -- --video input.mp4 --captions captions.json --out output.mp4 [options]

Options:
  --width N               Output width. Default: source width, or 1080 with --vertical.
  --height N              Output height. Default: source height, or 1920 with --vertical.
  --fps N                 Output FPS. Default: source FPS.
  --vertical              Render as 1080x1920.
  --vertical-contain      Render as 1080x1920 and fit the full horizontal video with black bars.
  --foreground-video FILE Optional transparent foreground layer rendered above captions.
  --fit cover|contain     Video fit. Default: style config, then cover.
  --position NAME         left-hook, right-hook, lower-left, center-bottom, center-impact.
  --style-config FILE     Caption style JSON. Default: ./caption-style.json if present.
  --combine-ms N          Caption grouping window. Default: style config, then 420.
  --highlight-words CSV   Words that should render in the alternate emphasis font.
  --no-captions           Disable both the visible caption layer and the inverted caption effect layer.
  --text-opacity N        Caption fill opacity. Default: 0.92.
  --frames START-END      Optional Remotion frame range for proof renders.
  --uppercase             Render caption text uppercase.
`;

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const video = path.resolve(requireArg(args, 'video', usage));
const captionsPath = path.resolve(requireArg(args, 'captions', usage));
const out = path.resolve(requireArg(args, 'out', usage));
const foregroundVideo = args['foreground-video']
  ? path.resolve(String(args['foreground-video']))
  : null;

const metadata = probeVideo(video);
const fps = Number(args.fps ?? metadata.fps ?? 30);
const styleConfig = readCaptionStyleConfig(args['style-config']);
const verticalContain = Boolean(args['vertical-contain']) || Boolean(styleConfig.verticalContain);
const vertical =
  Boolean(args.vertical) ||
  verticalContain ||
  Boolean(styleConfig.vertical) ||
  String(styleConfig.outputAspect ?? '') === '9:16';
const width = Number(args.width ?? (vertical ? 1080 : metadata.width));
const height = Number(args.height ?? (vertical ? 1920 : metadata.height));
const fit = String(
  args.fit ?? (verticalContain ? 'contain' : styleConfig.fit ?? 'cover'),
);
const highlightedWords = args['highlight-words']
  ? String(args['highlight-words'])
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean)
  : Array.isArray(styleConfig.highlightedWords)
    ? styleConfig.highlightedWords
    : [];

const props = {
  videoSrc: videoToSrc(video),
  foregroundSrc: foregroundVideo ? videoToSrc(foregroundVideo) : null,
  captions: readCaptions(captionsPath),
  width,
  height,
  fps,
  durationInFrames: Math.max(1, Math.ceil(metadata.durationSeconds * fps)),
  style: {
    ...styleConfig,
    position: String(args.position ?? styleConfig.position ?? 'left-hook'),
    fit,
    combineTokensWithinMilliseconds: Number(
      args['combine-ms'] ?? styleConfig.combineTokensWithinMilliseconds ?? 420,
    ),
    textColor: String(args['text-color'] ?? styleConfig.textColor ?? '#ffffff'),
    textOpacity: Number(args['text-opacity'] ?? styleConfig.textOpacity ?? 0.92),
    shadowColor: String(args['shadow-color'] ?? styleConfig.shadowColor ?? 'rgba(0, 0, 0, 0.55)'),
    activeScale: Number(args['active-scale'] ?? styleConfig.activeScale ?? 1),
    inactiveScale: Number(args['inactive-scale'] ?? styleConfig.inactiveScale ?? 0.62),
    uppercase: args.uppercase ? true : Boolean(styleConfig.uppercase),
    highlightedWords,
    visibleTextLayerEnabled: args['no-captions']
      ? false
      : styleConfig.visibleTextLayerEnabled,
    effectLayerEnabled: args['no-captions'] ? false : styleConfig.effectLayerEnabled,
  },
};

ensureDir(path.dirname(out));

const propsPath = path.join(
  os.tmpdir(),
  `remotion-caption-props-${Date.now()}.json`,
);
fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));

const renderArgs = [
  'remotion',
  'render',
  'src/index.tsx',
  'CaptionedClip',
  out,
  `--props=${propsPath}`,
  '--codec=h264',
];

if (args.frames) {
  renderArgs.push(`--frames=${String(args.frames)}`);
}

try {
  run('npx', renderArgs);
} finally {
  fs.rmSync(propsPath, {force: true});
}
