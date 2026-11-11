import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as yaml from 'js-yaml';

import {serializeCatalog} from '../scripts/platform/catalog.mjs';

import {root, runCli, parseChildJson, fixture} from './helpers/marketing-fixture.mjs';

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
    ['doctor', 'plan', 'estimate', 'approve', 'execute', 'inspect', 'qa', 'review', 'export'],
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

test('marketing plans bind the Higgsfield production contract before approval', (t) => {
  const fx = fixture(t);
  const product = path.join(fx.directory, 'product.yaml');
  const campaign = path.join(fx.directory, 'campaign.yaml');
  fs.writeFileSync(product, yaml.dump({id: 'demo', name: 'Demo'}));
  fs.writeFileSync(
    campaign,
    yaml.dump({
      id: 'generated-footage',
      product: './product.yaml',
      objective: 'Generate one editable walking shot.',
      variants: [
        {
          id: 'walking',
          durationSeconds: 4,
          cta: 'Go',
          intents: [
            {
              type: 'generation',
              provider: 'higgsfield',
              prompt: 'A fit woman walks past the camera on a park path.',
              production: {subjectLock: 'Same approved avatar and black athleisure.'},
              argv: [
                'generate',
                'create',
                '--prompt',
                'A fit woman walks past the camera on a park path.',
                '--aspect_ratio',
                '9:16',
              ],
            },
          ],
          timeline: [{type: 'end-card', startSeconds: 3, durationSeconds: 1, text: 'Go'}],
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
        'generated-run',
        '--wait',
        '--json',
      ],
      fx.env,
    ),
  );
  const plan = JSON.parse(
    fs.readFileSync(path.join(fx.campaigns, 'generated-run', 'plan.json'), 'utf8'),
  );
  const intent = plan.variants[0].intents[0];
  assert.match(intent.prompt, /^CLIPCAPTION HIGGSFIELD SHOT v1/);
  assert.match(intent.argv[intent.argv.indexOf('--prompt') + 1], /GLOBAL LOCK/);
  assert.match(intent.argv[intent.argv.indexOf('--prompt') + 1], /9:16/);
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
