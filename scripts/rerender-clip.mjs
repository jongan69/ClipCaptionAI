#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDir,
  parseArgs,
  outputsRoot,
  probeVideo,
  projectRoot,
  run,
} from './lib.mjs';

const usage = `
Usage:
  npm run rerender:clip -- --clip 1 [options]
  npm run rerender:clip -- --list [options]

Options:
  --run DIR               Run folder. Default: latest outputs/run-* folder.
  --clip ID               Clip number, title fragment, slug, or .captions.json path.
  --list                  List editable clips in the run folder.
  --replace               Overwrite the original captioned mp4. Default: write .corrected.mp4.
  --out FILE              Custom output file.
  --fps N                 Override FPS. Default: existing rendered clip FPS, then 15.
  --vertical              Force 1080x1920 output.
  --vertical-contain      Force 1080x1920 output with the full horizontal clip visible and black bars.
  --foreground-video FILE Optional transparent foreground layer rendered above captions.
  --position NAME         left-hook, right-hook, lower-left, center-bottom, center-impact.
  --style-config FILE     Caption style JSON. Default: ./caption-style.json if present.
  --highlight-words CSV   Override AI-selected highlighted words.
  --no-captions           Disable captions for this rerender only.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const findFiles = (dir, predicate) => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const found = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findFiles(entryPath, predicate));
      continue;
    }

    if (predicate(entryPath)) {
      found.push(entryPath);
    }
  }

  return found;
};

const latestRunDir = () => {
  const runs = fs.existsSync(outputsRoot)
    ? fs
        .readdirSync(outputsRoot, {withFileTypes: true})
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('run-'))
        .map((entry) => path.join(outputsRoot, entry.name))
        .sort(
          (a, b) =>
            fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs ||
            b.localeCompare(a),
        )
    : [];

  if (runs.length === 0) {
    throw new Error('No outputs/run-* folders found yet. Run RUN.command first.');
  }

  return runs[0];
};

const runDir = path.resolve(args.run ? String(args.run) : latestRunDir());
const generatedDir = path.join(runDir, 'generated-assets');
const finalDir = path.join(runDir, 'captioned-clips');

const captionsFiles = findFiles(generatedDir, (file) =>
  file.endsWith('.captions.json'),
).sort();

const clipRows = captionsFiles.map((captionsPath) => {
  const stem = path.basename(captionsPath, '.captions.json');
  const clipNumber = Number(stem.match(/^(\d+)/)?.[1] ?? NaN);
  const videoSlug = path.basename(path.dirname(captionsPath));
  const rawClipPath = path.join(path.dirname(captionsPath), `${stem}.mp4`);
  const sceneMixPath = path.join(path.dirname(captionsPath), `${stem}.scene-mix.mp4`);
  const sfxMixPath = path.join(path.dirname(captionsPath), `${stem}.sfx-mix.mp4`);
  const renderedPath = path.join(finalDir, videoSlug, `${stem}.captioned.mp4`);

  return {
    clipNumber,
    videoSlug,
    stem,
    captionsPath,
    rawClipPath,
    sceneMixPath,
    sfxMixPath,
    renderedPath,
  };
});

const printList = () => {
  if (clipRows.length === 0) {
    console.log(`No editable captions found in ${generatedDir}`);
    return;
  }

  console.log(`Editable clips in ${runDir}:\n`);
  for (const row of clipRows) {
    const number = Number.isFinite(row.clipNumber)
      ? String(row.clipNumber).padStart(2, '0')
      : '--';
    console.log(`${number}  ${row.videoSlug} / ${row.stem}`);
    console.log(`    captions: ${row.captionsPath}`);
    console.log(`    output:   ${row.renderedPath}`);
  }
};

if (args.list) {
  printList();
  process.exit(0);
}

if (!args.clip) {
  printList();
  throw new Error('Choose a clip with --clip 1, --clip title-fragment, or --clip path/to/file.captions.json');
}

const clipQuery = String(args.clip);
const resolvedQuery = path.resolve(clipQuery);
const numericQuery = Number(clipQuery);
let matches;

if (fs.existsSync(resolvedQuery) && resolvedQuery.endsWith('.captions.json')) {
  matches = clipRows.filter((row) => row.captionsPath === resolvedQuery);
} else if (Number.isFinite(numericQuery)) {
  matches = clipRows.filter((row) => row.clipNumber === numericQuery);
} else {
  const normalizedQuery = slugify(clipQuery);
  matches = clipRows.filter(
    (row) =>
      row.stem.includes(normalizedQuery) ||
      row.videoSlug.includes(normalizedQuery),
  );
}

if (matches.length !== 1) {
  printList();
  throw new Error(
    matches.length === 0
      ? `No clip matched "${clipQuery}".`
      : `More than one clip matched "${clipQuery}". Use a number or exact captions path.`,
  );
}

const clip = matches[0];

if (!fs.existsSync(clip.rawClipPath)) {
  throw new Error(`Raw clip not found: ${clip.rawClipPath}`);
}

const sourceVideoPath = fs.existsSync(clip.sfxMixPath)
  ? clip.sfxMixPath
  : fs.existsSync(clip.sceneMixPath)
    ? clip.sceneMixPath
    : clip.rawClipPath;

const correctedPath = path.join(
  path.dirname(clip.renderedPath),
  `${clip.stem}.corrected.mp4`,
);
const outPath = path.resolve(
  args.out ? String(args.out) : args.replace ? clip.renderedPath : correctedPath,
);

let existingMeta = null;
if (fs.existsSync(clip.renderedPath)) {
  existingMeta = probeVideo(clip.renderedPath);
}

const verticalContain = Boolean(args['vertical-contain']);
const vertical =
  Boolean(args.vertical) ||
  verticalContain ||
  Boolean(existingMeta && existingMeta.height > existingMeta.width);
const fps = Number(args.fps ?? existingMeta?.fps ?? 15);

const selectionPath = path.join(finalDir, clip.videoSlug, 'selection.json');
let highlightWords = [];
if (args['highlight-words']) {
  highlightWords = String(args['highlight-words'])
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
} else if (fs.existsSync(selectionPath) && Number.isFinite(clip.clipNumber)) {
  const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
  highlightWords = selection.clips?.[clip.clipNumber - 1]?.highlightWords ?? [];
}

ensureDir(path.dirname(outPath));

const renderArgs = [
  'run',
  'render:clip',
  '--',
  '--video',
  sourceVideoPath,
  '--captions',
  clip.captionsPath,
  '--out',
  outPath,
  '--fps',
  String(fps),
];

if (args.position) {
  renderArgs.push('--position', String(args.position));
}

if (args['style-config']) {
  renderArgs.push('--style-config', String(args['style-config']));
}

if (args['no-captions']) {
  renderArgs.push('--no-captions');
}

if (args['foreground-video']) {
  renderArgs.push('--foreground-video', String(args['foreground-video']));
}

if (verticalContain) {
  renderArgs.push('--vertical-contain');
}

if (highlightWords.length > 0) {
  renderArgs.push('--highlight-words', highlightWords.join(','));
}

if (vertical && !verticalContain) {
  renderArgs.push('--vertical');
}

run('npm', renderArgs);

console.log(`Corrected render written to: ${outPath}`);
