import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {fixture, root, run} from './helpers/marketing-fixture.mjs';

import {execute, success, setup} from './helpers/marketing-run.mjs';

test('campaign dry run does not render, submit, or alter an approved run', (t) => {
  const fx = setup(t, {paid: true, output: true});
  const runFile = path.join(fx.directoryRun, 'run.json');
  const before = fs.readFileSync(runFile, 'utf8');
  const result = success(
    execute(fx, 'execute', ['--run', 'safety', '--dry-run', '--live-execution']),
  );
  assert.equal(result.dryRun, true);
  assert.equal(fs.existsSync(fx.env.HIGGS_CALLS), false);
  assert.equal(fs.existsSync(fx.generated), false);
  assert.deepEqual(fs.readdirSync(path.join(fx.directoryRun, 'artifacts', 'previews')), []);
  assert.equal(fs.readFileSync(runFile, 'utf8'), before);
});

test('pending generated footage blocks final rendering and QA, then resumes without resubmission', (t) => {
  const fx = setup(t, {paid: true});
  const first = success(execute(fx, 'execute', ['--run', 'safety', '--live-execution']));
  assert.equal(first.status, 'awaiting-assets');
  assert.deepEqual(first.finals, []);
  const qa = success(execute(fx, 'qa', ['--run', 'safety']));
  assert.equal(qa.technical, 'failed');
  assert.equal(
    qa.reports[0].technical.checks.find((check) => check.name === 'generation-assets').passed,
    false,
  );
  fs.writeFileSync(fx.generated, 'collected-video');
  const resumed = success(execute(fx, 'execute', ['--run', 'safety', '--live-execution']));
  assert.equal(resumed.status, 'executed');
  assert.equal(resumed.finals.length, 1);
  assert.equal(fs.readFileSync(fx.env.HIGGS_CALLS, 'utf8').trim().split('\n').length, 1);
});

test('local execution records executed status and rerender invalidates prior reviews', (t) => {
  const fx = setup(t);
  assert.equal(success(execute(fx, 'execute', ['--run', 'safety'])).status, 'executed');
  success(execute(fx, 'qa', ['--run', 'safety']));
  const runFile = path.join(fx.directoryRun, 'run.json');
  const record = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  record.reviews = {
    technical: 'passed',
    contentClaims: 'approved',
    visualHuman: 'approved',
    publication: 'approved',
  };
  fs.writeFileSync(runFile, JSON.stringify(record));
  success(execute(fx, 'execute', ['--run', 'safety']));
  const updated = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  assert.equal(updated.reviews.technical, 'pending');
  assert.equal(updated.reviews.visualHuman, 'pending');
  assert.equal(updated.reviews.publication, 'blocked');
  assert.deepEqual(fs.readdirSync(path.join(fx.directoryRun, 'qa')), []);
});

test('estimate cannot invoke a generation command', (t) => {
  const fx = fixture(t);
  const result = run(
    process.execPath,
    [path.join(root, 'scripts/higgsfield-cli.mjs'), 'estimate', 'generate', 'create'],
    fx.env,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /COST_COMMAND_REQUIRED/);
  assert.equal(fs.existsSync(fx.env.HIGGS_CALLS), false);
});

test('ambiguous submission results do not cause a second charge on resume', (t) => {
  const fx = setup(t, {paid: true});
  fx.env.HIGGS_BAD_RESULT = '1';
  const first = execute(fx, 'execute', ['--run', 'safety', '--live-execution']);
  assert.notEqual(first.status, 0);
  const resumed = success(execute(fx, 'execute', ['--run', 'safety', '--live-execution']));
  assert.equal(resumed.status, 'awaiting-assets');
  assert.equal(fs.readFileSync(fx.env.HIGGS_CALLS, 'utf8').trim().split('\n').length, 1);
});

test('export requires current QA and unchanged artifacts even after review approval', (t) => {
  const fx = setup(t);
  const executed = success(execute(fx, 'execute', ['--run', 'safety']));
  success(execute(fx, 'qa', ['--run', 'safety']));
  const runFile = path.join(fx.directoryRun, 'run.json');
  success(
    execute(fx, 'review', [
      '--run',
      'safety',
      '--reviewer',
      'Fixture reviewer',
      '--content-claims',
      'approved',
      '--visual-human',
      'approved',
      '--publication',
      'approved',
    ]),
  );
  assert.equal(success(execute(fx, 'export', ['--run', 'safety'])).publishReady, true);
  const reportPath = path.join(fx.directoryRun, 'qa', 'vertical.json');
  const reportText = fs.readFileSync(reportPath, 'utf8');
  const stale = JSON.parse(reportText);
  delete stale.evidenceHash;
  fs.writeFileSync(reportPath, JSON.stringify(stale));
  assert.equal(success(execute(fx, 'export', ['--run', 'safety'])).publishReady, false);
  fs.writeFileSync(reportPath, reportText);
  fs.appendFileSync(executed.finals[0], 'changed after approval');
  assert.equal(success(execute(fx, 'export', ['--run', 'safety'])).publishReady, false);
  const qa = success(execute(fx, 'qa', ['--run', 'safety']));
  assert.equal(qa.technical, 'failed');
  assert.equal(JSON.parse(fs.readFileSync(runFile, 'utf8')).reviews.publication, 'blocked');
});

test('changed or missing generation assets fail QA', (t) => {
  const fx = setup(t, {paid: true, output: true});
  success(execute(fx, 'execute', ['--run', 'safety', '--live-execution']));
  const assets = JSON.parse(
    fs.readFileSync(path.join(fx.directoryRun, 'assets/index.json'), 'utf8'),
  );
  const generated = assets.find((asset) => asset.type === 'generated');
  for (const mutate of [
    () => fs.appendFileSync(generated.path, 'changed'),
    () => fs.rmSync(generated.path),
  ]) {
    mutate();
    const qa = success(execute(fx, 'qa', ['--run', 'safety']));
    assert.equal(qa.technical, 'failed');
    assert.equal(
      qa.reports[0].technical.checks.find((check) => check.name === 'generation-assets').passed,
      false,
    );
  }
});
