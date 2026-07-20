#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ensureDir, parseArgs} from './lib.mjs';
import {commandPath} from './command-utils.mjs';
import {timestampSlug} from './clipkit-lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/generate-ebay-main-photo-candidates.mjs --worklist outputs/.../traffic-optimization-worklist.json --source-root /path/to/supplier-video-repairs
  npm run ebay:main-photo-candidates -- --worklist outputs/.../traffic-optimization-worklist.json --source-root /path/to/supplier-video-repairs

Options:
  --worklist FILE       Dropship optimization worklist JSON.
  --source-root DIR     Directory containing supplier/listing image folders. Use ${path.delimiter} to pass multiple roots.
  --out-dir DIR         Default: <worklist-dir>/top-main-photo-candidates
  --top N               Max listings to process. Default: 20
  --min-impressions N   Default: 0
  --include-monitor     Include monitor rows with no sales. Default false

Creates eBay-safe main-photo candidates from real product images only:
clean square hero, tighter thumbnail-focus variant, per-item before/after
contact sheet, all-item contact sheet, and a manifest for tracking upload work.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const requireArg = (key) => {
  if (!args[key]) throw new Error(`Missing --${key}.\n${usage}`);
  return String(args[key]);
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const isImage = (name) => /\.(jpe?g|png|webp)$/i.test(name);

const magick = (() => {
  for (const command of ['magick', 'convert']) {
    const found = commandPath(command);
    if (found) return found;
  }
  throw new Error('ImageMagick is required. Install `magick` or `convert`.');
})();

const runMagick = (argv) => {
  const result = spawnSync(magick, argv, {encoding: 'utf8'});
  if (result.status !== 0) {
    throw new Error(`${magick} failed:\n${result.stderr || result.stdout}`);
  }
};

const walkImages = (root) => {
  const results = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git'].includes(entry.name)) walk(full);
      } else if (isImage(entry.name)) {
        results.push(full);
      }
    }
  };
  walk(root);
  return results;
};

const scoreSource = (file, itemId) => {
  const basename = path.basename(file).toLowerCase();
  const parent = path.dirname(file);
  const stat = fs.statSync(file);
  let score = stat.mtimeMs / 1e9;
  if (basename === '01.jpg' || basename === '01.jpeg' || basename === '01.png') score += 1000;
  if (basename === '1.jpg' || basename === '1.jpeg' || basename === '1.png') score += 500;
  if (parent.includes('/images')) score += 100;
  if (file.includes(itemId)) score += 10000;
  return score;
};

const sourceMapForIds = (roots, ids) => {
  const wanted = new Set(ids.map(String));
  const byId = new Map([...wanted].map((id) => [id, []]));
  for (const root of roots) {
    for (const file of walkImages(root)) {
      for (const id of wanted) {
        if (file.includes(id)) byId.get(id).push(file);
      }
    }
  }
  const selected = new Map();
  for (const [id, files] of byId) {
    const sorted = files.sort((a, b) => scoreSource(b, id) - scoreSource(a, id));
    if (sorted[0]) selected.set(id, sorted[0]);
  }
  return selected;
};

const selectedRows = (worklist, {top, minImpressions, includeMonitor}) => {
  const rows = Array.isArray(worklist.rows) ? worklist.rows : [];
  return rows
    .filter((row) => Number(row.sold ?? 0) === 0)
    .filter((row) => Number(row.impressions ?? 0) >= minImpressions)
    .filter((row) => includeMonitor || row.primary_action !== 'monitor')
    .filter((row) => row.primary_action === 'main_image_title' || row.issue_tags?.includes('weak_ctr') || row.issue_tags?.includes('zero_clicks'))
    .sort((a, b) => {
      const priorityDelta = Number(b.priority_score ?? 0) - Number(a.priority_score ?? 0);
      if (priorityDelta !== 0) return priorityDelta;
      return Number(b.impressions ?? 0) - Number(a.impressions ?? 0);
    })
    .slice(0, top);
};

