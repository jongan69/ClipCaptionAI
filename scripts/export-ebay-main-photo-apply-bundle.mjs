#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs} from './lib.mjs';
import {timestampSlug} from './clipkit-lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/export-ebay-main-photo-apply-bundle.mjs --queue outputs/.../final-main-photo-upload-queue.json
  npm run ebay:main-photo-apply-bundle -- --queue outputs/.../final-main-photo-upload-queue.json

Options:
  --queue FILE       Final main-photo upload queue JSON.
  --out-dir DIR      Default: <queue-dir>/main-photo-apply-bundle
  --limit N          Optional max ready listings to export.

Exports a no-price-change live-application bundle:
- one folder per ready listing
- the selected main image copied as 01_MAIN_UPLOAD_THIS.jpg
- JSON payload skeletons for eBay media preview/apply tooling
- operator checklist for browser/Seller Hub fallback
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
const safeName = (value) => clean(value).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 96) || 'listing';

const queuePath = path.resolve(requireArg('queue'));
const queue = readJson(queuePath);
const outDir = path.resolve(String(args['out-dir'] ?? path.join(path.dirname(queuePath), 'main-photo-apply-bundle')));
const limit = args.limit ? Math.max(1, Math.floor(Number(args.limit))) : null;
ensureDir(outDir);

const ready = (Array.isArray(queue.entries) ? queue.entries : [])
  .filter((entry) => entry.final_status === 'ready_for_upload_preview' && entry.selected_main_photo)
  .slice(0, limit ?? undefined);

const entries = [];
for (const entry of ready) {
  const itemId = String(entry.item_id);
  const itemDir = path.join(outDir, `${String(entry.rank).padStart(2, '0')}-${itemId}-${safeName(entry.title)}`);
  ensureDir(itemDir);

  const source = path.resolve(String(entry.selected_main_photo));
  if (!fs.existsSync(source)) {
    entries.push({...entry, export_status: 'missing_selected_main_photo', item_dir: itemDir});
    continue;
  }
  const uploadImage = path.join(itemDir, '01_MAIN_UPLOAD_THIS.jpg');
  fs.copyFileSync(source, uploadImage);

  const previewPayload = {
    tool: 'ebay_revise_listing_media',
    apply_immediately: false,
    item_id: itemId,
    preserve_existing_policies: true,
    picture_urls: [
      'UPLOAD_01_MAIN_UPLOAD_THIS_AND_PLACE_RETURNED_EBAY_OR_PUBLIC_IMAGE_URL_HERE',
      'PRESERVE_EXISTING_GALLERY_URLS_AFTER_THE_NEW_MAIN_PHOTO',
    ],
    notes: [
      'No price change.',
      'Preview first. Apply only after picture_urls contains the uploaded image URL plus existing gallery URLs.',
      'The selected image was generated from real product/source media and visually reviewed for main-photo testing.',
    ],
  };
  const applyPayload = {...previewPayload, apply_immediately: true};
  fs.writeFileSync(path.join(itemDir, 'mcp-preview-payload.json'), `${JSON.stringify(previewPayload, null, 2)}\n`);
  fs.writeFileSync(path.join(itemDir, 'mcp-apply-payload.json'), `${JSON.stringify(applyPayload, null, 2)}\n`);

  const checklist = [
    `# ${itemId} Main Photo Apply Checklist`,
    '',
    `Listing: ${entry.url}`,
    `Title: ${entry.title}`,
    `Impressions: ${entry.impressions}`,
    `Views: ${entry.views}`,
    `CTR: ${(Number(entry.ctr ?? 0) * 100).toFixed(2)}%`,
    `Selected variant: ${entry.selected_variant}`,
    '',
    '## Upload File',
    '',
    uploadImage,
    '',
    '## Rules',
    '',
    '- Do not change price.',
    '- Do not change quantity.',
    '- Do not change shipping policies.',
    '- Place this image first, then preserve the existing gallery images behind it.',
    '- After live apply, record timestamp and snapshot traffic before/after.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(itemDir, 'README.md'), checklist);

  entries.push({
    rank: entry.rank,
    item_id: itemId,
    title: entry.title,
    url: entry.url,
    impressions: entry.impressions,
    views: entry.views,
    ctr: entry.ctr,
    selected_variant: entry.selected_variant,
    selected_main_photo: source,
    upload_image: uploadImage,
    item_dir: itemDir,
    mcp_preview_payload: path.join(itemDir, 'mcp-preview-payload.json'),
    mcp_apply_payload: path.join(itemDir, 'mcp-apply-payload.json'),
    export_status: 'ready',
  });
}

const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  queue: queuePath,
  out_dir: outDir,
  ready_count: entries.filter((entry) => entry.export_status === 'ready').length,
  missing_count: entries.filter((entry) => entry.export_status !== 'ready').length,
  live_apply_blocker: queue.live_apply_blocker ?? 'Live apply requires authenticated eBay seller session.',
  safety: {
    price_changes: false,
    quantity_changes: false,
    shipping_policy_changes: false,
    preserve_existing_gallery: true,
  },
  entries,
};

const manifestPath = path.join(outDir, `main-photo-apply-bundle-${timestampSlug()}.json`);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const readme = [
  '# eBay Main Photo Apply Bundle',
  '',
  `Source queue: ${queuePath}`,
  `Ready listings: ${manifest.ready_count}`,
  `Missing images: ${manifest.missing_count}`,
  '',
  'Live apply blocker:',
  '',
  manifest.live_apply_blocker,
  '',
  '## Safety Rules',
  '',
  '- No price changes.',
  '- No quantity changes.',
  '- No shipping policy changes.',
  '- New image goes first; existing gallery images stay behind it.',
  '- Preview before apply.',
  '',
  '## Listings',
  '',
  '| Rank | Item | CTR | Upload file |',
  '| ---: | --- | ---: | --- |',
  ...entries.map((entry) => `| ${entry.rank} | [${entry.item_id}](${entry.url}) ${String(entry.title).replaceAll('|', '-')} | ${(Number(entry.ctr ?? 0) * 100).toFixed(2)}% | ${entry.upload_image ?? 'MISSING'} |`),
  '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'README.md'), readme);

console.log(`Apply bundle: ${manifestPath}`);
console.log(`Ready: ${manifest.ready_count}`);
console.log(`Missing: ${manifest.missing_count}`);
