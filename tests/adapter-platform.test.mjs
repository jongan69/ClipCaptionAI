import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {serializeCatalog} from '../scripts/platform/catalog.mjs';
import {
  cancelJob,
  jobPaths,
  listJobs,
  readJob,
  readJobLogs,
  submitJob,
  waitForJob,
  writeJsonAtomic,
} from '../scripts/platform/jobs.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');

const fixtureSource = `
export default {
  metadata: {
    id: 'fixture', title: 'Fixture', description: 'Test adapter', version: '1',
    actions: [
      {id: 'echo', title: 'Echo', description: 'Echo', mode: 'job', aliases: ['fixture-echo'], args: [], requirements: [], secrets: [], locks: [], setup: []},
      {id: 'locked', title: 'Locked', description: 'Locked', mode: 'job', aliases: [], args: [], requirements: [], secrets: [], locks: ['gpu'], setup: []},
      {id: 'long', title: 'Long', description: 'Long', mode: 'job', aliases: [], args: [], requirements: [], secrets: [], locks: [], setup: []}
    ]
  },
  async build(action, input) {
    const scripts = {
      echo: "console.log('token=provider-secret-value'); console.log(" + JSON.stringify(String(input.value ?? 'ok')) + ")",
      locked: "setTimeout(() => console.log('locked'), 250)",
      long: "setTimeout(() => console.log('late'), 10000)"
    };
    return {command: process.execPath, args: ['-e', scripts[action]]};
  }
};
`;

const createFixtureRepo = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cca-adapter-repo-'));
  fs.mkdirSync(path.join(root, 'adapters'), {recursive: true});
  fs.writeFileSync(path.join(root, 'adapters', 'fixture.adapter.mjs'), fixtureSource);
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
};

const withPlatformEnv = async (t, fn) => {
  const repo = createFixtureRepo(t);
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'cca-adapter-state-'));
  const previous = {root: process.env.CCA_PROJECT_ROOT, state: process.env.CCA_STATE_ROOT};
  process.env.CCA_PROJECT_ROOT = repo;
  process.env.CCA_STATE_ROOT = state;
  t.after(() => {
    if (previous.root === undefined) delete process.env.CCA_PROJECT_ROOT;
    else process.env.CCA_PROJECT_ROOT = previous.root;
    if (previous.state === undefined) delete process.env.CCA_STATE_ROOT;
    else process.env.CCA_STATE_ROOT = previous.state;
    fs.rmSync(state, {recursive: true, force: true});
  });
  return fn({repo, state});
};

test('a fixture adapter is discovered without router changes', async (t) => {
  const root = createFixtureRepo(t);
  const catalog = await serializeCatalog({root});
  assert.deepEqual(
    catalog.map((adapter) => adapter.id),
    ['fixture'],
  );
  assert.equal(catalog[0].actions[0].aliases[0], 'fixture-echo');

  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, 'bin', 'clipcaptionai.js'), 'adapters', 'list', '--json'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {...process.env, CCA_PROJECT_ROOT: root},
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(result.stdout).data.map((adapter) => adapter.id),
    ['fixture'],
  );
});

test('the workflow catalog includes transcribe and interview QA', async () => {
  const catalog = await serializeCatalog({root: projectRoot});
  const names = catalog
    .find((adapter) => adapter.id === 'workflow')
    .workflows.map((item) => item.command);
  assert.ok(names.includes('transcribe'));
  assert.ok(names.includes('interview-qa'));
});

test('detached jobs persist results and redact logs', async (t) => {
  await withPlatformEnv(t, async () => {
    const job = submitJob({adapter: 'fixture', action: 'echo', input: {value: 'done'}});
    const completed = await waitForJob(job.id);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.normalizedInputHash.length, 64);
    const logs = readJobLogs(job.id);
    assert.match(logs.stdout.text, /done/);
    assert.doesNotMatch(logs.stdout.text, /provider-secret-value/);
  });
});

test('resource locks serialize conflicting jobs', async (t) => {
  await withPlatformEnv(t, async () => {
    const first = submitJob({adapter: 'fixture', action: 'locked'});
    const second = submitJob({adapter: 'fixture', action: 'locked'});
    const [left, right] = await Promise.all([waitForJob(first.id), waitForJob(second.id)]);
    const ordered = [left, right].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    assert.ok(Date.parse(ordered[1].startedAt) >= Date.parse(ordered[0].endedAt));
  });
});

test('jobs can be cancelled and orphaned records are interrupted', async (t) => {
  await withPlatformEnv(t, async () => {
    const active = submitJob({adapter: 'fixture', action: 'long'});
    while (readJob(active.id).status === 'queued') {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(cancelJob(active.id).status, 'cancelled');

    const orphanId = 'orphan-fixture';
    const now = new Date().toISOString();
    writeJsonAtomic(jobPaths(orphanId).record, {
      id: orphanId,
      status: 'running',
      adapter: 'fixture',
      action: 'long',
      createdAt: now,
      updatedAt: now,
      workerPid: 2147483647,
    });
    assert.equal(listJobs().find((job) => job.id === orphanId).status, 'interrupted');
  });
});
