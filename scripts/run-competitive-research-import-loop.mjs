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
  node scripts/run-competitive-research-import-loop.mjs --queue outputs/.../competitive-research-queue.json --results automatio-results.csv
  npm run ebay:competitive-research-loop -- --queue outputs/.../competitive-research-queue.json --results automatio-results.csv

Options:
  --queue FILE              Queue from ebay:competitive-research-queue.
  --results FILE            Consolidated Automatio/Kalodata CSV, JSON, or NDJSON export.
  --out-dir DIR             Default: sibling competitive-research-import-loop.
  --replace                 Replace existing competitor template rows during import.
  --dry-run                 Preview import routing only; do not modify templates.
  --run-reruns              Run ready listing reruns. Default is processor dry-run/planned mode.
  --item-ids IDS            Comma-separated item IDs to process.
  --skip-item-ids IDS       Comma-separated item IDs to skip.
  --limit N                 Max listings to process.
  --credit-budget N         Passed to rerun helper. Default: 45.
  --credits-per-shot N      Passed to rerun helper. Default: 22.5.
  --max-jobs-per-listing N  Passed to rerun helper. Default: 1.
  --min-fit-score N         Passed to rerun helper. Default: 1.
  --min-trend-score N       Passed to rerun helper. Default: 0.
  --min-product-match-score N Passed to processor. Default: 0.2.
  --analyze-reference-video Passed to rerun helper.
  --allow-weak-research     Passed to rerun helper.
  --allow-incomplete        Process templates even when title/video URL evidence is missing.
  --allow-no-trend-metrics  Process templates even when trend metrics are missing.
  --allow-low-product-match Process templates even when no row meets product-match threshold.
  --allow-weak-structure    Process templates even when no row includes hook/shot/caption structure evidence.

Imports one consolidated Automatio/Kalodata export into held listing research
templates, then validates/processes ready listings. By default it writes local
template rows and runs the processor in dry-run mode so you can inspect planned
reruns before spending generation credits.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const requireArg = (key) => {
  if (!args[key]) throw new Error(`Missing --${key}.\n${usage}`);
  return path.resolve(String(args[key]));
};

const readJsonIfExists = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const writeJson = (file, value) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const tail = (value, max = 5000) => {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return text.slice(text.length - max);
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fileHref = (file, outDir) => {
  if (!file) return null;
  const relative = path.relative(outDir, file).split(path.sep).map(encodeURIComponent).join('/');
  return relative || path.basename(file);
};

const runStep = ({name, commandArgs}) => {
  const startedAt = new Date().toISOString();
  const result = spawnSync('node', commandArgs, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50,
  });
  return {
    name,
    command: ['node', ...commandArgs].join(' '),
    status: result.status === 0 ? 'ok' : 'failed',
    exit_code: result.status,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr),
  };
};

const pushOption = (cmdArgs, key) => {
  if (args[key] === undefined || args[key] === false) return;
  cmdArgs.push(`--${key}`, String(args[key]));
};

const pushFlag = (cmdArgs, key) => {
  if (args[key] === true) cmdArgs.push(`--${key}`);
};

const queuePath = requireArg('queue');
const resultsPath = requireArg('results');
if (!fs.existsSync(queuePath)) throw new Error(`Competitive research queue not found: ${queuePath}`);
if (!fs.existsSync(resultsPath)) throw new Error(`Results export not found: ${resultsPath}`);

const defaultOutDir = path.basename(path.dirname(queuePath)) === 'competitive-research-queue'
  ? path.join(path.dirname(queuePath), '..', 'competitive-research-import-loop')
  : path.join(path.dirname(queuePath), 'competitive-research-import-loop');
const outDir = path.resolve(String(args['out-dir'] ?? defaultOutDir));
const importOutDir = path.join(outDir, 'import');
const processOutDir = path.join(outDir, 'process');
ensureDir(outDir);

