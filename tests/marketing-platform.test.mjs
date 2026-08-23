import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as yaml from 'js-yaml';

import {hashValue, serializeCatalog} from '../scripts/platform/catalog.mjs';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'bin', 'clipcaptionai.js');
const executable = (file, source) => {
  fs.writeFileSync(file, `#!/usr/bin/env bun\n${source}`);
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

const startPexels = async (t, directory) => {
  const server = path.join(directory, 'pexels-server.cjs');
  const portFile = path.join(directory, 'pexels-port.txt');
  const requestFile = path.join(directory, 'pexels-request.txt');
  fs.writeFileSync(
    server,
    `const fs=require('fs'); const http=require('http');
const server=http.createServer((req,res)=>{
  fs.appendFileSync(${JSON.stringify(requestFile)},req.url+String.fromCharCode(10));
  if(req.url.startsWith('/v1/search')){
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({photos:[{id:42,width:2400,height:3600,alt:'Morning walk',photographer:'A Photographer',photographer_url:'https://www.pexels.com/@photo',url:'https://www.pexels.com/photo/42',src:{original:'http://127.0.0.1:'+server.address().port+'/image.jpg'}}]}));
  } else if(req.url==='/image.jpg'){
    res.setHeader('content-type','image/jpeg'); res.end('high-quality-image');
  } else {res.statusCode=404; res.end();}
});
server.listen(0,'127.0.0.1',()=>fs.writeFileSync(${JSON.stringify(portFile)},String(server.address().port)));`,
  );
  const child = spawn(process.execPath, [server], {stdio: 'ignore'});
  t.after(() => child.kill());
  for (let attempt = 0; attempt < 100 && !fs.existsSync(portFile); attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(fs.existsSync(portFile), 'fake Pexels server should start');
  return {
    baseUrl: `http://127.0.0.1:${fs.readFileSync(portFile, 'utf8')}/v1`,
    requestFile,
  };
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
else if(args[0]==='render'){if(args.includes('--json')){console.error('--json is only valid for inspect');process.exit(2);} const i=args.indexOf('--output'); if(i>=0)fs.writeFileSync(args[i+1],'video'); console.log(JSON.stringify({ok:true}));}
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
    path.join(bin, 'bunx'),
    `
const fs=require('fs'); const args=process.argv.slice(2);
if(args[0]==='remotion'&&(args[1]==='render'||args[1]==='still')){
  const propsArg=args.find((arg)=>arg.startsWith('--props='));
  const props=propsArg?JSON.parse(fs.readFileSync(propsArg.slice(8),'utf8')):{};
  fs.writeFileSync(args[4],args[1]==='still'?'final-image:'+props.timeline?.[1]?.headline:props.voice?'voice-track':'final-video');
  console.log('Rendered '+args[4]);
} else process.exit(2);
`,
  );
  executable(
    path.join(bin, 'ffprobe'),
    `console.log(JSON.stringify({streams:[{codec_type:'video',codec_name:'h264',width:1080,height:1920},{codec_type:'audio',codec_name:'aac'}],format:{duration:'5'}}));`,
  );
  executable(
    path.join(bin, 'ffmpeg'),
    `
const fs=require('fs'); const args=process.argv.slice(2); const output=args.at(-1);
if(output&&output!=='-'&&args.some((arg)=>arg.startsWith('loudnorm='))){
  const input=args[args.indexOf('-i')+1]; const rendered=fs.readFileSync(input,'utf8');
  fs.writeFileSync(output,rendered==='voice-track'?rendered:'normalized-video');
}
`,
  );
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
      .filter((id) => ['capture', 'higgsfield', 'marketing', 'rotato', 'stock'].includes(id)),
    ['capture', 'higgsfield', 'marketing', 'rotato', 'stock'],
  );
  assert.deepEqual(
    catalog.find((adapter) => adapter.id === 'marketing').actions.map((action) => action.id),
    ['doctor', 'plan', 'estimate', 'approve', 'execute', 'inspect', 'qa', 'export'],
  );
  assert.deepEqual(
    catalog.find((adapter) => adapter.id === 'stock').actions.map((action) => action.id),
    ['doctor', 'search', 'download'],
  );
});

