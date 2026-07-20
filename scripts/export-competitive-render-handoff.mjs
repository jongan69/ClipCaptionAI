#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs} from './lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/export-competitive-render-handoff.mjs --premium-plan outputs/.../competitive-premium-render-plan.json
  npm run ebay:competitive-handoff -- --premium-plan outputs/.../competitive-premium-render-plan.json

Options:
  --premium-plan FILE   Premium render plan from ebay:prep-premium-renders.
  --out-dir DIR         Default: sibling competitive-render-handoff.

Exports one batch handoff folder for external/Higgsfield rendering:
render queue JSON/JSONL, URL-map template, per-job reference image checks,
and a markdown runbook for producing the missing product-preserving MP4s.
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

const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

const flattenJobs = (plan) => {
  const jobs = [];
  const defaults = plan.model_defaults ?? {};
  for (const packet of plan.selected ?? []) {
    for (const job of packet.jobs ?? []) {
      const missingReferences = (job.reference_images ?? []).filter((file) => !fs.existsSync(file));
      const outputDir = path.dirname(job.output_hint);
      jobs.push({
        queue_id: `${packet.item_id}:${job.id}`,
        item_id: String(packet.item_id),
        title: packet.title,
        listing_url: packet.listing_url ?? null,
        project_dir: packet.project_dir,
        preview_video: packet.preview_video,
        preview_proof_frame: packet.preview_proof_frame,
        selected_reference: packet.selected_reference ?? null,
        job_id: job.id,
        purpose: job.purpose ?? null,
        beat: job.beat ?? null,
        competitor_pattern: job.beat?.competitor_pattern ?? null,
        original_execution: job.beat?.original_execution ?? null,
        caption_intent: job.beat?.caption_intent ?? null,
        sfx: job.beat?.sfx ?? [],
        imported_audio_note: job.beat?.imported_audio_note ?? null,
        prompt: job.prompt,
        model: job.model ?? defaults.model ?? 'seedance_2_0',
        resolution: job.resolution ?? defaults.resolution ?? '720p',
        mode: job.mode ?? defaults.mode ?? 'std',
        aspect_ratio: job.aspect_ratio ?? defaults.aspect_ratio ?? '9:16',
        duration_seconds: job.duration_seconds,
        estimated_credits: job.estimated_credits,
        reference_images: job.reference_images ?? [],
        missing_reference_images: missingReferences,
        output_hint: job.output_hint,
        output_dir: outputDir,
        output_exists: Boolean(job.output_hint && fs.existsSync(job.output_hint)),
        output_dir_exists: fs.existsSync(outputDir),
        product_truth_rules: [
          'Use the reference images as the exact product truth.',
          'Preserve actual color, shape, condition, labels, scale, and included items.',
          'Do not add text, packaging, accessories, rooms, logos, damage, or features.',
          'Copy only competitor-inspired camera role and pacing, never competitor assets.',
        ],
      });
    }
  }
  return jobs;
};

const higgsCreateArgsForJob = (job) => {
  const args = [
    'npm exec --package=@higgsfield/cli -- higgs generate create',
    shellQuote(job.model),
    '--prompt',
    shellQuote(job.prompt),
    '--duration',
    shellQuote(String(job.duration_seconds)),
  ];
  if (job.aspect_ratio) args.push('--aspect_ratio', shellQuote(job.aspect_ratio));
  if (job.resolution) args.push('--resolution', shellQuote(job.resolution));
  if (job.mode && job.model !== 'seedance_2_0_mini') args.push('--mode', shellQuote(job.mode));
  args.push(
    '--generate_audio',
    'false',
    '--wait',
    '--wait-timeout',
    '20m',
    '--wait-interval',
    '5s',
    '--json',
    ...job.reference_images.flatMap((image) => ['--image-references', shellQuote(image)]),
  );
  return args;
};

const cliCommandForJob = (job) => higgsCreateArgsForJob(job).join(' ');

