#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs} from './lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/build-competitive-review-board.mjs --status outputs/.../competitive-video-pipeline-status.json
  npm run ebay:competitive-review -- --status outputs/.../competitive-video-pipeline-status.json

Options:
  --status FILE      Pipeline status JSON from ebay:competitive-status.
  --out FILE         HTML output. Default: sibling competitive-review-board.html.

Builds a single HTML review board for a competitive listing video run. The board
shows selected competitor structure, trend evidence, preview videos, proof frames,
premium render blockers, and next action per listing before credits or uploads.
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

const readJsonIfExists = (file) => {
  if (!file || !fs.existsSync(file)) return null;
  return readJson(file);
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fileHref = (file, outDir) => {
  if (!file || !fs.existsSync(file)) return null;
  const relative = path.relative(outDir, file).split(path.sep).map(encodeURIComponent).join('/');
  return relative || path.basename(file);
};

const formatNumber = (value, options = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '0';
  return number.toLocaleString('en-US', options);
};

const formatMoney = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '$0';
  return `$${number.toLocaleString('en-US', {maximumFractionDigits: 0})}`;
};

const trendReason = (reference) => {
  const metrics = reference?.metrics ?? reference ?? {};
  const parts = [];
  if (metrics.views) parts.push(`${formatNumber(metrics.views)} views`);
  if (metrics.sold) parts.push(`${formatNumber(metrics.sold)} sold`);
  if (metrics.revenue) parts.push(`${formatMoney(metrics.revenue)} revenue`);
  if (metrics.growth_rate) parts.push(`${formatNumber(metrics.growth_rate)}% growth`);
  if (metrics.views_per_day) parts.push(`${formatNumber(metrics.views_per_day, {maximumFractionDigits: 0})} views/day`);
  if (metrics.sold_per_day) parts.push(`${formatNumber(metrics.sold_per_day, {maximumFractionDigits: 2})} sold/day`);
  if (metrics.engagement_rate) parts.push(`${(Number(metrics.engagement_rate) * 100).toFixed(1)}% engagement`);
  return parts.join(' | ') || 'No trend metrics';
};

const firstExisting = (...files) => files.find((file) => file && fs.existsSync(file)) ?? null;

const trendReportForBlueprint = (blueprintPath) => {
  if (!blueprintPath) return null;
  return firstExisting(
    path.join(path.dirname(blueprintPath), 'competitor-trend-report.json'),
    path.join(path.dirname(blueprintPath), 'competitor-trend-report.md'),
  );
};

const qaReportForStatus = (statusReport) => {
  const previewManifest = statusReport?.manifests?.preview;
  return firstExisting(
    previewManifest ? path.join(path.dirname(previewManifest), 'competitive-video-qa-report.json') : null,
    previewManifest ? path.join(path.dirname(previewManifest), 'competitive-video-qa-report.md') : null,
  );
};

const linkedFile = ({label, file, outDir}) => {
  const href = fileHref(file, outDir);
  if (!href) return '';
  return `<a href="${href}">${escapeHtml(label)}</a>`;
};

const renderMedia = ({item, outDir}) => {
  const previewHref = fileHref(item.preview?.final_video, outDir);
  const proofHref = fileHref(item.preview?.proof_frame, outDir);
  if (previewHref) {
    return `<video src="${previewHref}" controls preload="metadata" poster="${proofHref ?? ''}"></video>`;
  }
  if (proofHref) {
    return `<img src="${proofHref}" alt="${escapeHtml(item.title)} proof frame">`;
  }
  return '<div class="empty-media">No preview media yet</div>';
};

const statusTone = (status) => ({
  final_ready: 'good',
  ready_to_finalize: 'good',
  collected_waiting_finalize: 'warn',
  waiting_for_generated_clips: 'warn',
  research_review_required: 'warn',
  premium_packet_ready: 'warn',
  preview_ready: 'neutral',
  blueprint_only: 'neutral',
  failed: 'bad',
}[status] ?? 'neutral');