const writeMainCandidate = ({source, itemDir, itemId}) => {
  const main = path.join(itemDir, `${itemId}-main-photo-candidate.jpg`);
  const focus = path.join(itemDir, `${itemId}-thumbnail-focus-candidate.jpg`);
  const raw = path.join(itemDir, `${itemId}-source-lead.jpg`);
  fs.copyFileSync(source, raw);
  runMagick([
    source,
    '-auto-orient',
    '-colorspace',
    'sRGB',
    '-alpha',
    'remove',
    '-alpha',
    'off',
    '-resize',
    '1450x1450',
    '-background',
    'white',
    '-gravity',
    'center',
    '-extent',
    '1600x1600',
    '-unsharp',
    '0x0.75+0.75+0.02',
    '-contrast-stretch',
    '0.35%x0.35%',
    '-strip',
    '-quality',
    '92',
    main,
  ]);
  runMagick([
    source,
    '-auto-orient',
    '-colorspace',
    'sRGB',
    '-alpha',
    'remove',
    '-alpha',
    'off',
    '-resize',
    '1700x1700^',
    '-gravity',
    'center',
    '-extent',
    '1600x1600',
    '-unsharp',
    '0x0.8+0.8+0.02',
    '-contrast-stretch',
    '0.35%x0.35%',
    '-strip',
    '-quality',
    '92',
    focus,
  ]);
  const contact = path.join(itemDir, `${itemId}-before-after-contact.jpg`);
  runMagick([
    raw,
    main,
    focus,
    '-resize',
    '360x360',
    '-background',
    'white',
    '-bordercolor',
    'white',
    '-border',
    '12',
    '+append',
    contact,
  ]);
  return {raw, main, focus, contact};
};

const worklistPath = path.resolve(requireArg('worklist'));
const sourceRoots = requireArg('source-root').split(path.delimiter).filter(Boolean).map((root) => path.resolve(root));
const worklist = readJson(worklistPath);
const outDir = path.resolve(String(args['out-dir'] ?? path.join(path.dirname(worklistPath), 'top-main-photo-candidates')));
const top = Math.max(1, Math.floor(Number(args.top ?? 20)));
const minImpressions = Math.max(0, Math.floor(Number(args['min-impressions'] ?? 0)));
const includeMonitor = Boolean(args['include-monitor']);

for (const sourceRoot of sourceRoots) {
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(`Source root not found: ${sourceRoot}`);
  }
}

ensureDir(outDir);
const rows = selectedRows(worklist, {top, minImpressions, includeMonitor});
const ids = rows.map((row) => String(row.item_id));
const sources = sourceMapForIds(sourceRoots, ids);
const entries = [];
const skipped = [];

for (const row of rows) {
  const itemId = String(row.item_id);
  const source = sources.get(itemId);
  if (!source) {
    skipped.push({item_id: itemId, title: row.title, reason: 'source_image_not_found'});
    continue;
  }
  const itemDir = path.join(outDir, itemId);
  ensureDir(itemDir);
  const images = writeMainCandidate({source, itemDir, itemId});
  entries.push({
    item_id: itemId,
    title: clean(row.title),
    url: row.url ?? `https://www.ebay.com/itm/${itemId}`,
    priority_score: Number(row.priority_score ?? 0),
    impressions: Number(row.impressions ?? 0),
    views: Number(row.views ?? 0),
    ctr: Number(row.ctr ?? 0),
    sold: Number(row.sold ?? 0),
    primary_action: row.primary_action ?? null,
    issue_tags: row.issue_tags ?? [],
    source_image: source,
    source_lead_copy: images.raw,
    main_photo_candidate: images.main,
    thumbnail_focus_candidate: images.focus,
    before_after_contact: images.contact,
    recommendation: 'Review candidate visually, then use as first photo only after live seller auth is restored. Keep existing gallery detail photos behind it.',
  });
}

const allContact = path.join(outDir, 'all-main-photo-candidates-contact.jpg');
if (entries.length > 0) {
  const contactArgs = [
    ...entries.map((entry) => entry.main_photo_candidate),
    '-resize',
    '300x300',
    '-background',
    'white',
    '-bordercolor',
    'white',
    '-border',
    '10',
    '-append',
    allContact,
  ];
  runMagick(contactArgs);
}

const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  worklist: worklistPath,
  source_roots: sourceRoots,
  out_dir: outDir,
  purpose: 'Buyer-safe main image candidates generated from real supplier/listing lead photos. No text overlays, no synthetic staging, no price changes.',
  selected_count: rows.length,
  generated_count: entries.length,
  skipped_count: skipped.length,
  top,
  min_impressions: minImpressions,
  include_monitor: includeMonitor,
  all_contact_sheet: entries.length > 0 ? allContact : null,
  entries,
  skipped,
  next_steps: [
    'Visually review all-main-photo-candidates-contact.jpg for cropped or misleading candidates.',
    'When eBay auth works, preview media revisions before applying to live listings.',
    'After upload, snapshot traffic daily and compare CTR, views, watchers, bids, and sales by item_id.',
  ],
};

const manifestPath = path.join(outDir, `main-photo-candidates-${timestampSlug()}.json`);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Main-photo candidates: ${manifestPath}`);
console.log(`Generated: ${entries.length}`);
console.log(`Skipped: ${skipped.length}`);
if (entries.length > 0) console.log(`Contact sheet: ${allContact}`);
