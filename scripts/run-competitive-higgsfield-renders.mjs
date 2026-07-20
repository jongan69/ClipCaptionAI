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
  node scripts/run-competitive-higgsfield-renders.mjs --premium-plan outputs/.../competitive-premium-render-plan.json
  npm run ebay:competitive-higgsfield-render -- --premium-plan outputs/.../competitive-premium-render-plan.json --model seedance_2_0_mini --credit-budget 40

Options:
  --premium-plan FILE       Premium render plan from ebay:prep-premium-renders.
  --out-dir DIR             Default: sibling competitive-higgsfield-render-run.
  --out-manifest FILE       Default: out-dir/competitive-higgsfield-render-manifest.json.
  --url-map FILE            Default: out-dir/higgsfield-render-url-map.json.
  --model MODEL             Override model for all jobs, e.g. seedance_2_0_mini.
  --starter-fallback-model MODEL
                            Default: seedance_2_0_mini when account plan is Starter and job model is seedance_2_0.
  --no-starter-fallback     Do not auto-fallback from seedance_2_0 on Starter accounts.
  --credit-budget N         Max credits to spend/create in this run. Default: 45.
  --max-jobs N              Max jobs to create in this run.
  --job-ids IDS             Comma-separated job IDs to include.
  --skip-job-ids IDS        Comma-separated job IDs to exclude.
  --overwrite               Create jobs even when a completed job JSON already exists.
  --dry-run                 Plan/cost jobs but do not create jobs.
  --skip-cost               Use plan estimates instead of calling Higgsfield cost API.
  --wait-timeout VALUE      Default: 20m
  --wait-interval VALUE     Default: 5s

Renders premium competitive beat jobs through Higgsfield CLI, one at a time.
It writes per-job *.competitive-job.json files, a run manifest, and a URL map
for ebay:collect-premium-renders. It is budget-gated and resumable.
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

const idSet = (value) =>
  new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean));

const numberValue = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const tail = (value, max = 3000) => {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(text.length - max) : text;
};

const parseJsonLoose = (text) => {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const arrayStart = trimmed.indexOf('[');
    const index = [start, arrayStart].filter((item) => item >= 0).sort((a, b) => a - b)[0];
    if (index === undefined) return null;
    return JSON.parse(trimmed.slice(index));
  }
};

const completedJobFromFile = (file) => {
  if (!file || !fs.existsSync(file)) return null;
  const parsed = readJson(file);
  const job = Array.isArray(parsed) ? parsed[0] : parsed;
  return job?.status === 'completed' && job?.result_url ? job : null;
};

const runHiggs = (commandArgs) => {
  const result = spawnSync('npm', ['exec', '--yes', '--package=@higgsfield/cli', '--', 'higgs', ...commandArgs], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    parsed: result.status === 0 ? parseJsonLoose(result.stdout) : null,
  };
};

const accountStatus = () => {
  if (args['dry-run'] === true && args['skip-cost'] === true) return null;
  const result = runHiggs(['account', 'status', '--json']);
  return result.ok ? result.parsed : null;
};

const flattenJobs = (plan) => {
  const jobs = [];
  for (const packet of plan.selected ?? []) {
    for (const job of packet.jobs ?? []) {
      jobs.push({
        item_id: String(packet.item_id),
        title: packet.title,
        project_dir: packet.project_dir,
        job_json: path.join(packet.project_dir, 'higgsfield', `${job.id}.competitive-job.json`),
        ...job,
      });
    }
  }
  return jobs;
};

const effectiveModelForJob = ({job, account}) => {
  if (args.model) return String(args.model);
  if (
    args['no-starter-fallback'] !== true
    && String(account?.subscription_plan_type ?? '').toLowerCase() === 'starter'
    && job.model === 'seedance_2_0'
  ) {
    return String(args['starter-fallback-model'] ?? 'seedance_2_0_mini');
  }
  return job.model ?? 'seedance_2_0';
};

const higgsArgsForJob = ({job, model, command}) => {
  const commandArgs = [
    'generate',
    command,
    model,
    '--prompt',
    job.prompt,
    '--duration',
    String(Math.max(1, Math.round(numberValue(job.duration_seconds, 5)))),
  ];
  if (job.aspect_ratio) commandArgs.push('--aspect_ratio', job.aspect_ratio);
  if (job.resolution) commandArgs.push('--resolution', job.resolution);
  if (job.mode && model !== 'seedance_2_0_mini') commandArgs.push('--mode', job.mode);
  commandArgs.push('--generate_audio', 'false');
  for (const image of job.reference_images ?? []) commandArgs.push('--image-references', image);
  if (command === 'create') {
    commandArgs.push('--wait', '--wait-timeout', String(args['wait-timeout'] ?? '20m'), '--wait-interval', String(args['wait-interval'] ?? '5s'));
  }
  commandArgs.push('--json');
  return commandArgs;
};

const resultUrlFromParsed = (parsed) => {
  const job = Array.isArray(parsed) ? parsed[0] : parsed;
  return job?.result_url ?? null;
};

