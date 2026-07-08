#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ensureDir, parseArgs, probeVideo, projectRoot} from './lib.mjs';
import {slugify, timestampSlug} from './clipkit-lib.mjs';

const usage = `
Usage:
  npm run video:split -- --video /path/to/video.mp4

Options:
  --video FILE             Local source video to split. Required.
  --out-dir DIR            Output root. Default: ./outputs
  --run-name NAME          Run folder name. Default: local-fixed-clips-run-YYYY-MM-DD-HH-MM-SS
  --segments-dir DIR       Exact folder to put fixed clips in. Default: run folder/fixed-clips/<video-slug>
  --segment-seconds N      Fixed segment length. Default: 15

What it does:
  1. Reads one local video file.
  2. Splits the full source into back-to-back fixed-length clips.
  3. Writes manifest.json plus segments.json for that source video.
  4. Stops. No transcription, AI selection, captions, B-roll, or rendering.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const uniqueDir = (parent, preferredName) => {
  let candidate = path.join(parent, preferredName);
  let suffix = 2;

  while (fs.existsSync(candidate)) {
    candidate = path.join(parent, `${preferredName}-${suffix}`);
    suffix += 1;
  }

  return candidate;
};

const listSegmentFiles = (dir) =>
  fs
    .readdirSync(dir, {withFileTypes: true})
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp4'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));

const sourceVideo = args.video ? path.resolve(String(args.video)) : null;
if (!sourceVideo) {
  throw new Error('Missing required option --video.\n' + usage);
}
if (!fs.existsSync(sourceVideo)) {
  throw new Error(`Video not found: ${sourceVideo}`);
}

const outRoot = path.resolve(String(args['out-dir'] ?? path.join(projectRoot, 'outputs')));
const runName = String(args['run-name'] ?? `local-fixed-clips-run-${timestampSlug()}`);
const runDir = uniqueDir(outRoot, runName);
const sourceSlug = slugify(path.basename(sourceVideo, path.extname(sourceVideo)));
const segmentsDir = path.resolve(
  String(args['segments-dir'] ?? path.join(runDir, 'fixed-clips', sourceSlug)),
);
const segmentSeconds = Number(args['segment-seconds'] ?? 15);

if (!Number.isFinite(segmentSeconds) || segmentSeconds <= 0) {
  throw new Error('--segment-seconds must be a positive number.');
}

ensureDir(outRoot);
ensureDir(runDir);
ensureDir(segmentsDir);

const metadata = probeVideo(sourceVideo);
const segmentRoundingSlackSeconds = 0.1;
const expectedSegments = Math.max(
  1,
  Math.ceil(Math.max(0, metadata.durationSeconds - segmentRoundingSlackSeconds) / segmentSeconds),
);
const pattern = path.join(segmentsDir, '%03d.mp4');

console.log(`Splitting ${sourceSlug} into ${expectedSegments} fixed clip(s)...`);

execFileSync(
  'ffmpeg',
  [
    '-y',
    '-i',
    sourceVideo,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-force_key_frames',
    `expr:gte(t,n_forced*${segmentSeconds})`,
    '-f',
    'segment',
    '-segment_time',
    String(segmentSeconds),
    '-reset_timestamps',
    '1',
    '-movflags',
    '+faststart',
    pattern,
  ],
  {stdio: 'ignore'},
);

const segmentFiles = listSegmentFiles(segmentsDir);
const segments = segmentFiles.map((name, segmentIndex) => {
  const startSeconds = segmentIndex * segmentSeconds;
  const endSeconds = Math.min(metadata.durationSeconds, startSeconds + segmentSeconds);
  return {
    index: segmentIndex + 1,
    fileName: name,
    filePath: path.join(segmentsDir, name),
    startSeconds,
    endSeconds,
    durationSeconds: Math.max(0, endSeconds - startSeconds),
  };
});

const segmentIndexPath = path.join(segmentsDir, 'segments.json');
const manifest = {
  createdAt: new Date().toISOString(),
  mode: 'split-local-video',
  sourceVideo,
  runDir,
  segmentsDir,
  slug: sourceSlug,
  durationSeconds: metadata.durationSeconds,
  segmentSeconds,
  expectedSegments,
  actualSegments: segments.length,
  segmentIndexPath,
  segments,
};

fs.writeFileSync(segmentIndexPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Done. Local fixed clips run: ${runDir}`);
console.log(`Segments: ${segmentsDir}`);
