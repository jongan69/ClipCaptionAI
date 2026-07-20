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
  node scripts/run-competitive-video-control-loop.mjs --blueprints-dir outputs/.../competitive-creative
  npm run ebay:competitive-loop -- --blueprints-dir outputs/.../competitive-creative
  npm run ebay:competitive-loop -- --preview-manifest outputs/.../competitive-preview-render-manifest.json

Options:
  --blueprints-dir DIR       Render previews from every creative-blueprint.json under this folder.
  --preview-manifest FILE    Reuse an existing preview manifest instead of rendering.
  --roi-plan FILE            Optional ROI plan for premium render selection.
  --credit-budget N          Passed to premium prep. Default: 45.
  --credits-per-shot N       Passed to premium prep. Default: 22.5.
  --max-jobs-per-listing N   Passed to premium prep. Default: 1.
  --approved-item-ids IDS    Comma-separated item IDs for premium prep.
  --skip-item-ids IDS        Comma-separated item IDs for premium prep.
  --allow-weak-research      Permit fallback/no-trend references to receive premium render jobs.
  --min-fit-score N          Passed to premium prep. Default: 1.
  --min-trend-score N        Passed to premium prep. Default: 0.
  --skip-handoff             Do not export the batch Higgsfield render handoff.
  --limit N                  Passed to preview batch rendering.
  --duration N               Passed to preview batch rendering.
  --voiceover FILE           Passed to preview batch rendering.
  --voiceover-volume N       Passed to preview batch rendering.
  --url-map FILE             Optional Higgsfield output map for collection.
  --run-higgsfield-renders   Create Higgsfield jobs from the premium plan before collect.
  --higgs-render-model MODEL Optional model override for render runner.
  --higgs-render-credit-budget N
                            Credit budget for render runner. Default: --credit-budget value.
  --higgs-render-max-jobs N  Max jobs for render runner.
  --higgs-render-skip-cost   Use plan estimates instead of cost calls.
  --higgs-render-dry-run     Plan render jobs without creating them.
  --attempt-finalize         Assemble ready final ads. Default: dry-run finalizer only.
  --out-dir DIR              Control-loop output folder. Default: sibling competitive-control-loop.
  --dry-run                  Write the planned step list without running child commands.

Runs the repeatable competitive video control loop:
preview render -> technical QA -> premium render packets -> collect generated clips
-> finalize readiness -> status audit -> review board.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const requireOne = (...keys) => {
  const key = keys.find((candidate) => args[candidate]);
  if (!key) throw new Error(`Missing one of ${keys.map((keyName) => `--${keyName}`).join(', ')}.\n${usage}`);
  return {key, value: path.resolve(String(args[key]))};
};

const tail = (value, max = 4000) => {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return text.slice(text.length - max);
};

const pushOption = (cmdArgs, key) => {
  if (args[key] === undefined || args[key] === false) return;
  cmdArgs.push(`--${key}`, String(args[key]));
};

const runStep = ({name, commandArgs, expectedFiles = []}) => {
  const entry = {
    name,
    command: ['node', ...commandArgs].join(' '),
    status: 'planned',
    expected_files: expectedFiles,
    started_at: null,
    finished_at: null,
    exit_code: null,
    stdout_tail: '',
    stderr_tail: '',
  };

  if (args['dry-run'] === true) return entry;

  entry.status = 'running';
  entry.started_at = new Date().toISOString();
  const result = spawnSync('node', commandArgs, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 30,
  });
  entry.finished_at = new Date().toISOString();
  entry.exit_code = result.status;
  entry.stdout_tail = tail(result.stdout);
  entry.stderr_tail = tail(result.stderr);
  entry.status = result.status === 0 ? 'ok' : 'failed';
  if (result.status !== 0) {
    throw Object.assign(new Error(`${name} failed with status ${result.status}`), {step: entry});
  }
  return entry;
};

const input = requireOne('blueprints-dir', 'preview-manifest');
const startingPreviewManifest = args['preview-manifest'] ? input.value : null;
const blueprintsDir = args['blueprints-dir'] ? input.value : null;
if (blueprintsDir && (!fs.existsSync(blueprintsDir) || !fs.statSync(blueprintsDir).isDirectory())) {
  throw new Error(`Blueprints directory not found: ${blueprintsDir}`);
}
if (startingPreviewManifest && !fs.existsSync(startingPreviewManifest)) {
  throw new Error(`Preview manifest not found: ${startingPreviewManifest}`);
}