const premiumPlanPath = path.resolve(requireArg('premium-plan'));
if (!fs.existsSync(premiumPlanPath)) throw new Error(`Premium plan not found: ${premiumPlanPath}`);
const plan = readJson(premiumPlanPath);
const outDir = path.resolve(String(args['out-dir'] ?? path.join(path.dirname(premiumPlanPath), 'competitive-higgsfield-render-run')));
const outManifest = path.resolve(String(args['out-manifest'] ?? path.join(outDir, 'competitive-higgsfield-render-manifest.json')));
const urlMapPath = path.resolve(String(args['url-map'] ?? path.join(outDir, 'higgsfield-render-url-map.json')));
const creditBudget = numberValue(args['credit-budget'], 45);
const maxJobs = args['max-jobs'] !== undefined ? Math.max(0, Math.floor(numberValue(args['max-jobs'], 0))) : null;
const approvedJobIds = idSet(args['job-ids']);
const skipJobIds = idSet(args['skip-job-ids']);
const dryRun = args['dry-run'] === true;
const skipCost = args['skip-cost'] === true;
const overwrite = args.overwrite === true;
ensureDir(outDir);

const account = accountStatus();
const candidates = flattenJobs(plan)
  .filter((job) => (approvedJobIds.size ? approvedJobIds.has(job.id) : true))
  .filter((job) => !skipJobIds.has(job.id));

const results = [];
const urlMap = {};
let plannedCredits = 0;
let createdCredits = 0;
let createdCount = 0;

for (const job of candidates) {
  const completed = completedJobFromFile(job.job_json);
  const model = effectiveModelForJob({job, account});
  const entry = {
    item_id: job.item_id,
    title: job.title,
    job_id: job.id,
    model,
    original_model: job.model ?? null,
    job_json: job.job_json,
    output_hint: job.output_hint,
    status: 'planned',
    estimated_credits: 0,
    result_url: null,
    command_args: higgsArgsForJob({job, model, command: 'create'}),
    cost_stdout_tail: '',
    cost_stderr_tail: '',
    create_stdout_tail: '',
    create_stderr_tail: '',
    error: null,
  };

  if (completed && !overwrite) {
    entry.status = 'existing_completed';
    entry.result_url = completed.result_url;
    urlMap[job.item_id] ??= {};
    urlMap[job.item_id][job.id] = completed.result_url;
    results.push(entry);
    continue;
  }

  if (maxJobs !== null && createdCount >= maxJobs) {
    entry.status = 'held_max_jobs';
    results.push(entry);
    continue;
  }

  if (skipCost) {
    entry.estimated_credits = numberValue(job.estimated_credits, 0);
  } else {
    const cost = runHiggs(higgsArgsForJob({job, model, command: 'cost'}));
    entry.cost_stdout_tail = tail(cost.stdout);
    entry.cost_stderr_tail = tail(cost.stderr);
    if (!cost.ok) {
      entry.status = 'cost_failed';
      entry.error = entry.cost_stderr_tail || entry.cost_stdout_tail || `cost exited ${cost.status}`;
      results.push(entry);
      continue;
    }
    entry.estimated_credits = numberValue(cost.parsed?.credits, numberValue(job.estimated_credits, 0));
  }

  if (plannedCredits + entry.estimated_credits > creditBudget) {
    entry.status = 'held_credit_budget';
    results.push(entry);
    continue;
  }
  plannedCredits += entry.estimated_credits;

  if (dryRun) {
    entry.status = 'dry_run';
    results.push(entry);
    continue;
  }

  const created = runHiggs(entry.command_args);
  entry.create_stdout_tail = tail(created.stdout);
  entry.create_stderr_tail = tail(created.stderr);
  if (!created.ok) {
    entry.status = 'create_failed';
    entry.error = entry.create_stderr_tail || entry.create_stdout_tail || `create exited ${created.status}`;
    results.push(entry);
    continue;
  }

  ensureDir(path.dirname(job.job_json));
  fs.writeFileSync(job.job_json, `${JSON.stringify(created.parsed, null, 2)}\n`);
  entry.result_url = resultUrlFromParsed(created.parsed);
  if (!entry.result_url) {
    entry.status = 'missing_result_url';
    entry.error = 'Higgsfield job completed without result_url.';
    results.push(entry);
    continue;
  }
  urlMap[job.item_id] ??= {};
  urlMap[job.item_id][job.id] = entry.result_url;
  entry.status = 'created';
  createdCredits += entry.estimated_credits;
  createdCount += 1;
  results.push(entry);
}

writeJson(urlMapPath, urlMap);

const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  premium_plan: premiumPlanPath,
  dry_run: dryRun,
  skip_cost: skipCost,
  overwrite,
  account: account ? {
    subscription_plan_type: account.subscription_plan_type ?? null,
    credits: account.credits ?? null,
  } : null,
  credit_budget: creditBudget,
  planned_credits: plannedCredits,
  created_credits: createdCredits,
  candidate_count: candidates.length,
  created_count: results.filter((entry) => entry.status === 'created').length,
  existing_completed_count: results.filter((entry) => entry.status === 'existing_completed').length,
  held_count: results.filter((entry) => entry.status.startsWith('held_')).length,
  failed_count: results.filter((entry) => /failed|missing_result_url/.test(entry.status)).length,
  url_map: urlMapPath,
  results,
};
writeJson(outManifest, manifest);

console.log(`Competitive Higgsfield render manifest: ${outManifest}`);
console.log(`URL map: ${urlMapPath}`);
console.log(`Candidates: ${manifest.candidate_count}`);
console.log(`Created: ${manifest.created_count}`);
console.log(`Existing completed: ${manifest.existing_completed_count}`);
console.log(`Held: ${manifest.held_count}`);
console.log(`Failed: ${manifest.failed_count}`);
console.log(`Planned credits: ${manifest.planned_credits}`);
