#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/process-competitive-research-queue.mjs --queue outputs/.../competitive-research-queue.json
  npm run ebay:competitive-research-process -- --queue outputs/.../competitive-research-queue.json
  npm run ebay:competitive-research-process -- --status outputs/.../competitive-video-pipeline-status.json

Options:
  --queue FILE              Queue from ebay:competitive-research-queue.
  --status FILE             Pipeline status JSON; infers sibling competitive-research-queue JSON.
  --out-dir DIR             Default: sibling competitive-research-batch-rerun.
  --item-ids IDS            Comma-separated item IDs to process.
  --skip-item-ids IDS       Comma-separated item IDs to skip.
  --limit N                 Max listings to process.
  --credit-budget N         Passed to rerun helper. Default: 45.
  --credits-per-shot N      Passed to rerun helper. Default: 22.5.
  --max-jobs-per-listing N  Passed to rerun helper. Default: 1.
  --min-fit-score N         Passed to rerun helper. Default: 1.
  --min-trend-score N       Passed to rerun helper. Default: 0.
  --min-product-match-score N Require at least one row at or above this title-match score. Default: 0.2.
  --analyze-reference-video Passed to rerun helper.
  --allow-weak-research     Passed to rerun helper.
  --allow-incomplete        Process templates even when required product title/video URL evidence is missing.
  --allow-no-trend-metrics  Process templates even when no trend metrics are present.
  --allow-low-product-match Process templates even when no row meets product-match threshold.
  --allow-weak-structure    Process templates even when no row includes hook/shot/caption structure evidence.
  --dry-run                 Write planned reruns without running them.

Scans a competitive research queue, finds filled competitor import templates,
and reruns every ready held listing through the competitive pipeline.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const idSet = (value) => new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean));

const queuePath = (() => {
  if (args.queue) return path.resolve(String(args.queue));
  if (args.status) {
    const statusPath = path.resolve(String(args.status));
    return path.join(path.dirname(statusPath), 'competitive-research-queue', 'competitive-research-queue.json');
  }
  throw new Error(`Missing --queue or --status.\n${usage}`);
})();

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
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
};

const extractRowsFromJson = (value) => {
  if (Array.isArray(value)) return value;
  for (const key of ['records', 'items', 'videos', 'products', 'rows', 'data', 'results']) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return value && typeof value === 'object' ? [value] : [];
};

const readRows = (file) => {
  if (!fs.existsSync(file)) return {rows: [], error: 'file missing'};
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return {rows: [], error: 'file empty'};
  try {
    if (/\.csv$/i.test(file)) return {rows: parseCsv(text), error: null};
    if (/\.ndjson$/i.test(file) || text.split(/\r?\n/).every((line) => line.trim().startsWith('{'))) {
      return {rows: text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)), error: null};
    }
    return {rows: extractRowsFromJson(JSON.parse(text)), error: null};
  } catch (error) {
    return {rows: [], error: error instanceof Error ? error.message : String(error)};
  }
};

const keyMatches = (candidate, wanted) =>
  candidate.toLowerCase().replace(/[^a-z0-9]/g, '') === wanted.toLowerCase().replace(/[^a-z0-9]/g, '');

const firstValue = (row, keys) => {
  for (const key of keys) {
    if (row?.[key] !== undefined && String(row[key] ?? '').trim()) return String(row[key]).trim();
    const matched = Object.keys(row ?? {}).find((candidate) => keyMatches(candidate, key));
    if (matched && String(row[matched] ?? '').trim()) return String(row[matched]).trim();
  }
  return '';
};

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

const productMatchScore = ({listing, row}) => {
  const listingTerms = Array.from(new Set(titleTokens(listing.title)));
  const competitorText = [
    firstValue(row, ['Product Title', 'Video Title', 'title', 'name']),
    firstValue(row, ['Caption']),
    firstValue(row, ['Hook']),
    firstValue(row, ['Product Category']),
  ].filter(Boolean).join(' ');
  const competitorTerms = Array.from(new Set(titleTokens(competitorText)));
  const shared = listingTerms.filter((term) => competitorTerms.includes(term));
  const denominator = Math.max(1, Math.min(listingTerms.length, competitorTerms.length));
  return Number((shared.length / denominator).toFixed(3));
};

const trendMetricKeys = [
  'Video Views',
  'Views',
  'Items Sold',
  'Total Revenue',
  'Revenue Growth Rate',
  'Product GMV',
  'GMV',
  'GMV Growth Rate',
  'Product Units Sold',
  'Units Sold',
  'Video Likes',
  'Likes',
  'Video Comments',
  'Comments',
  'Video Shares',
  'Shares',
  'Engagement Rate',
  'Posting Date',
  'Published At',
];

