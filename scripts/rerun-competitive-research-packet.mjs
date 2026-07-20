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
  node scripts/rerun-competitive-research-packet.mjs --packet-dir outputs/.../competitive-creative-packets/<item> --competitors kalodata-export.csv
  npm run ebay:competitive-research-rerun -- --packet-dir outputs/.../<item> --competitors automatio-export.csv

Options:
  --packet-dir DIR          Creative packet folder from ebay:competitive-packets.
  --packet-json FILE        Alternative to --packet-dir; points at creative-packet.json.
  --competitors FILE        Filled Kalodata/Automatio/TikTok/YouTube CSV, JSON, or NDJSON export.
  --project-dir DIR         Override inferred listing project folder.
  --out-dir DIR             Override blueprint output dir. Default: original source_blueprint dir.
  --credit-budget N         Passed to ebay:competitive-loop. Default: 45.
  --credits-per-shot N      Passed to ebay:competitive-loop. Default: 22.5.
  --max-jobs-per-listing N  Passed to ebay:competitive-loop. Default: 1.
  --min-fit-score N         Passed to ebay:competitive-loop. Default: 1.
  --min-trend-score N       Passed to ebay:competitive-loop. Default: 0.
  --analyze-reference-video Analyze the selected reference into a research-only shot map.
  --analysis-max-seconds N  Passed to the architect when analyzing reference video.
  --allow-weak-research     Passed through to the control loop.
  --dry-run                 Write the planned commands without running them.

Turns a research-held creative packet into a fresh competitive blueprint and
control-loop run after you fill the packet's competitor-import-template.csv.
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

const requireArg = (key) => {
  if (!args[key]) throw new Error(`Missing --${key}.\n${usage}`);
  return path.resolve(String(args[key]));
};

const pushOption = (cmdArgs, key) => {
  if (args[key] === undefined || args[key] === false) return;
  cmdArgs.push(`--${key}`, String(args[key]));
};

const tail = (value, max = 5000) => {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return text.slice(text.length - max);
};

