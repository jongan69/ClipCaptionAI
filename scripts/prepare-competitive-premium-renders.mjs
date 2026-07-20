#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/prepare-competitive-premium-renders.mjs --preview-manifest outputs/.../competitive-preview-render-manifest.json
  npm run ebay:prep-premium-renders -- --preview-manifest outputs/.../competitive-preview-render-manifest.json --roi-plan outputs/.../higgsfield-roi-plan.json

Options:
  --preview-manifest FILE   Batch preview manifest from ebay:render-blueprint-batch.
  --roi-plan FILE           Optional roi-plan/competitive-plan Higgsfield ROI JSON.
  --out-dir DIR             Default: sibling folder next to preview manifest.
  --credit-budget N         Max estimated credits to allocate. Default: 45
  --credits-per-shot N      Estimated credits per generated shot. Default: 22.5
  --max-jobs-per-listing N  Default: 1
  --approved-item-ids IDS   Comma-separated item IDs to include. Default: all successful previews.
  --skip-item-ids IDS       Comma-separated item IDs to exclude.
  --allow-weak-research     Permit fallback/no-trend references to receive premium render jobs.
  --min-fit-score N         Minimum competitor/product fit score. Default: 1
  --min-trend-score N       Minimum trend score when a real reference exists. Default: 0
  --higgs-model MODEL       Default: seedance_2_0
  --higgs-resolution VALUE  Default: 720p
  --higgs-mode VALUE        Default: std
  --aspect-ratio VALUE      Default: 9:16

Creates credit-aware Higgsfield render packets from product-safe preview ads.
It does not spend credits. Review the generated QA gates before running render scripts.
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
const writeJson = (file, value) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const idSet = (value) =>
  new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean));

const numberValue = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const resolveMaybeProjectPath = (file, projectDir) => {
  if (!file) return null;
  if (path.isAbsolute(file) && fs.existsSync(file)) return file;
  const fromRoot = path.resolve(projectRoot, file);
  if (fs.existsSync(fromRoot)) return fromRoot;
  const fromProject = path.resolve(projectDir, file);
  return fs.existsSync(fromProject) ? fromProject : null;
};

const imagesForProject = (listing, projectDir) => {
  const fromListing = (listing.images ?? [])
    .map((image) => resolveMaybeProjectPath(image.path ?? image.filename, projectDir))
    .filter(Boolean);
  const local = fs.existsSync(projectDir)
    ? fs.readdirSync(projectDir)
      .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => path.join(projectDir, name))
    : [];
  return [...new Set([...fromListing, ...local])].filter((file) => fs.existsSync(file));
};

const referenceImagesForJob = ({job, imagePaths}) => {
  if (imagePaths.length === 0) return [];
  const text = `${job.id ?? ''} ${(job.references ?? []).join(' ')} ${job.purpose ?? ''}`.toLowerCase();
  if (/detail|macro|proof/.test(text)) {
    const details = imagePaths.length > 1 ? imagePaths.slice(1, 6) : imagePaths.slice(0, 1);
    return details.length ? details : imagePaths.slice(0, 1);
  }
  if (/all|bundle|included/.test(text)) return imagePaths.slice(0, 6);
  return imagePaths.slice(0, 1);
};

const referenceArgsForImages = (images) => images.flatMap((image) => ['--image-references', image]);

const higgsParamArgsForJob = (job) => [
  '--prompt',
  shellQuote(job.prompt),
  '--duration',
  shellQuote(String(job.duration_seconds)),
  ...(job.aspect_ratio ? ['--aspect_ratio', shellQuote(job.aspect_ratio)] : []),
  ...(job.resolution ? ['--resolution', shellQuote(job.resolution)] : []),
  ...(job.mode && job.model !== 'seedance_2_0_mini' ? ['--mode', shellQuote(job.mode)] : []),
  '--generate_audio',
  'false',
  ...job.reference_args.map(shellQuote),
];

