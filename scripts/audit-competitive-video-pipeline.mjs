#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs} from './lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/audit-competitive-video-pipeline.mjs --premium-plan outputs/.../competitive-premium-render-plan.json
  npm run ebay:competitive-status -- --premium-plan outputs/.../competitive-premium-render-plan.json

Options:
  --premium-plan FILE        Premium plan from ebay:prep-premium-renders.
  --preview-manifest FILE    Optional preview manifest from ebay:render-blueprint-batch.
  --collect-manifest FILE    Optional collect manifest from ebay:collect-premium-renders.
  --finalize-manifest FILE   Optional finalize manifest from ebay:finalize-premium-ads.
  --handoff-manifest FILE    Optional handoff manifest from ebay:competitive-handoff.
  --out FILE                 JSON output. Default: sibling competitive-video-pipeline-status.json
  --markdown FILE            Markdown output. Default: sibling competitive-video-pipeline-status.md

Audits the competitive listing video pipeline per item: blueprint, preview, premium
render packet, collected generated clips, final assembly, and next blocker.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const requireAny = (...keys) => {
  const key = keys.find((candidate) => args[candidate]);
  if (!key) throw new Error(`Missing one of ${keys.map((value) => `--${value}`).join(', ')}.\n${usage}`);
  return {key, value: String(args[key])};
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const existingPath = (file) => file && fs.existsSync(file) ? file : null;

const ffprobeVideo = (file) => {
  if (!file || !fs.existsSync(file)) return null;
  try {
    const output = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,codec_name,width,height,r_frame_rate:format=duration',
        '-of',
        'json',
        file,
      ],
      {encoding: 'utf8'},
    );
    const parsed = JSON.parse(output);
    return {
      duration_seconds: Number(parsed.format?.duration ?? 0),
      has_video: (parsed.streams ?? []).some((stream) => stream.codec_type === 'video'),
      has_audio: (parsed.streams ?? []).some((stream) => stream.codec_type === 'audio'),
      streams: parsed.streams ?? [],
    };
  } catch (error) {
    return {error: error instanceof Error ? error.message : String(error)};
  }
};

const statusRank = {
  final_ready: 6,
  ready_to_finalize: 5,
  collected_waiting_finalize: 4,
  waiting_for_generated_clips: 3,
  premium_packet_ready: 2,
  research_review_required: 2,
  preview_ready: 1,
  blueprint_only: 0,
  failed: -1,
};

const inferSibling = ({baseFile, relative}) => {
  if (!baseFile) return null;
  return existingPath(path.resolve(path.dirname(baseFile), relative));
};

const loadOptional = (file) => existingPath(file) ? readJson(file) : null;

const primary = requireAny('premium-plan', 'preview-manifest');
const premiumPlanPath = args['premium-plan'] ? path.resolve(String(args['premium-plan'])) : null;
const previewManifestPath = args['preview-manifest'] ? path.resolve(String(args['preview-manifest'])) : null;
const baseFile = path.resolve(primary.value);

const inferredPreview = previewManifestPath
  ?? inferSibling({baseFile: premiumPlanPath, relative: '../competitive-preview-render-manifest.json'});
const inferredPremium = premiumPlanPath;
const inferredCollect = args['collect-manifest']
  ? path.resolve(String(args['collect-manifest']))
  : inferSibling({baseFile: premiumPlanPath, relative: 'competitive-premium-collect-manifest.json'});
const inferredFinalize = args['finalize-manifest']
  ? path.resolve(String(args['finalize-manifest']))
  : inferSibling({baseFile: premiumPlanPath, relative: 'competitive-premium-finalize-manifest.json'});
const inferredHandoff = args['handoff-manifest']
  ? path.resolve(String(args['handoff-manifest']))
  : inferSibling({baseFile: premiumPlanPath, relative: 'competitive-render-handoff/competitive-render-handoff-manifest.json'});

const previewManifest = loadOptional(inferredPreview);
const premiumPlan = loadOptional(inferredPremium);
const collectManifest = loadOptional(inferredCollect);
const finalizeManifest = loadOptional(inferredFinalize);
const handoffManifest = loadOptional(inferredHandoff);
const handoffQueue = loadOptional(handoffManifest?.artifacts?.queue);

const itemMap = new Map();
const ensureItem = (itemId) => {
  const key = String(itemId ?? 'unknown');
  if (!itemMap.has(key)) {
    itemMap.set(key, {
      item_id: key,
      title: null,
      project_dir: null,
      blueprint: null,
      preview: null,
      premium: null,
      collection: null,
      finalization: null,
      handoff: null,
      premium_hold: null,
      status: 'blueprint_only',
      next_action: 'Create a competitive creative blueprint.',
      blockers: [],
    });
  }
  return itemMap.get(key);
};

