#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ensureDir, parseArgs, requireArg, run} from './lib.mjs';

const usage = `
Usage:
  npm run render:batch -- --clips-dir ./clips --out-dir ./captioned [options]

Options:
  --captions-dir DIR      Where caption JSON files live. Default: ./captions inside clips-dir parent.
  --auto-transcribe       Create missing caption JSON files with npm run transcribe.
  --vertical              Render 1080x1920.
  --position NAME         left-hook, right-hook, lower-left, center-bottom, center-impact.
  --style-config FILE     Caption style JSON. Default: ./caption-style.json if present.
  --combine-ms N          Caption grouping window.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const clipsDir = path.resolve(requireArg(args, 'clips-dir', usage));
const outDir = path.resolve(requireArg(args, 'out-dir', usage));
const captionsDir = path.resolve(
  args['captions-dir'] ??
    path.join(path.dirname(clipsDir), 'captions'),
);
const autoTranscribe = Boolean(args['auto-transcribe']);

ensureDir(outDir);
ensureDir(captionsDir);

const clips = fs
  .readdirSync(clipsDir)
  .filter((file) => /\.(mp4|mov|m4v|webm)$/i.test(file))
  .sort();

if (clips.length === 0) {
  throw new Error(`No videos found in ${clipsDir}`);
}

for (const clip of clips) {
  const videoPath = path.join(clipsDir, clip);
  const base = path.basename(clip, path.extname(clip));
  const captionsPath = path.join(captionsDir, `${base}.captions.json`);
  const outPath = path.join(outDir, `${base}.captioned.mp4`);

  if (!fs.existsSync(captionsPath)) {
    if (!autoTranscribe) {
      console.log(`Skipping ${clip}: missing ${captionsPath}`);
      continue;
    }

    run('npm', [
      'run',
      'transcribe',
      '--',
      '--video',
      videoPath,
      '--out',
      captionsPath,
    ]);
  }

  const renderArgs = [
    'run',
    'render:clip',
    '--',
    '--video',
    videoPath,
    '--captions',
    captionsPath,
    '--out',
    outPath,
  ];

  if (args.vertical) {
    renderArgs.push('--vertical');
  }
  if (args.position) {
    renderArgs.push('--position', String(args.position));
  }
  if (args['style-config']) {
    renderArgs.push('--style-config', String(args['style-config']));
  }
  if (args['combine-ms']) {
    renderArgs.push('--combine-ms', String(args['combine-ms']));
  }

  run('npm', renderArgs);
}
