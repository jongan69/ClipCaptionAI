#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs} from './lib.mjs';
import {slugify} from './clipkit-lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/export-competitive-creative-packets.mjs --status outputs/.../competitive-video-pipeline-status.json
  npm run ebay:competitive-packets -- --status outputs/.../competitive-video-pipeline-status.json

Options:
  --status FILE        Pipeline status JSON from ebay:competitive-status.
  --out-dir DIR        Default: sibling competitive-creative-packets.
  --no-preview-copy    Do not copy preview MP4/proof frame into each packet.

Exports one self-contained creative packet per listing: blueprint summary,
competitor-inspired beat map, product-truth references, preview QA evidence,
Higgsfield render prompts, URL-map template, and rejection checklist.
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
const readJsonIfExists = (file) => file && fs.existsSync(file) ? readJson(file) : null;
const writeJson = (file, value) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const copyIfExists = ({source, dest, missing}) => {
  if (!source) return null;
  if (!fs.existsSync(source)) {
    missing.push(source);
    return null;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(source, dest);
  return dest;
};

const relativeOrNull = (from, file) => file ? path.relative(from, file).split(path.sep).join('/') : null;

const qaReportForStatus = (status) => {
  const preview = status?.manifests?.preview;
  const candidates = [
    preview ? path.join(path.dirname(preview), 'competitive-video-qa-report.json') : null,
    status?.manifests?.qa_report,
  ].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file)) ?? null;
};

const competitorColumns = [
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

const researchSourceNote = [
  'Kalodata is JavaScript-rendered, login-gated, paginated, and protected by anti-bot checks.',
  'Use Automatio or another logged-in browser scraper to export CSV/JSON rows, then import those rows here.',
  'Do not spend premium render credits until the selected reference has a real video URL, product fit, and trend evidence.',
];

const researchQueriesForItem = ({item, blueprint}) => {
  const title = item.title ?? blueprint?.listing?.title ?? `eBay item ${item.item_id}`;
  const category = blueprint?.listing?.inferred_category ?? 'marketplace product';
  const compactTitle = title.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const nouns = compactTitle
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 7)
    .join(' ');
  return [
    `${compactTitle} product demo`,
    `${compactTitle} TikTok Shop`,
    `${compactTitle} review video`,
    `${nouns} high converting ad`,
    `${category} problem solution product video`,
    `${category} UGC product demonstration`,
  ];
};

