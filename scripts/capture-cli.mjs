#!/usr/bin/env bun
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

import {parseArgs, requireArg} from './lib.mjs';
import {ProductManifest} from './marketing/schemas.mjs';
import {hashValue} from './platform/catalog.mjs';
import {writeJsonAtomic} from './platform/jobs.mjs';

const action = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readManifest = () => {
  if (args.plan)
    return ProductManifest.parse(
      JSON.parse(fs.readFileSync(path.resolve(String(args.plan)), 'utf8')).product,
    );
  const file = path.resolve(requireArg(args, 'manifest'));
  return ProductManifest.parse(yaml.load(fs.readFileSync(file, 'utf8')));
};

if (!action || action === '--help' || action === '-h')
  console.log(
    'Usage: clipcaptionai capture doctor|run (--manifest <file>|--plan <file>) --flow <id> [--profile <id>] [--record <file>] [--timeout <ms>]',
  );
else if (action === 'doctor') console.log(JSON.stringify({ok: true, mode: 'command'}));
else if (action === 'run') {
  const manifest = readManifest();
  const flowId = requireArg(args, 'flow');
  const flow = manifest.captureFlows[flowId];
  if (!flow) throw new Error(`Unknown capture flow: ${flowId}`);
  const cwd = path.resolve(flow.cwd || manifest.repositoryRoot || process.cwd());
  const timeout = Number(args.timeout ?? 600_000);
  if (!Number.isFinite(timeout) || timeout <= 0)
    throw new Error('Capture timeout must be a positive number of milliseconds.');
  const result = spawnSync(flow.argv[0], flow.argv.slice(1), {
    cwd,
    encoding: 'utf8',
    shell: false,
    timeout,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.stderr || result.error?.message || 'Capture failed.');
  let repositoryCommit = manifest.repositoryCommit || null;
  if (!repositoryCommit) {
    const git = spawnSync('git', ['rev-parse', 'HEAD'], {cwd, encoding: 'utf8', shell: false});
    if (git.status === 0) repositoryCommit = git.stdout.trim();
  }
  const capturedAt = new Date().toISOString();
  const artifacts = flow.outputs.map((output) => {
    const file = path.resolve(cwd, output);
    if (!fs.existsSync(file)) throw new Error(`Capture output missing: ${file}`);
    return {path: file, hash: sha256(file)};
  });
  const record = {
    repositoryCommit,
    flowId,
    flowHash: hashValue(flow),
    seedVersion: manifest.seedVersion,
    platformProfile: args.profile || null,
    capturedAt,
    artifacts,
  };
  if (args.record) writeJsonAtomic(path.resolve(String(args.record)), record);
  console.log(JSON.stringify(record));
} else throw new Error(`Unknown capture action: ${action}`);