const safeSlug = (value, fallback = 'shot') => {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return slug || fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const durationForBeat = (beat) => {
  const start = numberValue(beat?.time_seconds?.start, 0);
  const end = numberValue(beat?.time_seconds?.end, start + 5);
  return clamp(Number((end - start).toFixed(2)), 3, 8);
};

const referencesForBeat = (beat, index) => {
  const sourceAssets = (beat?.source_assets ?? []).map((asset) => String(asset).toLowerCase());
  if (sourceAssets.some((asset) => /image_[2-6]|detail|macro/.test(asset))) {
    return ['detail listing photos', ...sourceAssets.filter((asset) => asset.startsWith('image_')).slice(0, 3)];
  }
  if (sourceAssets.some((asset) => /all|bundle|included/.test(asset))) {
    return ['all included listing photos'];
  }
  if (sourceAssets.some((asset) => /broll|cleared_story/.test(asset))) {
    return ['best actual listing photo', 'cleared supporting b-roll direction only'];
  }
  return index === 0 ? ['best actual listing photo'] : ['detail listing photos'];
};

const beatRenderJobsForBlueprint = (blueprint) => {
  const beats = Array.isArray(blueprint?.beats) ? blueprint.beats : [];
  if (!beats.length) return [];
  const title = blueprint?.listing?.title ?? 'product listing';
  return beats.map((beat, index) => {
    const beatName = String(beat.beat ?? `beat ${index + 1}`);
    const competitorPattern = String(beat.competitor_pattern ?? beat.imported_structure_note ?? '').trim();
    const execution = String(beat.original_execution ?? '').trim();
    const captionIntent = String(beat.caption_intent ?? '').trim();
    const importedAudio = String(beat.imported_audio_note ?? '').trim();
    const sfx = Array.isArray(beat.sfx) ? beat.sfx.join(', ') : String(beat.sfx ?? '').trim();
    return {
      id: `competitive-${String(index + 1).padStart(2, '0')}-${safeSlug(beatName)}`,
      purpose: `Beat ${index + 1}: ${beatName}${beat.time_seconds ? ` (${beat.time_seconds.start}-${beat.time_seconds.end}s)` : ''}`,
      duration_seconds: durationForBeat(beat),
      references: referencesForBeat(beat, index),
      beat: {
        index: index + 1,
        name: beatName,
        time_seconds: beat.time_seconds ?? null,
        competitor_pattern: competitorPattern || null,
        original_execution: execution || null,
        caption_intent: captionIntent || null,
        sfx: Array.isArray(beat.sfx) ? beat.sfx : [],
        imported_structure_note: beat.imported_structure_note ?? null,
        imported_audio_note: importedAudio || null,
        source_assets: beat.source_assets ?? [],
      },
      prompt: [
        `Vertical premium marketplace product ad shot for the exact eBay item shown in the reference images: ${title}.`,
        competitorPattern ? `Adapt this competitor structure as timing and camera strategy only: ${competitorPattern}.` : null,
        execution ? `Our original execution for this beat: ${execution}` : null,
        captionIntent ? `The later caption intent is: ${captionIntent}. Do not bake captions or text into the generated video.` : null,
        sfx ? `Edit energy to support later SFX accents: ${sfx}.` : null,
        importedAudio ? `Music/editing feel to support later in assembly: ${importedAudio}. Do not generate or copy audio in this clip.` : null,
        'Use realistic camera movement, strong product focus, clean light, and resale-buyer trust.',
        'Preserve the real product color, condition, geometry, labels, included items, and scale from the references.',
        'Do not copy competitor footage, layouts, captions, audio, watermarks, logos, props, rooms, or exact wording.',
      ].filter(Boolean).join(' '),
    };
  });
};

const renderJobsForBlueprint = ({blueprint, fallbackJobs}) => {
  const beatJobs = beatRenderJobsForBlueprint(blueprint);
  return beatJobs.length ? beatJobs : fallbackJobs;
};

const loadRoiMap = (roiPlanPath) => {
  if (!roiPlanPath || !fs.existsSync(roiPlanPath)) return new Map();
  const plan = readJson(roiPlanPath);
  const map = new Map();
  for (const [index, listing] of (plan.ranked ?? []).entries()) {
    map.set(String(listing.item_id), {...listing, roi_rank: index + 1, roi_selected: false});
  }
  for (const [index, listing] of (plan.selected ?? []).entries()) {
    map.set(String(listing.item_id), {
      ...(map.get(String(listing.item_id)) ?? {}),
      ...listing,
      roi_rank: map.get(String(listing.item_id))?.roi_rank ?? index + 1,
      selected_rank: index + 1,
      roi_selected: true,
    });
  }
  return map;
};

const readListingFromRender = (render, renderManifest) => {
  const projectDir = renderManifest?.project_dir ?? null;
  if (!projectDir) return {projectDir: null, listing: null};
  const listingPath = path.join(projectDir, 'listing.json');
  return {
    projectDir,
    listing: fs.existsSync(listingPath)
      ? readJson(listingPath)
      : {item_id: render.item_id, title: render.title, images: []},
  };
};

const jobPacketForRender = ({render, roi, maxJobsPerListing, modelDefaults, creditsPerShot}) => {
  const renderManifest = render.manifest && fs.existsSync(render.manifest) ? readJson(render.manifest) : null;
  const {projectDir, listing} = readListingFromRender(render, renderManifest);
  if (!projectDir || !listing) throw new Error(`Could not infer project dir for ${render.item_id}`);
  const itemId = String(listing.item_id ?? render.item_id);
  const blueprintPath = render.blueprint;
  const blueprintDir = path.dirname(blueprintPath);
  const blueprint = readJson(blueprintPath);
  const renderJobsPath = path.join(blueprintDir, 'higgsfield-competitive-render-jobs.json');
  const fallbackJobs = fs.existsSync(renderJobsPath)
    ? readJson(renderJobsPath).jobs ?? []
    : blueprint.higgsfield_prompts ?? [];
  const sourceJobs = renderJobsForBlueprint({blueprint, fallbackJobs});
  const imagePaths = imagesForProject(listing, projectDir);
  const pickedJobs = sourceJobs.slice(0, maxJobsPerListing);

  const jobs = pickedJobs.map((job, index) => {
    const referenceImages = referenceImagesForJob({job, imagePaths});
    const prompt = [
      job.prompt,
      '',
      'Make this a premium, high-converting eBay product ad shot.',
      'Use the reference images as product truth. Preserve actual color, shape, condition, labels, and included items.',
      'Do not add text inside the generated video. Do not invent accessories, packaging, logos, damage, features, or scale.',
      'Copy only the competitor-inspired camera role and pacing, not competitor assets.',
    ].join(' ');
    return {
      id: job.id ?? `competitive-${String(index + 1).padStart(2, '0')}`,
      purpose: job.purpose ?? null,
      beat: job.beat ?? null,
      priority: index + 1,
      estimated_credits: creditsPerShot,
      model: modelDefaults.model,
      resolution: modelDefaults.resolution,
      mode: modelDefaults.mode,
      aspect_ratio: modelDefaults.aspect_ratio,
      duration_seconds: numberValue(job.duration_seconds ?? job.duration, 5),
      prompt,
      reference_images: referenceImages,
      reference_args: referenceArgsForImages(referenceImages),
      output_hint: path.join(projectDir, 'higgsfield-renders', `${job.id ?? `competitive-${index + 1}`}.mp4`),
    };
  });

  return {
    item_id: itemId,
    title: listing.title ?? render.title,
    project_dir: projectDir,
    listing_url: listing.url ?? null,
    blueprint: blueprintPath,
    source_render_jobs: fs.existsSync(renderJobsPath) ? renderJobsPath : null,
    source_blueprint_beats: Array.isArray(blueprint.beats) && blueprint.beats.length ? blueprintPath : null,
    preview_video: render.final_video,
    preview_proof_frame: render.proof_frame,
    preview_manifest: render.manifest,
    selected_reference: render.selected_reference ?? renderManifest?.selected_reference ?? null,
    roi: roi ?? null,
    images: imagePaths,
    jobs,
    estimated_credits: jobs.reduce((sum, job) => sum + job.estimated_credits, 0),
  };
};

const scoreCandidate = (candidate) => {
  const roi = candidate.roi ?? {};
  const selectedBonus = roi.roi_selected ? 10000 : 0;
  const roiScore = numberValue(roi.roi_score, 0);
  const price = numberValue(roi.price, 0);
  const rankBonus = roi.roi_rank ? Math.max(0, 1000 - Number(roi.roi_rank)) : 0;
  return selectedBonus + rankBonus + roiScore * 10 + price;
};

const referenceQualityForPacket = (packet, {minFitScore = 1, minTrendScore = 0} = {}) => {
  const reference = packet.selected_reference ?? {};
  const platform = String(reference.platform ?? '').toLowerCase();
  const metrics = reference.metrics ?? reference;
  const fitScore = numberValue(reference.fit_score, 0);
  const trendScore = numberValue(metrics.trend_score ?? reference.trend_score, 0);
  const hasUrl = Boolean(reference.url);
  const isFallback = platform === 'fallback-template' || String(reference.id ?? '').startsWith('fallback-template');
  const issues = [];
  if (isFallback) issues.push('selected reference is fallback-template');
  if (!hasUrl && !isFallback) issues.push('selected reference has no URL');
  if (fitScore < minFitScore) issues.push(`fit score ${fitScore} below minimum ${minFitScore}`);
  if (!isFallback && trendScore < minTrendScore) issues.push(`trend score ${trendScore} below minimum ${minTrendScore}`);
  return {
    status: issues.length ? 'research_review_required' : 'ready',
    issues,
    is_fallback: isFallback,
    has_url: hasUrl,
    fit_score: fitScore,
    trend_score: trendScore,
    min_fit_score: minFitScore,
    min_trend_score: minTrendScore,
  };
};

const writePerListingArtifacts = ({packet}) => {
  const higgsDir = path.join(packet.project_dir, 'higgsfield');
  ensureDir(higgsDir);
  ensureDir(path.join(packet.project_dir, 'higgsfield-renders'));

  const jobsPath = path.join(higgsDir, 'competitive-premium-render-jobs.json');
  writeJson(jobsPath, {
    created_at: new Date().toISOString(),
    source_policy: 'Approved competitive preview -> original product-preserving generated shots only.',
    ...packet,
  });

  const estimateScript = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `cd ${shellQuote(projectRoot)}`,
    `echo ${shellQuote(`Estimating competitive premium renders for ${packet.item_id} - ${packet.title}`)}`,
    ...packet.jobs.flatMap((job) => [
      `echo ${shellQuote(`--- ${job.id}`)}`,
      [
        'npm exec --package=@higgsfield/cli -- higgs generate cost',
        shellQuote(job.model),
        ...higgsParamArgsForJob(job),
      ].join(' '),
    ]),
    '',
  ].join('\n');

  const renderScript = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `cd ${shellQuote(projectRoot)}`,
    `mkdir -p ${shellQuote(path.join(packet.project_dir, 'higgsfield-renders'))}`,
    `echo ${shellQuote(`Rendering competitive premium shots for ${packet.item_id} - ${packet.title}`)}`,
    ...packet.jobs.flatMap((job) => [
      `echo ${shellQuote(`--- ${job.id}`)}`,
      [
        'npm exec --package=@higgsfield/cli -- higgs generate create',
        shellQuote(job.model),
        ...higgsParamArgsForJob(job),
        '--wait',
        '--wait-timeout',
        '20m',
        '--wait-interval',
        '5s',
        '--json',
        ...job.reference_args.map(shellQuote),
        `| tee ${shellQuote(path.join(higgsDir, `${job.id}.competitive-job.json`))}`,
      ].join(' '),
      `echo ${shellQuote(`Download/save the resulting video as: ${job.output_hint}`)}`,
    ]),
    '',
  ].join('\n');

  const qaMarkdown = [
    `# Competitive Premium QA: ${packet.title}`,
    '',
    `Item: ${packet.item_id}`,
    `Preview video: ${packet.preview_video}`,
    `Selected reference: ${packet.selected_reference?.title ?? packet.selected_reference?.url ?? 'none'}`,
    '',
    'Reject any generated clip if:',
    '',
    '- It changes the actual item, color, condition, labels, size, or geometry.',
    '- It shows accessories, packaging, rooms, props, or features that are not in the listing or cleared B-roll.',
    '- It bakes text into the video.',
    '- It looks like competitor footage, a stock ad, or a misleading lifestyle claim.',
    '- It weakens trust compared with the original listing photos.',
    '',
    'After approved clips are saved into `higgsfield-renders/`:',
    '',
    '```bash',
    `npm run ebay:cinematic-ads -- assemble --project-dir "${packet.project_dir}" --energy max --include-broll --broll-position interleave`,
    '```',
    '',
  ].join('\n');

  const estimatePath = path.join(higgsDir, 'estimate-competitive-premium-costs.sh');
  const renderPath = path.join(higgsDir, 'render-competitive-premium-shots.sh');
  const qaPath = path.join(higgsDir, 'competitive-premium-qa.md');
  fs.writeFileSync(estimatePath, estimateScript);
  fs.writeFileSync(renderPath, renderScript);
  fs.writeFileSync(qaPath, qaMarkdown);
  fs.chmodSync(estimatePath, 0o755);
  fs.chmodSync(renderPath, 0o755);

  return {jobsPath, estimatePath, renderPath, qaPath};
};

