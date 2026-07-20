#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs} from './lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/import-competitive-research-results.mjs --queue outputs/.../competitive-research-queue.json --results automatio-results.csv
  npm run ebay:competitive-research-import -- --queue outputs/.../competitive-research-queue.json --results automatio-results.csv

Options:
  --queue FILE       Queue from ebay:competitive-research-queue.
  --results FILE     Consolidated Automatio/Kalodata CSV, JSON, or NDJSON export.
  --out-dir DIR      Default: sibling competitive-research-import.
  --replace          Replace existing competitor template rows instead of appending/deduping.
  --dry-run          Write manifest only; do not modify competitor import templates.

Routes one consolidated Automatio/Kalodata export back into each held listing's
research/competitor-import-template.csv so the batch processor can rerun ready
listings without hand-copying rows one packet at a time. Rows can route by
Item ID, Competitor Import Template, Packet Dir, or a queued Search Query.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const requireArg = (key) => {
  if (!args[key]) throw new Error(`Missing --${key}.\n${usage}`);
  return path.resolve(String(args[key]));
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const csvCell = (value) => {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
};

const splitCsvLine = (line) => {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
};

const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return {headers: [], rows: []};
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
  return {headers, rows};
};

const extractRowsFromJson = (value) => {
  if (Array.isArray(value)) return value;
  for (const key of ['records', 'items', 'videos', 'products', 'rows', 'data', 'results']) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return value && typeof value === 'object' ? [value] : [];
};

const readRows = (file) => {
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return {headers: [], rows: []};
  if (/\.csv$/i.test(file)) return parseCsv(text);
  if (/\.ndjson$/i.test(file) || text.split(/\r?\n/).every((line) => line.trim().startsWith('{'))) {
    const rows = text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    return {headers: Array.from(new Set(rows.flatMap((row) => Object.keys(row)))), rows};
  }
  const rows = extractRowsFromJson(JSON.parse(text));
  return {headers: Array.from(new Set(rows.flatMap((row) => Object.keys(row)))), rows};
};

const normalizeKey = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const normalizeSearchQuery = (value) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const stopWords = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'your',
  'you',
  'are',
  'new',
  'used',
  'set',
  'kit',
  'bundle',
]);

const titleTokens = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && (token.length > 2 || /\d/.test(token)) && !stopWords.has(token));

const firstValue = (row, keys) => {
  const rowKeys = Object.keys(row ?? {});
  for (const key of keys) {
    if (row?.[key] !== undefined && String(row[key] ?? '').trim()) return String(row[key]).trim();
    const wanted = normalizeKey(key);
    const match = rowKeys.find((candidate) => normalizeKey(candidate) === wanted);
    if (match && String(row[match] ?? '').trim()) return String(row[match]).trim();
  }
  return '';
};

const routeKeyForRow = (row) => {
  const itemId = firstValue(row, ['Item ID', 'item_id', 'Listing ID', 'Listing Item ID', 'eBay Item ID']);
  if (itemId) return {type: 'item_id', value: itemId};
  const template = firstValue(row, ['Competitor Import Template', 'competitor_import_template', 'Template Path']);
  if (template) return {type: 'template', value: path.resolve(template)};
  const packetDir = firstValue(row, ['Packet Dir', 'packet_dir']);
  if (packetDir) return {type: 'packet_dir', value: path.resolve(packetDir)};
  const searchQuery = firstValue(row, ['Search Query', 'search_query', 'Query', 'Keyword', 'Search Term']);
  if (searchQuery) return {type: 'search_query', value: normalizeSearchQuery(searchQuery)};
  return {type: 'missing', value: ''};
};

const defaultColumns = [
  'Product Title',
  'Product Category',
  'Shop Name',
  'Creator Handle',
  'Video URL',
  'Video Title',
  'Caption',
  'Hook',
  'Duration Seconds',
  'Video Views',
  'Items Sold',
  'Total Revenue',
  'Revenue Growth Rate',
  'Ad Spend Estimate',
  'Regional Ranking',
  'Shot Breakdown',
  'Audio Notes',
  'Hashtags',
  'Posting Date',
];