const importArgs = [
  'scripts/import-competitive-research-results.mjs',
  '--queue',
  queuePath,
  '--results',
  resultsPath,
  '--out-dir',
  importOutDir,
];
pushFlag(importArgs, 'replace');
if (args['dry-run'] === true) importArgs.push('--dry-run');

const processArgs = [
  'scripts/process-competitive-research-queue.mjs',
  '--queue',
  queuePath,
  '--out-dir',
  processOutDir,
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
for (const key of ['item-ids', 'skip-item-ids', 'limit', 'analysis-max-seconds', 'min-product-match-score']) {
  pushOption(processArgs, key);
}
for (const key of ['analyze-reference-video', 'allow-weak-research', 'allow-incomplete', 'allow-no-trend-metrics', 'allow-low-product-match', 'allow-weak-structure']) {
  pushFlag(processArgs, key);
}
if (args['run-reruns'] !== true) processArgs.push('--dry-run');

const steps = [];
steps.push(runStep({name: 'import', commandArgs: importArgs}));
if (steps[0].status === 'ok') {
  steps.push(runStep({name: args['run-reruns'] === true ? 'process-and-rerun' : 'process-dry-run', commandArgs: processArgs}));
}

const importManifestPath = path.join(importOutDir, 'competitive-research-import-manifest.json');
const processManifestPath = path.join(processOutDir, 'competitive-research-batch-rerun-manifest.json');
const importManifest = readJsonIfExists(importManifestPath);
const processManifest = readJsonIfExists(processManifestPath);
const reviewBoardPath = path.join(outDir, 'competitive-research-import-review.html');
const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  ok: steps.every((step) => step.status === 'ok') && (processManifest?.ok ?? true),
  source_queue: queuePath,
  source_results: resultsPath,
  out_dir: outDir,
  dry_run: args['dry-run'] === true,
  process_dry_run: args['run-reruns'] !== true,
  import_manifest: importManifestPath,
  process_manifest: processManifestPath,
  review_board: reviewBoardPath,
  import_summary: importManifest ? {
    imported_rows: importManifest.imported_rows,
    duplicate_rows: importManifest.duplicate_rows,
    low_match_rows: importManifest.low_match_rows,
    skipped_rows: importManifest.skipped_rows,
    matched_listing_count: importManifest.matched_listing_count,
  } : null,
  process_summary: processManifest ? {
    selected_count: processManifest.selected_count,
    skipped_count: processManifest.skipped_count,
    result_count: processManifest.result_count,
    dry_run: processManifest.dry_run,
  } : null,
  steps,
};