const previewManifestPath = path.resolve(requireArg('preview-manifest'));
if (!fs.existsSync(previewManifestPath)) throw new Error(`Preview manifest not found: ${previewManifestPath}`);
const previewManifest = readJson(previewManifestPath);
const roiPlanPath = args['roi-plan'] ? path.resolve(String(args['roi-plan'])) : null;
const roiMap = loadRoiMap(roiPlanPath);
const approvedIds = idSet(args['approved-item-ids']);
const skippedIds = idSet(args['skip-item-ids']);
const creditBudget = numberValue(args['credit-budget'], 45);
const creditsPerShot = numberValue(args['credits-per-shot'], 22.5);
const maxJobsPerListing = Math.max(1, Math.floor(numberValue(args['max-jobs-per-listing'], 1)));
const allowWeakResearch = args['allow-weak-research'] === true;
const minFitScore = numberValue(args['min-fit-score'], 1);
const minTrendScore = numberValue(args['min-trend-score'], 0);
const modelDefaults = {
  model: String(args['higgs-model'] ?? 'seedance_2_0'),
  resolution: String(args['higgs-resolution'] ?? '720p'),
  mode: String(args['higgs-mode'] ?? 'std'),
  aspect_ratio: String(args['aspect-ratio'] ?? '9:16'),
};
const outDir = path.resolve(String(
  args['out-dir'] ?? path.join(path.dirname(previewManifestPath), 'competitive-premium-render-plan'),
));
ensureDir(outDir);

