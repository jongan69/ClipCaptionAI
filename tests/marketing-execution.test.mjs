import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as yaml from 'js-yaml';
import {runCli, parseChildJson, fixture} from './helpers/marketing-fixture.mjs';

test(
  'marketing campaign runs through the shared broker without paid submission',
  {timeout: 60_000},
  async (t) => {
    const fx = fixture(t);
    const source = path.join(fx.directory, 'source.mp4');
    const voice = path.join(fx.directory, 'voice.mp3');
    fs.writeFileSync(source, 'fake-video');
    fs.writeFileSync(voice, 'fake-voice');
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
            voice: './voice.mp3',
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
      runCli(['marketing', 'execute', '--run', 'demo-run', '--wait', '--json'], fx.env),
    );
    const executedAssets = JSON.parse(
      fs.readFileSync(path.join(fx.campaigns, 'demo-run', 'assets', 'index.json'), 'utf8'),
    );
    const finalAsset = executedAssets.find((asset) => asset.type === 'final');
    assert.ok(finalAsset, 'execute should register a final rendered video');
    assert.ok(fs.existsSync(finalAsset.path));
    assert.equal(fs.readFileSync(finalAsset.path, 'utf8'), 'voice-track');
    assert.equal(finalAsset.provenance.adapter, 'remotion');
    const assetIndex = path.join(fx.campaigns, 'demo-run', 'assets', 'index.json');
    fs.writeFileSync(
      assetIndex,
      JSON.stringify(executedAssets.filter((asset) => asset.type !== 'final')),
    );
    const missingFinalQa = parseChildJson(
      runCli(['marketing', 'qa', '--run', 'demo-run', '--wait', '--json'], fx.env),
    );
    assert.equal(missingFinalQa.technical, 'failed');
    assert.match(
      missingFinalQa.reports[0].technical.checks.find((check) => check.name === 'asset').detail,
      /final/i,
    );
    fs.writeFileSync(assetIndex, JSON.stringify(executedAssets));
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
            timeline: [
              {type: 'video', src: generated, startSeconds: 0, durationSeconds: 4},
              {type: 'end-card', startSeconds: 4, durationSeconds: 1, text: 'Go'},
            ],
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
            timeline: [
              {type: 'video', src: generated, startSeconds: 0, durationSeconds: 2},
              {type: 'video', src: generatedTwo, startSeconds: 2, durationSeconds: 2},
              {type: 'end-card', startSeconds: 4, durationSeconds: 1, text: 'Go'},
            ],
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
    assert.equal(assets.filter((asset) => asset.type === 'generated').length, 3);
    assert.equal(assets.filter((asset) => asset.type === 'final').length, 2);
    assert.equal(assets[0].provenance.adapter, 'higgsfield');
  },
);

test(
  'live generation remains awaiting assets when the provider returns no file',
  {timeout: 60_000},
  (t) => {
    const fx = fixture(t);
    const generated = path.join(fx.directory, 'pending.mp4');
    const product = path.join(fx.directory, 'product.yaml');
    fs.writeFileSync(product, yaml.dump({id: 'demo', name: 'Demo'}));
    const campaign = path.join(fx.directory, 'campaign.yaml');
    fs.writeFileSync(
      campaign,
      yaml.dump({
        id: 'pending-paid',
        product: './product.yaml',
        objective: 'Keep provider completion honest.',
        variants: [
          {
            id: 'pending',
            durationSeconds: 5,
            cta: 'Go',
            intents: [
              {
                type: 'generation',
                provider: 'higgsfield',
                model: 'fake',
                estimateArgv: ['generate', 'cost', 'fake'],
                argv: ['generate', 'create'],
                output: generated,
              },
            ],
            timeline: [
              {type: 'video', src: generated, startSeconds: 0, durationSeconds: 4},
              {type: 'end-card', startSeconds: 4, durationSeconds: 1, text: 'Go'},
            ],
          },
        ],
      }),
    );
    parseChildJson(
      runCli(
        [
          'marketing',
          'plan',
          '--campaign',
          campaign,
          '--run-id',
          'pending-run',
          '--wait',
          '--json',
        ],
        fx.env,
      ),
    );
    parseChildJson(
      runCli(['marketing', 'estimate', '--run', 'pending-run', '--wait', '--json'], fx.env),
    );
    parseChildJson(
      runCli(
        ['marketing', 'approve', '--run', 'pending-run', '--budget-credits', '3', '--json'],
        fx.env,
      ),
    );
    const result = parseChildJson(
      runCli(
        ['marketing', 'execute', '--run', 'pending-run', '--live-execution', '--wait', '--json'],
        fx.env,
      ),
    );
    assert.equal(result.status, 'awaiting-assets');
    const assets = JSON.parse(
      fs.readFileSync(path.join(fx.campaigns, 'pending-run', 'assets', 'index.json'), 'utf8'),
    );
    assert.equal(
      assets.some((asset) => asset.type === 'final'),
      false,
    );
    assert.equal(
      assets.some((asset) => asset.type === 'generated'),
      false,
    );
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
