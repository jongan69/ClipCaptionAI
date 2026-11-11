import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {acquireResourceLocks} from '../scripts/platform/resource-locks.mjs';
import {hashValue} from '../scripts/platform/catalog.mjs';

const fixture = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cca-resource-lock-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'locks'));
  return {root, target: (name) => path.join(root, 'locks', hashValue(name))};
};

test('an incompletely initialized lock is never stolen and partial acquisitions release', async (t) => {
  const fx = fixture(t);
  fs.mkdirSync(fx.target('b'));
  await assert.rejects(
    acquireResourceLocks({
      root: fx.root,
      id: 'next',
      names: ['a', 'b'],
      readJob: () => ({status: 'queued'}),
      pause: async () => {
        assert.ok(fs.existsSync(fx.target('b')));
        throw new Error('test-wait-ended');
      },
    }),
    /test-wait-ended/,
  );
  assert.ok(fs.existsSync(fx.target('b')));
  assert.equal(fs.existsSync(fx.target('a')), false);
});

test('terminal live owners retain ownership until their own release', async (t) => {
  const fx = fixture(t);
  const readJob = (id) =>
    id === 'owner' ? {status: 'completed', workerPid: process.pid} : {status: 'queued'};
  const releaseOwner = await acquireResourceLocks({
    root: fx.root,
    id: 'owner',
    names: ['gpu'],
    readJob,
  });
  let waited = false;
  const releaseNext = await acquireResourceLocks({
    root: fx.root,
    id: 'next',
    names: ['gpu'],
    readJob,
    pause: async () => {
      waited = true;
      assert.equal(fs.readFileSync(path.join(fx.target('gpu'), 'owner'), 'utf8'), 'owner');
      releaseOwner();
    },
  });
  assert.equal(waited, true);
  releaseOwner();
  assert.ok(fs.existsSync(fx.target('gpu')));
  releaseNext();
});

test('abandoned ownership is retired before new ownership is established', async (t) => {
  const fx = fixture(t);
  fs.mkdirSync(fx.target('gpu'));
  fs.writeFileSync(path.join(fx.target('gpu'), 'owner'), 'dead');
  const release = await acquireResourceLocks({
    root: fx.root,
    id: 'next',
    names: ['gpu'],
    readJob: (id) => ({status: id === 'dead' ? 'interrupted' : 'queued'}),
    pause: async () => {},
  });
  assert.equal(fs.readFileSync(path.join(fx.target('gpu'), 'owner'), 'utf8'), 'next');
  release();
  assert.equal(fs.existsSync(fx.target('gpu')), false);
});
