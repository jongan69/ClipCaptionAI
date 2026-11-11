import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {execute, success, setup} from './helpers/marketing-run.mjs';
import {withCampaignLock} from '../scripts/marketing/lock.mjs';

test('supported review command binds approvals to current QA and permits rejection', (t) => {
  const fx = setup(t);
  const flags = ['--run', 'safety', '--reviewer', 'Fixture reviewer'];
  assert.match(
    execute(fx, 'review', [...flags, '--visual-human', 'approved']).stderr,
    /CURRENT_QA_REQUIRED/,
  );
  success(execute(fx, 'execute', ['--run', 'safety']));
  success(execute(fx, 'qa', ['--run', 'safety']));
  assert.match(
    execute(fx, 'review', [...flags, '--publication', 'approved']).stderr,
    /CONTENT_AND_VISUAL_REVIEW_REQUIRED/,
  );
  assert.match(
    execute(fx, 'review', [...flags, '--content-claims', 'maybe']).stderr,
    /approved or rejected/,
  );
  success(execute(fx, 'review', [...flags, '--content-claims', 'approved']));
  success(
    execute(fx, 'review', [...flags, '--visual-human', 'approved', '--publication', 'approved']),
  );
  assert.equal(success(execute(fx, 'export', ['--run', 'safety'])).publishReady, true);
  const rejected = success(execute(fx, 'review', [...flags, '--visual-human', 'rejected']));
  assert.equal(rejected.reviews.publication, 'blocked');
  assert.equal(success(execute(fx, 'export', ['--run', 'safety'])).publishReady, false);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(fx.directoryRun, 'qa/vertical.json'), 'utf8')).visualHuman
      .status,
    'rejected',
  );
});

test('campaign execution cannot cross the paid boundary while another operation owns the run', async (t) => {
  const fx = setup(t, {paid: true, output: true});
  await withCampaignLock(fx.directoryRun, () => {
    const result = execute(fx, 'execute', ['--run', 'safety', '--live-execution']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CAMPAIGN_LOCKED/);
    assert.equal(fs.existsSync(fx.env.HIGGS_CALLS), false);
  });
  success(execute(fx, 'execute', ['--run', 'safety', '--live-execution']));
  assert.equal(fs.readFileSync(fx.env.HIGGS_CALLS, 'utf8').trim().split('\n').length, 1);
});