for (const render of previewManifest?.renders ?? []) {
  const item = ensureItem(render.item_id);
  item.title = render.title ?? item.title;
  item.blueprint = render.blueprint ?? item.blueprint;
  item.preview = {
    ok: Boolean(render.ok),
    final_video: render.final_video ?? null,
    proof_frame: render.proof_frame ?? null,
    manifest: render.manifest ?? null,
    duration_seconds: render.duration_seconds ?? null,
    probe: ffprobeVideo(render.final_video),
    selected_reference: render.selected_reference ?? null,
  };
}

for (const packet of premiumPlan?.selected ?? []) {
  const item = ensureItem(packet.item_id);
  item.title = packet.title ?? item.title;
  item.project_dir = packet.project_dir ?? item.project_dir;
  item.premium = {
    estimated_credits: packet.estimated_credits ?? 0,
    job_count: (packet.jobs ?? []).length,
    jobs: (packet.jobs ?? []).map((job) => ({
      id: job.id,
      purpose: job.purpose ?? null,
      beat: job.beat ?? null,
      competitor_pattern: job.beat?.competitor_pattern ?? null,
      caption_intent: job.beat?.caption_intent ?? null,
      imported_audio_note: job.beat?.imported_audio_note ?? null,
      output_hint: job.output_hint,
      exists: Boolean(job.output_hint && fs.existsSync(job.output_hint)),
      reference_images: job.reference_images ?? [],
    })),
  };
}

for (const packet of premiumPlan?.held ?? []) {
  const item = ensureItem(packet.item_id);
  item.title = packet.title ?? item.title;
  item.premium_hold = {
    reason: packet.hold_reason ?? 'held',
    estimated_credits: packet.estimated_credits ?? 0,
    reference_quality: packet.reference_quality ?? null,
  };
}

for (const result of collectManifest?.results ?? []) {
  const item = ensureItem(result.item_id);
  const existing = item.collection?.jobs ?? [];
  existing.push({
    job_id: result.job_id,
    output_hint: result.output_hint,
    imported: Boolean(result.imported),
    existing: Boolean(result.existing),
    missing_source: Boolean(result.missing_source),
    error: result.error ?? null,
    ready: Boolean(result.output_hint && fs.existsSync(result.output_hint) && !result.error),
  });
  item.collection = {jobs: existing};
}

for (const result of finalizeManifest?.results ?? []) {
  const item = ensureItem(result.item_id);
  item.finalization = {
    ready: Boolean(result.ready),
    assembled: Boolean(result.assembled),
    final_video: result.final_video ?? null,
    proof_frame: result.proof_frame ?? null,
    missing_clips: result.missing_clips ?? [],
    error: result.error ?? null,
    probe: result.probe ?? ffprobeVideo(result.final_video),
  };
}

for (const job of handoffQueue?.jobs ?? []) {
  const item = ensureItem(job.item_id);
  const existing = item.handoff?.jobs ?? [];
  existing.push({
    queue_id: job.queue_id,
    job_id: job.job_id,
    purpose: job.purpose ?? null,
    beat: job.beat ?? null,
    competitor_pattern: job.competitor_pattern ?? job.beat?.competitor_pattern ?? null,
    original_execution: job.original_execution ?? job.beat?.original_execution ?? null,
    caption_intent: job.caption_intent ?? job.beat?.caption_intent ?? null,
    sfx: job.sfx ?? job.beat?.sfx ?? [],
    imported_audio_note: job.imported_audio_note ?? job.beat?.imported_audio_note ?? null,
    prompt: job.prompt ?? null,
    model: job.model ?? null,
    resolution: job.resolution ?? null,
    mode: job.mode ?? null,
    aspect_ratio: job.aspect_ratio ?? null,
    duration_seconds: job.duration_seconds ?? null,
    output_hint: job.output_hint,
    output_exists: Boolean(job.output_exists),
    reference_images: job.reference_images ?? [],
    missing_reference_images: job.missing_reference_images ?? [],
    estimated_credits: job.estimated_credits ?? 0,
  });
  item.handoff = {
    manifest: inferredHandoff,
    queue: handoffManifest?.artifacts?.queue ?? null,
    queue_jsonl: handoffManifest?.artifacts?.queue_jsonl ?? null,
    url_map_template: handoffManifest?.artifacts?.url_map_template ?? null,
    runbook: handoffManifest?.artifacts?.runbook ?? null,
    cli_script: handoffManifest?.artifacts?.cli_script ?? null,
    jobs: existing,
  };
}

