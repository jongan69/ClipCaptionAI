import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as yaml from 'js-yaml';
import {hashValue} from '../scripts/platform/catalog.mjs';
import {
  root,
  executable,
  run,
  runCli,
  parseChildJson,
  fixture,
} from './helpers/marketing-fixture.mjs';

test('Rotato templates compile semantic slots and reject drift or screen conflicts', (t) => {
  const fx = fixture(t);
  const templates = path.join(fx.directory, 'templates');
  const template = path.join(templates, 'phone');
  fs.mkdirSync(template, {recursive: true});
  fs.writeFileSync(path.join(template, 'scene.rotato'), 'scene');
  const inspected = {devices: [{index: 0}], overlays: [{id: 'headline'}]};
  fs.writeFileSync(
    path.join(template, 'template.json'),
    JSON.stringify({
      inspectFingerprint: hashValue(inspected),
      deviceSlots: {phone: 0},
      textOverlays: {headline: 'headline'},
      imageOverlays: {},
    }),
  );
  const media = path.join(fx.directory, 'screen.mp4');
  const output = path.join(fx.directory, 'render.mp4');
  fs.writeFileSync(media, 'screen');
  const env = {...fx.env, CCA_ROTATO_TEMPLATES_ROOT: templates};
  const listed = parseChildJson(runCli(['rotato', 'templates', '--json'], env));
  assert.deepEqual(listed.templates[0].deviceSlots, {phone: 0});
  const rendered = run(
    process.execPath,
    [
      path.join(root, 'scripts', 'rotato-cli.mjs'),
      'render',
      '--template',
      'phone',
      '--screen-slot',
      'phone',
      media,
      '--text-slot',
      'headline',
      'Hello',
      '--output',
      output,
      '--json',
    ],
    env,
  );
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.ok(fs.existsSync(output));
  const brokerOutput = path.join(fx.directory, 'broker-render.mp4');
  const brokerResult = runCli(
    ['rotato', 'render', '--template', 'phone', '--output', brokerOutput, '--wait', '--json'],
    env,
  );
  assert.equal(brokerResult.status, 0, brokerResult.stderr);
  const brokerArtifact = JSON.parse(brokerResult.stdout).data.result.artifact;
  assert.equal(brokerArtifact.templateValidated, true);
  assert.equal(brokerArtifact.capabilityFingerprint.length, 64);
  const conflict = run(
    process.execPath,
    [
      path.join(root, 'scripts', 'rotato-cli.mjs'),
      'render',
      path.join(template, 'scene.rotato'),
      '--screen-media',
      media,
      '--screen-media-for',
      '0',
      media,
    ],
    env,
  );
  assert.match(conflict.stderr, /ROTATO_SCREEN_MODE_CONFLICT/);
  const config = JSON.parse(fs.readFileSync(path.join(template, 'template.json')));
  config.inspectFingerprint = 'stale';
  fs.writeFileSync(path.join(template, 'template.json'), JSON.stringify(config));
  const stale = run(
    process.execPath,
    [
      path.join(root, 'scripts', 'rotato-cli.mjs'),
      'render',
      '--template',
      'phone',
      '--output',
      output,
    ],
    env,
  );
  assert.match(stale.stderr, /TEMPLATE_INSPECT_MISMATCH/);
});

test('Higgsfield submission enforces live approval and budgets', (t) => {
  const fx = fixture(t);
  const approvalFile = path.join(fx.directory, 'run.json');
  const estimates = {intent: 3};
  fs.writeFileSync(
    approvalFile,
    JSON.stringify({
      estimates,
      approval: {
        planHash: 'plan',
        capabilityFingerprint: 'cap',
        estimateHash: hashValue(estimates),
        budgetCredits: 5,
      },
    }),
  );
  const base = [
    path.join(root, 'scripts', 'higgsfield-cli.mjs'),
    'submit',
    '--approval-file',
    approvalFile,
    '--plan-hash',
    'plan',
    '--capability-fingerprint',
    'cap',
    '--intent-key',
    'intent',
    '--estimated-credits',
    '3',
  ];
  const dry = run(process.execPath, [...base, '--dry-run', 'generate', 'create'], fx.env);
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(fs.existsSync(fx.env.HIGGS_CALLS), false);
  const changedEstimate = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
  changedEstimate.estimates.intent = 4;
  fs.writeFileSync(approvalFile, JSON.stringify(changedEstimate));
  const invalidated = run(process.execPath, [...base, '--dry-run', 'generate', 'create'], fx.env);
  assert.match(invalidated.stderr, /APPROVAL_INVALID/);
  fs.writeFileSync(
    approvalFile,
    JSON.stringify({
      estimates,
      approval: {
        planHash: 'plan',
        capabilityFingerprint: 'cap',
        estimateHash: hashValue(estimates),
        budgetCredits: 5,
      },
    }),
  );
  const missingBudget = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
  delete missingBudget.approval.budgetCredits;
  fs.writeFileSync(approvalFile, JSON.stringify(missingBudget));
  const malformed = run(process.execPath, [...base, '--dry-run', 'generate', 'create'], fx.env);
  assert.match(malformed.stderr, /BUDGET_EXCEEDED/);
  fs.writeFileSync(
    approvalFile,
    JSON.stringify({
      estimates,
      approval: {
        planHash: 'plan',
        capabilityFingerprint: 'cap',
        estimateHash: hashValue(estimates),
        budgetCredits: 5,
      },
    }),
  );
  const noLive = run(process.execPath, [...base, 'generate', 'create'], fx.env);
  assert.match(noLive.stderr, /LIVE_EXECUTION_REQUIRED/);
  const over = run(
    process.execPath,
    [...base, '--total-spent-credits', '4', '--live-execution', 'generate', 'create'],
    fx.env,
  );
  assert.match(over.stderr, /BUDGET_EXCEEDED/);
  const live = run(process.execPath, [...base, '--live-execution', 'generate', 'create'], fx.env);
  assert.equal(live.status, 0, live.stderr);
  assert.match(fs.readFileSync(fx.env.HIGGS_CALLS, 'utf8'), /generate create/);
});

test('command capture records reproducible provenance', (t) => {
  const fx = fixture(t);
  const output = path.join(fx.directory, 'capture.mp4');
  const capture = path.join(fx.bin, 'capture-demo');
  executable(capture, `require('fs').writeFileSync(${JSON.stringify(output)},'capture')`);
  const manifest = path.join(fx.directory, 'product.yaml');
  fs.writeFileSync(
    manifest,
    yaml.dump({
      id: 'demo',
      name: 'Demo',
      repositoryCommit: 'abc123',
      seedVersion: '7',
      captureFlows: {hero: {argv: [capture], outputs: [output]}},
    }),
  );
  const result = run(
    process.execPath,
    [
      path.join(root, 'scripts', 'capture-cli.mjs'),
      'run',
      '--manifest',
      manifest,
      '--flow',
      'hero',
      '--profile',
      'desktop',
    ],
    fx.env,
  );
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(result.stdout);
  assert.equal(record.repositoryCommit, 'abc123');
  assert.equal(record.seedVersion, '7');
  assert.equal(record.platformProfile, 'desktop');
  assert.equal(record.artifacts[0].hash.length, 64);
  const invalidTimeout = run(
    process.execPath,
    [
      path.join(root, 'scripts', 'capture-cli.mjs'),
      'run',
      '--manifest',
      manifest,
      '--flow',
      'hero',
      '--timeout',
      '0',
    ],
    fx.env,
  );
  assert.match(invalidTimeout.stderr, /positive number/);
});
