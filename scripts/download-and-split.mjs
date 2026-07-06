#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ensureDir, parseArgs, probeVideo, projectRoot} from './lib.mjs';
import {
  downloadYoutubeVideo,
  readLinkEntriesFromLinksFile,
} from './lib-youtube-download.mjs';

const defaultLinks = path.join(projectRoot, 'links.txt');

const usage = `
Usage:
  npm run download:split -- --links links.txt

Options:
  --links FILE             Text file with one YouTube URL per line. Default: ./links.txt
  --out-dir DIR            Output root. Default: ./outputs
  --run-name NAME          Run folder name. Default: fixed-clips-run-YYYY-MM-DD-HHMMSS
  --download-dir DIR       Exact folder to put downloaded videos in. Default: run folder/downloads
  --segments-dir DIR       Exact folder to put 15-second clips in. Default: run folder/fixed-clips
  --segment-seconds N      Fixed segment length. Default: 15

What it does:
  1. Reads every non-comment URL from the links file.
  2. Downloads each full YouTube video as MP4.
  3. Chops the full source into back-to-back fixed-length clips.
  4. Writes manifest.json plus one segments.json per source video.
  5. Stops. No transcription, AI selection, captions, B-roll, or rendering.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const slugify = (value, fallback = 'video') => {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return slug || fallback;
};

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

const listSegmentFiles = (dir) =>
  fs
    .readdirSync(dir, {withFileTypes: true})
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp4'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));

const linksPath = path.resolve(String(args.links ?? defaultLinks));
const outRoot = path.resolve(String(args['out-dir'] ?? path.join(projectRoot, 'outputs')));
const runName = String(args['run-name'] ?? `fixed-clips-run-${timestampSlug()}`);
const runDir = uniqueDir(outRoot, runName);
const downloadRoot = path.resolve(String(args['download-dir'] ?? path.join(runDir, 'downloads')));
const segmentsRoot = path.resolve(String(args['segments-dir'] ?? path.join(runDir, 'fixed-clips')));
const segmentSeconds = Number(args['segment-seconds'] ?? 15);

if (!Number.isFinite(segmentSeconds) || segmentSeconds <= 0) {
  throw new Error('--segment-seconds must be a positive number.');
}

const linkEntries = readLinkEntriesFromLinksFile(linksPath);

ensureDir(outRoot);
ensureDir(runDir);
ensureDir(downloadRoot);
ensureDir(segmentsRoot);
fs.copyFileSync(linksPath, path.join(runDir, 'links.txt'));

const videos = [];
const failures = [];

for (const [index, entry] of linkEntries.entries()) {
  const {url, sourceProfile = null} = entry;
  console.log(`\n[${index + 1}/${linkEntries.length}] Downloading ${url}`);

  try {
    const filePath = downloadYoutubeVideo(url, downloadRoot);
    const baseSlug = slugify(path.basename(filePath, path.extname(filePath)));
    const videoSegmentsDir = path.join(segmentsRoot, baseSlug);
    const metadata = probeVideo(filePath);
    const expectedSegments = Math.max(1, Math.ceil(metadata.durationSeconds / segmentSeconds));

    ensureDir(videoSegmentsDir);

    const pattern = path.join(videoSegmentsDir, '%03d.mp4');
    console.log(
      `[${index + 1}/${linkEntries.length}] Splitting ${baseSlug} into ${expectedSegments} fixed clip(s)`,
    );

    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        filePath,
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

    const segmentFiles = listSegmentFiles(videoSegmentsDir);
    const segments = segmentFiles.map((name, segmentIndex) => {
      const startSeconds = segmentIndex * segmentSeconds;
      const endSeconds = Math.min(metadata.durationSeconds, startSeconds + segmentSeconds);
      return {
        index: segmentIndex + 1,
        fileName: name,
        filePath: path.join(videoSegmentsDir, name),
        startSeconds,
        endSeconds,
        durationSeconds: Math.max(0, endSeconds - startSeconds),
      };
    });

    const segmentIndexPath = path.join(videoSegmentsDir, 'segments.json');
    const videoRecord = {
      url,
      sourceProfile,
      filePath,
      slug: baseSlug,
      durationSeconds: metadata.durationSeconds,
      segmentSeconds,
      expectedSegments,
      actualSegments: segments.length,
      segmentsDir: videoSegmentsDir,
      segmentIndexPath,
      segments,
    };

    fs.writeFileSync(segmentIndexPath, `${JSON.stringify(videoRecord, null, 2)}\n`);
    videos.push(videoRecord);
    console.log(
      `[${index + 1}/${linkEntries.length}] Wrote ${segments.length} fixed clip(s) to ${videoSegmentsDir}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({url, sourceProfile, error: message});
    console.error(`[${index + 1}/${linkEntries.length}] Failed: ${message}`);
  }
}

const manifest = {
  createdAt: new Date().toISOString(),
  mode: 'download-and-split',
  linksFile: linksPath,
  runDir,
  downloadsDir: downloadRoot,
  segmentsDir: segmentsRoot,
  segmentSeconds,
  videos,
  failures,
};

const manifestPath = path.join(runDir, 'manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\nDone. Fixed clips run: ${runDir}`);
console.log(`Manifest: ${manifestPath}`);

if (failures.length > 0) {
  console.error(`${failures.length} video(s) failed. See manifest.json for details.`);
  process.exit(1);
}