const structureEvidenceKeys = [
  'Shot Breakdown',
  'shot_breakdown',
  'Visual Notes',
  'Creative Notes',
  'Hook',
  'opening_hook',
  'Caption',
  'Video Title',
  'Duration Seconds',
  'duration_seconds',
  'Audio Notes',
  'Hashtags',
];

const validateRows = ({rows, listing, minProductMatchScore}) => {
  const usable = rows.filter((row) => {
    const title = firstValue(row, ['Product Title', 'Video Title', 'title', 'name']);
    const url = firstValue(row, ['Video URL', 'url', 'video_url', 'link']);
    return title && url;
  });
  const metricRows = rows.filter((row) => firstValue(row, trendMetricKeys));
  const structureRows = usable.filter((row) => firstValue(row, structureEvidenceKeys));
  const productMatchRows = usable.filter((row) => productMatchScore({listing, row}) >= minProductMatchScore);
  const maxProductMatchScore = usable.reduce(
    (max, row) => Math.max(max, productMatchScore({listing, row})),
    0,
  );
  const issues = [];
  if (rows.length === 0) issues.push('no data rows');
  if (usable.length === 0) issues.push('no row has both product title and video URL');
  if (metricRows.length === 0) issues.push('no rows include trend metrics');
  if (usable.length > 0 && structureRows.length === 0) issues.push('no rows include structure evidence');
  if (usable.length > 0 && productMatchRows.length === 0) issues.push('no rows meet product-match threshold');
  return {
    row_count: rows.length,
    usable_row_count: usable.length,
    metric_row_count: metricRows.length,
    structure_row_count: structureRows.length,
    product_match_row_count: productMatchRows.length,
    max_product_match_score: maxProductMatchScore,
    min_product_match_score: minProductMatchScore,
    issues,
  };
};

const tail = (value, max = 5000) => {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return text.slice(text.length - max);
};

const pushOption = (cmdArgs, key) => {
  if (args[key] === undefined || args[key] === false) return;
  cmdArgs.push(`--${key}`, String(args[key]));
};

const runRerun = ({listing, commandArgs}) => {
  const entry = {
    item_id: listing.item_id,
    title: listing.title,
    packet_dir: listing.packet_dir,
    competitors: listing.competitor_import_template,
    command: ['node', ...commandArgs].join(' '),
    status: args['dry-run'] === true ? 'planned' : 'running',
    started_at: null,
    finished_at: null,
    exit_code: null,
    stdout_tail: '',
    stderr_tail: '',
  };
  if (args['dry-run'] === true) return entry;
  entry.started_at = new Date().toISOString();
  const result = spawnSync('node', commandArgs, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50,
  });
  entry.finished_at = new Date().toISOString();
  entry.exit_code = result.status;
  entry.stdout_tail = tail(result.stdout);
  entry.stderr_tail = tail(result.stderr);
  entry.status = result.status === 0 ? 'ok' : 'failed';
  return entry;
};

if (!fs.existsSync(queuePath)) {
  throw new Error(`Competitive research queue not found: ${queuePath}. Run ebay:competitive-research-queue first.`);
}

const queue = readJson(queuePath);
const defaultOutDir = path.basename(path.dirname(queuePath)) === 'competitive-research-queue'
  ? path.join(path.dirname(queuePath), '..', 'competitive-research-batch-rerun')
  : path.join(path.dirname(queuePath), 'competitive-research-batch-rerun');
const outDir = path.resolve(String(args['out-dir'] ?? defaultOutDir));
ensureDir(outDir);
const onlyIds = idSet(args['item-ids']);
const skipIds = idSet(args['skip-item-ids']);
const limit = args.limit === undefined ? Infinity : Math.max(0, Math.floor(Number(args.limit)));
const allowIncomplete = args['allow-incomplete'] === true;
const allowNoTrendMetrics = args['allow-no-trend-metrics'] === true;
const allowLowProductMatch = args['allow-low-product-match'] === true;
const allowWeakStructure = args['allow-weak-structure'] === true;
const minProductMatchScore = args['min-product-match-score'] === undefined ? 0.2 : Number(args['min-product-match-score']);

const evaluated = [];
const selected = [];
const skipped = [];

