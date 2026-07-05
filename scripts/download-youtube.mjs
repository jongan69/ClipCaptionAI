#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';
import {downloadYoutubeVideo, readUrlsFromLinksFile} from './lib-youtube-download.mjs';

const defaultLinks = path.join(projectRoot, 'links.txt');

const usage = `
Usage:
  npm run download:youtube -- --links links.txt

Options:
  --links FILE        Text file with one YouTube URL per line. Default: ./links.txt
  --out-dir DIR       Output root. Default: ./outputs
  --run-name NAME     Run folder name. Default: download-run-YYYY-MM-DD-HHMMSS
  --download-dir DIR  Exact folder to put downloaded videos in. Default: run folder/downloads

What it does:
  1. Reads every non-comment URL from the links file.
  2. Downloads each video as MP4 with yt-dlp.
  3. Writes a manifest.json.
  4. Stops. No transcription, clipping, captions, B-roll, or rendering.
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

const linksPath = path.resolve(String(args.links ?? defaultLinks));
const outRoot = path.resolve(String(args['out-dir'] ?? path.join(projectRoot, 'outputs')));
const runName = String(args['run-name'] ?? `download-run-${timestampSlug()}`);
const runDir = uniqueDir(outRoot, runName);
const downloadRoot = path.resolve(String(args['download-dir'] ?? path.join(runDir, 'downloads')));
const urls = readUrlsFromLinksFile(linksPath);

ensureDir(outRoot);
ensureDir(runDir);
ensureDir(downloadRoot);
fs.copyFileSync(linksPath, path.join(runDir, 'links.txt'));

const downloads = [];
const failures = [];

for (const [index, url] of urls.entries()) {
  console.log(`\n[${index + 1}/${urls.length}] Downloading ${url}`);
  try {
    const filePath = downloadYoutubeVideo(url, downloadRoot);
    downloads.push({url, filePath});
    console.log(`[${index + 1}/${urls.length}] Saved ${filePath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({url, error: message});
    console.error(`[${index + 1}/${urls.length}] Failed: ${message}`);
  }
}

const manifest = {
  createdAt: new Date().toISOString(),
  mode: 'download-youtube',
  linksFile: linksPath,
  urls,
  runDir,
  downloadsDir: downloadRoot,
  downloads,
  failures,
};

const manifestPath = path.join(runDir, 'manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\nDone. Download folder: ${downloadRoot}`);
console.log(`Manifest: ${manifestPath}`);

if (failures.length > 0) {
  console.error(`${failures.length} download(s) failed. See manifest.json for details.`);
  process.exit(1);
}
