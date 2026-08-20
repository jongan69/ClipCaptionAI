#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {commandPath} from './command-utils.mjs';
import {parseArgs, projectRoot, requireArg} from './lib.mjs';
import {hashValue} from './platform/catalog.mjs';

const argv = process.argv.slice(2);
const action = argv[0];
const args = parseArgs(argv.slice(1));
const candidates = [
  process.env.CCA_HIGGSFIELD_BIN,
  commandPath('higgsfield'),
  commandPath('higgs'),
  path.join(projectRoot, 'node_modules', '.bin', 'higgs'),
  path.join(projectRoot, 'node_modules', '.bin', 'higgsfield'),
  path.join(projectRoot, 'bin', 'higgsfield'),
];
const executable = candidates.find((candidate) => candidate && fs.existsSync(candidate));
const invoke = (items, options = {}) => {
  if (!executable) throw new Error('Installed or project-local Higgsfield CLI not found.');
  const result = spawnSync(executable, items, {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr || `Higgsfield CLI exited with ${result.status}`);
  return result;
};
const capabilities = () => {
  const help = invoke(['--help']).stdout;
  return {executable, fingerprint: crypto.createHash('sha256').update(help).digest('hex')};
};
const stripWrapperFlags = (items) => {
  const flags = new Set([
    '--approval-file',
    '--plan-hash',
    '--capability-fingerprint',
    '--intent-key',
    '--estimated-credits',
    '--total-spent-credits',
  ]);
  const result = [];
  for (let index = 0; index < items.length; index += 1) {
    if (flags.has(items[index])) index += 1;
    else if (!['--live-execution', '--dry-run'].includes(items[index])) result.push(items[index]);
  }
  return result;
};

if (!action || action === '--help') {
  console.log('Usage: clipcaptionai higgsfield doctor|estimate|submit|poll|collect [args]');
} else if (action === 'doctor') {
  console.log(JSON.stringify({ok: true, ...capabilities()}));
} else if (action === 'estimate') {
  const capability = capabilities();
  if (args.credits !== undefined || args['estimated-credits'] !== undefined) {
    const credits = Number(args.credits ?? args['estimated-credits']);
    if (!Number.isFinite(credits) || credits < 0)
      throw new Error('Credits must be a non-negative number.');
    console.log(JSON.stringify({credits, capability}));
  } else {
    const commandArgs = stripWrapperFlags(argv.slice(1));
    if (commandArgs.length === 0)
      throw new Error('Estimate requires --credits or installed-CLI cost argv.');
    process.stdout.write(invoke(commandArgs).stdout);
  }
} else if (action === 'submit') {
  capabilities();
  const run = JSON.parse(fs.readFileSync(path.resolve(requireArg(args, 'approval-file')), 'utf8'));
  const approval = run.approval;
  const planHash = requireArg(args, 'plan-hash');
  const capabilityFingerprint = requireArg(args, 'capability-fingerprint');
  const intentKey = requireArg(args, 'intent-key');
  const estimated = Number(requireArg(args, 'estimated-credits'));
  const spent = Number(args['total-spent-credits'] || 0);
  if (
    !approval ||
    approval.planHash !== planHash ||
    approval.capabilityFingerprint !== capabilityFingerprint ||
    approval.estimateHash !== hashValue(run.estimates || {}) ||
    Number(run.estimates?.[intentKey]) !== estimated
  )
    throw new Error('APPROVAL_INVALID');
  if (
    !Number.isFinite(estimated) ||
    !Number.isFinite(spent) ||
    estimated < 0 ||
    spent < 0 ||
    estimated > approval.budgetCredits ||
    estimated + spent > approval.budgetCredits
  )
    throw new Error('BUDGET_EXCEEDED');
  if (argv.includes('--dry-run'))
    console.log(JSON.stringify({submitted: false, dryRun: true, estimatedCredits: estimated}));
  else {
    if (!argv.includes('--live-execution')) throw new Error('LIVE_EXECUTION_REQUIRED');
    const result = invoke(stripWrapperFlags(argv.slice(1)));
    process.stdout.write(result.stdout);
  }
} else if (['poll', 'collect'].includes(action)) {
  capabilities();
  const result = invoke(stripWrapperFlags(argv.slice(1)));
  process.stdout.write(result.stdout);
} else {
  throw new Error(`Unknown Higgsfield action: ${action}`);
}
