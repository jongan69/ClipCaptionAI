import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {execute, success, setup} from './helpers/marketing-run.mjs';

test('rerender uses registered generation snapshots when provider output is replaced', (t) => {
  const fx = setup(t, {paid: true, output: true});
  success(execute(fx, 'execute', ['--run', 'safety', '--live-execution']));
  const propsPath = path.join(fx.directoryRun, 'artifacts/previews/vertical-props.json');
  const props = JSON.parse(fs.readFileSync(propsPath, 'utf8'));
  assert.match(props.timeline[0].src, /vertical-/);
  assert.doesNotMatch(props.timeline[0].src, /generated\.mp4$/);
  fs.writeFileSync(fx.generated, 'replaced-original');
  success(execute(fx, 'execute', ['--run', 'safety']));
  assert.equal(
    JSON.parse(fs.readFileSync(propsPath, 'utf8')).timeline[0].src,
    props.timeline[0].src,
  );
  assert.equal(success(execute(fx, 'qa', ['--run', 'safety'])).technical, 'passed');
});

test('corrupt registered snapshots are rejected instead of being blessed by recollection', (t) => {
  const fx = setup(t, {paid: true, output: true});
  success(execute(fx, 'execute', ['--run', 'safety', '--live-execution']));
  const assets = JSON.parse(
    fs.readFileSync(path.join(fx.directoryRun, 'assets/index.json'), 'utf8'),
  );
  fs.appendFileSync(assets.find((asset) => asset.type === 'generated').path, 'tampered');
  const result = execute(fx, 'execute', ['--run', 'safety', '--live-execution']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ARTIFACT_HASH_MISMATCH/);
});

test('pre-existing output cannot be charged or accepted as a new generation', (t) => {
  const fx = setup(t, {paid: true});
  fs.writeFileSync(fx.generated, 'old-output');
  const result = execute(fx, 'execute', ['--run', 'safety', '--live-execution']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GENERATION_OUTPUT_EXISTS/);
  const run = JSON.parse(fs.readFileSync(path.join(fx.directoryRun, 'run.json'), 'utf8'));
  assert.deepEqual(run.providerJobs, {});
});

test('generated slideshow uses its snapshot even when the original is replaced', (t) => {
  const fx = setup(t, {paid: true, output: true, slides: true});
  success(execute(fx, 'execute', ['--run', 'safety', '--live-execution']));
  const propsPath = path.join(fx.directoryRun, 'artifacts/previews/vertical-slide-01-props.json');
  const before = JSON.parse(fs.readFileSync(propsPath, 'utf8'));
  fs.writeFileSync(fx.generated, 'replacement');
  success(execute(fx, 'execute', ['--run', 'safety']));
  assert.equal(
    JSON.parse(fs.readFileSync(propsPath, 'utf8')).timeline[0].src,
    before.timeline[0].src,
  );
});

test('pending generated slideshow waits without copying its missing source', (t) => {
  const fx = setup(t, {paid: true, slides: true});
  const result = success(execute(fx, 'execute', ['--run', 'safety', '--live-execution']));
  assert.equal(result.status, 'awaiting-assets');
  assert.deepEqual(result.finals, []);
});