const templateColumns = (listing) => {
  const template = listing.competitor_import_template;
  if (template && fs.existsSync(template)) {
    const firstLine = fs.readFileSync(template, 'utf8').split(/\r?\n/)[0]?.trim();
    if (firstLine) return splitCsvLine(firstLine);
  }
  return listing.required_columns?.length ? listing.required_columns : defaultColumns;
};

const mapRowToTemplate = (row, columns) =>
  Object.fromEntries(columns.map((column) => [column, firstValue(row, [column])]));

const signatureForRow = (row) => {
  const url = firstValue(row, ['Video URL', 'url', 'video_url', 'link']);
  const title = firstValue(row, ['Product Title', 'Video Title', 'title', 'name']);
  return `${normalizeKey(url)}::${normalizeKey(title)}`;
};

const productMatchReview = ({listing, row}) => {
  const listingTerms = Array.from(new Set(titleTokens(listing.title)));
  const competitorText = [
    row['Product Title'],
    row['Video Title'],
    row.Caption,
    row.Hook,
    row['Product Category'],
  ].filter(Boolean).join(' ');
  const competitorTerms = Array.from(new Set(titleTokens(competitorText)));
  const shared = listingTerms.filter((term) => competitorTerms.includes(term));
  const denominator = Math.max(1, Math.min(listingTerms.length, competitorTerms.length));
  const score = Number((shared.length / denominator).toFixed(3));
  const warnings = [];
  if (competitorTerms.length === 0) warnings.push('no competitor product terms found');
  if (score < 0.2) warnings.push('low product-title match; review before rerun');
  return {
    score,
    shared_terms: shared,
    listing_terms: listingTerms,
    competitor_terms: competitorTerms,
    warnings,
  };
};

const queuePath = requireArg('queue');
const resultsPath = requireArg('results');
if (!fs.existsSync(queuePath)) throw new Error(`Competitive research queue not found: ${queuePath}`);
if (!fs.existsSync(resultsPath)) throw new Error(`Results export not found: ${resultsPath}`);

const queue = readJson(queuePath);
const defaultOutDir = path.basename(path.dirname(queuePath)) === 'competitive-research-queue'
  ? path.join(path.dirname(queuePath), '..', 'competitive-research-import')
  : path.join(path.dirname(queuePath), 'competitive-research-import');
const outDir = path.resolve(String(args['out-dir'] ?? defaultOutDir));
ensureDir(outDir);

const listings = queue.listings ?? [];
const byItemId = new Map(listings.map((listing) => [String(listing.item_id), listing]));
const byTemplate = new Map(listings.map((listing) => [path.resolve(String(listing.competitor_import_template)), listing]));
const byPacketDir = new Map(listings.map((listing) => [path.resolve(String(listing.packet_dir)), listing]));
const bySearchQuery = new Map();
for (const row of queue.rows ?? []) {
  const query = normalizeSearchQuery(row.search_query ?? row['Search Query']);
  const listing = byItemId.get(String(row.item_id ?? row['Item ID']));
  if (!query || !listing) continue;
  if (bySearchQuery.has(query) && bySearchQuery.get(query)?.item_id !== listing.item_id) {
    bySearchQuery.set(query, null);
  } else {
    bySearchQuery.set(query, listing);
  }
}
const {headers: resultHeaders, rows} = readRows(resultsPath);

const grouped = new Map();
const skipped = [];

for (const [index, row] of rows.entries()) {
  const route = routeKeyForRow(row);
  let listing = null;
  if (route.type === 'item_id') listing = byItemId.get(route.value);
  if (route.type === 'template') listing = byTemplate.get(route.value);
  if (route.type === 'packet_dir') listing = byPacketDir.get(route.value);
  if (route.type === 'search_query') {
    if (bySearchQuery.has(route.value) && bySearchQuery.get(route.value) === null) {
      skipped.push({row_index: index + 1, route, reason: 'ambiguous search query matched multiple queued listings'});
      continue;
    }
    listing = bySearchQuery.get(route.value);
  }
  if (!listing && listings.length === 1 && route.type === 'missing') listing = listings[0];
  if (!listing) {
    skipped.push({row_index: index + 1, route, reason: 'could not match row to a queued listing'});
    continue;
  }
  const target = String(listing.item_id);
  if (!grouped.has(target)) grouped.set(target, {listing, rows: []});
  grouped.get(target).rows.push(row);
}