const markdownForHandoff = ({plan, jobs, paths}) => {
  const missingRefs = jobs.filter((job) => job.missing_reference_images.length > 0);
  const missingOutputs = jobs.filter((job) => !job.output_exists);
  const lines = [
    '# Competitive Render Handoff',
    '',
    `Source premium plan: ${paths.premiumPlan}`,
    `Jobs: ${jobs.length}`,
    `Estimated credits: ${jobs.reduce((sum, job) => sum + Number(job.estimated_credits ?? 0), 0)}`,
    `Missing generated outputs: ${missingOutputs.length}`,
    `Missing reference images: ${missingRefs.length}`,
    '',
    '## Output Contract',
    '',
    'Render each job as a product-preserving vertical MP4 and save it to its `output_hint` path. After that, run:',
    '',
    '```bash',
    `npm run ebay:collect-premium-renders -- --premium-plan ${shellQuote(paths.premiumPlan)} --url-map ${shellQuote(paths.urlMapTemplate)}`,
    `npm run ebay:competitive-loop -- --preview-manifest ${shellQuote(plan.preview_manifest)} --credit-budget ${plan.credit_budget ?? 45} --max-jobs-per-listing ${plan.max_jobs_per_listing ?? 1}`,
    '```',
    '',
    'If Higgsfield gives direct URLs instead of local files, fill `render-url-map.template.json` with those URLs and rerun the collector command.',
    '',
    '## Jobs',
    '',
    ...jobs.flatMap((job, index) => [
      `### ${index + 1}. ${job.item_id} / ${job.job_id}`,
      '',
      `Title: ${job.title}`,
      `Purpose: ${job.purpose ?? 'product-preserving premium shot'}`,
      ...(job.beat ? [`Beat: ${job.beat.index ?? '?'} / ${job.beat.name ?? 'unnamed beat'}`] : []),
      ...(job.competitor_pattern ? [`Competitor pattern: ${job.competitor_pattern}`] : []),
      ...(job.original_execution ? [`Our execution: ${job.original_execution}`] : []),
      ...(job.caption_intent ? [`Caption intent: ${job.caption_intent}`] : []),
      ...(job.sfx?.length ? [`SFX intent: ${job.sfx.join(', ')}`] : []),
      ...(job.imported_audio_note ? [`Audio feel: ${job.imported_audio_note}`] : []),
      `Output: ${job.output_hint}`,
      `Estimated credits: ${job.estimated_credits}`,
      `Reference images: ${job.reference_images.length}`,
      job.missing_reference_images.length ? `Missing references: ${job.missing_reference_images.join(', ')}` : 'Missing references: none',
      '',
      'Prompt:',
      '',
      '```text',
      job.prompt,
      '```',
      '',
      'CLI command:',
      '',
      '```bash',
      cliCommandForJob(job),
      '```',
      '',
      'QA rejection rules:',
      '',
      ...job.product_truth_rules.map((rule) => `- ${rule}`),
      '',
    ]),
  ];
  return `${lines.join('\n')}\n`;
};

const premiumPlanPath = requireArg('premium-plan');
if (!fs.existsSync(premiumPlanPath)) throw new Error(`Premium plan not found: ${premiumPlanPath}`);
const plan = readJson(premiumPlanPath);
const outDir = path.resolve(String(args['out-dir'] ?? path.join(path.dirname(premiumPlanPath), 'competitive-render-handoff')));
ensureDir(outDir);

const jobs = flattenJobs(plan);
for (const job of jobs) ensureDir(job.output_dir);

const queuePath = path.join(outDir, 'render-queue.json');
const queueJsonlPath = path.join(outDir, 'render-queue.jsonl');
const urlMapTemplatePath = path.join(outDir, 'render-url-map.template.json');
const runbookPath = path.join(outDir, 'higgsfield-render-runbook.md');
const cliScriptPath = path.join(outDir, 'run-higgsfield-cli-jobs.sh');
const manifestPath = path.join(outDir, 'competitive-render-handoff-manifest.json');

const urlMapTemplate = Object.fromEntries(
  jobs.map((job) => [
    job.item_id,
    {
      ...(jobs
        .filter((candidate) => candidate.item_id === job.item_id)
        .reduce((acc, candidate) => {
          acc[candidate.job_id] = candidate.output_hint;
          return acc;
        }, {})),
    },
  ]),
);

writeJson(queuePath, {created_at: new Date().toISOString(), source_premium_plan: premiumPlanPath, jobs});
fs.writeFileSync(queueJsonlPath, `${jobs.map((job) => JSON.stringify(job)).join('\n')}\n`);
writeJson(urlMapTemplatePath, urlMapTemplate);
fs.writeFileSync(runbookPath, markdownForHandoff({
  plan,
  jobs,
  paths: {premiumPlan: premiumPlanPath, urlMapTemplate: urlMapTemplatePath},
}));
fs.writeFileSync(cliScriptPath, `${[
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  '',
  '# Review this script before running. It spends Higgsfield credits.',
  ...jobs.flatMap((job) => [
    '',
    `echo ${shellQuote(`Rendering ${job.item_id} / ${job.job_id}`)}`,
    cliCommandForJob(job),
    `echo ${shellQuote(`Save/download result to: ${job.output_hint}`)}`,
  ]),
  '',
].join('\n')}\n`);
fs.chmodSync(cliScriptPath, 0o755);

const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  source_premium_plan: premiumPlanPath,
  out_dir: outDir,
  job_count: jobs.length,
  estimated_credits: jobs.reduce((sum, job) => sum + Number(job.estimated_credits ?? 0), 0),
  missing_reference_image_count: jobs.reduce((sum, job) => sum + job.missing_reference_images.length, 0),
  missing_output_count: jobs.filter((job) => !job.output_exists).length,
  artifacts: {
    queue: queuePath,
    queue_jsonl: queueJsonlPath,
    url_map_template: urlMapTemplatePath,
    runbook: runbookPath,
    cli_script: cliScriptPath,
  },
};
writeJson(manifestPath, manifest);

console.log(`Competitive render handoff: ${manifestPath}`);
console.log(`Runbook: ${runbookPath}`);
console.log(`Queue: ${queuePath}`);
console.log(`URL map template: ${urlMapTemplatePath}`);
console.log(`Jobs: ${manifest.job_count}`);
console.log(`Missing generated outputs: ${manifest.missing_output_count}`);
console.log(`Missing reference images: ${manifest.missing_reference_image_count}`);
