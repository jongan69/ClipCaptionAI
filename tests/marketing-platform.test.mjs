import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

import {hashValue, serializeCatalog} from '../scripts/platform/catalog.mjs';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'bin', 'clipcaptionai.js');
const executable = (file, source) => {
  fs.writeFileSync(file, `#!/usr/bin/env node\n${source}`);
  fs.chmodSync(file, 0o755);
};
const run = (command, args, env) => spawnSync(command, args, {cwd: root, env, encoding: 'utf8'});
const runCli = (args, env) => run(process.execPath, [cli, ...args], env);
const parseChildJson = (result) => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, true, result.stdout);
  const text = envelope.data.logs?.stdout?.text ?? envelope.data.stdout;
  return text ? JSON.parse(text.trim().split('\n').at(-1)) : envelope.data;
};

const fixture = (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cca-marketing-'));
  const bin = path.join(directory, 'bin');
  const campaigns = path.join(directory, 'campaigns');
  const state = path.join(directory, 'state');
  fs.mkdirSync(bin, {recursive: true});
  const helpFile = path.join(directory, 'higgs-help.txt');
  fs.writeFileSync(helpFile, 'fake higgs v1');
  executable(
    path.join(bin, 'rotato'),
    `
const fs=require('fs'); const args=process.argv.slice(2);
if(args[0]==='--help') console.log('inspect render fake-v1');
else if(args[0]==='inspect') console.log(JSON.stringify({devices:[{index:0}],overlays:[{id:'headline'}]}));
else if(args[0]==='render'){const i=args.indexOf('--output'); if(i>=0)fs.writeFileSync(args[i+1],'video'); console.log(JSON.stringify({ok:true}));}
`,
  );
  executable(
    path.join(bin, 'higgs'),
    `
const fs=require('fs'); const args=process.argv.slice(2);
if(args[0]==='--help') console.log(fs.readFileSync(${JSON.stringify(helpFile)},'utf8'));
else if(args.includes('cost')) console.log(JSON.stringify({credits:args.includes('fake-two')?2:3}));
else {const i=args.indexOf('--output'); if(i>=0)fs.writeFileSync(args[i+1],'generated'); if(process.env.HIGGS_CALLS)fs.appendFileSync(process.env.HIGGS_CALLS,args.join(' ')+'\\n'); console.log(JSON.stringify({id:'fake-job',status:'complete'}));}
`,
  );
  executable(
    path.join(bin, 'ffprobe'),
    `console.log(JSON.stringify({streams:[{codec_type:'video',codec_name:'h264',width:1080,height:1920},{codec_type:'audio',codec_name:'aac'}],format:{duration:'5'}}));`,
  );
  executable(path.join(bin, 'ffmpeg'), ``);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    CCA_CAMPAIGNS_ROOT: campaigns,
    CCA_STATE_ROOT: state,
    CCA_DISABLE_OLLAMA: '1',
    CCA_HIGGSFIELD_BIN: path.join(bin, 'higgs'),
    HIGGS_CALLS: path.join(directory, 'higgs-calls.txt'),
  };
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return {directory, bin, campaigns, env, helpFile};
};

test('marketing tools are catalog-driven for CLI and desktop consumers', async () => {
  const catalog = await serializeCatalog({root});
  assert.deepEqual(
    catalog
      .map((adapter) => adapter.id)
      .filter((id) => ['capture', 'higgsfield', 'marketing', 'rotato'].includes(id)),
    ['capture', 'higgsfield', 'marketing', 'rotato'],
  );
  assert.deepEqual(
    catalog.find((adapter) => adapter.id === 'marketing').actions.map((action) => action.id),
    ['doctor', 'plan', 'estimate', 'approve', 'execute', 'inspect', 'qa', 'export'],
  );
});

