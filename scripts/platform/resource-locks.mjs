import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {hashValue} from './catalog.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const alive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

const recoveryError = (target, cause) =>
  new Error(
    `RESOURCE_LOCK_RECOVERY_REQUIRED: inspect ${target} and confirm its owner and children have exited before removing it.`,
    {cause},
  );

function retireAbandonedLock(target, ownerId, readJob) {
  const claim = path.join(target, 'recovery');
  try {
    fs.mkdirSync(claim);
  } catch (error) {
    if (['EEXIST', 'ENOENT'].includes(error.code)) return;
    throw error;
  }
  let retired = false;
  try {
    const currentOwner = fs.readFileSync(path.join(target, 'owner'), 'utf8').trim();
    if (currentOwner !== ownerId) return;
    const current = readJob(currentOwner);
    if (!terminal.has(current.status) || alive(current.workerPid) || alive(current.childPid))
      return;
    const tombstone = `${target}.retired-${crypto.randomUUID()}`;
    fs.renameSync(target, tombstone);
    retired = true;
    fs.rmSync(tombstone, {recursive: true, force: true});
  } finally {
    if (!retired) fs.rmdirSync(claim);
  }
}

async function acquireOne({target, id, readJob, pause}) {
  let incompleteReads = 0;
  while (true) {
    if (readJob(id).cancelRequested) throw new Error('JOB_CANCELLED');
    try {
      fs.mkdirSync(target);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let ownerJob;
      let owner;
      try {
        owner = fs.readFileSync(path.join(target, 'owner'), 'utf8').trim();
        ownerJob = readJob(owner);
      } catch (readError) {
        // A creator can be between mkdir and writing owner. Never steal its lock.
        if (readError.code !== 'ENOENT' || ++incompleteReads >= 50)
          throw recoveryError(target, readError);
      }
      if (
        ownerJob &&
        terminal.has(ownerJob.status) &&
        !alive(ownerJob.workerPid) &&
        !alive(ownerJob.childPid)
      )
        retireAbandonedLock(target, owner, readJob);
      await pause(100);
      continue;
    }
    try {
      fs.writeFileSync(path.join(target, 'owner'), id, {mode: 0o600});
      return;
    } catch (error) {
      fs.rmSync(target, {recursive: true, force: true});
      throw error;
    }
  }
}

export async function acquireResourceLocks({root, id, names, readJob, pause = sleep}) {
  const directory = path.join(root, 'locks');
  fs.mkdirSync(directory, {recursive: true});
  const acquired = [];
  const release = () => {
    for (const target of acquired.splice(0).reverse())
      fs.rmSync(target, {recursive: true, force: true});
  };
  try {
    for (const name of [...new Set(names)].sort()) {
      const target = path.join(directory, hashValue(name));
      await acquireOne({target, id, readJob, pause});
      acquired.push(target);
    }
    return release;
  } catch (error) {
    release();
    throw error;
  }
}