test('marketing plans preserve YAML merge keys', (t) => {
  const fx = fixture(t);
  const product = path.join(fx.directory, 'product.yaml');
  const campaign = path.join(fx.directory, 'campaign.yaml');
  fs.writeFileSync(product, yaml.dump({id: 'demo', name: 'Demo'}));
  fs.writeFileSync(
    campaign,
    `id: anchored\nproduct: ./product.yaml\nobjective: Verify reusable campaign defaults.\ndefaults: &defaults\n  width: 1080\n  height: 1920\n  durationSeconds: 5\n  cta: Go\nvariants:\n  - <<: *defaults\n    id: merged\n    timeline:\n      - type: end-card\n        startSeconds: 4\n        durationSeconds: 1\n        text: Go\n`,
  );
  parseChildJson(
    runCli(
      ['marketing', 'plan', '--campaign', campaign, '--run-id', 'anchored-run', '--wait', '--json'],
      fx.env,
    ),
  );
  const plan = JSON.parse(
    fs.readFileSync(path.join(fx.campaigns, 'anchored-run', 'plan.json'), 'utf8'),
  );
  assert.equal(plan.variants[0].width, 1080);
  assert.equal(plan.variants[0].cta, 'Go');
});

test('stock adapter downloads portrait originals with reusable license provenance', async (t) => {
  const fx = fixture(t);
  const pexels = await startPexels(t, fx.directory);
  const output = path.join(fx.directory, 'stock');
  const result = parseChildJson(
    runCli(
      [
        'stock',
        'download',
        '--query',
        'morning sunlight walk',
        '--count',
        '1',
        '--out',
        output,
        '--wait',
        '--json',
      ],
      {
        ...fx.env,
        PEXELS_API_KEY: 'test-key',
        CCA_PEXELS_API_BASE_URL: pexels.baseUrl,
      },
    ),
  );
  const manifest = JSON.parse(fs.readFileSync(result.manifest, 'utf8'));
  assert.equal(manifest.provider, 'pexels');
  assert.equal(manifest.providerUrl, 'https://www.pexels.com/');
  assert.equal(manifest.files.length, 1);
  assert.equal(manifest.files[0].creator, 'A Photographer');
  assert.equal(manifest.files[0].sourceUrl, 'https://www.pexels.com/photo/42');
  assert.equal(manifest.files[0].licenseUrl, 'https://www.pexels.com/license/');
  assert.ok(fs.existsSync(manifest.files[0].path));
  assert.match(fs.readFileSync(pexels.requestFile, 'utf8'), /orientation=portrait/);
  assert.match(fs.readFileSync(pexels.requestFile, 'utf8'), /size=large/);
});

test(
  'marketing plan expands a licensed slideshow through the campaign interface',
  {timeout: 60_000},
  (t) => {
    const fx = fixture(t);
    const product = path.join(fx.directory, 'product.yaml');
    const first = path.join(fx.directory, 'morning.jpg');
    const second = path.join(fx.directory, 'sunlight.jpg');
    fs.writeFileSync(product, yaml.dump({id: 'demo', name: 'Demo'}));
    fs.writeFileSync(first, 'first-image');
    fs.writeFileSync(second, 'second-image');
    const campaign = path.join(fx.directory, 'campaign.yaml');
    fs.writeFileSync(
      campaign,
      yaml.dump({
        id: 'health-slides',
        product: './product.yaml',
        objective: 'Teach first and promote transparently.',
        variants: [
          {
            id: 'weekly-health',
            cta: 'Try PrepAI',
            endCardDurationSeconds: 1.5,
            slides: [
              {
                src: './morning.jpg',
                eyebrow: 'SAVE THIS',
                headline: '5 ways to improve your health this week',
                body: 'Start with one change, not all five.',
                durationSeconds: 2,
                motion: 'push-in',
                sourceType: 'stock',
                attribution: {
                  provider: 'pexels',
                  creator: 'A Photographer',
                  sourceUrl: 'https://www.pexels.com/photo/1',
                  licenseUrl: 'https://www.pexels.com/license/',
                },
              },
              {
                src: './sunlight.jpg',
                headline: 'Get morning sunlight',
                body: 'A short outdoor walk is an easy place to begin.',
                durationSeconds: 2,
                motion: 'pan-right',
              },
            ],
          },
        ],
      }),
    );

    parseChildJson(
      runCli(
        ['marketing', 'plan', '--campaign', campaign, '--run-id', 'slides-run', '--wait', '--json'],
        fx.env,
      ),
    );
    const plan = JSON.parse(
      fs.readFileSync(path.join(fx.campaigns, 'slides-run', 'plan.json'), 'utf8'),
    );
    const variant = plan.variants[0];
    assert.equal(variant.durationSeconds, 5.5);
    assert.deepEqual(
      variant.timeline.map((entry) => entry.type),
      ['image', 'slide-text', 'image', 'slide-text', 'end-card'],
    );
    assert.equal(variant.timeline[0].motion, 'push-in');
    assert.equal(variant.timeline[1].headline, '5 ways to improve your health this week');
    assert.equal(variant.timeline[2].startSeconds, 2);
    assert.equal(variant.timeline[4].startSeconds, 4);
    assert.equal(variant.intents.length, 2);
    assert.equal(variant.intents[0].provenance.provider, 'pexels');
    assert.equal(variant.intents[0].source, first);

    parseChildJson(
      runCli(['marketing', 'estimate', '--run', 'slides-run', '--wait', '--json'], fx.env),
    );
    parseChildJson(
      runCli(
        ['marketing', 'approve', '--run', 'slides-run', '--budget-credits', '0', '--json'],
        fx.env,
      ),
    );
    parseChildJson(
      runCli(['marketing', 'execute', '--run', 'slides-run', '--wait', '--json'], fx.env),
    );
    const assets = JSON.parse(
      fs.readFileSync(path.join(fx.campaigns, 'slides-run', 'assets', 'index.json'), 'utf8'),
    );
    const stockAsset = assets.find((asset) => asset.path.endsWith('.jpg'));
    assert.equal(stockAsset.provenance.provider, 'pexels');
    assert.equal(stockAsset.provenance.creator, 'A Photographer');
    const qa = parseChildJson(
      runCli(['marketing', 'qa', '--run', 'slides-run', '--wait', '--json'], fx.env),
    );
    assert.equal(
      qa.reports[0].technical.checks.find((check) => check.name === 'stock-provenance').passed,
      true,
    );
  },
);