const writeResearchBrief = ({item, blueprint, packetDir}) => {
  if (item.status !== 'research_review_required' && !item.premium_hold?.reference_quality) return null;
  const researchDir = path.join(packetDir, 'research');
  ensureDir(researchDir);
  const sourcePrompt = item.blueprint
    ? path.join(path.dirname(item.blueprint), 'kalodata-automatio-prompt.md')
    : null;
  const promptText = sourcePrompt && fs.existsSync(sourcePrompt)
    ? fs.readFileSync(sourcePrompt, 'utf8')
    : null;
  const queries = researchQueriesForItem({item, blueprint});
  const templatePath = path.join(researchDir, 'competitor-import-template.csv');
  fs.writeFileSync(templatePath, `${competitorColumns.join(',')}\n`);
  const brief = {
    item_id: item.item_id,
    title: item.title,
    status: item.status,
    hold_reason: item.premium_hold?.reason ?? null,
    issues: item.premium_hold?.reference_quality?.issues ?? [],
    required_columns: competitorColumns,
    search_queries: queries,
    research_source_note: researchSourceNote,
    source_prompt: sourcePrompt && fs.existsSync(sourcePrompt) ? sourcePrompt : null,
    competitor_import_template: templatePath,
    rerun_command: `npm run ebay:creative-intel -- plan --project-dir "${item.project_dir ?? '<listing project>'}" --competitors "<export.csv>"`,
  };
  writeJson(path.join(researchDir, 'research-brief.json'), brief);
  fs.writeFileSync(path.join(researchDir, 'research-brief.md'), `${[
    `# Competitor Research Brief: ${item.title ?? item.item_id}`,
    '',
    `Item ID: ${item.item_id}`,
    `Status: ${item.status}`,
    item.premium_hold?.reason ? `Hold reason: ${item.premium_hold.reason}` : null,
    '',
    '## Why This Is Held',
    '',
    ...(item.premium_hold?.reference_quality?.issues ?? ['Needs stronger competitor evidence.']).map((issue) => `- ${issue}`),
    '',
    '## Search Queries',
    '',
    ...queries.map((query) => `- ${query}`),
    '',
    '## Why Export First',
    '',
    ...researchSourceNote.map((note) => `- ${note}`),
    '',
    '## Required Export Columns',
    '',
    competitorColumns.join(', '),
    '',
    '## Kalodata / Automatio Prompt',
    '',
    promptText ?? 'Use the search queries above, then export rows with the required columns.',
    '',
    '## Import Command',
    '',
    '```bash',
    brief.rerun_command,
    '```',
    '',
  ].filter((line) => line !== null).join('\n')}\n`);
  return {
    research_dir: researchDir,
    research_brief_json: path.join(researchDir, 'research-brief.json'),
    research_brief_markdown: path.join(researchDir, 'research-brief.md'),
    competitor_import_template: templatePath,
  };
};

const markdownForPacket = ({item, blueprint, qa, local, packetDir}) => {
  const selected = blueprint?.selected_reference ?? item.preview?.selected_reference ?? {};
  const beats = blueprint?.beats ?? [];
  const jobs = item.handoff?.jobs ?? item.premium?.jobs ?? [];
  const lines = [
    `# Creative Packet: ${item.title ?? item.item_id}`,
    '',
    `Item ID: ${item.item_id}`,
    `Status: ${item.status}`,
    `Next action: ${item.next_action}`,
    item.premium_hold ? `Hold reason: ${item.premium_hold.reason}` : null,
    '',
    '## Selected Structure',
    '',
    `Reference title: ${selected.title ?? 'No reference selected'}`,
    `Platform: ${selected.platform ?? 'unknown'}`,
    `Reference URL: ${selected.url ?? 'none'}`,
    `Hook pattern: ${selected.hook_pattern ?? 'unknown'}`,
    `Fit score: ${selected.fit_score ?? 0}`,
    `Trend score: ${selected.metrics?.trend_score ?? selected.trend_score ?? 0}`,
    '',
    '## Beat Map',
    '',
    '| Time | Beat | Competitor Pattern | Original Execution | Assets |',
    '| --- | --- | --- | --- | --- |',
    ...beats.map((beat) => {
      const time = beat.time_seconds ? `${beat.time_seconds.start}-${beat.time_seconds.end}s` : '';
      return `| ${time} | ${beat.beat ?? ''} | ${String(beat.competitor_pattern ?? '').replaceAll('|', '/')} | ${String(beat.original_execution ?? '').replaceAll('|', '/')} | ${(beat.source_assets ?? []).join(', ')} |`;
    }),
    '',
    '## Product Truth',
    '',
    ...(blueprint?.product_truth_rules ?? [
      'Use actual listing photos as the source of truth.',
      'Reject generated clips that change color, shape, scale, labels, condition, or included items.',
    ]).map((rule) => `- ${rule}`),
    '',
    item.premium_hold?.reference_quality?.issues?.length ? [
      '## Research Quality Review',
      '',
      ...item.premium_hold.reference_quality.issues.map((issue) => `- ${issue}`),
      '',
    ] : [],
    '## Local Assets',
    '',
    local.preview_video ? `- Preview video: ${relativeOrNull(packetDir, local.preview_video)}` : '- Preview video: not copied',
    local.proof_frame ? `- Proof frame: ${relativeOrNull(packetDir, local.proof_frame)}` : '- Proof frame: not copied',
    ...local.reference_images.map((image) => `- Reference image: ${relativeOrNull(packetDir, image)}`),
    '',
    '## Preview QA',
    '',
    qa ? [
      `Status: ${qa.status}`,
      `Score: ${qa.score}`,
      qa.probe ? `Probe: ${qa.probe.width}x${qa.probe.height}, ${qa.probe.duration_seconds}s, audio=${qa.probe.has_audio}` : null,
      qa.audio?.mean_volume_db !== undefined ? `Mean audio: ${qa.audio.mean_volume_db} dB` : null,
      qa.scenes?.scene_change_count !== undefined ? `Scene changes: ${qa.scenes.scene_change_count}` : null,
      ...(qa.issues?.length ? ['Issues:', ...qa.issues.map((issue) => `- ${issue}`)] : []),
      ...(qa.warnings?.length ? ['Warnings:', ...qa.warnings.map((warning) => `- ${warning}`)] : []),
    ].filter(Boolean).join('\n') : 'No QA report found.',
    '',
    '## Higgsfield Jobs',
    '',
    ...jobs.flatMap((job, index) => [
      `### ${index + 1}. ${job.queue_id ?? job.id ?? job.job_id}`,
      '',
      `Output: ${job.output_hint}`,
      `Estimated credits: ${job.estimated_credits ?? 'unknown'}`,
      job.missing_reference_images?.length ? `Missing references: ${job.missing_reference_images.join(', ')}` : 'Missing references: none',
      '',
      'Prompt:',
      '',
      '```text',
      job.prompt ?? 'See render-queue.json for prompt details.',
      '```',
      '',
    ]),
    '## Rejection Checklist',
    '',
    '- Generated product matches the real listing reference image.',
    '- No fake accessories, fake room features, fake labels, fake packaging, or changed condition.',
    '- First second clearly shows what is for sale.',
    '- The clip follows the competitor-inspired pacing without using competitor media.',
    '- Final MP4 has a video stream and passes the competitive QA gate.',
    '',
  ];
  return `${lines.flat().join('\n')}\n`;
};