const writes = [];
for (const {listing, rows: listingRows} of grouped.values()) {
  const template = path.resolve(String(listing.competitor_import_template));
  const columns = templateColumns(listing);
  const existing = fs.existsSync(template) && args.replace !== true ? parseCsv(fs.readFileSync(template, 'utf8')).rows : [];
  const existingSignatures = new Set(existing.map(signatureForRow).filter((signature) => signature !== '::'));
  const mappedRows = [];
  const duplicateRows = [];
  for (const row of listingRows.map((candidate) => mapRowToTemplate(candidate, columns))) {
    const signature = signatureForRow(row);
    if (signature !== '::' && existingSignatures.has(signature)) {
      duplicateRows.push(row);
      continue;
    }
    if (signature !== '::') existingSignatures.add(signature);
    mappedRows.push(row);
  }
  const nextRows = args.replace === true ? mappedRows : [...existing, ...mappedRows];
  const csv = `${[
    columns.map(csvCell).join(','),
    ...nextRows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
  ].join('\n')}\n`;
  if (args['dry-run'] !== true) {
    ensureDir(path.dirname(template));
    fs.writeFileSync(template, csv);
  }
  writes.push({
    item_id: String(listing.item_id),
    title: listing.title,
    competitor_import_template: template,
    columns,
    incoming_rows: listingRows.length,
    imported_rows: mappedRows.length,
    duplicate_rows: duplicateRows.length,
    existing_rows: existing.length,
    final_rows: nextRows.length,
    low_match_rows: mappedRows.filter((row) => productMatchReview({listing, row}).score < 0.2).length,
    imported_preview_rows: mappedRows.slice(0, 10).map((row) => ({
      ...row,
      _review: {
        product_match: productMatchReview({listing, row}),
      },
    })),
    dry_run: args['dry-run'] === true,
  });
}

const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  dry_run: args['dry-run'] === true,
  replace: args.replace === true,
  source_queue: queuePath,
  source_results: resultsPath,
  result_headers: resultHeaders,
  route_sources: ['Item ID', 'Competitor Import Template', 'Packet Dir', 'Search Query'],
  result_rows: rows.length,
  matched_listing_count: writes.length,
  imported_rows: writes.reduce((sum, write) => sum + write.imported_rows, 0),
  duplicate_rows: writes.reduce((sum, write) => sum + write.duplicate_rows, 0),
  low_match_rows: writes.reduce((sum, write) => sum + write.low_match_rows, 0),
  skipped_rows: skipped.length,
  writes,
  skipped,
  next_command: `npm run ebay:competitive-research-process -- --queue "${queuePath}" --dry-run`,
};

const manifestPath = path.join(outDir, 'competitive-research-import-manifest.json');
const markdownPath = path.join(outDir, 'competitive-research-import-manifest.md');
writeJson(manifestPath, manifest);
fs.writeFileSync(markdownPath, `${[
  '# Competitive Research Results Import',
  '',
  `Dry run: ${manifest.dry_run}`,
  `Replace existing rows: ${manifest.replace}`,
  `Source queue: ${queuePath}`,
  `Source results: ${resultsPath}`,
  `Rows in results: ${manifest.result_rows}`,
  `Imported rows: ${manifest.imported_rows}`,
  `Duplicate rows skipped: ${manifest.duplicate_rows}`,
  `Unmatched rows: ${manifest.skipped_rows}`,
  '',
  '## Writes',
  '',
  ...writes.map((write) => `- ${write.item_id} ${write.title}: imported ${write.imported_rows}/${write.incoming_rows} rows into ${write.competitor_import_template}`),
  '',
  '## Skipped',
  '',
  ...skipped.map((row) => `- Row ${row.row_index}: ${row.reason}`),
  '',
  '## Next',
  '',
  '```bash',
  manifest.next_command,
  '```',
  '',
].join('\n')}\n`);

console.log(`Competitive research import manifest: ${manifestPath}`);
console.log(`Matched listings: ${writes.length}`);
console.log(`Imported rows: ${manifest.imported_rows}`);
console.log(`Skipped rows: ${manifest.skipped_rows}`);
