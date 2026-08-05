#!/usr/bin/env node
/**
 * compress-video.mjs — Compress a video with minimal quality loss using CRF encoding.
 *
 * Usage:
 *   npm run compress:video -- --video "/path/to/video.mp4"
 *   npm run compress:video -- --video in.mp4 --quality high --codec h265
 *   npm run compress:video -- --video in.mp4 --quality medium --scale 1920 --audio-bitrate 128k
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  ensureDir,
  loadEnv,
  outputsRoot,
  parseArgs,
  probeVideo,
  requireArg,
  slugify,
} from './lib.mjs';

// ── Constants ────────────────────────────────────────────────────────────

const QUALITY_PRESETS = {
  lossless: {crf: 17, label: 'Visually lossless', description: 'Near-perfect quality, largest file'},
  high: {crf: 20, label: 'High quality', description: 'Excellent quality with meaningful compression'},
  medium: {crf: 23, label: 'Medium', description: 'Good balance of quality and file size'},
  aggressive: {crf: 28, label: 'Aggressive', description: 'Smaller file, minor quality loss noticeable on scrutiny'},
};

const CODECS = {
  h264: {
    encoder: 'libx264',
    label: 'H.264',
    description: 'Best compatibility, widely supported',
    defaultCRF: 23,
  },
  h265: {
    encoder: 'libx265',
    label: 'H.265 / HEVC',
    description: '~30-50% smaller files at equivalent quality, less universal support',
    defaultCRF: 28,
    extraArgs: ['-tag:v', 'hvc1'], // Apple/browser compatibility
  },
};

const ENCODER_PRESETS = ['veryfast', 'fast', 'medium', 'slow', 'veryslow'];

const COMPRESS_OUT_DIR = path.join(outputsRoot, 'compress');

const usage = `compress:video — Compress a video with minimal quality loss.

Usage:
  npm run compress:video -- --video <path> [options]

Required:
  --video <path>       Input video file to compress

Options:
  --quality <preset>   Quality preset (default: high)
                       Choices: lossless, high, medium, aggressive
                         lossless   — CRF 17, visually lossless
                         high       — CRF 20, excellent quality (default)
                         medium     — CRF 23, good balance
                         aggressive — CRF 28, smaller file, minor loss
  --codec <codec>      Video codec (default: h264)
                       Choices: h264, h265
  --preset <preset>    Encoder speed preset (default: medium)
                       Choices: veryfast, fast, medium, slow, veryslow
                       Slower = better compression at same quality
  --scale <width>      Optional: cap video width (e.g. 1920 for 1080p)
                       Height scales proportionally. No scaling by default.
  --audio-copy         Copy audio stream without re-encoding (default)
  --audio-bitrate <k>  Re-encode audio at this bitrate (e.g. 128k)
                       Overrides --audio-copy
  --out <path>         Output path (default: outputs/compress/<slug>.compressed.mp4)
  --dry-run            Show the ffmpeg command without executing
  --json               Output machine-readable JSON manifest
  --help, -h           Show this help`;

// ── Main ──────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

loadEnv();

const video = requireArg(args, 'video', usage);
const absoluteVideo = path.resolve(video);

if (!fs.existsSync(absoluteVideo)) {
  console.error(`Video not found: ${absoluteVideo}`);
  process.exit(1);
}

// Gather and validate options

const qualityPreset = String(args.quality ?? 'high');
if (!QUALITY_PRESETS[qualityPreset]) {
  console.error(
    `Unknown quality preset: ${qualityPreset}. Choices: ${Object.keys(QUALITY_PRESETS).join(', ')}`,
  );
  process.exit(1);
}

const codecKey = String(args.codec ?? 'h264');
if (!CODECS[codecKey]) {
  console.error(
    `Unknown codec: ${codecKey}. Choices: ${Object.keys(CODECS).join(', ')}`,
  );
  process.exit(1);
}

const encoderPreset = String(args.preset ?? 'medium');
if (!ENCODER_PRESETS.includes(encoderPreset)) {
  console.error(
    `Unknown encoder preset: ${encoderPreset}. Choices: ${ENCODER_PRESETS.join(', ')}`,
  );
  process.exit(1);
}

const crf = QUALITY_PRESETS[qualityPreset].crf;
const codec = CODECS[codecKey];
const scaleWidth = args.scale ? Number(args.scale) : null;
if (scaleWidth !== null && (!Number.isFinite(scaleWidth) || scaleWidth < 1)) {
  console.error(`Invalid --scale width: ${args.scale}. Must be a positive integer.`);
  process.exit(1);
}

const audioBitrate = args['audio-bitrate'] ?? null;
if (audioBitrate !== null && !/^\d+k?$/i.test(String(audioBitrate))) {
  console.error(`Invalid --audio-bitrate: ${audioBitrate}. Expected format like 128k.`);
  process.exit(1);
}
const audioCopy = audioBitrate === null; // copy audio by default unless bitrate specified
const dryRun = Boolean(args['dry-run']);
const jsonOutput = Boolean(args.json);

// Probe input video

if (!jsonOutput) console.log(`Probing ${absoluteVideo} …`);
const metadata = probeVideo(absoluteVideo);
const {width, height, fps, durationSeconds} = metadata;
const sizeBytes = fs.statSync(absoluteVideo).size;

if (!jsonOutput) {
  console.log(`  Resolution: ${width}x${height} @ ${fps.toFixed(2)} fps`);
  console.log(`  Duration: ${durationSeconds.toFixed(1)}s`);
  console.log(`  Input size: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB`);
}

// Determine output path

const safeBase = path
  .basename(absoluteVideo)
  .replace(/\.[^.]+$/, '')
  .replace(/[^a-z0-9._-]+/gi, '_')
  .slice(0, 90);

const slug = slugify(safeBase);
ensureDir(COMPRESS_OUT_DIR);

const outPath = args.out
  ? path.resolve(args.out)
  : path.join(COMPRESS_OUT_DIR, `${slug}.compressed.mp4`);

// Build ffmpeg arguments

const ffmpegArgs = [
  '-hide_banner',
  '-loglevel', 'info',
  '-y',
  '-i', absoluteVideo,
  '-map', '0:v?',
  '-map', '0:a?',
  '-map_metadata', '0',
  '-movflags', '+faststart',
  '-c:v', codec.encoder,
  '-crf', String(crf),
  '-preset', encoderPreset,
  '-pix_fmt', 'yuv420p',
];

// Optional scaling
if (scaleWidth !== null) {
  ffmpegArgs.push('-vf', `scale='min(${scaleWidth},iw)':-2:flags=lanczos`);
}

// H.265 extra args (tag for Apple compatibility)
if (codec.extraArgs) {
  ffmpegArgs.push(...codec.extraArgs);
}

// Audio handling
if (audioCopy) {
  ffmpegArgs.push('-c:a', 'copy');
} else {
  ffmpegArgs.push('-c:a', 'aac', '-b:a', String(audioBitrate));
}

ffmpegArgs.push(outPath);

// Build manifest

const manifest = {
  version: 1,
  generated: new Date().toISOString(),
  sourceVideo: absoluteVideo,
  sourceMetadata: {
    width,
    height,
    fps: Number(fps.toFixed(2)),
    durationSeconds: Number(durationSeconds.toFixed(2)),
    sizeBytes,
    sizeMB: Number((sizeBytes / 1024 / 1024).toFixed(1)),
  },
  compression: {
    codec: codecKey,
    encoder: codec.encoder,
    qualityPreset: qualityPreset,
    crf,
    encoderPreset,
    scaleWidth,
    audio: audioCopy ? 'copy' : `aac @ ${audioBitrate}`,
    ffmpegCommand: ['ffmpeg', ...ffmpegArgs.map(a => (/[\s"]/.test(a) ? `"${a}"` : a))].join(' '),
  },
  outputPath: outPath,
};

if (jsonOutput) {
  console.log(JSON.stringify(manifest, null, 2));
}

if (!jsonOutput) {
  console.log(`\nCompression settings:`);
  console.log(`  Codec:       ${codec.label} (${codec.encoder})`);
  console.log(`  Quality:     ${QUALITY_PRESETS[qualityPreset].label} (CRF ${crf})`);
  console.log(`  Preset:      ${encoderPreset}`);
  if (scaleWidth) console.log(`  Scale:       cap width at ${scaleWidth}px`);
  console.log(`  Audio:       ${audioCopy ? 'copy (no re-encode)' : `AAC @ ${audioBitrate}`}`);
  console.log(`  Output:      ${outPath}`);
}

// Execute or dry-run

if (dryRun) {
  if (!jsonOutput) {
    console.log(`\n[DRY RUN] Command:`);
    console.log(`  ffmpeg ${ffmpegArgs.join(' ')}`);
  }
  if (!jsonOutput) console.log('\nDry run complete — no encoding performed.');
  process.exit(0);
}

if (!jsonOutput) console.log(`\nEncoding …`);

const startTime = Date.now();
execFileSync('ffmpeg', ffmpegArgs, {stdio: 'inherit'});
const encodeTimeMs = Date.now() - startTime;

// Post-compression stats

const compressedBytes = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
const savedPercent = sizeBytes > 0
  ? Number(((1 - compressedBytes / sizeBytes) * 100).toFixed(1))
  : 0;

manifest.result = {
  outputSizeBytes: compressedBytes,
  outputSizeMB: Number((compressedBytes / 1024 / 1024).toFixed(1)),
  savedPercent,
  savedMB: Number(((sizeBytes - compressedBytes) / 1024 / 1024).toFixed(1)),
  encodeTimeSeconds: Number((encodeTimeMs / 1000).toFixed(1)),
};

const manifestPath = outPath.replace(/\.\w+$/, '.compress.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

if (jsonOutput) {
  console.log(JSON.stringify(manifest, null, 2));
} else {
  console.log(`\nCompression complete:`);
  console.log(`  Output:  ${outPath}`);
  console.log(`  Size:    ${manifest.result.outputSizeMB} MB (${savedPercent > 0 ? '-' : '+'}${Math.abs(savedPercent)}%)`);
  console.log(`  Saved:   ${Math.abs(manifest.result.savedMB).toFixed(1)} MB`);
  console.log(`  Time:    ${manifest.result.encodeTimeSeconds}s`);
  console.log(`  Manifest: ${manifestPath}`);
  console.log('\nDone.');
}
