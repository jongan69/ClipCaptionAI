import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {commandPath} from '../command-utils.mjs';
import {loadEnv, parseArgs, projectRoot} from '../lib.mjs';
import {hashValue, serializeCatalog} from '../platform/catalog.mjs';
import {writeJsonAtomic} from '../platform/jobs.mjs';
import {AssetRecord, CampaignRun, CreativePlan} from './schemas.mjs';

const args = parseArgs(process.argv.slice(3));
loadEnv();
const campaignsRoot = path.resolve(
  process.env.CCA_CAMPAIGNS_ROOT || path.join(projectRoot, 'campaigns'),
);
const now = () => new Date().toISOString();
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const fileHash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const print = (value) => console.log(JSON.stringify(value));
const appendEvent = (directory, type, data = {}) =>
  fs.appendFileSync(
    path.join(directory, 'events.ndjson'),
    `${JSON.stringify({at: now(), type, ...data})}\n`,
  );

const runDirectory = (value) => {
  const requested = path.resolve(String(value));
  if (fs.existsSync(requested) && fs.statSync(requested).isDirectory()) return requested;
  const byId = path.join(campaignsRoot, String(value));
  if (fs.existsSync(byId)) return byId;
  throw new Error(`Campaign run not found: ${value}`);
};

const loadRun = (value) => {
  const directory = runDirectory(value);
  return {
    directory,
    plan: CreativePlan.parse(readJson(path.join(directory, 'plan.json'))),
    run: CampaignRun.parse(readJson(path.join(directory, 'run.json'))),
    assets: zAssets(readJson(path.join(directory, 'assets', 'index.json'))),
  };
};

const zAssets = (value) => {
  if (!Array.isArray(value)) throw new Error('assets/index.json must contain an array.');
  return value.map((entry) => AssetRecord.parse(entry));
};

const saveRun = (directory, run, patch = {}) => {
  const next = CampaignRun.parse({...run, ...patch, updatedAt: now()});
  writeJsonAtomic(path.join(directory, 'run.json'), next);
  return next;
};

const currentCapabilities = async () => {
  const catalog = await serializeCatalog();
  const tools = [
    {
      name: 'rotato',
      executable:
        commandPath('rotato') ||
        (fs.existsSync('/usr/local/bin/rotato') ? '/usr/local/bin/rotato' : null),
    },
    {
      name: 'higgsfield',
      executable:
        process.env.CCA_HIGGSFIELD_BIN ||
        commandPath('higgsfield') ||
        commandPath('higgs') ||
        [
          path.join(projectRoot, 'node_modules', '.bin', 'higgs'),
          path.join(projectRoot, 'node_modules', '.bin', 'higgsfield'),
          path.join(projectRoot, 'bin', 'higgsfield'),
        ].find((candidate) => fs.existsSync(candidate)),
    },
  ];
  const toolHelp = tools.map(({name, executable}) => {
    if (!executable) return {name, available: false};
    const result = spawnSync(executable, ['--help'], {encoding: 'utf8', shell: false});
    return {
      name,
      available: result.status === 0,
      fingerprint: result.status === 0 ? hashValue(result.stdout) : null,
    };
  });
  return hashValue({
    adapters: catalog.map(({id, version, capabilityFingerprint}) => ({
      id,
      version,
      capabilityFingerprint,
    })),
    toolHelp,
  });
};

const currentPlanHash = (plan) => hashValue({...plan, planHash: ''});

const requireCurrentApproval = async ({plan, run}) => {
  const capabilityFingerprint = await currentCapabilities();
  const planHash = currentPlanHash(plan);
  if (planHash !== plan.planHash || run.planHash !== planHash)
    throw new Error('PLAN_HASH_MISMATCH');
  if (
    capabilityFingerprint !== plan.capabilityFingerprint ||
    run.capabilityFingerprint !== capabilityFingerprint
  )
    throw new Error('CAPABILITY_FINGERPRINT_CHANGED');
  if (
    !run.approval ||
    run.approval.planHash !== planHash ||
    run.approval.capabilityFingerprint !== capabilityFingerprint ||
    run.approval.estimateHash !== hashValue(run.estimates)
  )
    throw new Error('APPROVAL_REQUIRED');
  if ((run.estimateCredits ?? 0) > run.approval.budgetCredits) throw new Error('BUDGET_EXCEEDED');
};

export {
  runDirectory,
  args,
  campaignsRoot,
  now,
  readJson,
  fileHash,
  print,
  appendEvent,
  loadRun,
  saveRun,
  currentCapabilities,
  currentPlanHash,
  requireCurrentApproval,
};