test('marketing carousel renders one finished image per slide', {timeout: 60_000}, (t) => {
  const fx = fixture(t);
  const product = path.join(fx.directory, 'product.yaml');
  const images = Array.from({length: 6}, (_, index) =>
    path.join(fx.directory, `slide-${index + 1}.jpg`),
  );
  fs.writeFileSync(product, yaml.dump({id: 'demo', name: 'Demo'}));
  images.forEach((image, index) => fs.writeFileSync(image, `image-${index + 1}`));
  const campaign = path.join(fx.directory, 'campaign.yaml');
  fs.writeFileSync(
    campaign,
    yaml.dump({
      id: 'health-carousel',
      product: './product.yaml',
      objective: 'Publish a real image carousel.',
      variants: [
        {
          id: 'weekly-health',
          format: 'carousel',
          cta: 'Review your day with PrepAI',
          slides: images.map((_, index) => ({
            src: `./slide-${index + 1}.jpg`,
            headline: `Useful change ${index + 1}`,
          })),
        },
      ],
    }),
  );

  parseChildJson(
    runCli(
      ['marketing', 'plan', '--campaign', campaign, '--run-id', 'carousel-run', '--wait', '--json'],
      fx.env,
    ),
  );
  const plan = JSON.parse(
    fs.readFileSync(path.join(fx.campaigns, 'carousel-run', 'plan.json'), 'utf8'),
  );
  assert.equal(plan.variants[0].format, 'carousel');
  assert.equal(plan.variants[0].slides.length, 6);
  assert.equal(plan.variants[0].timeline.length, 0);

  parseChildJson(
    runCli(['marketing', 'estimate', '--run', 'carousel-run', '--wait', '--json'], fx.env),
  );
  parseChildJson(
    runCli(
      ['marketing', 'approve', '--run', 'carousel-run', '--budget-credits', '0', '--json'],
      fx.env,
    ),
  );
  parseChildJson(
    runCli(['marketing', 'execute', '--run', 'carousel-run', '--wait', '--json'], fx.env),
  );
  const assets = JSON.parse(
    fs.readFileSync(path.join(fx.campaigns, 'carousel-run', 'assets', 'index.json'), 'utf8'),
  );
  const finals = assets.filter((asset) => asset.type === 'final');
  assert.equal(finals.length, 6);
  assert.deepEqual(
    finals.map((asset) => asset.provenance.slideIndex),
    [1, 2, 3, 4, 5, 6],
  );
  assert.ok(finals.every((asset) => asset.path.endsWith('.png')));
  assert.equal(new Set(finals.map((asset) => asset.path)).size, 6);
  assert.deepEqual(
    finals.map((asset) => fs.readFileSync(asset.path, 'utf8')),
    Array.from({length: 6}, (_, index) => `final-image:Useful change ${index + 1}`),
  );

  const qa = parseChildJson(
    runCli(['marketing', 'qa', '--run', 'carousel-run', '--wait', '--json'], fx.env),
  );
  assert.equal(qa.technical, 'passed');
  assert.equal(
    qa.reports[0].technical.checks.find((check) => check.name === 'carousel-slide-count').passed,
    true,
  );
});

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
      runCli(
        ['marketing', 'execute', '--run', 'demo-run', '--dry-run', '--wait', '--json'],
        fx.env,
      ),
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
              },
            ],
            timeline: [{type: 'end-card', startSeconds: 4, durationSeconds: 1, text: 'Go'}],
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
      true,
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