const candidates = [];
const rejected = [];
for (const render of previewManifest.renders ?? []) {
  const itemId = String(render.item_id ?? '');
  if (!render.ok) {
    rejected.push({item_id: itemId, reason: 'preview render failed'});
    continue;
  }
  if (approvedIds.size > 0 && !approvedIds.has(itemId)) {
    rejected.push({item_id: itemId, reason: 'not in approved item list'});
    continue;
  }
  if (skippedIds.has(itemId)) {
    rejected.push({item_id: itemId, reason: 'skip item list'});
    continue;
  }
  try {
    const packet = jobPacketForRender({
      render,
      roi: roiMap.get(itemId) ?? null,
      maxJobsPerListing,
      modelDefaults,
      creditsPerShot,
    });
    packet.reference_quality = referenceQualityForPacket(packet, {minFitScore, minTrendScore});
    candidates.push(packet);
  } catch (error) {
    rejected.push({item_id: itemId, reason: error instanceof Error ? error.message : String(error)});
  }
}

candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

let spent = 0;
const selected = [];
const held = [];
for (const candidate of candidates) {
  if (candidate.reference_quality?.status !== 'ready' && !allowWeakResearch) {
    held.push({...candidate, hold_reason: 'research quality review required'});
    continue;
  }
  if (spent + candidate.estimated_credits <= creditBudget || selected.length === 0) {
    selected.push(candidate);
    spent += candidate.estimated_credits;
  } else {
    held.push({...candidate, hold_reason: 'credit budget'});
  }
}

