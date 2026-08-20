import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {hashValue} from './catalog.mjs';

const workerPath = fileURLToPath(new URL('./job-worker.mjs', import.meta.url));
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted']);

export function stateRoot() {
  if (process.env.CCA_STATE_ROOT) return path.resolve(process.env.CCA_STATE_ROOT);
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'ClipCaptionAI');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'ClipCaptionAI');
  }
  return path.join(
    process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'),
    'clipcaptionai',
  );
}

const jobsRoot = () => path.join(stateRoot(), 'jobs');
export const jobPaths = (id) => {
  const directory = path.join(jobsRoot(), id);
  return {
    directory,
    record: path.join(directory, 'job.json'),
    stdout: path.join(directory, 'stdout.log'),
    stderr: path.join(directory, 'stderr.log'),
    result: path.join(directory, 'result.json'),
  };
};

export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
  fs.renameSync(temporary, file);
}

export function readJob(id) {
  const file = jobPaths(id).record;
  if (!fs.existsSync(file)) throw new Error(`Unknown job: ${id}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function updateJob(id, changes) {
  const current = readJob(id);
  const next = {...current, ...changes, updatedAt: new Date().toISOString()};
  writeJsonAtomic(jobPaths(id).record, next);
  return next;
}

const isAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export function recoverJobs() {
  for (const job of listJobs({recover: false})) {
    if (['queued', 'running'].includes(job.status) && job.workerPid && !isAlive(job.workerPid)) {
      updateJob(job.id, {status: 'interrupted', endedAt: new Date().toISOString()});
    }
  }
}

export function listJobs({recover = true} = {}) {
  fs.mkdirSync(jobsRoot(), {recursive: true});
  const jobs = fs.readdirSync(jobsRoot(), {withFileTypes: true}).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    try {
      return [readJob(entry.name)];
    } catch {
      return [];
    }
  });
  if (recover) {
    for (const job of jobs) {
      if (['queued', 'running'].includes(job.status) && job.workerPid && !isAlive(job.workerPid)) {
        Object.assign(
          job,
          updateJob(job.id, {status: 'interrupted', endedAt: new Date().toISOString()}),
        );
      }
    }
  }
  return jobs.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

export function submitJob({adapter, action, input = {}, capabilityFingerprint = null}) {
  const inspect = (value, key = '') => {
    if (/key|token|password|secret/i.test(key) && value) {
      throw new Error(`Secrets must be supplied through the environment, not job input (${key}).`);
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        if (/^--(?:api-key|token|password|secret|.*-api-key|.*-token)$/i.test(String(entry))) {
          throw new Error(`Secrets must be supplied through the environment, not ${entry}.`);
        }
        inspect(entry, String(index));
      });
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([childKey, child]) => inspect(child, childKey));
    }
  };
  inspect(input);
  const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const paths = jobPaths(id);
  fs.mkdirSync(paths.directory, {recursive: true});
  fs.writeFileSync(paths.stdout, '');
  fs.writeFileSync(paths.stderr, '');
  const now = new Date().toISOString();
  writeJsonAtomic(paths.record, {
    id,
    status: 'queued',
    adapter,
    action,
    input,
    normalizedInputHash: hashValue(input),
    capabilityFingerprint,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    endedAt: null,
    workerPid: null,
    childPid: null,
    exitCode: null,
    signal: null,
    cancelRequested: false,
    logPaths: {stdout: paths.stdout, stderr: paths.stderr},
    result: null,
    artifacts: [],
  });

  const child = spawn(process.execPath, [workerPath, id], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {...process.env, ...(process.versions.electron ? {ELECTRON_RUN_AS_NODE: '1'} : {})},
  });
  child.unref();
  updateJob(id, {workerPid: child.pid});
  return readJob(id);
}

export function readJobLogs(id, {stdoutOffset = 0, stderrOffset = 0} = {}) {
  const paths = jobPaths(id);
  const read = (file, offset) => {
    if (!fs.existsSync(file)) return {text: '', offset};
    const buffer = fs.readFileSync(file);
    return {text: buffer.subarray(offset).toString('utf8'), offset: buffer.length};
  };
  return {stdout: read(paths.stdout, stdoutOffset), stderr: read(paths.stderr, stderrOffset)};
}

export async function waitForJob(id, {intervalMs = 150} = {}) {
  while (true) {
    const job = readJob(id);
    if (terminal.has(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export function cancelJob(id) {
  const job = updateJob(id, {cancelRequested: true});
  const pid = job.childPid || job.workerPid;
  if (isAlive(pid)) {
    try {
      process.kill(process.platform === 'win32' ? pid : -pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // The worker may have completed between the liveness check and signal.
      }
    }
  }
  return updateJob(id, {status: 'cancelled', endedAt: new Date().toISOString()});
}

export function pruneJobs({olderThanMs = 7 * 24 * 60 * 60 * 1000} = {}) {
  const removed = [];
  for (const job of listJobs()) {
    if (!terminal.has(job.status)) continue;
    if (Date.now() - Date.parse(job.endedAt || job.createdAt) < olderThanMs) continue;
    fs.rmSync(jobPaths(job.id).directory, {recursive: true, force: true});
    removed.push(job.id);
  }
  return removed;
}
