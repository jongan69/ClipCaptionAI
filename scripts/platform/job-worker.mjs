import {spawn} from 'node:child_process';
import fs from 'node:fs';

import {sanitizeLogText} from '../../desktop/worker/progress.mjs';
import {acquireResourceLocks} from './resource-locks.mjs';
import {getAdapter} from './catalog.mjs';
import {jobPaths, listJobs, readJob, updateJob, writeJsonAtomic, stateRoot} from './jobs.mjs';

const id = process.argv[2];
if (!id) process.exit(2);

let release = () => {};
try {
  listJobs();
  const job = readJob(id);
  const adapter = await getAdapter(job.adapter);
  const action = adapter.metadata.actions.find((candidate) => candidate.id === job.action);
  if (!action) throw new Error(`Unknown action ${job.adapter}/${job.action}`);
  release = await acquireResourceLocks({root: stateRoot(), id, names: action.locks, readJob});
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