for (const listing of queue.listings ?? []) {
  const itemId = String(listing.item_id);
  if (onlyIds.size > 0 && !onlyIds.has(itemId)) {
    skipped.push({...listing, skip_reason: 'not in item-ids'});
    continue;
  }
  if (skipIds.has(itemId)) {
    skipped.push({...listing, skip_reason: 'skip item list'});
    continue;
  }
  const importPath = listing.competitor_import_template;
  const {rows, error} = readRows(importPath);
  const validation = validateRows({rows, listing, minProductMatchScore});
  const evaluation = {...listing, import_error: error, validation};
  evaluated.push(evaluation);
  if (error) {
    skipped.push({...evaluation, skip_reason: `import error: ${error}`});
    continue;
  }
  if (!allowIncomplete && validation.issues.includes('no row has both product title and video URL')) {
    skipped.push({...evaluation, skip_reason: validation.issues.join('; ')});
    continue;
  }
  if (!allowNoTrendMetrics && validation.issues.includes('no rows include trend metrics')) {
    skipped.push({...evaluation, skip_reason: validation.issues.join('; ')});
    continue;
  }
  if (!allowWeakStructure && validation.issues.includes('no rows include structure evidence')) {
    skipped.push({...evaluation, skip_reason: validation.issues.join('; ')});
    continue;
  }
  if (!allowLowProductMatch && validation.issues.includes('no rows meet product-match threshold')) {
    skipped.push({...evaluation, skip_reason: validation.issues.join('; ')});
    continue;
  }
  if (selected.length >= limit) {
    skipped.push({...evaluation, skip_reason: 'limit reached'});
    continue;
  }
  selected.push(evaluation);
}

const results = [];
for (const listing of selected) {
  const commandArgs = [
    'scripts/rerun-competitive-research-packet.mjs',
    '--packet-dir',
    listing.packet_dir,
    '--competitors',
    listing.competitor_import_template,
    '--credit-budget',
    String(args['credit-budget'] ?? 45),
    '--credits-per-shot',
    String(args['credits-per-shot'] ?? 22.5),
    '--max-jobs-per-listing',
    String(args['max-jobs-per-listing'] ?? 1),
    '--min-fit-score',
    String(args['min-fit-score'] ?? 1),
    '--min-trend-score',
    String(args['min-trend-score'] ?? 0),
  ];
  if (args['analyze-reference-video'] === true) commandArgs.push('--analyze-reference-video');
  if (args['allow-weak-research'] === true) commandArgs.push('--allow-weak-research');
  pushOption(commandArgs, 'analysis-max-seconds');
  if (args['dry-run'] === true) commandArgs.push('--dry-run');
  results.push(runRerun({listing, commandArgs}));
}

const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  ok: results.every((result) => result.status === 'ok' || result.status === 'planned'),
  dry_run: args['dry-run'] === true,
  source_queue: queuePath,
  out_dir: outDir,
  quality_gate: {
    require_product_title_and_video_url: !allowIncomplete,
    require_trend_metrics: !allowNoTrendMetrics,
    require_structure_evidence: !allowWeakStructure,
    require_product_match: !allowLowProductMatch,
    min_product_match_score: minProductMatchScore,
    trend_metric_keys: trendMetricKeys,
    structure_evidence_keys: structureEvidenceKeys,
  },
  evaluated_count: evaluated.length,
  selected_count: selected.length,
  skipped_count: skipped.length,
  result_count: results.length,
  evaluated,
  skipped,
  results,
};

const manifestPath = path.join(outDir, 'competitive-research-batch-rerun-manifest.json');
const markdownPath = path.join(outDir, 'competitive-research-batch-rerun-manifest.md');
writeJson(manifestPath, manifest);
fs.writeFileSync(markdownPath, `${[
  '# Competitive Research Batch Rerun',
  '',
  `OK: ${manifest.ok}`,
  `Dry run: ${manifest.dry_run}`,
  `Source queue: ${queuePath}`,
  `Requires product title and video URL: ${!allowIncomplete}`,
  `Requires trend metrics: ${!allowNoTrendMetrics}`,
  `Requires structure evidence: ${!allowWeakStructure}`,
  `Requires product match: ${!allowLowProductMatch}`,
  `Minimum product match score: ${minProductMatchScore}`,
  `Selected: ${selected.length}`,
  `Skipped: ${skipped.length}`,
  '',
  '## Results',
  '',
  ...results.map((result) => `- ${result.item_id} ${result.title}: ${result.status}`),
  '',
  '## Skipped',
  '',
  ...skipped.map((item) => `- ${item.item_id} ${item.title}: ${item.skip_reason}`),
  '',
].join('\n')}\n`);

console.log(`Competitive research batch rerun: ${manifestPath}`);
console.log(`Selected listings: ${selected.length}`);
console.log(`Skipped listings: ${skipped.length}`);
console.log(`Results: ${results.length}`);
if (!manifest.ok) process.exitCode = 1;
