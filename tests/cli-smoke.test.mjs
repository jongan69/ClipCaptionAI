import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);

test('clipkit top-level help renders the polished command hub', () => {
  const result = spawnSync('node', ['scripts/clipkit.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Polished command hub/);
  assert.match(result.stdout, /broll-captions\|heavy/);
  assert.match(result.stdout, /rerender --clip 03-your-website-is-leaking-money --no-captions/);
});

test('bin entry works and exposes help output', () => {
  const result = spawnSync('node', ['bin/clipcaptionai.js', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: clipcaptionai/);
  assert.match(result.stdout, /download\|dl/);
});