const manifestPath = path.join(outDir, 'competitive-research-import-loop-manifest.json');
const markdownPath = path.join(outDir, 'competitive-research-import-loop-manifest.md');
writeJson(manifestPath, manifest);
fs.writeFileSync(reviewBoardPath, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Competitive Research Import Review</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #12151c;
      --muted: #5f6878;
      --line: #d8dee8;
      --paper: #f6f7f9;
      --card: #ffffff;
      --good: #0e7a4f;
      --warn: #9a5b00;
      --bad: #b3261e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    header {
      background: #fff;
      border-bottom: 1px solid var(--line);
      padding: 26px 32px 18px;
    }
    main { padding: 22px 32px 40px; display: grid; gap: 18px; }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 0 0 8px; font-size: 20px; letter-spacing: 0; }
    h3 { margin: 16px 0 6px; font-size: 14px; color: var(--muted); text-transform: uppercase; letter-spacing: 0; }
    p { margin: 5px 0; }
    .summary { display: flex; flex-wrap: wrap; gap: 10px; color: var(--muted); }
    .pill { border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 4px 10px; }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-left: 6px solid #667085;
      border-radius: 8px;
      padding: 16px;
      overflow: hidden;
    }
    .ready { border-left-color: var(--good); }
    .held { border-left-color: var(--warn); }
    .failed { border-left-color: var(--bad); }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
    th, td { border-bottom: 1px solid var(--line); padding: 8px; text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 700; }
    code { background: #eef1f6; padding: 2px 5px; border-radius: 4px; overflow-wrap: anywhere; }
    .meta, .small { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
    .good-text { color: var(--good); font-weight: 700; }
    .warn-text { color: var(--warn); font-weight: 700; }
    .bad-text { color: var(--bad); font-weight: 700; }
    a { color: #0b57d0; }
    @media (max-width: 760px) {
      header, main { padding-left: 16px; padding-right: 16px; }
      table { display: block; overflow-x: auto; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Competitive Research Import Review</h1>
    <div class="summary">
      <span class="pill">OK: ${escapeHtml(manifest.ok)}</span>
      <span class="pill">Import dry run: ${escapeHtml(manifest.dry_run)}</span>
      <span class="pill">Processor dry run: ${escapeHtml(manifest.process_dry_run)}</span>
      <span class="pill">Imported rows: ${escapeHtml(manifest.import_summary?.imported_rows ?? 0)}</span>
      <span class="pill">Low-match rows: ${escapeHtml(manifest.import_summary?.low_match_rows ?? 0)}</span>
      <span class="pill">Selected listings: ${escapeHtml(manifest.process_summary?.selected_count ?? 0)}</span>
      <span class="pill">Skipped listings: ${escapeHtml(manifest.process_summary?.skipped_count ?? 0)}</span>
    </div>
  </header>
  <main>
    <section class="card">
      <h2>Run Inputs</h2>
      <p class="small">Queue: <code>${escapeHtml(queuePath)}</code></p>
      <p class="small">Results: <code>${escapeHtml(resultsPath)}</code></p>
      <p class="small">
        <a href="${escapeHtml(fileHref(importManifestPath, outDir))}">Import manifest</a>
        ·
        <a href="${escapeHtml(fileHref(processManifestPath, outDir))}">Process manifest</a>
      </p>
    </section>

    <section class="card ${manifest.process_summary?.selected_count ? 'ready' : 'held'}">
      <h2>Processor Readiness</h2>
      <p>${manifest.process_summary?.selected_count
        ? `<span class="good-text">${escapeHtml(manifest.process_summary.selected_count)} listing(s) ready for planned rerun.</span>`
        : '<span class="warn-text">No listings selected yet.</span>'}</p>
      <table>
        <thead><tr><th>Item</th><th>Status</th><th>Command / Reason</th></tr></thead>
        <tbody>
          ${(processManifest?.results ?? []).map((result) => `
            <tr>
              <td><code>${escapeHtml(result.item_id)}</code><br>${escapeHtml(result.title)}</td>
              <td>${escapeHtml(result.status)}</td>
              <td><code>${escapeHtml(result.command)}</code></td>
            </tr>
          `).join('')}
          ${(processManifest?.skipped ?? []).map((item) => `
            <tr>
              <td><code>${escapeHtml(item.item_id)}</code><br>${escapeHtml(item.title)}</td>
              <td>skipped</td>
              <td>${escapeHtml(item.skip_reason)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>

    <section class="card">
      <h2>Imported Competitor Rows</h2>
      ${(importManifest?.writes ?? []).map((write) => `
        <article>
          <h3>${escapeHtml(write.item_id)} · ${escapeHtml(write.title)}</h3>
          <p class="small">Template: <code>${escapeHtml(write.competitor_import_template)}</code></p>
          <p class="small">Imported ${escapeHtml(write.imported_rows)} of ${escapeHtml(write.incoming_rows)} incoming rows. Duplicates skipped: ${escapeHtml(write.duplicate_rows)}. Low product-match rows: ${escapeHtml(write.low_match_rows ?? 0)}.</p>
          <table>
            <thead><tr><th>Product Title</th><th>Video URL</th><th>Hook</th><th>Trend Evidence</th><th>Product Match</th></tr></thead>
            <tbody>
              ${(write.imported_preview_rows ?? []).map((row) => `
                <tr>
                  <td>${escapeHtml(row['Product Title'] ?? row['Video Title'] ?? '')}</td>
                  <td>${row['Video URL'] ? `<a href="${escapeHtml(row['Video URL'])}">${escapeHtml(row['Video URL'])}</a>` : ''}</td>
                  <td>${escapeHtml(row.Hook ?? '')}</td>
                  <td>${escapeHtml([
                    row['Video Views'] ? `${row['Video Views']} views` : '',
                    row['Items Sold'] ? `${row['Items Sold']} sold` : '',
                    row['Total Revenue'] ? `${row['Total Revenue']} revenue` : '',
                    row['Product GMV'] ? `${row['Product GMV']} GMV` : '',
                    row['Engagement Rate'] ? `${row['Engagement Rate']} engagement` : '',
                  ].filter(Boolean).join(' | '))}</td>
                  <td>
                    <span class="${row._review?.product_match?.score >= 0.2 ? 'good-text' : 'warn-text'}">${escapeHtml(row._review?.product_match?.score ?? 0)}</span>
                    <div class="small">${escapeHtml((row._review?.product_match?.shared_terms ?? []).join(', ') || 'No shared product terms')}</div>
                    ${(row._review?.product_match?.warnings ?? []).map((warning) => `<div class="warn-text">${escapeHtml(warning)}</div>`).join('')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </article>
      `).join('') || '<p class="small">No imported rows.</p>'}
    </section>

    ${(importManifest?.skipped ?? []).length ? `
      <section class="card failed">
        <h2>Unmatched Rows</h2>
        <table>
          <thead><tr><th>Row</th><th>Route</th><th>Reason</th></tr></thead>
          <tbody>
            ${importManifest.skipped.map((row) => `
              <tr>
                <td>${escapeHtml(row.row_index)}</td>
                <td>${escapeHtml(`${row.route?.type ?? ''}: ${row.route?.value ?? ''}`)}</td>
                <td>${escapeHtml(row.reason)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    ` : ''}
  </main>
</body>
</html>
`);
fs.writeFileSync(markdownPath, `${[
  '# Competitive Research Import Loop',
  '',
  `OK: ${manifest.ok}`,
  `Import dry run: ${manifest.dry_run}`,
  `Processor dry run: ${manifest.process_dry_run}`,
  `Source queue: ${queuePath}`,
  `Source results: ${resultsPath}`,
  `Review board: ${reviewBoardPath}`,
  '',
  '## Import Summary',
  '',
  manifest.import_summary
    ? `Imported rows: ${manifest.import_summary.imported_rows}\nDuplicate rows: ${manifest.import_summary.duplicate_rows}\nLow product-match rows: ${manifest.import_summary.low_match_rows}\nSkipped rows: ${manifest.import_summary.skipped_rows}\nMatched listings: ${manifest.import_summary.matched_listing_count}`
    : 'No import manifest found.',
  '',
  '## Process Summary',
  '',
  manifest.process_summary
    ? `Selected listings: ${manifest.process_summary.selected_count}\nSkipped listings: ${manifest.process_summary.skipped_count}\nResults: ${manifest.process_summary.result_count}`
    : 'No process manifest found.',
  '',
  '## Steps',
  '',
  ...steps.map((step) => `- ${step.name}: ${step.status} (${step.exit_code})`),
  '',
].join('\n')}\n`);

console.log(`Competitive research import loop: ${manifestPath}`);
console.log(`Imported rows: ${manifest.import_summary?.imported_rows ?? 0}`);
console.log(`Selected listings: ${manifest.process_summary?.selected_count ?? 0}`);
console.log(`Processor dry run: ${manifest.process_dry_run}`);
if (!manifest.ok) process.exitCode = 1;