const baseDir = startingPreviewManifest
  ? path.dirname(startingPreviewManifest)
  : blueprintsDir;
const outDir = path.resolve(String(args['out-dir'] ?? path.join(baseDir, 'competitive-control-loop')));
ensureDir(outDir);

const previewManifest = startingPreviewManifest ?? path.join(blueprintsDir, 'competitive-preview-render-manifest.json');
const qaReport = path.join(path.dirname(previewManifest), 'competitive-video-qa-report.json');
const premiumPlanDir = path.join(path.dirname(previewManifest), 'competitive-premium-render-plan');
const premiumPlan = path.join(premiumPlanDir, 'competitive-premium-render-plan.json');
const handoffDir = path.join(premiumPlanDir, 'competitive-render-handoff');
const handoffManifest = path.join(handoffDir, 'competitive-render-handoff-manifest.json');
const higgsRenderDir = path.join(premiumPlanDir, 'competitive-higgsfield-render-run');
const higgsRenderManifest = path.join(higgsRenderDir, 'competitive-higgsfield-render-manifest.json');
const higgsRenderUrlMap = path.join(higgsRenderDir, 'higgsfield-render-url-map.json');
const collectManifest = path.join(premiumPlanDir, 'competitive-premium-collect-manifest.json');
const finalizeManifest = path.join(premiumPlanDir, 'competitive-premium-finalize-manifest.json');
const statusReport = path.join(premiumPlanDir, 'competitive-video-pipeline-status.json');
const reviewBoard = path.join(premiumPlanDir, 'competitive-review-board.html');
const creativePacketsManifest = path.join(premiumPlanDir, 'competitive-creative-packets', 'competitive-creative-packets-manifest.json');
const controlManifest = path.join(outDir, 'competitive-control-loop-manifest.json');
const controlMarkdown = path.join(outDir, 'competitive-control-loop-manifest.md');

const steps = [];
const run = (step) => {
  const executed = runStep(step);
  steps.push(executed);
  return executed;
};

