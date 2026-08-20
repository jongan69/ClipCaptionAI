import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {sanitizeLogText} from '../../desktop/worker/progress.mjs';
import {getAdapter, hashValue} from './catalog.mjs';
import {jobPaths, listJobs, readJob, updateJob, writeJsonAtomic, stateRoot} from './jobs.mjs';

const id = process.argv[2];
if (!id) process.exit(2);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lockPath = (name) => path.join(stateRoot(), 'locks', hashValue(name));

async function acquireLocks(names) {
  const acquired = [];
  for (const name of [...new Set(names)].sort()) {
    const target = lockPath(name);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    while (true) {
      if (readJob(id).cancelRequested) throw new Error('JOB_CANCELLED');
      try {
        fs.mkdirSync(target);
        fs.writeFileSync(path.join(target, 'owner'), id);
        acquired.push(target);
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        try {
          const owner = fs.readFileSync(path.join(target, 'owner'), 'utf8').trim();
          const ownerJob = readJob(owner);
          if (['completed', 'failed', 'cancelled', 'interrupted'].includes(ownerJob.status)) {
            fs.rmSync(target, {recursive: true, force: true});
            continue;
          }
        } catch {
          fs.rmSync(target, {recursive: true, force: true});
          continue;
        }
        await sleep(100);
      }
    }
  }
  return () =>
    acquired.reverse().forEach((target) => fs.rmSync(target, {recursive: true, force: true}));
}

let release = () => {};
try {
  listJobs();
  const job = readJob(id);
  const adapter = await getAdapter(job.adapter);
  const action = adapter.metadata.actions.find((candidate) => candidate.id === job.action);
  if (!action) throw new Error(`Unknown action ${job.adapter}/${job.action}`);
  release = await acquireLocks(action.locks);
  const spec = await adapter.build(job.action, job.input, {job, action});
  if (!spec || typeof spec.command !== 'string' || !Array.isArray(spec.args)) {
    throw new Error('Adapter build() must return {command, args: []}.');
  }
  const paths = jobPaths(id);
  updateJob(id, {
    status: 'running',
    startedAt: new Date().toISOString(),
    execution: {command: spec.command, args: spec.args},
  });
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: {...process.env, CCA_JOB_ID: id, ...spec.env},
    shell: false,
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  updateJob(id, {childPid: child.pid});
  const append = (file, chunk) => fs.appendFileSync(file, sanitizeLogText(String(chunk)));
  child.stdout.on('data', (chunk) => append(paths.stdout, chunk));
  child.stderr.on('data', (chunk) => append(paths.stderr, chunk));
  const exit = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({code, signal}));
  });
  const cancelled = readJob(id).cancelRequested;
  const collected = adapter.collect
    ? await adapter.collect(job.action, job.input, {job: readJob(id), spec, exit})
    : {};
  const result = {exitCode: exit.code, signal: exit.signal, ...collected};
  writeJsonAtomic(paths.result, result);
  updateJob(id, {
    status: cancelled ? 'cancelled' : exit.code === 0 ? 'completed' : 'failed',
    endedAt: new Date().toISOString(),
    exitCode: exit.code,
    signal: exit.signal,
    result,
    artifacts: result.artifacts ?? [],
  });
} catch (error) {
  const cancelled = error?.message === 'JOB_CANCELLED' || readJob(id).cancelRequested;
  fs.appendFileSync(
    jobPaths(id).stderr,
    `${sanitizeLogText(error?.stack || error?.message || error)}\n`,
  );
  updateJob(id, {
    status: cancelled ? 'cancelled' : 'failed',
    endedAt: new Date().toISOString(),
    exitCode: cancelled ? null : 1,
    result: {error: cancelled ? 'Cancelled' : String(error?.message ?? error)},
  });
} finally {
  release();
}
