#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ensureDir, parseArgs, probeVideo, requireArg} from './lib.mjs';

const usage = `
Usage:
  bun run portrait:analyze -- --video input.mp4 --out framing.json [options]

Options:
  --center-x N              Manual subject center from 0 to 1. Default: 0.5.
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

const fallback = (source = 'fallback', reason = 'Centered framing.') => ({
  schemaVersion: 1,
  generator: 'clipcaptionai/portrait-framing',
  generatorVersion: '1',
  createdAt: new Date().toISOString(),
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

if (args.auto || args.model)
  throw new Error('Automatic portrait detection is not supported; use --center-x.');
const plan =
  args['center-x'] !== undefined ? fallback('manual', 'Manual subject center.') : fallback();
const hasher = createHash('sha256');
for await (const chunk of fs.createReadStream(video)) hasher.update(chunk);
plan.inputSha256 = hasher.digest('hex');
ensureDir(path.dirname(out));
fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
console.log(
  JSON.stringify({
    ok: true,
    out,
    strategy: plan.strategy,
    source: plan.source,
    confidence: plan.confidence,
  }),
);