const decideStatus = (item) => {
  const blockers = [];
  let status = 'blueprint_only';
  let nextAction = 'Render a product-safe preview from the creative blueprint.';

  if (item.preview?.ok) {
    status = 'preview_ready';
    nextAction = 'Prepare premium render jobs for approved previews.';
  } else if (item.preview && !item.preview.ok) {
    status = 'failed';
    blockers.push('Preview render failed.');
    nextAction = 'Fix the preview render before spending generation credits.';
  }

  if (item.premium?.job_count > 0) {
    status = 'premium_packet_ready';
    nextAction = 'Run Higgsfield render script or collect generated output URLs/files.';
    const missing = item.premium.jobs.filter((job) => !job.exists);
    if (missing.length > 0) blockers.push(...missing.map((job) => `Missing generated clip: ${job.output_hint}`));
  }

  if (item.premium_hold?.reference_quality?.status === 'research_review_required') {
    status = 'research_review_required';
    nextAction = 'Add stronger competitor/Kalodata reference evidence or rerun premium prep with --allow-weak-research.';
    blockers.push(...(item.premium_hold.reference_quality.issues ?? []).map((issue) => `Research quality: ${issue}`));
  }

  const collectionJobs = item.collection?.jobs ?? [];
  if (collectionJobs.length > 0) {
    const readyJobs = collectionJobs.filter((job) => job.ready);
    const missingSource = collectionJobs.filter((job) => job.missing_source);
    const failed = collectionJobs.filter((job) => job.error);
    if (failed.length > 0) {
      status = 'failed';
      blockers.push(...failed.map((job) => `${job.job_id}: ${job.error}`));
      nextAction = 'Fix failed generated clip imports.';
    } else if (readyJobs.length === collectionJobs.length) {
      status = 'collected_waiting_finalize';
      nextAction = 'Run ebay:finalize-premium-ads to assemble final MP4s.';
    } else {
      status = 'waiting_for_generated_clips';
      nextAction = 'Provide Higgsfield output URLs/files, then rerun ebay:collect-premium-renders.';
      blockers.push(...missingSource.map((job) => `No source for ${job.job_id}: ${job.output_hint}`));
    }
  }

  if (item.finalization) {
    if (item.finalization.assembled && item.finalization.probe?.has_video) {
      status = 'final_ready';
      nextAction = 'Review proof frame/final MP4, then upload or attach if approved.';
    } else if (item.finalization.ready) {
      status = 'ready_to_finalize';
      nextAction = 'Run ebay:finalize-premium-ads without dry-run.';
    } else {
      status = 'waiting_for_generated_clips';
      nextAction = 'Generate or collect the missing Higgsfield clips, then finalize.';
      blockers.push(...(item.finalization.missing_clips ?? []).map((clip) => `Missing generated clip: ${clip.path}`));
    }
  }

  item.status = status;
  item.status_rank = statusRank[status] ?? 0;
  item.next_action = nextAction;
  item.blockers = [...new Set(blockers)];
};

for (const item of itemMap.values()) decideStatus(item);

const items = [...itemMap.values()].sort((a, b) => {
  if (a.status_rank !== b.status_rank) return a.status_rank - b.status_rank;
  return String(a.item_id).localeCompare(String(b.item_id));
});

const summary = {
  items: items.length,
  by_status: items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {}),
  blockers: items.reduce((sum, item) => sum + item.blockers.length, 0),
};

const outFile = path.resolve(String(
  args.out ?? path.join(path.dirname(baseFile), 'competitive-video-pipeline-status.json'),
));
const markdownFile = path.resolve(String(
  args.markdown ?? path.join(path.dirname(baseFile), 'competitive-video-pipeline-status.md'),
));
ensureDir(path.dirname(outFile));
ensureDir(path.dirname(markdownFile));

  const report = {
  created_at: new Date().toISOString(),
  script: scriptName,
  manifests: {
    preview: inferredPreview,
    premium_plan: inferredPremium,
    collect: inferredCollect,
    finalize: inferredFinalize,
    handoff: inferredHandoff,
  },
  summary,
  items,
};

fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# Competitive Video Pipeline Status',
  '',
  `Items: ${summary.items}`,
  `Statuses: ${Object.entries(summary.by_status).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
  `Blockers: ${summary.blockers}`,
  '',
  '## Worklist',
  '',
  ...items.flatMap((item) => [
    `### ${item.item_id} - ${item.title ?? 'Untitled listing'}`,
    '',
    `- Status: ${item.status}`,
    `- Next: ${item.next_action}`,
    item.preview?.final_video ? `- Preview: ${item.preview.final_video}` : null,
    item.finalization?.final_video ? `- Final: ${item.finalization.final_video}` : null,
    ...(item.blockers.length ? ['- Blockers:', ...item.blockers.map((blocker) => `  - ${blocker}`)] : []),
    '',
  ].filter(Boolean)),
].join('\n');

fs.writeFileSync(markdownFile, `${md}\n`);

console.log(`Competitive video pipeline status: ${outFile}`);
console.log(`Markdown status: ${markdownFile}`);
console.log(`Items: ${summary.items}`);
console.log(`Statuses: ${Object.entries(summary.by_status).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`);
console.log(`Blockers: ${summary.blockers}`);