test(
  'marketing campaign runs through the shared broker without paid submission',
  {timeout: 60_000},
  async (t) => {
    const fx = fixture(t);
    const source = path.join(fx.directory, 'source.mp4');
    fs.writeFileSync(source, 'fake-video');
    const product = path.join(fx.directory, 'product.yaml');
    fs.writeFileSync(product, yaml.dump({id: 'demo', name: 'Demo', approvedClaims: ['It works.']}));
    const campaign = path.join(fx.directory, 'campaign.yaml');
    fs.writeFileSync(
      campaign,
      yaml.dump({
        id: 'demo-campaign',
        product: './product.yaml',
        objective: 'Test the vertical.',
        variants: [
          {
            id: 'vertical',
            width: 1080,
            height: 1920,
            fps: 30,
            durationSeconds: 5,
            cta: 'Try it',
            intents: [{type: 'source', source: './source.mp4'}],
            timeline: [
              {type: 'video', startSeconds: 0, durationSeconds: 4, src: source},
              {type: 'end-card', startSeconds: 4, durationSeconds: 1, text: 'Try it'},
            ],
            captions: [{text: 'Hello', startSeconds: 0, endSeconds: 1, yPercent: 82}],
          },
        ],
      }),
    );

    parseChildJson(
      runCli(
        ['marketing', 'plan', '--campaign', campaign, '--run-id', 'demo-run', '--wait', '--json'],
        fx.env,
      ),
    );
    parseChildJson(
      runCli(['marketing', 'estimate', '--run', 'demo-run', '--wait', '--json'], fx.env),
    );
    parseChildJson(
      runCli(
        ['marketing', 'approve', '--run', 'demo-run', '--budget-credits', '0', '--json'],
        fx.env,
      ),
    );
    parseChildJson(
      runCli(
        ['marketing', 'execute', '--run', 'demo-run', '--dry-run', '--wait', '--json'],
        fx.env,
      ),
    );
    const qa = parseChildJson(
      runCli(['marketing', 'qa', '--run', 'demo-run', '--wait', '--json'], fx.env),
    );
    assert.equal(qa.technical, 'passed');
    const exported = parseChildJson(
      runCli(['marketing', 'export', '--run', 'demo-run', '--wait', '--json'], fx.env),
    );
    assert.ok(fs.existsSync(exported.path));
    const inspected = parseChildJson(
      runCli(['marketing', 'inspect', '--run', 'demo-run', '--json'], fx.env),
    );
    assert.equal(inspected.run.reviews.technical, 'passed');
    assert.equal(inspected.run.reviews.publication, 'blocked');
    assert.ok(inspected.run.jobIds.length >= 5);
    assert.equal(fs.existsSync(fx.env.HIGGS_CALLS), false);
    assert.deepEqual(fs.readdirSync(path.join(fx.campaigns, 'demo-run', 'artifacts')).sort(), [
      'final',
      'generated',
      'mockups',
      'previews',
      'source',
    ]);
  },
);