const statusPath = requireArg('status');
if (!fs.existsSync(statusPath)) throw new Error(`Status file not found: ${statusPath}`);
const status = readJson(statusPath);
const qaPath = qaReportForStatus(status);
const qaReport = readJsonIfExists(qaPath);
const qaByItem = new Map((qaReport?.items ?? []).map((item) => [String(item.item_id), item]));
const outDir = path.resolve(String(args['out-dir'] ?? path.join(path.dirname(statusPath), 'competitive-creative-packets')));
ensureDir(outDir);

const packets = [];
for (const item of status.items ?? []) {
  const packetSlug = `${item.item_id}-${slugify(item.title ?? 'listing')}`;
  const packetDir = path.join(outDir, packetSlug);
  const referenceDir = path.join(packetDir, 'product-references');
  const previewDir = path.join(packetDir, 'preview');
  const missing = [];
  ensureDir(packetDir);
  ensureDir(referenceDir);

  const blueprint = readJsonIfExists(item.blueprint);
  const qa = qaByItem.get(String(item.item_id)) ?? null;
  const copiedReferences = [];
  const referenceSources = [
    ...(item.premium?.jobs ?? []).flatMap((job) => job.reference_images ?? []),
    ...(item.handoff?.jobs ?? []).flatMap((job) => job.reference_images ?? []),
  ];
  for (const [index, source] of [...new Set(referenceSources)].entries()) {
    const dest = path.join(referenceDir, `${String(index + 1).padStart(2, '0')}-${path.basename(source)}`);
    const copied = copyIfExists({source, dest, missing});
    if (copied) copiedReferences.push(copied);
  }

  const shouldCopyPreview = args['no-preview-copy'] !== true;
  const previewVideo = shouldCopyPreview
    ? copyIfExists({source: item.preview?.final_video, dest: path.join(previewDir, path.basename(item.preview?.final_video ?? 'preview.mp4')), missing})
    : null;
  const proofFrame = shouldCopyPreview
    ? copyIfExists({source: item.preview?.proof_frame, dest: path.join(previewDir, path.basename(item.preview?.proof_frame ?? 'proof-frame.jpg')), missing})
    : null;

  const queue = {jobs: (item.handoff?.jobs ?? []).map((job) => ({...job, item_id: item.item_id, title: item.title}))};
  const urlMap = Object.fromEntries(queue.jobs.map((job) => [job.job_id ?? job.id, job.output_hint]));
  const research = writeResearchBrief({item, blueprint, packetDir});
  const packet = {
    created_at: new Date().toISOString(),
    item_id: item.item_id,
    title: item.title,
    status: item.status,
    source_status: statusPath,
    source_blueprint: item.blueprint,
    selected_reference: blueprint?.selected_reference ?? item.preview?.selected_reference ?? null,
    beat_count: blueprint?.beats?.length ?? 0,
    qa,
    blockers: item.blockers ?? [],
    handoff: item.handoff ?? null,
    premium_hold: item.premium_hold ?? null,
    research,
    local_assets: {
      packet_dir: packetDir,
      preview_video: previewVideo,
      proof_frame: proofFrame,
      reference_images: copiedReferences,
    },
    missing_assets: missing,
  };
  writeJson(path.join(packetDir, 'creative-packet.json'), packet);
  writeJson(path.join(packetDir, 'render-queue.json'), queue);
  writeJson(path.join(packetDir, 'render-url-map.template.json'), {[item.item_id]: urlMap});
  fs.writeFileSync(path.join(packetDir, 'creative-packet.md'), markdownForPacket({
    item,
    blueprint,
    qa,
    local: packet.local_assets,
    packetDir,
  }));
  packets.push({
    item_id: item.item_id,
    title: item.title,
    packet_dir: packetDir,
    packet_json: path.join(packetDir, 'creative-packet.json'),
    packet_markdown: path.join(packetDir, 'creative-packet.md'),
    research_brief: research?.research_brief_markdown ?? null,
    missing_asset_count: missing.length,
    job_count: queue.jobs.length,
  });
}

const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  source_status: statusPath,
  qa_report: qaPath,
  out_dir: outDir,
  packet_count: packets.length,
  missing_asset_count: packets.reduce((sum, packet) => sum + packet.missing_asset_count, 0),
  packets,
};
writeJson(path.join(outDir, 'competitive-creative-packets-manifest.json'), manifest);

console.log(`Competitive creative packets: ${path.join(outDir, 'competitive-creative-packets-manifest.json')}`);
console.log(`Packets: ${manifest.packet_count}`);
console.log(`Missing assets: ${manifest.missing_asset_count}`);