const runStep = ({name, commandArgs, expectedFiles = []}) => {
  const entry = {
    name,
    command: ['node', ...commandArgs].join(' '),
    status: args['dry-run'] === true ? 'planned' : 'running',
    expected_files: expectedFiles,
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
    maxBuffer: 1024 * 1024 * 40,
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

const packetJson = args['packet-json']
  ? path.resolve(String(args['packet-json']))
  : path.join(requireArg('packet-dir'), 'creative-packet.json');
if (!fs.existsSync(packetJson)) throw new Error(`Creative packet JSON not found: ${packetJson}`);
const packetDir = path.dirname(packetJson);
const packet = readJson(packetJson);
const competitors = requireArg('competitors');
if (!fs.existsSync(competitors)) throw new Error(`Competitor export not found: ${competitors}`);

const inferProjectDir = () => {
  if (args['project-dir']) return path.resolve(String(args['project-dir']));
  if (packet.project_dir && fs.existsSync(packet.project_dir)) return packet.project_dir;
  const statusPath = packet.source_status;
  const status = statusPath && fs.existsSync(statusPath) ? readJson(statusPath) : null;
  const previewManifestPath = status?.manifests?.preview;
  const previewManifest = previewManifestPath && fs.existsSync(previewManifestPath)
    ? readJson(previewManifestPath)
    : null;
  const matchingRender = (previewManifest?.renders ?? []).find((render) =>
    String(render.item_id) === String(packet.item_id),
  );
  const renderManifestPath = matchingRender?.manifest;
  const renderManifest = renderManifestPath && fs.existsSync(renderManifestPath)
    ? readJson(renderManifestPath)
    : null;
  if (renderManifest?.project_dir && fs.existsSync(renderManifest.project_dir)) {
    return renderManifest.project_dir;
  }
  if (matchingRender?.final_video) {
    const candidate = path.dirname(path.dirname(matchingRender.final_video));
    if (fs.existsSync(path.join(candidate, 'listing.json'))) return candidate;
  }
  const sourceBlueprint = packet.source_blueprint;
  if (sourceBlueprint) {
    const parts = path.resolve(sourceBlueprint).split(path.sep);
    const creativeIndex = parts.lastIndexOf('competitive-creative');
    if (creativeIndex > 0) {
      const base = parts.slice(0, creativeIndex).join(path.sep) || path.sep;
      const candidate = path.join(base, 'projects', String(packet.item_id));
      if (fs.existsSync(path.join(candidate, 'listing.json'))) return candidate;
    }
  }
  return null;
};

const projectDir = inferProjectDir();
if (!projectDir || !fs.existsSync(path.join(projectDir, 'listing.json'))) {
  throw new Error(`Could not infer listing project folder for ${packet.item_id}; pass --project-dir.`);
}

const sourceBlueprint = packet.source_blueprint && fs.existsSync(packet.source_blueprint)
  ? packet.source_blueprint
  : null;
const blueprintOutDir = path.resolve(String(args['out-dir'] ?? (
  sourceBlueprint ? path.dirname(sourceBlueprint) : path.join(projectDir, 'competitive-creative')
)));
ensureDir(blueprintOutDir);

const runManifest = path.join(blueprintOutDir, 'competitive-research-rerun-manifest.json');
const steps = [];
const run = (step) => {
  const executed = runStep(step);
  steps.push(executed);
  return executed;
};

const architectArgs = [
  'scripts/competitive-listing-video-architect.mjs',
  'plan',
  '--project-dir',
  projectDir,
  '--competitors',
  competitors,
  '--out-dir',
  blueprintOutDir,
];
if (args['analyze-reference-video'] === true) architectArgs.push('--analyze-reference-video');
pushOption(architectArgs, 'analysis-max-seconds');

const previewManifest = path.join(blueprintOutDir, 'competitive-preview-render-manifest.json');
const premiumPlan = path.join(blueprintOutDir, 'competitive-premium-render-plan', 'competitive-premium-render-plan.json');
const statusReport = path.join(blueprintOutDir, 'competitive-premium-render-plan', 'competitive-video-pipeline-status.json');
const reviewBoard = path.join(blueprintOutDir, 'competitive-premium-render-plan', 'competitive-review-board.html');

try {
  run({
    name: 'rerun_competitive_architect',
    commandArgs: architectArgs,
    expectedFiles: [path.join(blueprintOutDir, 'creative-blueprint.json')],
  });

  const loopArgs = [
    'scripts/run-competitive-video-control-loop.mjs',
    '--blueprints-dir',
    blueprintOutDir,
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
  if (args['allow-weak-research'] === true) loopArgs.push('--allow-weak-research');

  run({
    name: 'rerun_competitive_control_loop',
    commandArgs: loopArgs,
    expectedFiles: [previewManifest, premiumPlan, statusReport, reviewBoard],
  });
} catch (error) {
  if (error?.step) steps.push(error.step);
  writeJson(runManifest, {
    created_at: new Date().toISOString(),
    script: scriptName,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    packet_json: packetJson,
    packet_dir: packetDir,
    project_dir: projectDir,
    competitors,
    blueprint_out_dir: blueprintOutDir,
    paths: {preview_manifest: previewManifest, premium_plan: premiumPlan, status_report: statusReport, review_board: reviewBoard},
    steps,
  });
  throw error;
}

writeJson(runManifest, {
  created_at: new Date().toISOString(),
  script: scriptName,
  ok: steps.every((step) => step.status === 'ok' || step.status === 'planned'),
  dry_run: args['dry-run'] === true,
  packet_json: packetJson,
  packet_dir: packetDir,
  item_id: packet.item_id,
  title: packet.title,
  project_dir: projectDir,
  competitors,
  blueprint_out_dir: blueprintOutDir,
  paths: {preview_manifest: previewManifest, premium_plan: premiumPlan, status_report: statusReport, review_board: reviewBoard},
  steps,
});

console.log(`Competitive research rerun manifest: ${runManifest}`);
console.log(`Project: ${projectDir}`);
console.log(`Blueprint dir: ${blueprintOutDir}`);
console.log(`Status report: ${statusReport}`);