test(
  'live generation is budget-gated and idempotent across resumed execution',
  {timeout: 120_000},
  (t) => {
    const fx = fixture(t);
    const generated = path.join(fx.directory, 'generated.mp4');
    const generatedTwo = path.join(fx.directory, 'generated-two.mp4');
    const sharedIntent = {
      type: 'generation',
      provider: 'higgsfield',
      model: 'fake',
      estimateCredits: 3,
      estimateArgv: ['generate', 'cost', 'fake'],
      argv: ['generate', 'create', '--output', generated],
      output: generated,
    };
    const product = path.join(fx.directory, 'product.yaml');
    fs.writeFileSync(product, yaml.dump({id: 'demo', name: 'Demo'}));
    const campaign = path.join(fx.directory, 'campaign.yaml');
    fs.writeFileSync(
      campaign,
      yaml.dump({
        id: 'paid',
        product: './product.yaml',
        objective: 'Test paid resume.',
        variants: [
          {
            id: 'v',
            durationSeconds: 5,
            cta: 'Go',
            intents: [sharedIntent],
            timeline: [{type: 'end-card', startSeconds: 4, durationSeconds: 1, text: 'Go'}],
          },
          {
            id: 'v2',
            durationSeconds: 5,
            cta: 'Go',
            intents: [
              sharedIntent,
              {
                type: 'generation',
                provider: 'higgsfield',
                model: 'fake-two',
                estimateCredits: 2,
                estimateArgv: ['generate', 'cost', 'fake-two'],
                argv: ['generate', 'create', '--output', generatedTwo],
                output: generatedTwo,
              },
            ],
            timeline: [{type: 'end-card', startSeconds: 4, durationSeconds: 1, text: 'Go'}],
          },
        ],
      }),
    );
    parseChildJson(
      runCli(
        ['marketing', 'plan', '--campaign', campaign, '--run-id', 'paid-run', '--wait', '--json'],
        fx.env,
      ),
    );
    parseChildJson(
      runCli(['marketing', 'estimate', '--run', 'paid-run', '--wait', '--json'], fx.env),
    );
    parseChildJson(
      runCli(
        ['marketing', 'approve', '--run', 'paid-run', '--budget-credits', '5', '--json'],
        fx.env,
      ),
    );
    for (let attempt = 0; attempt < 2; attempt += 1)
      parseChildJson(
        runCli(
          ['marketing', 'execute', '--run', 'paid-run', '--live-execution', '--wait', '--json'],
          fx.env,
        ),
      );
    assert.equal(fs.readFileSync(fx.env.HIGGS_CALLS, 'utf8').trim().split('\n').length, 2);
    const runRecord = JSON.parse(
      fs.readFileSync(path.join(fx.campaigns, 'paid-run', 'run.json'), 'utf8'),
    );
    assert.equal(Object.keys(runRecord.providerJobs).length, 2);
    const assets = JSON.parse(
      fs.readFileSync(path.join(fx.campaigns, 'paid-run', 'assets', 'index.json'), 'utf8'),
    );
    assert.equal(assets.length, 3);
    assert.equal(assets[0].provenance.adapter, 'higgsfield');
  },
);

test(
  'campaign approval is invalidated by plan or capability drift',
  {timeout: 60_000},
  async (t) => {
    const fx = fixture(t);
    const product = path.join(fx.directory, 'product.yaml');
    fs.writeFileSync(product, yaml.dump({id: 'demo', name: 'Demo'}));
    const campaign = path.join(fx.directory, 'campaign.yaml');
    fs.writeFileSync(
      campaign,
      yaml.dump({
        id: 'drift',
        product: './product.yaml',
        objective: 'Drift test',
        variants: [
          {
            id: 'v',
            durationSeconds: 5,
            cta: 'Go',
            timeline: [{type: 'end-card', startSeconds: 4, durationSeconds: 1, text: 'Go'}],
          },
        ],
      }),
    );
    parseChildJson(
      runCli(
        ['marketing', 'plan', '--campaign', campaign, '--run-id', 'drift-run', '--wait', '--json'],
        fx.env,
      ),
    );
    parseChildJson(
      runCli(['marketing', 'estimate', '--run', 'drift-run', '--wait', '--json'], fx.env),
    );
    parseChildJson(
      runCli(
        ['marketing', 'approve', '--run', 'drift-run', '--budget-credits', '0', '--json'],
        fx.env,
      ),
    );
    const planPath = path.join(fx.campaigns, 'drift-run', 'plan.json');
    const originalPlan = fs.readFileSync(planPath, 'utf8');
    const changedPlan = JSON.parse(originalPlan);
    changedPlan.variants[0].cta = 'Changed';
    fs.writeFileSync(planPath, JSON.stringify(changedPlan));
    const planDrift = runCli(
      ['marketing', 'execute', '--run', 'drift-run', '--wait', '--json'],
      fx.env,
    );
    assert.equal(JSON.parse(planDrift.stdout).ok, false);
    assert.match(planDrift.stdout, /PLAN_HASH_MISMATCH/);
    fs.writeFileSync(planPath, originalPlan);
    fs.writeFileSync(fx.helpFile, 'fake higgs v2');
    const drift = runCli(
      ['marketing', 'execute', '--run', 'drift-run', '--wait', '--json'],
      fx.env,
    );
    assert.equal(JSON.parse(drift.stdout).ok, false);
    assert.match(drift.stdout, /CAPABILITY_FINGERPRINT_CHANGED/);
  },
);

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