const renderQa = (qa) => {
  if (!qa) return '';
  const details = [
    qa.probe ? `${qa.probe.width}x${qa.probe.height}` : null,
    qa.probe?.duration_seconds ? `${Number(qa.probe.duration_seconds).toFixed(2)}s` : null,
    qa.audio?.mean_volume_db !== null && qa.audio?.mean_volume_db !== undefined ? `${Number(qa.audio.mean_volume_db).toFixed(1)} dB audio` : null,
    qa.scenes?.scene_change_count !== undefined ? `${qa.scenes.scene_change_count} scene changes` : null,
  ].filter(Boolean).join(' | ');
  const messages = [...(qa.issues ?? []), ...(qa.warnings ?? [])];
  return `
    <section>
      <h3>Video QA</h3>
      <p><span class="${qa.status === 'pass' ? 'ready' : qa.status === 'fail' ? 'bad-text' : 'missing'}">${escapeHtml(qa.status)}</span> Score ${escapeHtml(qa.score ?? 'n/a')}</p>
      <p class="meta">${escapeHtml(details)}</p>
      ${messages.length ? `<ul>${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul>` : '<p class="small">No technical QA issues.</p>'}
    </section>
  `;
};

const renderItemCard = ({item, blueprint, trendReport, qa, qaReportPath, creativePacket, outDir}) => {
  const selected = blueprint?.selected_reference ?? item.preview?.selected_reference ?? {};
  const ranked = trendReport?.ranked_references ?? blueprint?.ranked_references ?? [];
  const topTrend = ranked[0] ?? selected;
  const premiumJobs = item.premium?.jobs ?? [];
  const sourceLinks = [
    linkedFile({label: 'Blueprint', file: item.blueprint, outDir}),
    linkedFile({label: 'Trend report', file: trendReportForBlueprint(item.blueprint), outDir}),
    linkedFile({label: 'QA report', file: qaReportPath, outDir}),
    linkedFile({label: 'Preview manifest', file: item.preview?.manifest, outDir}),
    linkedFile({label: 'Render handoff', file: item.handoff?.manifest, outDir}),
    linkedFile({label: 'Handoff runbook', file: item.handoff?.runbook, outDir}),
    linkedFile({label: 'Render queue', file: item.handoff?.queue, outDir}),
    linkedFile({label: 'URL map template', file: item.handoff?.url_map_template, outDir}),
    linkedFile({label: 'Creative packet', file: creativePacket?.packet_markdown, outDir}),
    linkedFile({label: 'Packet JSON', file: creativePacket?.packet_json, outDir}),
    linkedFile({label: 'Research brief', file: creativePacket?.research_brief, outDir}),
    linkedFile({label: 'Final video', file: item.finalization?.final_video, outDir}),
  ].filter(Boolean);

  return `
    <article class="card ${statusTone(item.status)}">
      <div class="media">${renderMedia({item, outDir})}</div>
      <div class="content">
        <div class="eyebrow">${escapeHtml(item.item_id)} <span>${escapeHtml(item.status)}</span></div>
        <h2>${escapeHtml(item.title ?? 'Untitled listing')}</h2>
        <p class="next">${escapeHtml(item.next_action ?? '')}</p>

        <section>
          <h3>Selected Structure</h3>
          <p><strong>${escapeHtml(selected.title || 'No reference selected')}</strong></p>
          <p>${escapeHtml(selected.platform || 'unknown platform')} ${selected.creator ? `by ${escapeHtml(selected.creator)}` : ''}</p>
          <p>${selected.url ? `<a href="${escapeHtml(selected.url)}">Reference URL</a>` : ''}</p>
          <p class="meta">Fit ${formatNumber(selected.fit_score)} | Trend ${formatNumber(selected.metrics?.trend_score ?? topTrend.trend_score)} | ${escapeHtml(selected.hook_pattern ?? topTrend.hook_pattern ?? 'hook unknown')}</p>
          <p class="meta">${escapeHtml(trendReason(selected.metrics ? selected : topTrend))}</p>
        </section>

        ${renderQa(qa)}

        <section>
          <h3>Premium Render Jobs</h3>
          ${premiumJobs.length ? `
            <ul>
              ${premiumJobs.map((job) => `
                <li>
                  <code>${escapeHtml(job.id)}</code>
                  <span class="${job.exists ? 'ready' : 'missing'}">${job.exists ? 'clip exists' : 'missing clip'}</span>
                  ${job.competitor_pattern ? `<div class="small">Beat: ${escapeHtml(job.beat?.name ?? job.purpose ?? 'premium shot')} | Pattern: ${escapeHtml(job.competitor_pattern)}</div>` : ''}
                  ${job.caption_intent ? `<div class="small">Caption intent: ${escapeHtml(job.caption_intent)}</div>` : ''}
                  <div class="small">${escapeHtml(job.output_hint ?? '')}</div>
                </li>
              `).join('')}
            </ul>
          ` : '<p class="small">No premium render jobs prepared.</p>'}
        </section>

        ${item.handoff?.jobs?.length ? `
          <section>
            <h3>Render Handoff</h3>
            <p class="small">Batch queue ready: ${escapeHtml(item.handoff.jobs.length)} job${item.handoff.jobs.length === 1 ? '' : 's'}. Use the runbook or URL map template to produce/import the missing product-preserving MP4s.</p>
            <ul>
              ${item.handoff.jobs.map((job) => `
                <li>
                  <code>${escapeHtml(job.queue_id ?? job.job_id)}</code>
                  <span class="${job.output_exists ? 'ready' : 'missing'}">${job.output_exists ? 'clip exists' : 'awaiting render'}</span>
                  ${job.competitor_pattern ? `<div class="small">Pattern: ${escapeHtml(job.competitor_pattern)}</div>` : ''}
                  ${job.original_execution ? `<div class="small">Our execution: ${escapeHtml(job.original_execution)}</div>` : ''}
                  ${job.imported_audio_note ? `<div class="small">Audio feel: ${escapeHtml(job.imported_audio_note)}</div>` : ''}
                  <div class="small">${escapeHtml(job.output_hint ?? '')}</div>
                  ${job.missing_reference_images?.length ? `<div class="bad-text">Missing references: ${escapeHtml(job.missing_reference_images.join(', '))}</div>` : ''}
                </li>
              `).join('')}
            </ul>
          </section>
        ` : ''}

        ${item.premium_hold ? `
          <section>
            <h3>Research Quality Review</h3>
            <p class="missing">${escapeHtml(item.premium_hold.reason ?? 'held')}</p>
            ${item.premium_hold.reference_quality?.issues?.length ? `<ul>${item.premium_hold.reference_quality.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>` : ''}
          </section>
        ` : ''}

        ${item.blockers?.length ? `
          <section>
            <h3>Blockers</h3>
            <ul>${item.blockers.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join('')}</ul>
          </section>
        ` : ''}

        ${sourceLinks.length ? `<p class="links">${sourceLinks.join(' · ')}</p>` : ''}
      </div>
    </article>
  `;
};

const renderBoard = ({report, cards, outDir}) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Competitive Listing Video Review Board</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #111318;
      --muted: #586070;
      --line: #d9dee7;
      --good: #0e7a4f;
      --warn: #9a5b00;
      --bad: #b3261e;
      --paper: #f7f8fb;
      --card: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--paper);
      color: var(--ink);
      line-height: 1.45;
    }
    header {
      padding: 28px 32px 18px;
      border-bottom: 1px solid var(--line);
      background: #fff;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; color: var(--muted); }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; background: #fff; }
    main { padding: 22px 32px 40px; display: grid; gap: 20px; }
    .card {
      display: grid;
      grid-template-columns: minmax(240px, 360px) minmax(0, 1fr);
      gap: 20px;
      background: var(--card);
      border: 1px solid var(--line);
      border-left-width: 6px;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 2px rgba(17, 19, 24, 0.05);
    }
    .card.good { border-left-color: var(--good); }
    .card.warn { border-left-color: var(--warn); }
    .card.bad { border-left-color: var(--bad); }
    .card.neutral { border-left-color: #667085; }
    .media {
      min-height: 360px;
      background: #111;
      border-radius: 6px;
      overflow: hidden;
      display: grid;
      place-items: center;
    }
    video, img { width: 100%; max-height: 540px; object-fit: contain; display: block; }
    .empty-media { color: #fff; padding: 20px; }
    .content { min-width: 0; }
    .eyebrow { font-size: 13px; color: var(--muted); display: flex; gap: 10px; align-items: center; }
    .eyebrow span { text-transform: uppercase; letter-spacing: 0; font-weight: 700; }
    h2 { margin: 6px 0 8px; font-size: 22px; letter-spacing: 0; overflow-wrap: anywhere; }
    h3 { margin: 18px 0 6px; font-size: 14px; text-transform: uppercase; letter-spacing: 0; color: var(--muted); }
    p { margin: 5px 0; }
    .next { font-weight: 700; }
    .meta, .small { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    li { margin: 5px 0; }
    code { background: #f0f2f6; padding: 2px 5px; border-radius: 4px; }
    .ready { color: var(--good); font-weight: 700; margin-left: 8px; }
    .missing { color: var(--warn); font-weight: 700; margin-left: 8px; }
    .bad-text { color: var(--bad); font-weight: 700; margin-left: 8px; }
    .links { margin-top: 18px; }
    a { color: #0b57d0; text-decoration-thickness: 1px; }
    @media (max-width: 820px) {
      header, main { padding-left: 16px; padding-right: 16px; }
      .card { grid-template-columns: 1fr; }
      .media { min-height: 240px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Competitive Listing Video Review Board</h1>
    <div class="summary">
      <span class="pill">Items: ${escapeHtml(report.summary?.items ?? cards.length)}</span>
      <span class="pill">Statuses: ${escapeHtml(Object.entries(report.summary?.by_status ?? {}).map(([key, value]) => `${key}=${value}`).join(', ') || 'none')}</span>
      <span class="pill">Blockers: ${escapeHtml(report.summary?.blockers ?? 0)}</span>
      <span class="pill">Generated: ${escapeHtml(new Date().toISOString())}</span>
    </div>
  </header>
  <main>
    ${cards.join('\n')}
  </main>
</body>
</html>
`;

const statusPath = requireArg('status');
const outFile = path.resolve(String(args.out ?? path.join(path.dirname(statusPath), 'competitive-review-board.html')));
const outDir = path.dirname(outFile);
ensureDir(outDir);

const report = readJson(statusPath);
const qaReportPath = qaReportForStatus(report);
const qaReport = qaReportPath?.endsWith('.json') ? readJsonIfExists(qaReportPath) : null;
const qaByItem = new Map((qaReport?.items ?? []).map((item) => [String(item.item_id), item]));
const packetManifestPath = path.join(path.dirname(statusPath), 'competitive-creative-packets', 'competitive-creative-packets-manifest.json');
const packetManifest = readJsonIfExists(packetManifestPath);
const packetByItem = new Map((packetManifest?.packets ?? []).map((packet) => [String(packet.item_id), packet]));
const cards = (report.items ?? []).map((item) => {
  const blueprint = readJsonIfExists(item.blueprint);
  const trendReportPath = item.blueprint ? path.join(path.dirname(item.blueprint), 'competitor-trend-report.json') : null;
  const trendReport = readJsonIfExists(trendReportPath);
  const qa = qaByItem.get(String(item.item_id));
  const creativePacket = packetByItem.get(String(item.item_id));
  return renderItemCard({item, blueprint, trendReport, qa, qaReportPath, creativePacket, outDir});
});

fs.writeFileSync(outFile, renderBoard({report, cards, outDir}));

console.log(`Competitive review board: ${outFile}`);
console.log(`Items: ${report.items?.length ?? 0}`);
