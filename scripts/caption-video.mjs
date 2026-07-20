#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDir,
  loadEnv,
  parseArgs,
  outputsRoot,
  probeVideo,
  projectRoot,
  readCaptionStyleConfig,
  requireArg,
  run,
} from './lib.mjs';

const usage = `
Usage:
  npm run caption:auto -- --video /path/to/video.mp4

Options:
  --video FILE              Video to caption.
  --captions FILE           Existing captions JSON. If omitted, transcribes automatically.
  --out-dir DIR             Output root. Default: ./outputs
  --run-name NAME           Custom run folder name. Default: caption-run-YYYY-MM-DD-HHMMSS
  --style-config FILE       Caption style JSON. Default: ./caption-style.json
  --fps N                   Final render FPS. Default: source FPS.
  --width N                 Output width. Default: source width, or 1080 with --vertical.
  --height N                Output height. Default: source height, or 1920 with --vertical.
  --vertical                Render as 1080x1920 cropped fill.
  --vertical-contain        Render as 1080x1920 with full video visible and black bars.
  --fit cover|contain       Video fit. Default: style config, then cover.
  --position NAME           Caption position override.
  --transcription-prompt T  Prompt words for transcription accuracy.
  --no-render               Stop after captions are created.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

loadEnv();

const slugify = (value, fallback = 'video') => {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return slug || fallback;
};

const timestampSlug = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('-');
};

const sourceVideo = path.resolve(requireArg(args, 'video', usage));
if (!fs.existsSync(sourceVideo)) {
  throw new Error(`Video not found: ${sourceVideo}`);
}

const styleConfigPath = args['style-config']
  ? path.resolve(String(args['style-config']))
  : path.join(projectRoot, 'caption-style.json');
const styleConfig = readCaptionStyleConfig(styleConfigPath);
const metadata = probeVideo(sourceVideo);

const outRoot = path.resolve(String(args['out-dir'] ?? outputsRoot));
const runName = String(args['run-name'] ?? `caption-run-${timestampSlug()}`);
const runDir = path.join(outRoot, runName);
const assetsDir = path.join(runDir, 'assets');
const finalDir = path.join(runDir, 'final');
ensureDir(assetsDir);
ensureDir(finalDir);

const safeBase = slugify(path.basename(sourceVideo, path.extname(sourceVideo)));
const captionsPath = path.join(assetsDir, `${safeBase}.captions.json`);
const finalPath = path.join(finalDir, `${safeBase}.captioned.mp4`);
const manifestPath = path.join(runDir, 'manifest.json');

if (args.captions) {
  fs.copyFileSync(path.resolve(String(args.captions)), captionsPath);
} else {
  const transcriptionPrompt = String(args['transcription-prompt'] ?? '');
  const transcribeArgs = [
    'run',
    'transcribe',
    '--',
    '--video',
    sourceVideo,
    '--out',
    captionsPath,
  ];

  if (transcriptionPrompt) {
    transcribeArgs.push('--prompt', transcriptionPrompt);
  }

  run('npm', transcribeArgs);
}

if (!args['no-render']) {
  const vertical = Boolean(args.vertical);
  const verticalContain =
    Boolean(args['vertical-contain']) ||
    Boolean(styleConfig.verticalContain) ||
    String(styleConfig.outputAspect ?? '') === '9:16';
  const fps = Number(args.fps ?? metadata.fps ?? 30);
  const renderArgs = [
    'run',
    'render:clip',
    '--',
    '--video',
    sourceVideo,
    '--captions',
    captionsPath,
    '--out',
    finalPath,
    '--fps',
    String(fps),
    '--style-config',
    styleConfigPath,
  ];

  if (args.width) {
    renderArgs.push('--width', String(args.width));
  }
  if (args.height) {
    renderArgs.push('--height', String(args.height));
  }
  if (args.fit) {
    renderArgs.push('--fit', String(args.fit));
  }
  if (args.position) {
    renderArgs.push('--position', String(args.position));
  }
  if (vertical) {
    renderArgs.push('--vertical');
  }
  if (verticalContain) {
    renderArgs.push('--vertical-contain');
  }

  run('npm', renderArgs);
}

const manifest = {
  createdAt: new Date().toISOString(),
  mode: 'caption-auto',
  sourceVideo,
  runDir,
  assetsDir,
  finalDir,
  captionsPath,
  finalPath: fs.existsSync(finalPath) ? finalPath : null,
  config: {
    styleConfigPath,
    rendered: !args['no-render'],
  },
  metadata: {
    source: metadata,
    final: fs.existsSync(finalPath) ? probeVideo(finalPath) : null,
  },
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Done. Run folder: ${runDir}`);
if (manifest.finalPath) {
  console.log(`Final video: ${manifest.finalPath}`);
}
console.log(`Captions: ${captionsPath}`);
console.log(`Manifest: ${manifestPath}`);
