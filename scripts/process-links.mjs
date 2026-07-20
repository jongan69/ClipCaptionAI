#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  defaultCaptionStylePath,
  ensureDir,
  outputsRoot,
  parseArgs,
  projectRoot,
  run,
} from './lib.mjs';
import {
  downloadYoutubeVideo,
  readLinkEntriesFromLinksFile,
} from './lib-youtube-download.mjs';

const desktopLinks = '/Users/jonathangan/Desktop/Full-Vids/links.txt';
const localLinks = path.join(projectRoot, 'links.txt');

const usage = `
Usage:
  npm run process -- [options]

Options:
  --links FILE            Links file. Default: ./links.txt, then ${desktopLinks}
  --out-dir DIR           Output root. Default: outputs
  --run-name NAME         Run folder name. Default: run-YYYY-MM-DD-HHMMSS
  --download-dir DIR      Download folder. Default: current run folder/downloads
  --max-clips N           Clips per source video. Default: 3
  --min-seconds N         Minimum clip length. Default: smart selector default
  --max-seconds N         Maximum clip length. Default: smart selector default
  --padding-seconds N     Extra seconds before and after each selected clip. Default: 2
  --boundary-lookaround-seconds N
                          Max extra seconds to expand toward thought boundaries. Default: 6
  --disable-thought-snapping
                          Keep raw AI timestamps without sentence/thought snapping.
  --review-width N        Review render width. Default: smart selector default
  --review-fps N          Review render FPS. Default: smart selector default
  --raw-clips-only        Export only AI-selected source moments for manual editing.
  --style-config FILE     Caption style JSON. Default: ./caption-style.json if present
  --selection-model ID    OpenAI model for editorial selection.
  --reselect              Ask AI to choose clips again even if selection.json exists.
  --scene-library DIR     Folder of tagged scene clips for context-matched cutaways.
  --library-config FILE   Optional scene-library metadata config used by scene:index.
  --context-scenes        Force-enable context scene mixing.
  --disable-context-scenes Disable context scene mixing for this run.
  --youtube-ingest        Force-enable YouTube B-roll ingest while planning cutaways.
  --disable-youtube-ingest Disable YouTube B-roll ingest for this run.
  --local-scenes-only     Use only clips already in the local scene library.
  --reindex-scene-library Rebuild scene-library/index.json before generating clips.
  --sfx-library DIR       Folder of indexed sound effects.
  --sound-effects         Force-enable automatic low-volume sound effects.
  --disable-sound-effects Disable automatic sound effects for this run.
  --vertical              Render selected clips as 1080x1920.
  --vertical-contain      Render selected clips as 1080x1920 with full horizontal video and black bars.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const pad = (value) => String(value).padStart(2, '0');
const makeRunName = () => {
  const now = new Date();
  return [
    'run',
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

const linksPath = path.resolve(
  args.links ??
    (fs.existsSync(localLinks) ? localLinks : desktopLinks),
);
const outRoot = path.resolve(args['out-dir'] ?? outputsRoot);
const runName = String(args['run-name'] ?? makeRunName());
const runDir = uniqueDir(outRoot, runName);
const downloadRoot = path.resolve(args['download-dir'] ?? path.join(runDir, 'downloads'));
const generatedRoot = path.join(runDir, 'generated-assets');
const finalRoot = path.join(runDir, 'captioned-clips');
const mediaStagingDir = path.join(projectRoot, 'public', 'media');
const styleConfigPath = path.resolve(args['style-config'] ?? defaultCaptionStylePath);

const linkEntries = readLinkEntriesFromLinksFile(linksPath);
const urls = linkEntries.map((entry) => entry.url);

ensureDir(outRoot);
ensureDir(runDir);
ensureDir(downloadRoot);
ensureDir(generatedRoot);
ensureDir(finalRoot);

fs.copyFileSync(linksPath, path.join(runDir, 'links.txt'));
if (fs.existsSync(styleConfigPath)) {
  fs.copyFileSync(styleConfigPath, path.join(runDir, 'caption-style.json'));
}

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72) || 'video';

const passThroughOptions = [
  'max-clips',
  'min-seconds',
  'max-seconds',
  'padding-seconds',
  'boundary-lookaround-seconds',
  'review-width',
  'review-fps',
  'raw-clips-only',
  'style-config',
  'selection-model',
  'scene-library',
  'library-config',
  'sfx-library',
];

for (const [index, entry] of linkEntries.entries()) {
  const {url, sourceProfile} = entry;
  console.log(`\n[${index + 1}/${urls.length}] Downloading ${url}`);
  const videoPath = downloadYoutubeVideo(url, downloadRoot);
  const baseSlug = slugify(path.basename(videoPath, path.extname(videoPath)));
  const outputDir = path.join(finalRoot, baseSlug);
  const workDir = path.join(generatedRoot, baseSlug);

  console.log(`[${index + 1}/${urls.length}] Creating AI-selected captioned clips`);

  const smartArgs = [
    'run',
    'smart:clips',
    '--',
    '--video',
    videoPath,
    '--out-dir',
    outputDir,
    '--work-dir',
    workDir,
  ];

  for (const option of passThroughOptions) {
    if (args[option] !== undefined) {
      if (args[option] === true) {
        smartArgs.push(`--${option}`);
      } else {
        smartArgs.push(`--${option}`, String(args[option]));
      }
    }
  }

  if (sourceProfile) {
    smartArgs.push('--source-profile', sourceProfile);
  }

  if (args.reselect) {
    smartArgs.push('--reselect');
  }
  if (args['disable-thought-snapping']) {
    smartArgs.push('--disable-thought-snapping');
  }
  if (args['context-scenes']) {
    smartArgs.push('--context-scenes');
  }
  if (args['disable-context-scenes']) {
    smartArgs.push('--disable-context-scenes');
  }
  if (args['youtube-ingest']) {
    smartArgs.push('--youtube-ingest');
  }
  if (args['disable-youtube-ingest']) {
    smartArgs.push('--disable-youtube-ingest');
  }
  if (args['local-scenes-only']) {
    smartArgs.push('--local-scenes-only');
  }
  if (args['reindex-scene-library']) {
    smartArgs.push('--reindex-scene-library');
  }

  if (args['sound-effects']) {
    smartArgs.push('--sound-effects');
  }
  if (args['disable-sound-effects']) {
    smartArgs.push('--disable-sound-effects');
  }

  if (args.vertical) {
    smartArgs.push('--vertical');
  }
  if (args['vertical-contain']) {
    smartArgs.push('--vertical-contain');
  }

  run('npm', smartArgs);
}

const manifest = {
  createdAt: new Date().toISOString(),
  linksFile: linksPath,
  linkEntries,
  urls,
  runDir,
  downloadsDir: downloadRoot,
  generatedAssetsDir: generatedRoot,
  captionedClipsDir: finalRoot,
  captionStyleConfig: fs.existsSync(styleConfigPath) ? styleConfigPath : null,
};

fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.rmSync(mediaStagingDir, {recursive: true, force: true});
ensureDir(mediaStagingDir);

console.log(`\nDone. This run is in: ${runDir}`);