try {
  if (!startingPreviewManifest) {
    const renderArgs = [
      'scripts/render-competitive-blueprint-batch.mjs',
      '--blueprints-dir',
      blueprintsDir,
      '--out-manifest',
      previewManifest,
    ];
    for (const key of ['limit', 'duration', 'width', 'height', 'fps', 'music-track', 'music-volume', 'voiceover', 'voiceover-volume', 'sfx-library', 'sfx-volume']) {
      pushOption(renderArgs, key);
    }
    run({name: 'render_previews', commandArgs: renderArgs, expectedFiles: [previewManifest]});
  }

  run({
    name: 'qa_previews',
    commandArgs: ['scripts/qa-competitive-videos.mjs', '--preview-manifest', previewManifest],
    expectedFiles: [qaReport],
  });

  const prepArgs = [
    'scripts/prepare-competitive-premium-renders.mjs',
    '--preview-manifest',
    previewManifest,
    '--out-dir',
    premiumPlanDir,
  ];
  for (const key of ['roi-plan', 'credit-budget', 'credits-per-shot', 'max-jobs-per-listing', 'approved-item-ids', 'skip-item-ids', 'min-fit-score', 'min-trend-score']) {
    pushOption(prepArgs, key);
  }
  if (args['allow-weak-research'] === true) prepArgs.push('--allow-weak-research');
  run({name: 'prepare_premium_packets', commandArgs: prepArgs, expectedFiles: [premiumPlan]});

  if (args['skip-handoff'] !== true) {
    run({
      name: 'export_render_handoff',
      commandArgs: ['scripts/export-competitive-render-handoff.mjs', '--premium-plan', premiumPlan, '--out-dir', handoffDir],
      expectedFiles: [handoffManifest],
    });
  }

  if (args['run-higgsfield-renders'] === true) {
    const renderProviderArgs = [
      'scripts/run-competitive-higgsfield-renders.mjs',
      '--premium-plan',
      premiumPlan,
      '--out-dir',
      higgsRenderDir,
      '--url-map',
      higgsRenderUrlMap,
      '--credit-budget',
      String(args['higgs-render-credit-budget'] ?? args['credit-budget'] ?? 45),
    ];
    if (args['higgs-render-model']) renderProviderArgs.push('--model', String(args['higgs-render-model']));
    if (args['higgs-render-max-jobs']) renderProviderArgs.push('--max-jobs', String(args['higgs-render-max-jobs']));
    if (args['higgs-render-skip-cost'] === true) renderProviderArgs.push('--skip-cost');
    if (args['higgs-render-dry-run'] === true) renderProviderArgs.push('--dry-run');
    run({name: 'render_higgsfield_jobs', commandArgs: renderProviderArgs, expectedFiles: [higgsRenderManifest, higgsRenderUrlMap]});
  }

  const collectArgs = ['scripts/collect-competitive-premium-renders.mjs', '--premium-plan', premiumPlan];
  if (args['url-map']) {
    pushOption(collectArgs, 'url-map');
  } else if (args['run-higgsfield-renders'] === true) {
    collectArgs.push('--url-map', higgsRenderUrlMap);
  }
  run({name: 'collect_generated_clips', commandArgs: collectArgs, expectedFiles: [collectManifest]});

  const finalizeArgs = ['scripts/finalize-competitive-premium-ads.mjs', '--premium-plan', premiumPlan];
  if (args['attempt-finalize'] !== true) finalizeArgs.push('--dry-run');
  run({name: args['attempt-finalize'] === true ? 'finalize_ready_ads' : 'finalize_readiness', commandArgs: finalizeArgs, expectedFiles: [finalizeManifest]});

  run({name: 'audit_status', commandArgs: ['scripts/audit-competitive-video-pipeline.mjs', '--premium-plan', premiumPlan], expectedFiles: [statusReport]});

  run({name: 'export_creative_packets', commandArgs: ['scripts/export-competitive-creative-packets.mjs', '--status', statusReport], expectedFiles: [creativePacketsManifest]});

  run({name: 'build_review_board', commandArgs: ['scripts/build-competitive-review-board.mjs', '--status', statusReport], expectedFiles: [reviewBoard]});
} catch (error) {
  if (error?.step) steps.push(error.step);
  const failedManifest = {
    created_at: new Date().toISOString(),
    script: scriptName,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    paths: {preview_manifest: previewManifest, qa_report: qaReport, premium_plan: premiumPlan, handoff_manifest: handoffManifest, higgsfield_render_manifest: higgsRenderManifest, higgsfield_render_url_map: higgsRenderUrlMap, collect_manifest: collectManifest, finalize_manifest: finalizeManifest, status_report: statusReport, creative_packets_manifest: creativePacketsManifest, review_board: reviewBoard},
    steps,
  };
  fs.writeFileSync(controlManifest, `${JSON.stringify(failedManifest, null, 2)}\n`);
  throw error;
}

const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  ok: steps.every((step) => step.status === 'ok' || step.status === 'planned'),
  dry_run: args['dry-run'] === true,
  input: {
    blueprints_dir: blueprintsDir,
    preview_manifest: startingPreviewManifest,
  },
  paths: {
    preview_manifest: previewManifest,
    qa_report: qaReport,
    premium_plan: premiumPlan,
    handoff_manifest: handoffManifest,
    higgsfield_render_manifest: higgsRenderManifest,
    higgsfield_render_url_map: higgsRenderUrlMap,
    collect_manifest: collectManifest,
    finalize_manifest: finalizeManifest,
    status_report: statusReport,
    creative_packets_manifest: creativePacketsManifest,
    review_board: reviewBoard,
  },
  steps,
};

fs.writeFileSync(controlManifest, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(controlMarkdown, `${[
  '# Competitive Video Control Loop',
  '',
  `OK: ${manifest.ok}`,
  `Dry run: ${manifest.dry_run}`,
  '',
  '## Outputs',
  '',
  ...Object.entries(manifest.paths).map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## Steps',
  '',
  ...steps.map((step) => `- ${step.name}: ${step.status}${step.exit_code === null ? '' : ` (${step.exit_code})`}`),
  '',
].join('\n')}\n`);

console.log(`Competitive control-loop manifest: ${controlManifest}`);
console.log(`Review board: ${reviewBoard}`);
console.log(`Status report: ${statusReport}`);
console.log(`Steps: ${steps.map((step) => `${step.name}=${step.status}`).join(', ')}`);