const artifacts = selected.map((packet) => ({
  item_id: packet.item_id,
  ...writePerListingArtifacts({packet}),
}));

const plan = {
  created_at: new Date().toISOString(),
  script: scriptName,
  preview_manifest: previewManifestPath,
  roi_plan: roiPlanPath,
  credit_budget: creditBudget,
  credits_per_shot: creditsPerShot,
  estimated_selected_credits: spent,
  max_jobs_per_listing: maxJobsPerListing,
  model_defaults: modelDefaults,
  selected_count: selected.length,
  held_count: held.length,
  rejected_count: rejected.length,
  source_policy: 'Generated shots must preserve real listing photos and copy only competitor structure, never competitor assets.',
  research_quality_policy: {
    allow_weak_research: allowWeakResearch,
    min_fit_score: minFitScore,
    min_trend_score: minTrendScore,
  },
  selected: selected.map((packet) => ({
    item_id: packet.item_id,
    title: packet.title,
    project_dir: packet.project_dir,
    preview_video: packet.preview_video,
    preview_proof_frame: packet.preview_proof_frame,
    selected_reference: packet.selected_reference,
    estimated_credits: packet.estimated_credits,
    reference_quality: packet.reference_quality,
    roi: packet.roi,
    jobs: packet.jobs.map((job) => ({
      id: job.id,
      purpose: job.purpose,
      estimated_credits: job.estimated_credits,
      model: job.model,
      resolution: job.resolution,
      mode: job.mode,
      aspect_ratio: job.aspect_ratio,
      duration_seconds: job.duration_seconds,
      reference_images: job.reference_images,
      reference_args: job.reference_args,
      output_hint: job.output_hint,
      prompt: job.prompt,
      beat: job.beat ?? null,
    })),
  })),
  held: held.map((packet) => ({
    item_id: packet.item_id,
    title: packet.title,
    estimated_credits: packet.estimated_credits,
    hold_reason: packet.hold_reason,
    reference_quality: packet.reference_quality,
    roi: packet.roi,
  })),
  rejected,
  artifacts,
};

