import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {withCampaignLock} from '../scripts/marketing/lock.mjs';

test('run ownership excludes another process and releases after completion', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cca-lock-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const module = new URL('../scripts/marketing/lock.mjs', import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      '--eval',
      `import {withCampaignLock} from ${JSON.stringify(module)}; await withCampaignLock(${JSON.stringify(directory)}, async () => { console.log('locked'); for await (const chunk of process.stdin) { if(chunk) break; } });`,
    ],
    {stdio: ['pipe', 'pipe', 'pipe']},
  );
  t.after(() => child.kill());
  await once(child.stdout, 'data');
  let called = false;
  await assert.rejects(
    withCampaignLock(directory, () => {
      called = true;
    }),
    /CAMPAIGN_LOCKED/,
  );
  assert.equal(called, false);
  const exited = once(child, 'exit');
  child.stdin.end('release');
  assert.equal((await exited)[0], 0);
  assert.equal(await withCampaignLock(directory, () => 'recovered'), 'recovered');
  await assert.rejects(
    withCampaignLock(directory, () => {
      throw new Error('failed operation');
    }),
    /failed operation/,
  );
  assert.equal(fs.existsSync(path.join(directory, '.campaign.lock')), false);
});

test('unreadable abandoned lock is never stolen automatically', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cca-lock-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, '.campaign.lock');
  fs.writeFileSync(file, 'interrupted');
  await assert.rejects(
    withCampaignLock(directory, () => {}),
    /CAMPAIGN_LOCKED/,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'interrupted');
  await assert.rejects(
    withCampaignLock(path.join(directory, 'absent'), () => {}),
    /ENOENT/,
  );
});
