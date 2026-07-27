#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ensureDir, parseArgs, probeVideo, requireArg} from './lib.mjs';

const usage = `
Usage:
  npm run portrait:analyze -- --video input.mp4 --out framing.json [options]

Options:
  --auto                    Try the optional local YOLO/OpenCV detector.
  --center-x N              Manual subject center from 0 to 1. Default: 0.5.
  --model FILE              Local YOLO model for --auto. Default: models/yolov8n.pt.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const video = path.resolve(requireArg(args, 'video', usage));
const out = path.resolve(requireArg(args, 'out', usage));
const metadata = probeVideo(video);
const manualCenter = Number(args['center-x'] ?? 0.5);
if (!Number.isFinite(manualCenter) || manualCenter < 0 || manualCenter > 1) {
  throw new Error('--center-x must be a number between 0 and 1.');
}

const fallback = (source = 'fallback', reason = 'No subject detector was available.') => ({
  schemaVersion: 1,
  video,
  source,
  strategy: metadata.width / metadata.height > 1 ? 'track' : 'contain',
  confidence: source === 'manual' ? 1 : 0,
  reason,
  keyframes: [
    {at: 0, centerX: manualCenter, confidence: source === 'manual' ? 1 : 0},
    {at: 1, centerX: manualCenter, confidence: source === 'manual' ? 1 : 0},
  ],
});

let plan = args['center-x'] !== undefined ? fallback('manual', 'Manual subject center.') : null;
if (args.auto && metadata.width / metadata.height > 1) {
  const detector = spawnSync('python3', [
    path.join(path.dirname(new URL(import.meta.url).pathname), 'portrait-framing.py'),
    '--video', video,
    '--model', path.resolve(String(args.model ?? 'models/yolov8n.pt')),
  ], {encoding: 'utf8'});
  if (detector.status === 0) {
    try {
      plan = JSON.parse(detector.stdout);
      plan.video = video;
    } catch {
      plan = fallback('fallback', 'Detector returned invalid JSON.');
    }
  } else {
    plan = fallback('fallback', 'Optional YOLO/OpenCV detector unavailable; using center framing.');
  }
}
plan ??= fallback();
ensureDir(path.dirname(out));
fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ok: true, out, strategy: plan.strategy, source: plan.source, confidence: plan.confidence}));