const planJson = path.join(outDir, 'competitive-premium-render-plan.json');
const planMd = path.join(outDir, 'competitive-premium-render-plan.md');
writeJson(planJson, plan);

const markdown = [
  '# Competitive Premium Render Plan',
  '',
  `Preview manifest: ${previewManifestPath}`,
  `ROI plan: ${roiPlanPath ?? 'none'}`,
  `Credit budget: ${creditBudget}`,
  `Estimated selected credits: ${spent}`,
  '',
  '## Selected',
  '',
  ...selected.flatMap((packet, index) => [
    `### ${index + 1}. ${packet.title}`,
    '',
    `- Item: ${packet.item_id}`,
    `- Preview: ${packet.preview_video}`,
    `- Reference: ${packet.selected_reference?.title ?? packet.selected_reference?.url ?? 'none'}`,
    `- Reference quality: ${packet.reference_quality?.status ?? 'unknown'}`,
    `- Estimated credits: ${packet.estimated_credits}`,
    `- Render script: ${path.join(packet.project_dir, 'higgsfield', 'render-competitive-premium-shots.sh')}`,
    `- QA: ${path.join(packet.project_dir, 'higgsfield', 'competitive-premium-qa.md')}`,
    '',
    ...packet.jobs.map((job) => `- ${job.id}: ${job.purpose ?? 'premium product shot'} -> ${job.output_hint}`),
    '',
  ]),
  held.length ? '## Held By Budget' : '',
  '',
  ...held.map((packet) => `- ${packet.item_id} ${packet.title} (${packet.estimated_credits} credits): ${packet.hold_reason}${packet.reference_quality?.issues?.length ? ` - ${packet.reference_quality.issues.join('; ')}` : ''}`),
  '',
].filter((line, index, lines) => line || lines[index - 1]).join('\n');

fs.writeFileSync(planMd, `${markdown}\n`);

console.log(`Competitive premium render plan: ${planJson}`);
console.log(`Plan markdown: ${planMd}`);
console.log(`Selected listings: ${selected.length}`);
console.log(`Estimated credits: ${spent}`);
console.log(`Held by budget: ${held.length}`);
console.log(`Rejected: ${rejected.length}`);
