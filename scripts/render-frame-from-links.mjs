#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {downloadYoutubeVideo, readLinkEntriesFromLinksFile} from './lib-youtube-download.mjs';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';

const defaultLinks = path.join(projectRoot, 'links.txt');
const defaultFrame = path.join(path.dirname(projectRoot), 'Frame.png');

const usage = `
Usage:
  npm run frame:links -- --frame /Users/jonathangan/Desktop/Frame.png

Options:
  --links FILE       Text file with YouTube URLs. Default: ./links.txt
  --frame FILE       PNG/JPG frame image. Default: ../Frame.png
  --out-dir DIR      Output root. Default: ./outputs
  --run-name NAME    Run folder name. Default: frame-run-YYYY-MM-DD-HHMMSS
  --x N              Video slot x-position. Default: 70
  --y N              Video slot y-position. Default: 303
  --width N          Video slot width. Default: 982
  --height N         Video slot height. Default: 608
  --radius N         Rounded corner radius for the video mask. Default: 58
  --fit cover|contain  Cover crops to fill the slot; contain letterboxes inside it. Default: cover

What it does:
  1. Reads every non-comment URL from links.txt.
  2. Downloads each video as MP4.
  3. Renders each downloaded video inside the frame's rounded slot.
  4. Writes a manifest with all generated assets.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const pad = (value) => String(value).padStart(2, '0');
const timestampSlug = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
  ].join('-');
};

const uniqueDir = (parent, preferredName) => {
  let candidate = path.join(parent, preferredName);
  let suffix = 2;

  while (fs.existsSync(candidate)) {
    candidate = path.join(parent, `${preferredName}-${suffix}`);
    suffix += 1;
  }

  return candidate;
};

const slugify = (value) => {
  return String(value ?? 'video')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'video';
};

const numberArg = (key, fallback) => {
  const value = args[key] === undefined ? fallback : Number(args[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`--${key} must be a number.`);
  }
  return Math.round(value);
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const writeRoundedMask = (maskPath, width, height, radius, feather = 3) => {
  const header = Buffer.from(`P5\n${width} ${height}\n255\n`, 'ascii');
  const pixels = Buffer.alloc(width * height);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const innerX = halfWidth - radius;
  const innerY = halfHeight - radius;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = Math.abs(x + 0.5 - halfWidth) - innerX;
      const py = Math.abs(y + 0.5 - halfHeight) - innerY;
      const outsideX = Math.max(px, 0);
      const outsideY = Math.max(py, 0);
      const distance =
        Math.hypot(outsideX, outsideY) + Math.min(Math.max(px, py), 0) - radius;
      const alpha = clamp((-distance + feather / 2) / feather, 0, 1);
      pixels[y * width + x] = Math.round(alpha * 255);
    }
  }

  fs.writeFileSync(maskPath, Buffer.concat([header, pixels]));
};

const renderIntoFrame = ({videoPath, framePath, maskPath, outPath, slot, fit}) => {
  const fitFilter =
    fit === 'contain'
      ? `scale=${slot.width}:${slot.height}:force_original_aspect_ratio=decrease,pad=${slot.width}:${slot.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`
      : `scale=${slot.width}:${slot.height}:force_original_aspect_ratio=increase,crop=${slot.width}:${slot.height},setsar=1`;

  const filter = [
    `[0:v]${fitFilter},format=rgba[slotv]`,
    '[2:v]format=gray[mask]',
    '[slotv][mask]alphamerge[masked]',
    '[1:v]format=rgba[frame]',
    `[frame][masked]overlay=${slot.x}:${slot.y}:shortest=1,format=yuv420p[v]`,
  ].join(';');

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      videoPath,
      '-loop',
      '1',
      '-i',
      framePath,
      '-loop',
      '1',
      '-i',
      maskPath,
      '-filter_complex',
      filter,
      '-map',
      '[v]',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-shortest',
      outPath,
    ],
    {stdio: 'inherit'},
  );
};

const linksPath = path.resolve(String(args.links ?? defaultLinks));
const framePath = path.resolve(String(args.frame ?? defaultFrame));
const outRoot = path.resolve(String(args['out-dir'] ?? path.join(projectRoot, 'outputs')));
const runName = String(args['run-name'] ?? `frame-run-${timestampSlug()}`);
const runDir = uniqueDir(outRoot, runName);
const downloadRoot = path.join(runDir, 'downloads');
const renderedRoot = path.join(runDir, 'framed');
const assetRoot = path.join(runDir, 'assets');
const fit = String(args.fit ?? 'cover').toLowerCase();

if (!['cover', 'contain'].includes(fit)) {
  throw new Error('--fit must be either cover or contain.');
}

if (!fs.existsSync(framePath)) {
  throw new Error(`Frame image not found: ${framePath}`);
}

const slot = {
  x: numberArg('x', 70),
  y: numberArg('y', 303),
  width: numberArg('width', 982),
  height: numberArg('height', 608),
  radius: numberArg('radius', 58),
};

ensureDir(outRoot);
ensureDir(runDir);
ensureDir(downloadRoot);
ensureDir(renderedRoot);
ensureDir(assetRoot);

fs.copyFileSync(linksPath, path.join(runDir, 'links.txt'));
fs.copyFileSync(framePath, path.join(assetRoot, path.basename(framePath)));

const maskPath = path.join(assetRoot, `rounded-mask-${slot.width}x${slot.height}-r${slot.radius}.pgm`);
writeRoundedMask(maskPath, slot.width, slot.height, slot.radius);

const entries = readLinkEntriesFromLinksFile(linksPath);
const outputs = [];
const failures = [];

for (const [index, entry] of entries.entries()) {
  console.log(`\n[${index + 1}/${entries.length}] Downloading ${entry.url}`);

  try {
    const filePath = downloadYoutubeVideo(entry.url, downloadRoot);
    console.log(`[${index + 1}/${entries.length}] Saved ${filePath}`);

    const parsed = path.parse(filePath);
    const outName = `${String(index + 1).padStart(2, '0')}-${slugify(parsed.name)}.framed.mp4`;
    const outPath = path.join(renderedRoot, outName);

    console.log(`[${index + 1}/${entries.length}] Rendering inside ${framePath}`);
    renderIntoFrame({
      videoPath: filePath,
      framePath,
      maskPath,
      outPath,
      slot,
      fit,
    });

    outputs.push({
      url: entry.url,
      sourceProfile: entry.sourceProfile ?? null,
      downloadedVideo: filePath,
      framedVideo: outPath,
    });
    console.log(`[${index + 1}/${entries.length}] Framed video: ${outPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({url: entry.url, error: message});
    console.error(`[${index + 1}/${entries.length}] Failed: ${message}`);
  }
}

const manifest = {
  createdAt: new Date().toISOString(),
  mode: 'frame-from-links',
  linksFile: linksPath,
  frame: framePath,
  runDir,
  downloadsDir: downloadRoot,
  renderedDir: renderedRoot,
  slot,
  fit,
  outputs,
  failures,
};

const manifestPath = path.join(runDir, 'manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\nDone. Run folder: ${runDir}`);
console.log(`Rendered folder: ${renderedRoot}`);
console.log(`Manifest: ${manifestPath}`);

if (failures.length > 0) {
  console.error(`${failures.length} item(s) failed. See manifest.json for details.`);
  process.exit(1);
}
