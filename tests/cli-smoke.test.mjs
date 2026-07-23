import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);

test('clipkit top-level help renders the polished command hub', () => {
  const result = spawnSync('node', ['scripts/clipkit.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /CLI-first AI video editor and model harness/);
  assert.match(result.stdout, /broll-captions\|heavy/);
  assert.match(result.stdout, /ebay-intel/);
  assert.match(result.stdout, /split-video\|slice-video/);
  assert.match(result.stdout, /review-moments\|review/);
  assert.match(result.stdout, /rotato\|mockup/);
  assert.match(result.stdout, /video/);
  assert.match(result.stdout, /fal-reference-video/);
  assert.match(result.stdout, /voiceover\|elevenlabs/);
  assert.match(result.stdout, /rerender --clip 03-your-website-is-leaking-money --no-captions/);
});

test('video plan creates a versioned machine-readable run manifest', () => {
  const runId = `test-video-${Date.now()}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-video-'));
  const brief = path.join(tempDir, 'brief.txt');
  fs.writeFileSync(brief, 'Open with the product.\nShow the workflow.\nClose with the result.\n');
  const result = spawnSync('node', ['scripts/video.mjs', 'plan', '--brief-file', brief, '--run-id', runId, '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  try {
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    const manifest = JSON.parse(fs.readFileSync(payload.manifestPath, 'utf8'));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.kind, 'clipcaptionai.video.run');
    assert.equal(manifest.plan.shots.length, 3);
    assert.equal(manifest.status, 'planned');
  } finally {
    fs.rmSync(path.join(projectRoot, 'outputs', 'video-runs', runId), {recursive: true, force: true});
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test('video dry-run is resumable and does not require provider secrets', () => {
  const runId = `test-video-dry-${Date.now()}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-video-'));
  const brief = path.join(tempDir, 'brief.txt');
  fs.writeFileSync(brief, 'A deterministic local render plan.');
  const result = spawnSync('node', ['scripts/video.mjs', 'run', '--brief-file', brief, '--run-id', runId, '--dry-run', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  try {
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.dryRun, true);
    assert.match(payload.plannedOutput, new RegExp(`${runId}.*mp4`));
  } finally {
    fs.rmSync(path.join(projectRoot, 'outputs', 'video-runs', runId), {recursive: true, force: true});
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test('bin entry works and exposes help output', () => {
  const result = spawnSync('node', ['bin/clipcaptionai.js', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: clipcaptionai/);
  assert.match(result.stdout, /download\|dl/);
  assert.match(result.stdout, /ebay-intel/);
  assert.match(result.stdout, /review-moments\|review/);
  assert.match(result.stdout, /rotato\|mockup/);
});

test('moments review helper exposes the standalone report command', () => {
  const result = spawnSync('node', ['scripts/review-moments.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /npm run moments:review/);
  assert.match(result.stdout, /--persist/);
});

test('eBay cinematic ads exposes the batch competitive-plan command', () => {
  const result = spawnSync('node', ['scripts/ebay-cinematic-ads.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /competitive-plan/);
  assert.match(result.stdout, /shot-replica blueprints/);
  assert.match(result.stdout, /--run-control-loop/);
  assert.match(result.stdout, /--run-higgsfield-renders/);
  assert.match(result.stdout, /--higgs-render-dry-run/);
});

test('eBay traffic optimizer exposes help', () => {
  const result = spawnSync('node', ['scripts/optimize-ebay-traffic-report.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /optimize-ebay-traffic-report/);
  assert.match(result.stdout, /traffic-report/);
});

test('competitive blueprint preview renderer exposes help', () => {
  const result = spawnSync('node', ['scripts/render-competitive-blueprint-ad.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /render-competitive-blueprint-ad/);
  assert.match(result.stdout, /product-safe preview renderer/i);
});

test('competitive blueprint batch preview renderer exposes help', () => {
  const result = spawnSync('node', ['scripts/render-competitive-blueprint-batch.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /render-competitive-blueprint-batch/);
  assert.match(result.stdout, /blueprints-dir/);
  assert.match(result.stdout, /product-safe policy/i);
});

test('competitive premium render prep exposes help', () => {
  const result = spawnSync('node', ['scripts/prepare-competitive-premium-renders.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /prepare-competitive-premium-renders/);
  assert.match(result.stdout, /preview-manifest/);
  assert.match(result.stdout, /credit-aware Higgsfield render packets/i);
});

test('competitive premium finalizer exposes help', () => {
  const result = spawnSync('node', ['scripts/finalize-competitive-premium-ads.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /finalize-competitive-premium-ads/);
  assert.match(result.stdout, /premium-plan/);
  assert.match(result.stdout, /no slideshow fallback/i);
});

test('competitive premium render collector exposes help', () => {
  const result = spawnSync('node', ['scripts/collect-competitive-premium-renders.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /collect-competitive-premium-renders/);
  assert.match(result.stdout, /url-map/);
  assert.match(result.stdout, /higgsfield-renders/);
});

test('competitive video pipeline auditor exposes help', () => {
  const result = spawnSync('node', ['scripts/audit-competitive-video-pipeline.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /audit-competitive-video-pipeline/);
  assert.match(result.stdout, /premium-plan/);
  assert.match(result.stdout, /per item/i);
});

test('competitive review board generator exposes help', () => {
  const result = spawnSync('node', ['scripts/build-competitive-review-board.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /build-competitive-review-board/);
  assert.match(result.stdout, /status/);
  assert.match(result.stdout, /review board/i);
});

test('competitive video QA gate exposes help', () => {
  const result = spawnSync('node', ['scripts/qa-competitive-videos.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /qa-competitive-videos/);
  assert.match(result.stdout, /preview-manifest/);
  assert.match(result.stdout, /slideshow/i);
});

test('competitive video control loop exposes help', () => {
  const result = spawnSync('node', ['scripts/run-competitive-video-control-loop.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /run-competitive-video-control-loop/);
  assert.match(result.stdout, /blueprints-dir/);
  assert.match(result.stdout, /preview render -> technical QA/i);
});

test('competitive render handoff exporter exposes help', () => {
  const result = spawnSync('node', ['scripts/export-competitive-render-handoff.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /export-competitive-render-handoff/);
  assert.match(result.stdout, /premium-plan/);
  assert.match(result.stdout, /render queue/i);
});

test('competitive Higgsfield render runner exposes help', () => {
  const result = spawnSync('node', ['scripts/run-competitive-higgsfield-renders.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /run-competitive-higgsfield-renders/);
  assert.match(result.stdout, /credit-budget/);
  assert.match(result.stdout, /seedance_2_0_mini/);
});

test('competitive creative packet exporter exposes help', () => {
  const result = spawnSync('node', ['scripts/export-competitive-creative-packets.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /export-competitive-creative-packets/);
  assert.match(result.stdout, /creative packet/i);
});

test('competitive voiceover plan exporter exposes help', () => {
  const result = spawnSync('node', ['scripts/export-competitive-voiceover-plan.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /export-competitive-voiceover-plan/);
  assert.match(result.stdout, /voiceover/i);
});

test('local AI provider commands expose guarded help without requiring secrets', () => {
  for (const [script, expected] of [
    ['scripts/generate-elevenlabs-voiceover.mjs', /ELEVENLABS_API_KEY/],
    ['scripts/fal-image-edit.mjs', /approved-for-generated-marketing/],
    ['scripts/fal-reference-video.mjs', /disables native/i],
  ]) {
    const result = spawnSync('node', [script, '--help'], {cwd: projectRoot, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, expected);
  }
});

test('eBay main photo candidate generator exposes help', () => {
  const result = spawnSync('node', ['scripts/generate-ebay-main-photo-candidates.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /generate-ebay-main-photo-candidates/);
  assert.match(result.stdout, /main-photo candidates/i);
});

test('eBay main photo apply bundle exporter exposes help', () => {
  const result = spawnSync('node', ['scripts/export-ebay-main-photo-apply-bundle.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /export-ebay-main-photo-apply-bundle/);
  assert.match(result.stdout, /no-price-change/i);
});

test('competitive research rerun helper exposes help', () => {
  const result = spawnSync('node', ['scripts/rerun-competitive-research-packet.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /rerun-competitive-research-packet/);
  assert.match(result.stdout, /packet-dir/);
  assert.match(result.stdout, /competitor-import-template/);
});

test('competitive research queue exporter exposes help', () => {
  const result = spawnSync('node', ['scripts/export-competitive-research-queue.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /export-competitive-research-queue/);
  assert.match(result.stdout, /packets-manifest/);
  assert.match(result.stdout, /Automatio\/Kalodata research queue/);
});

test('competitive research queue processor exposes help', () => {
  const result = spawnSync('node', ['scripts/process-competitive-research-queue.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /process-competitive-research-queue/);
  assert.match(result.stdout, /queue/);
  assert.match(result.stdout, /filled competitor import templates/);
});

test('competitive research results importer exposes help', () => {
  const result = spawnSync('node', ['scripts/import-competitive-research-results.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /import-competitive-research-results/);
  assert.match(result.stdout, /Automatio\/Kalodata/);
  assert.match(result.stdout, /competitor-import-template/);
});

test('competitive research import loop exposes help', () => {
  const result = spawnSync('node', ['scripts/run-competitive-research-import-loop.mjs', '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /run-competitive-research-import-loop/);
  assert.match(result.stdout, /Automatio\/Kalodata/);
  assert.match(result.stdout, /run-reruns/);
});

test('competitive blueprint batch preview renderer writes a dry-run manifest', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-preview-batch-'));
  const blueprintsDir = path.join(tempRoot, 'competitive-creative');
  const firstDir = path.join(blueprintsDir, '398174220620');
  const secondDir = path.join(blueprintsDir, '398174269080');
  fs.mkdirSync(firstDir, {recursive: true});
  fs.mkdirSync(secondDir, {recursive: true});
  fs.writeFileSync(path.join(firstDir, 'creative-blueprint.json'), JSON.stringify({
    listing: {item_id: '398174220620', title: 'Playing Card Rug'},
    selected_reference: {title: 'Matched rug video', platform: 'kalodata', url: 'https://example.com/rug-video', fit_score: 80, metrics: {trend_score: 25}},
    beats: [{beat: 'hook', time_seconds: {start: 0, end: 2}, caption_intent: 'one-line pattern interrupt'}],
  }, null, 2));
  fs.writeFileSync(path.join(secondDir, 'creative-blueprint.json'), JSON.stringify({
    listing: {item_id: '398174269080', title: 'Car Jack Stands'},
    selected_reference: {title: 'Matched jack stand video'},
    beats: [{beat: 'hook', time_seconds: {start: 0, end: 2}, caption_intent: 'one-line pattern interrupt'}],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/render-competitive-blueprint-batch.mjs',
    '--blueprints-dir',
    blueprintsDir,
    '--dry-run',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Blueprints discovered: 2/);
  const manifestPath = path.join(blueprintsDir, 'competitive-preview-render-manifest.json');
  assert.ok(fs.existsSync(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.dry_run, true);
  assert.equal(manifest.discovered_count, 2);
  assert.equal(manifest.skipped_count, 2);
  assert.equal(manifest.failed_count, 0);
  assert.deepEqual(manifest.renders.map((entry) => entry.item_id), ['398174220620', '398174269080']);
});

test('competitive premium render prep writes credit-aware Higgsfield packets', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-premium-plan-'));
  const projectDir = path.join(tempRoot, 'projects', '398174220620');
  const creativeDir = path.join(tempRoot, 'competitive-creative', '398174220620');
  const finalDir = path.join(projectDir, 'final');
  fs.mkdirSync(projectDir, {recursive: true});
  fs.mkdirSync(creativeDir, {recursive: true});
  fs.mkdirSync(finalDir, {recursive: true});
  fs.writeFileSync(path.join(projectDir, '01.jpg'), 'fake image placeholder');
  fs.writeFileSync(path.join(projectDir, '02.jpg'), 'fake image placeholder');
  fs.writeFileSync(path.join(projectDir, 'listing.json'), JSON.stringify({
    item_id: '398174220620',
    title: 'Playing Card Rug',
    url: 'https://www.ebay.com/itm/398174220620',
    images: [
      {index: 1, filename: '01.jpg', path: path.join(projectDir, '01.jpg')},
      {index: 2, filename: '02.jpg', path: path.join(projectDir, '02.jpg')},
    ],
  }, null, 2));
  const blueprintPath = path.join(creativeDir, 'creative-blueprint.json');
  fs.writeFileSync(blueprintPath, JSON.stringify({
    listing: {item_id: '398174220620', title: 'Playing Card Rug'},
    selected_reference: {title: 'Matched rug video', platform: 'kalodata', url: 'https://example.com/rug-video', fit_score: 80, metrics: {trend_score: 25}},
    higgsfield_prompts: [
      {id: 'competitive-01-hero', purpose: 'Hero reveal', prompt: 'Hero prompt', duration_seconds: 5, references: ['best actual listing photo']},
      {id: 'competitive-02-proof', purpose: 'Proof detail', prompt: 'Proof prompt', duration_seconds: 5, references: ['detail listing photos']},
    ],
  }, null, 2));
  fs.writeFileSync(path.join(creativeDir, 'higgsfield-competitive-render-jobs.json'), JSON.stringify({
    jobs: [
      {id: 'competitive-01-hero', purpose: 'Hero reveal', prompt: 'Hero prompt', duration_seconds: 5, references: ['best actual listing photo']},
      {id: 'competitive-02-proof', purpose: 'Proof detail', prompt: 'Proof prompt', duration_seconds: 5, references: ['detail listing photos']},
    ],
  }, null, 2));
  const renderManifestPath = path.join(finalDir, '398174220620-competitive-preview-manifest.json');
  fs.writeFileSync(renderManifestPath, JSON.stringify({
    item_id: '398174220620',
    title: 'Playing Card Rug',
    project_dir: projectDir,
    final_video: path.join(finalDir, 'preview.mp4'),
    proof_frame: path.join(finalDir, 'proof.jpg'),
    selected_reference: {title: 'Matched rug video', platform: 'kalodata', url: 'https://example.com/rug-video', fit_score: 80, metrics: {trend_score: 25}},
  }, null, 2));
  const previewManifest = path.join(tempRoot, 'competitive-preview-render-manifest.json');
  fs.writeFileSync(previewManifest, JSON.stringify({
    renders: [{
      blueprint: blueprintPath,
      item_id: '398174220620',
      title: 'Playing Card Rug',
      ok: true,
      final_video: path.join(finalDir, 'preview.mp4'),
      proof_frame: path.join(finalDir, 'proof.jpg'),
      manifest: renderManifestPath,
      selected_reference: {title: 'Matched rug video', platform: 'kalodata', url: 'https://example.com/rug-video', fit_score: 80, metrics: {trend_score: 25}},
    }],
  }, null, 2));
  const roiPlan = path.join(tempRoot, 'higgsfield-roi-plan.json');
  fs.writeFileSync(roiPlan, JSON.stringify({
    selected: [{item_id: '398174220620', roi_score: 100, price: 49.99}],
    ranked: [{item_id: '398174220620', roi_score: 100, price: 49.99}],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/prepare-competitive-premium-renders.mjs',
    '--preview-manifest',
    previewManifest,
    '--roi-plan',
    roiPlan,
    '--credit-budget',
    '22.5',
    '--max-jobs-per-listing',
    '1',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Selected listings: 1/);
  const planPath = path.join(tempRoot, 'competitive-premium-render-plan', 'competitive-premium-render-plan.json');
  assert.ok(fs.existsSync(planPath));
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  assert.equal(plan.selected_count, 1);
  assert.equal(plan.estimated_selected_credits, 22.5);
  assert.equal(plan.selected[0].jobs.length, 1);
  assert.deepEqual(plan.selected[0].jobs[0].reference_images, [path.join(projectDir, '01.jpg')]);
  assert.ok(fs.existsSync(path.join(projectDir, 'higgsfield', 'competitive-premium-render-jobs.json')));
  assert.ok(fs.existsSync(path.join(projectDir, 'higgsfield', 'render-competitive-premium-shots.sh')));
  assert.ok(fs.existsSync(path.join(projectDir, 'higgsfield', 'competitive-premium-qa.md')));
});

test('competitive premium render prep converts blueprint beats into product-safe render jobs', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-premium-beat-jobs-'));
  const projectDir = path.join(tempRoot, 'projects', '398176513526');
  const creativeDir = path.join(tempRoot, 'competitive-creative', '398176513526');
  const finalDir = path.join(projectDir, 'final');
  fs.mkdirSync(projectDir, {recursive: true});
  fs.mkdirSync(creativeDir, {recursive: true});
  fs.mkdirSync(finalDir, {recursive: true});
  fs.writeFileSync(path.join(projectDir, '01.jpg'), 'fake image placeholder');
  fs.writeFileSync(path.join(projectDir, '02.jpg'), 'fake detail image placeholder');
  fs.writeFileSync(path.join(projectDir, 'listing.json'), JSON.stringify({
    item_id: '398176513526',
    title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
    url: 'https://www.ebay.com/itm/398176513526',
    images: [
      {index: 1, filename: '01.jpg', path: path.join(projectDir, '01.jpg')},
      {index: 2, filename: '02.jpg', path: path.join(projectDir, '02.jpg')},
    ],
  }, null, 2));

  const selectedReference = {
    title: 'Cat cabinet viral organizer video',
    platform: 'kalodata',
    url: 'https://example.com/cat-cabinet-video',
    fit_score: 88,
    metrics: {trend_score: 44},
  };
  const blueprintPath = path.join(creativeDir, 'creative-blueprint.json');
  fs.writeFileSync(blueprintPath, JSON.stringify({
    listing: {item_id: '398176513526', title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black'},
    selected_reference: selectedReference,
    beats: [
      {
        beat: 'hook',
        competitor_pattern: 'mess reveal',
        original_execution: 'Translate the messy room opener into a clean reveal of our actual cabinet.',
        source_assets: ['image_1'],
        caption_intent: 'hide the litter mess',
        sfx: ['impact hit'],
        imported_structure_note: 'mess reveal',
        imported_audio_note: 'quiet lofi beat with whoosh cuts',
        time_seconds: {start: 0, end: 4},
      },
      {
        beat: 'proof detail',
        competitor_pattern: 'rattan door closeup',
        original_execution: 'Show the actual rattan doors and cabinet finish without inventing accessories.',
        source_assets: ['image_2', 'image_3'],
        caption_intent: 'real cabinet detail',
        sfx: ['macro tick'],
        imported_structure_note: 'rattan door closeup',
        imported_audio_note: 'quiet lofi beat with whoosh cuts',
        time_seconds: {start: 4, end: 8},
      },
      {
        beat: 'use-case b-roll',
        competitor_pattern: 'room styling bridge',
        original_execution: 'Use cleared room context without implying included props.',
        source_assets: ['cleared_story_broll'],
        caption_intent: 'cleaner room',
        sfx: ['whoosh'],
        imported_structure_note: 'room styling bridge',
        imported_audio_note: 'quiet lofi beat with whoosh cuts',
        time_seconds: {start: 8, end: 12},
      },
      {
        beat: 'offer close',
        competitor_pattern: 'CTA and final cabinet shot',
        original_execution: 'Return to the actual product and point buyers to eBay details.',
        source_assets: ['image_1'],
        caption_intent: 'check the eBay listing',
        sfx: ['soft hit'],
        imported_structure_note: 'CTA and final cabinet shot',
        imported_audio_note: 'quiet lofi beat with whoosh cuts',
        time_seconds: {start: 12, end: 16},
      },
    ],
    higgsfield_prompts: [
      {id: 'competitive-01-hero', purpose: 'Generic hero', prompt: 'Old generic hero prompt', duration_seconds: 5},
    ],
  }, null, 2));
  fs.writeFileSync(path.join(creativeDir, 'higgsfield-competitive-render-jobs.json'), JSON.stringify({
    jobs: [{id: 'competitive-01-hero', purpose: 'Generic hero', prompt: 'Old generic hero prompt', duration_seconds: 5}],
  }, null, 2));
  const renderManifestPath = path.join(finalDir, '398176513526-competitive-preview-manifest.json');
  fs.writeFileSync(renderManifestPath, JSON.stringify({
    item_id: '398176513526',
    title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
    project_dir: projectDir,
    final_video: path.join(finalDir, 'preview.mp4'),
    proof_frame: path.join(finalDir, 'proof.jpg'),
    selected_reference: selectedReference,
  }, null, 2));
  const previewManifest = path.join(tempRoot, 'competitive-preview-render-manifest.json');
  fs.writeFileSync(previewManifest, JSON.stringify({
    renders: [{
      blueprint: blueprintPath,
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
      ok: true,
      final_video: path.join(finalDir, 'preview.mp4'),
      proof_frame: path.join(finalDir, 'proof.jpg'),
      manifest: renderManifestPath,
      selected_reference: selectedReference,
    }],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/prepare-competitive-premium-renders.mjs',
    '--preview-manifest',
    previewManifest,
    '--credit-budget',
    '45',
    '--max-jobs-per-listing',
    '2',
    '--higgs-model',
    'seedance_2_0_mini',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const planPath = path.join(tempRoot, 'competitive-premium-render-plan', 'competitive-premium-render-plan.json');
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  assert.equal(plan.selected_count, 1);
  assert.equal(plan.selected[0].jobs.length, 2);
  assert.equal(plan.selected[0].jobs[0].id, 'competitive-01-hook');
  assert.equal(plan.selected[0].jobs[0].model, 'seedance_2_0_mini');
  assert.equal(plan.selected[0].jobs[0].resolution, '720p');
  assert.equal(plan.selected[0].jobs[0].mode, 'std');
  assert.equal(plan.selected[0].jobs[0].aspect_ratio, '9:16');
  assert.equal(plan.selected[0].jobs[0].beat.competitor_pattern, 'mess reveal');
  assert.match(plan.selected[0].jobs[0].prompt, /quiet lofi beat with whoosh cuts/);
  assert.match(plan.selected[0].jobs[0].prompt, /Do not copy competitor footage/);
  assert.equal(plan.selected[0].jobs[1].id, 'competitive-02-proof-detail');
  assert.equal(plan.selected[0].jobs[1].beat.competitor_pattern, 'rattan door closeup');
  assert.deepEqual(plan.selected[0].jobs[1].reference_images, [path.join(projectDir, '02.jpg')]);

  const packet = JSON.parse(fs.readFileSync(path.join(projectDir, 'higgsfield', 'competitive-premium-render-jobs.json'), 'utf8'));
  assert.equal(packet.source_blueprint_beats, blueprintPath);
  assert.equal(packet.jobs[0].beat.imported_audio_note, 'quiet lofi beat with whoosh cuts');
  assert.doesNotMatch(packet.jobs[0].prompt, /Old generic hero prompt/);
  const renderScript = fs.readFileSync(path.join(projectDir, 'higgsfield', 'render-competitive-premium-shots.sh'), 'utf8');
  assert.match(renderScript, /seedance_2_0_mini/);
  assert.match(renderScript, /--aspect_ratio '9:16'/);
  assert.match(renderScript, /--resolution '720p'/);
  assert.doesNotMatch(renderScript, /--mode 'std'/);
});

test('competitive premium render prep holds weak fallback references for research review', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-premium-weak-research-'));
  const projectDir = path.join(tempRoot, 'projects', '398176513526');
  const creativeDir = path.join(tempRoot, 'competitive-creative', '398176513526');
  const finalDir = path.join(projectDir, 'final');
  fs.mkdirSync(projectDir, {recursive: true});
  fs.mkdirSync(creativeDir, {recursive: true});
  fs.mkdirSync(finalDir, {recursive: true});
  fs.writeFileSync(path.join(projectDir, '01.jpg'), 'fake image placeholder');
  fs.writeFileSync(path.join(projectDir, 'listing.json'), JSON.stringify({
    item_id: '398176513526',
    title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
    images: [{index: 1, filename: '01.jpg', path: path.join(projectDir, '01.jpg')}],
  }, null, 2));
  const blueprintPath = path.join(creativeDir, 'creative-blueprint.json');
  fs.writeFileSync(blueprintPath, JSON.stringify({
    listing: {item_id: '398176513526', title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black'},
    selected_reference: {id: 'fallback-template-cat-cabinet', platform: 'fallback-template', title: 'Fallback direct product ad', fit_score: 0, metrics: {trend_score: 0}},
    higgsfield_prompts: [{id: 'competitive-01-hero', purpose: 'Hero reveal', prompt: 'Hero prompt', duration_seconds: 5}],
  }, null, 2));
  const renderManifestPath = path.join(finalDir, '398176513526-competitive-preview-manifest.json');
  fs.writeFileSync(renderManifestPath, JSON.stringify({
    item_id: '398176513526',
    title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
    project_dir: projectDir,
    final_video: path.join(finalDir, 'preview.mp4'),
    proof_frame: path.join(finalDir, 'proof.jpg'),
    selected_reference: {id: 'fallback-template-cat-cabinet', platform: 'fallback-template', title: 'Fallback direct product ad', fit_score: 0, metrics: {trend_score: 0}},
  }, null, 2));
  const previewManifest = path.join(tempRoot, 'competitive-preview-render-manifest.json');
  fs.writeFileSync(previewManifest, JSON.stringify({
    renders: [{
      blueprint: blueprintPath,
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
      ok: true,
      final_video: path.join(finalDir, 'preview.mp4'),
      proof_frame: path.join(finalDir, 'proof.jpg'),
      manifest: renderManifestPath,
      selected_reference: {id: 'fallback-template-cat-cabinet', platform: 'fallback-template', title: 'Fallback direct product ad', fit_score: 0, metrics: {trend_score: 0}},
    }],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/prepare-competitive-premium-renders.mjs',
    '--preview-manifest',
    previewManifest,
    '--credit-budget',
    '22.5',
    '--max-jobs-per-listing',
    '1',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const planPath = path.join(tempRoot, 'competitive-premium-render-plan', 'competitive-premium-render-plan.json');
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  assert.equal(plan.selected_count, 0);
  assert.equal(plan.held_count, 1);
  assert.equal(plan.held[0].hold_reason, 'research quality review required');
  assert.equal(plan.held[0].reference_quality.status, 'research_review_required');
  assert.ok(plan.held[0].reference_quality.issues.some((issue) => issue.includes('fallback-template')));

  const audit = spawnSync('node', [
    'scripts/audit-competitive-video-pipeline.mjs',
    '--premium-plan',
    planPath,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(audit.status, 0, audit.stderr);
  assert.match(audit.stdout, /research_review_required=1/);
});

test('competitive premium finalizer reports missing generated clips without assembling', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-finalize-plan-'));
  const projectDir = path.join(tempRoot, 'projects', '398174220620');
  fs.mkdirSync(path.join(projectDir, 'higgsfield-renders'), {recursive: true});
  const premiumPlan = path.join(tempRoot, 'competitive-premium-render-plan.json');
  const expectedClip = path.join(projectDir, 'higgsfield-renders', 'competitive-01-hero.mp4');
  fs.writeFileSync(premiumPlan, JSON.stringify({
    selected: [{
      item_id: '398174220620',
      title: 'Playing Card Rug',
      project_dir: projectDir,
      jobs: [{id: 'competitive-01-hero', output_hint: expectedClip}],
    }],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/finalize-competitive-premium-ads.mjs',
    '--premium-plan',
    premiumPlan,
    '--dry-run',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Not ready: 1/);
  const manifestPath = path.join(tempRoot, 'competitive-premium-finalize-manifest.json');
  assert.ok(fs.existsSync(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.not_ready_count, 1);
  assert.equal(manifest.assembled_count, 0);
  assert.equal(manifest.results[0].missing_clips[0].path, expectedClip);
  assert.match(manifest.source_policy, /no slideshow fallback/i);
});

test('competitive premium render collector reports missing sources without failing', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-collect-missing-'));
  const projectDir = path.join(tempRoot, 'projects', '398174220620');
  fs.mkdirSync(path.join(projectDir, 'higgsfield-renders'), {recursive: true});
  const premiumPlan = path.join(tempRoot, 'competitive-premium-render-plan.json');
  fs.writeFileSync(premiumPlan, JSON.stringify({
    selected: [{
      item_id: '398174220620',
      title: 'Playing Card Rug',
      project_dir: projectDir,
      jobs: [{id: 'competitive-01-hero', output_hint: path.join(projectDir, 'higgsfield-renders', 'competitive-01-hero.mp4')}],
    }],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/collect-competitive-premium-renders.mjs',
    '--premium-plan',
    premiumPlan,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Missing source: 1/);
  assert.match(result.stdout, /Failed: 0/);
  const manifestPath = path.join(tempRoot, 'competitive-premium-collect-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.missing_source_count, 1);
  assert.equal(manifest.failed_count, 0);
  assert.equal(manifest.results[0].missing_source, true);
});

test('competitive video pipeline auditor reports generated clip blockers', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-competitive-status-'));
  const projectDir = path.join(tempRoot, 'projects', '398174220620');
  const premiumDir = path.join(tempRoot, 'competitive-creative', 'competitive-premium-render-plan');
  fs.mkdirSync(path.join(projectDir, 'higgsfield-renders'), {recursive: true});
  fs.mkdirSync(path.join(projectDir, 'final'), {recursive: true});
  fs.mkdirSync(premiumDir, {recursive: true});

  const expectedClip = path.join(projectDir, 'higgsfield-renders', 'competitive-01-hero.mp4');
  const previewManifest = path.join(tempRoot, 'competitive-creative', 'competitive-preview-render-manifest.json');
  const premiumPlan = path.join(premiumDir, 'competitive-premium-render-plan.json');
  const collectManifest = path.join(premiumDir, 'competitive-premium-collect-manifest.json');
  const finalizeManifest = path.join(premiumDir, 'competitive-premium-finalize-manifest.json');
  const handoffDir = path.join(premiumDir, 'competitive-render-handoff');
  const handoffManifest = path.join(handoffDir, 'competitive-render-handoff-manifest.json');
  const handoffQueue = path.join(handoffDir, 'render-queue.json');
  const handoffRunbook = path.join(handoffDir, 'higgsfield-render-runbook.md');
  const handoffUrlMap = path.join(handoffDir, 'render-url-map.template.json');
  fs.mkdirSync(handoffDir, {recursive: true});

  fs.writeFileSync(previewManifest, JSON.stringify({
    renders: [{
      item_id: '398174220620',
      title: 'Playing Card Rug',
      ok: true,
      final_video: path.join(projectDir, 'final', 'preview.mp4'),
      proof_frame: path.join(projectDir, 'final', 'preview.jpg'),
      blueprint: path.join(tempRoot, 'competitive-creative', '398174220620', 'creative-blueprint.json'),
    }],
  }, null, 2));
  fs.writeFileSync(premiumPlan, JSON.stringify({
    selected: [{
      item_id: '398174220620',
      title: 'Playing Card Rug',
      project_dir: projectDir,
      estimated_credits: 22.5,
      jobs: [{
        id: 'competitive-01-hero',
        purpose: 'Hook beat',
        beat: {
          index: 1,
          name: 'hook',
          competitor_pattern: 'rug room reveal',
          caption_intent: 'room upgrade',
          imported_audio_note: 'lofi house bed',
        },
        output_hint: expectedClip,
      }],
    }],
  }, null, 2));
  fs.writeFileSync(collectManifest, JSON.stringify({
    results: [{
      item_id: '398174220620',
      job_id: 'competitive-01-hero',
      output_hint: expectedClip,
      imported: false,
      existing: false,
      missing_source: true,
    }],
  }, null, 2));
  fs.writeFileSync(finalizeManifest, JSON.stringify({
    results: [{
      item_id: '398174220620',
      ready: false,
      assembled: false,
      missing_clips: [{job_id: 'competitive-01-hero', path: expectedClip}],
    }],
  }, null, 2));
  fs.writeFileSync(handoffQueue, JSON.stringify({
    jobs: [{
      item_id: '398174220620',
      queue_id: '398174220620:competitive-01-hero',
      job_id: 'competitive-01-hero',
      output_hint: expectedClip,
      output_exists: false,
      missing_reference_images: [],
      estimated_credits: 22.5,
      beat: {index: 1, name: 'hook', competitor_pattern: 'rug room reveal'},
      competitor_pattern: 'rug room reveal',
      original_execution: 'Reveal the actual rug photo as a room upgrade.',
      caption_intent: 'room upgrade',
      imported_audio_note: 'lofi house bed',
    }],
  }, null, 2));
  fs.writeFileSync(handoffRunbook, '# Handoff\n');
  fs.writeFileSync(handoffUrlMap, '{}\n');
  fs.writeFileSync(handoffManifest, JSON.stringify({
    artifacts: {
      queue: handoffQueue,
      runbook: handoffRunbook,
      url_map_template: handoffUrlMap,
    },
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/audit-competitive-video-pipeline.mjs',
    '--premium-plan',
    premiumPlan,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /waiting_for_generated_clips=1/);
  const reportPath = path.join(premiumDir, 'competitive-video-pipeline-status.json');
  const markdownPath = path.join(premiumDir, 'competitive-video-pipeline-status.md');
  assert.ok(fs.existsSync(reportPath));
  assert.ok(fs.existsSync(markdownPath));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.summary.items, 1);
  assert.equal(report.summary.by_status.waiting_for_generated_clips, 1);
  assert.equal(report.items[0].status, 'waiting_for_generated_clips');
  assert.match(report.items[0].next_action, /Generate or collect/i);
  assert.equal(report.manifests.handoff, handoffManifest);
  assert.equal(report.items[0].handoff.jobs[0].queue_id, '398174220620:competitive-01-hero');
  assert.equal(report.items[0].premium.jobs[0].competitor_pattern, 'rug room reveal');
  assert.equal(report.items[0].premium.jobs[0].caption_intent, 'room upgrade');
  assert.equal(report.items[0].handoff.jobs[0].competitor_pattern, 'rug room reveal');
  assert.equal(report.items[0].handoff.jobs[0].original_execution, 'Reveal the actual rug photo as a room upgrade.');
  assert.equal(report.items[0].handoff.jobs[0].imported_audio_note, 'lofi house bed');
  assert.equal(report.items[0].handoff.runbook, handoffRunbook);
  assert.ok(report.items[0].blockers.some((blocker) => blocker.includes(expectedClip)));
});

test('competitive review board generator writes an HTML operator board', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-review-board-'));
  const creativeDir = path.join(tempRoot, 'competitive-creative', '398174269080');
  const finalDir = path.join(tempRoot, 'projects', '398174269080', 'final');
  fs.mkdirSync(creativeDir, {recursive: true});
  fs.mkdirSync(finalDir, {recursive: true});
  const previewVideo = path.join(finalDir, 'preview.mp4');
  const proofFrame = path.join(finalDir, 'proof.jpg');
  fs.writeFileSync(previewVideo, 'fake preview placeholder');
  fs.writeFileSync(proofFrame, 'fake proof placeholder');
  const blueprintPath = path.join(creativeDir, 'creative-blueprint.json');
  fs.writeFileSync(blueprintPath, JSON.stringify({
    listing: {item_id: '398174269080', title: 'Diehard Car Jack Stands'},
    selected_reference: {
      id: 'ref-1',
      platform: 'tiktok',
      creator: '@garageproof',
      title: 'Jack stands garage safety kit',
      url: 'https://example.com/ref',
      fit_score: 140,
      hook_pattern: 'price-value hook',
      metrics: {
        views: 8400,
        sold: 118,
        revenue: 7600,
        trend_score: 115,
        views_per_day: 5500,
      },
    },
  }, null, 2));
  fs.writeFileSync(path.join(creativeDir, 'competitor-trend-report.json'), JSON.stringify({
    ranked_references: [{
      id: 'ref-1',
      platform: 'tiktok',
      creator: '@garageproof',
      title: 'Jack stands garage safety kit',
      fit_score: 140,
      trend_score: 115,
      hook_pattern: 'price-value hook',
      trend_reason: '8,400 views',
      metrics: {views: 8400},
    }],
  }, null, 2));
  const previewManifest = path.join(tempRoot, 'competitive-preview-render-manifest.json');
  fs.writeFileSync(previewManifest, JSON.stringify({renders: []}, null, 2));
  fs.writeFileSync(path.join(tempRoot, 'competitive-video-qa-report.json'), JSON.stringify({
    summary: {items: 1, pass: 1, warn: 0, fail: 0, average_score: 96},
    items: [{
      item_id: '398174269080',
      status: 'pass',
      score: 96,
      probe: {width: 1080, height: 1920, duration_seconds: 10, has_audio: true},
      audio: {mean_volume_db: -34.5},
      scenes: {scene_change_count: 5},
      issues: [],
      warnings: [],
    }],
  }, null, 2));
  const statusPath = path.join(tempRoot, 'competitive-video-pipeline-status.json');
  const missingClip = path.join(tempRoot, 'projects', '398174269080', 'higgsfield-renders', 'competitive-01-hero.mp4');
  fs.writeFileSync(statusPath, JSON.stringify({
    manifests: {preview: previewManifest},
    summary: {items: 1, by_status: {waiting_for_generated_clips: 1}, blockers: 1},
    items: [{
      item_id: '398174269080',
      title: 'Diehard Car Jack Stands',
      blueprint: blueprintPath,
      status: 'waiting_for_generated_clips',
      next_action: 'Generate or collect the missing Higgsfield clips, then finalize.',
      preview: {ok: true, final_video: previewVideo, proof_frame: proofFrame},
      premium: {jobs: [{
        id: 'competitive-01-hero',
        output_hint: missingClip,
        exists: false,
        beat: {name: 'hook'},
        competitor_pattern: 'garage safety reveal',
        caption_intent: 'safer garage setup',
      }]},
      handoff: {
        manifest: path.join(tempRoot, 'competitive-render-handoff-manifest.json'),
        queue: path.join(tempRoot, 'render-queue.json'),
        runbook: path.join(tempRoot, 'higgsfield-render-runbook.md'),
        url_map_template: path.join(tempRoot, 'render-url-map.template.json'),
        jobs: [{
          queue_id: '398174269080:competitive-01-hero',
          job_id: 'competitive-01-hero',
          output_hint: missingClip,
          output_exists: false,
          missing_reference_images: [],
          competitor_pattern: 'garage safety reveal',
          original_execution: 'Use our actual jack stand photo for a trust-first opener.',
          imported_audio_note: 'quiet rock beat with metal hits',
        }],
      },
      blockers: [`Missing generated clip: ${missingClip}`],
    }],
  }, null, 2));
  fs.writeFileSync(path.join(tempRoot, 'competitive-render-handoff-manifest.json'), '{}\n');
  fs.writeFileSync(path.join(tempRoot, 'render-queue.json'), '{}\n');
  fs.writeFileSync(path.join(tempRoot, 'higgsfield-render-runbook.md'), '# Runbook\n');
  fs.writeFileSync(path.join(tempRoot, 'render-url-map.template.json'), '{}\n');

  const result = spawnSync('node', [
    'scripts/build-competitive-review-board.mjs',
    '--status',
    statusPath,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Competitive review board/);
  const htmlPath = path.join(tempRoot, 'competitive-review-board.html');
  assert.ok(fs.existsSync(htmlPath));
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /Competitive Listing Video Review Board/);
  assert.match(html, /Diehard Car Jack Stands/);
  assert.match(html, /waiting_for_generated_clips/);
  assert.match(html, /Jack stands garage safety kit/);
  assert.match(html, /Video QA/);
  assert.match(html, /Score 96/);
  assert.match(html, /Render Handoff/);
  assert.match(html, /398174269080:competitive-01-hero/);
  assert.match(html, /Pattern: garage safety reveal/);
  assert.match(html, /Our execution: Use our actual jack stand photo for a trust-first opener/);
  assert.match(html, /Audio feel: quiet rock beat with metal hits/);
  assert.match(html, /Caption intent: safer garage setup/);
  assert.match(html, /Handoff runbook/);
  assert.match(html, /Missing generated clip/);
});

test('competitive video QA gate writes a report for a vertical MP4', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-qa-video-'));
  const video = path.join(tempRoot, 'qa-input.mp4');
  const ffmpeg = spawnSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=720x1280:d=1:r=24',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    video,
  ], {encoding: 'utf8'});
  if (ffmpeg.status !== 0 || !fs.existsSync(video)) {
    t.skip('ffmpeg is required for the competitive QA smoke test');
    return;
  }

  const result = spawnSync('node', [
    'scripts/qa-competitive-videos.mjs',
    '--video',
    video,
    '--item-id',
    'qa-item',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Competitive video QA report/);
  const reportPath = path.join(tempRoot, 'competitive-video-qa-report.json');
  const markdownPath = path.join(tempRoot, 'competitive-video-qa-report.md');
  assert.ok(fs.existsSync(reportPath));
  assert.ok(fs.existsSync(markdownPath));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.summary.items, 1);
  assert.equal(report.items[0].item_id, 'qa-item');
  assert.equal(report.items[0].probe.has_video, true);
  assert.equal(report.items[0].probe.has_audio, true);
  assert.equal(report.items[0].probe.width, 720);
  assert.equal(report.items[0].probe.height, 1280);
});

test('competitive video control loop writes a dry-run manifest', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-control-loop-'));
  const previewManifest = path.join(tempRoot, 'competitive-preview-render-manifest.json');
  fs.writeFileSync(previewManifest, JSON.stringify({
    renders: [{
      item_id: '398174269080',
      title: 'Diehard Car Jack Stands',
      ok: true,
      final_video: path.join(tempRoot, 'preview.mp4'),
    }],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/run-competitive-video-control-loop.mjs',
    '--preview-manifest',
    previewManifest,
    '--dry-run',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Competitive control-loop manifest/);
  const manifestPath = path.join(tempRoot, 'competitive-control-loop', 'competitive-control-loop-manifest.json');
  assert.ok(fs.existsSync(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.dry_run, true);
  assert.equal(manifest.ok, true);
  assert.deepEqual(manifest.steps.map((step) => step.name), [
    'qa_previews',
    'prepare_premium_packets',
    'export_render_handoff',
    'collect_generated_clips',
    'finalize_readiness',
    'audit_status',
    'export_creative_packets',
    'build_review_board',
  ]);
  assert.ok(fs.existsSync(path.join(tempRoot, 'competitive-control-loop', 'competitive-control-loop-manifest.md')));
});

test('eBay competitive-plan can run from saved dashboard and workbench snapshots', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-ebay-snapshot-plan-'));
  const outRoot = path.join(tempRoot, 'run');
  const projectDir = path.join(outRoot, 'projects', '398176513526');
  fs.mkdirSync(projectDir, {recursive: true});
  const imagePath = path.join(projectDir, '01.jpg');
  fs.writeFileSync(imagePath, 'fake image placeholder');

  const dashboardPath = path.join(tempRoot, 'dashboard.json');
  fs.writeFileSync(dashboardPath, JSON.stringify({
    summary: {active_listing_count: 1},
    listings: [{
      ok: true,
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
      url: 'https://www.ebay.com/itm/398176513526',
      price: 199.99,
      asset_score: 42,
      picture_count: 3,
      video_count: 0,
      bid_count: 0,
      watch_count: 2,
    }],
  }, null, 2));

  const workbenchPath = path.join(tempRoot, 'workbench.json');
  fs.writeFileSync(workbenchPath, JSON.stringify({
    manifest: {
      listings: [{
        item_id: '398176513526',
        title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
        url: 'https://www.ebay.com/itm/398176513526',
        directory: projectDir,
        images: [{
          filename: '01.jpg',
          path: imagePath,
          source_url: 'https://example.com/01.jpg',
        }],
      }],
    },
  }, null, 2));

  const competitorsPath = path.join(tempRoot, 'automatio-kalodata.csv');
  fs.writeFileSync(competitorsPath, [
    'Product Title,Video URL,Hook,Caption,Video Views,Product Units Sold,Product GMV,Duration Seconds,Shot Breakdown,Audio Notes',
    '"Double cat litter box enclosure rattan cabinet","https://example.com/cat-cabinet-video","Your litter box can stop looking like a litter box","Hide two litter boxes and make the room cleaner","88000","430","US$38000","16","mess reveal, cabinet proof, room styling, CTA","soft house beat with whoosh cuts"',
  ].join('\n'));

  const result = spawnSync('node', [
    'scripts/ebay-cinematic-ads.mjs',
    'competitive-plan',
    '--dashboard-file',
    dashboardPath,
    '--workbench-file',
    workbenchPath,
    '--competitors',
    competitorsPath,
    '--out-dir',
    outRoot,
    '--max-listings',
    '1',
    '--credit-budget',
    '40',
    '--credits-per-shot',
    '10',
    '--max-higgs-shots',
    '4',
    '--no-download',
    '--no-discover-youtube',
    '--no-analyze-reference-video',
    '--run-control-loop',
    '--control-loop-dry-run',
    '--run-higgsfield-renders',
    '--higgs-render-model',
    'seedance_2_0_mini',
    '--higgs-render-dry-run',
    '--higgs-render-skip-cost',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Competitive pipeline manifest/);
  const pipelineManifestPath = path.join(outRoot, 'competitive-pipeline-manifest.json');
  assert.ok(fs.existsSync(pipelineManifestPath));
  const pipeline = JSON.parse(fs.readFileSync(pipelineManifestPath, 'utf8'));
  assert.equal(pipeline.selected_count, 1);
  assert.equal(pipeline.control_loop.run_higgsfield_renders, true);
  assert.equal(pipeline.control_loop.higgsfield_render_dry_run, true);
  assert.ok(fs.existsSync(path.join(outRoot, 'higgsfield-roi-plan.json')));
  assert.ok(fs.existsSync(path.join(projectDir, 'listing.json')));
  assert.ok(fs.existsSync(path.join(outRoot, 'competitive-creative', '398176513526', 'creative-blueprint.json')));
  const controlManifest = JSON.parse(fs.readFileSync(pipeline.control_loop.control_loop_manifest, 'utf8'));
  assert.equal(controlManifest.dry_run, true);
  assert.ok(controlManifest.steps.some((step) => step.name === 'render_higgsfield_jobs'));
});

test('eBay traffic optimizer writes immediate CTR and conversion worklists', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-traffic-opt-'));
  const reportPath = path.join(tempRoot, 'traffic.csv');
  fs.writeFileSync(reportPath, [
    'disclaimer line',
    'Listing title,eBay item ID,Item Start Date,Category,Current promoted listings status,Quantity available,Total impressions,Click-through rate = Page views from eBay site/Total impressions,Quantity sold,% Top 20 Search Impressions,Sales conversion rate = Quantity sold/Total page views,Top 20 search slot impressions from promoted listings,% change in top 20 search slot impressions from promoted listings,Top 20 search slot organic impressions,% change in top 20 search slot impressions,Rest of search slot impressions,Total Search Impressions,Non-search promoted listings impressions,% Change in non-search promoted listings impressions,Non-search organic impressions,% Change in non-search organic impressions,Total Promoted Listings impressions (applies to eBay site only),Total Promoted Offsite impressions (applies to off-eBay only),Total organic impressions on eBay site,Total page views,Page views via promoted listings impressions on eBay site,Page views via promoted listings Impressions from outside eBay (search engines, affilliates),Page views via organic impressions on eBay site,Page views from organic impressions outside eBay (Includes page views from search engines),',
    'High Views Camera,="398160795273",2026-07-10,Digital Cameras,Promoted,1,"17,567",2.9%,0,67.6%,0.0%,0,0,0,0,0,"5,551",0,0,0,0,686,0,"16,881",519,0,0,519,0,',
    'Ignored Hat,="398175425702",2026-07-14,Hats,Non-promoted,1,257,0.0%,0,9.8%,0.0%,0,0,0,0,0,246,0,0,257,0,0,0,257,0,0,0,0,0,',
  ].join('\n'));

  const outDir = path.join(tempRoot, 'out');
  const result = spawnSync('node', [
    'scripts/optimize-ebay-traffic-report.mjs',
    '--traffic-report',
    reportPath,
    '--out-dir',
    outDir,
    '--max-listings',
    '2',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Traffic optimization worklist/);
  const worklist = JSON.parse(fs.readFileSync(path.join(outDir, 'traffic-optimization-worklist.json'), 'utf8'));
  assert.equal(worklist.summary.listing_count, 2);
  assert.equal(worklist.immediate.length, 2);
  assert.equal(worklist.immediate[0].item_id, '398160795273');
  assert.equal(worklist.immediate[0].primary_action, 'conversion_trust_video');
  assert.equal(worklist.immediate[1].primary_action, 'main_image_title');
  const dashboard = JSON.parse(fs.readFileSync(path.join(outDir, 'traffic-dashboard-snapshot.json'), 'utf8'));
  assert.equal(dashboard.listings.length, 2);
  assert.equal(dashboard.listings[0].traffic.page_views, 519);
  assert.ok(fs.existsSync(path.join(outDir, 'traffic-optimization-worklist.md')));
  assert.ok(fs.readFileSync(path.join(outDir, 'traffic-optimization-worklist.csv'), 'utf8').includes('High Views Camera'));
});

test('eBay traffic optimizer can focus on dropship quantity listings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-dropship-opt-'));
  const reportPath = path.join(tempRoot, 'traffic.csv');
  fs.writeFileSync(reportPath, [
    'report preamble',
    'Listing title,eBay item ID,Item Start Date,Category,Current promoted listings status,Quantity available,Total impressions,Click-through rate = Page views from eBay site/Total impressions,Quantity sold,% Top 20 Search Impressions,Sales conversion rate = Quantity sold/Total page views,Top 20 search slot impressions from promoted listings,% change in top 20 search slot impressions from promoted listings,Top 20 search slot organic impressions,% change in top 20 search slot impressions,Rest of search slot impressions,Total Search Impressions,Non-search promoted listings impressions,% Change in non-search promoted listings impressions,Non-search organic impressions,% Change in non-search organic impressions,Total Promoted Listings impressions (applies to eBay site only),Total Promoted Offsite impressions (applies to off-eBay only),Total organic impressions on eBay site,Total page views,Page views via promoted listings impressions on eBay site,Page views via promoted listings Impressions from outside eBay (search engines, affilliates),Page views via organic impressions on eBay site,Page views from organic impressions outside eBay (Includes page views from search engines),',
    'One Off Camera,="398160795273",2026-07-10,Digital Cameras,Promoted,1,"17,567",2.9%,0,67.6%,0.0%,0,0,0,0,0,"5,551",0,0,0,0,686,0,"16,881",519,0,0,519,0,',
    'Supplier Dog Crate,="398175951396",2026-07-14,Cages & Crates,Promoted,2,295,1.0%,0,57.0%,0.0%,0,0,0,0,0,200,0,0,95,0,100,0,195,3,0,0,3,0,',
  ].join('\n'));

  const outDir = path.join(tempRoot, 'out');
  const result = spawnSync('node', [
    'scripts/optimize-ebay-traffic-report.mjs',
    '--traffic-report',
    reportPath,
    '--out-dir',
    outDir,
    '--dropship-only',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const worklist = JSON.parse(fs.readFileSync(path.join(outDir, 'traffic-optimization-worklist.json'), 'utf8'));
  assert.equal(worklist.summary.all_listing_count, 2);
  assert.equal(worklist.summary.listing_count, 1);
  assert.equal(worklist.summary.filter.dropship_only, true);
  assert.equal(worklist.immediate[0].item_id, '398175951396');
  assert.equal(worklist.immediate[0].primary_action, 'main_image_title');
  assert.ok(worklist.immediate[0].issue_tags.includes('dropship_active_optimization'));
  const selectedIds = fs.readFileSync(path.join(outDir, 'selected-item-ids.txt'), 'utf8');
  assert.equal(selectedIds.trim(), '398175951396');
});

test('competitive render handoff exporter writes queue and runbook', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-handoff-'));
  const projectDir = path.join(tempRoot, 'projects', '398174269080');
  fs.mkdirSync(projectDir, {recursive: true});
  const imagePath = path.join(projectDir, '01.jpg');
  fs.writeFileSync(imagePath, 'fake image placeholder');
  const outputHint = path.join(projectDir, 'higgsfield-renders', 'competitive-01-hero.mp4');
  const premiumPlan = path.join(tempRoot, 'competitive-premium-render-plan.json');
  fs.writeFileSync(premiumPlan, JSON.stringify({
    preview_manifest: path.join(tempRoot, 'competitive-preview-render-manifest.json'),
    credit_budget: 22.5,
    max_jobs_per_listing: 1,
    selected: [{
      item_id: '398174269080',
      title: 'Diehard Car Jack Stands',
      project_dir: projectDir,
      listing_url: 'https://www.ebay.com/itm/398174269080',
      preview_video: path.join(projectDir, 'final', 'preview.mp4'),
      selected_reference: {title: 'Jack stand reference', hook_pattern: 'price-value hook'},
      jobs: [{
        id: 'competitive-01-hero',
        purpose: 'Hero reveal',
        beat: {
          index: 1,
          name: 'hook',
          competitor_pattern: 'garage safety reveal',
          original_execution: 'Use our actual jack stand photo for a trust-first opener.',
          caption_intent: 'safer garage setup',
          sfx: ['impact hit', 'tool click'],
          imported_audio_note: 'quiet rock beat with metal hits',
        },
        prompt: 'Render exact jack stands from reference photo.',
        model: 'seedance_2_0_mini',
        resolution: '720p',
        mode: 'std',
        aspect_ratio: '9:16',
        duration_seconds: 5,
        estimated_credits: 22.5,
        reference_images: [imagePath],
        output_hint: outputHint,
      }],
    }],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/export-competitive-render-handoff.mjs',
    '--premium-plan',
    premiumPlan,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Competitive render handoff/);
  const handoffDir = path.join(tempRoot, 'competitive-render-handoff');
  const manifest = JSON.parse(fs.readFileSync(path.join(handoffDir, 'competitive-render-handoff-manifest.json'), 'utf8'));
  assert.equal(manifest.job_count, 1);
  assert.equal(manifest.missing_reference_image_count, 0);
  assert.equal(manifest.missing_output_count, 1);
  assert.ok(fs.existsSync(path.join(handoffDir, 'render-queue.json')));
  assert.ok(fs.existsSync(path.join(handoffDir, 'render-queue.jsonl')));
  assert.ok(fs.existsSync(path.join(handoffDir, 'render-url-map.template.json')));
  assert.ok(fs.existsSync(path.join(handoffDir, 'higgsfield-render-runbook.md')));
  assert.ok(fs.existsSync(path.join(handoffDir, 'run-higgsfield-cli-jobs.sh')));
  const queue = JSON.parse(fs.readFileSync(path.join(handoffDir, 'render-queue.json'), 'utf8'));
  assert.equal(queue.jobs[0].queue_id, '398174269080:competitive-01-hero');
  assert.deepEqual(queue.jobs[0].reference_images, [imagePath]);
  assert.equal(queue.jobs[0].competitor_pattern, 'garage safety reveal');
  assert.equal(queue.jobs[0].original_execution, 'Use our actual jack stand photo for a trust-first opener.');
  assert.equal(queue.jobs[0].caption_intent, 'safer garage setup');
  assert.deepEqual(queue.jobs[0].sfx, ['impact hit', 'tool click']);
  assert.equal(queue.jobs[0].imported_audio_note, 'quiet rock beat with metal hits');
  assert.equal(JSON.parse(fs.readFileSync(path.join(handoffDir, 'render-queue.jsonl'), 'utf8').trim()).beat.name, 'hook');
  const urlMap = JSON.parse(fs.readFileSync(path.join(handoffDir, 'render-url-map.template.json'), 'utf8'));
  assert.equal(urlMap['398174269080']['competitive-01-hero'], outputHint);
  const runbook = fs.readFileSync(path.join(handoffDir, 'higgsfield-render-runbook.md'), 'utf8');
  assert.match(runbook, /Output Contract/);
  assert.match(runbook, /seedance_2_0_mini/);
  assert.doesNotMatch(runbook, /--mode 'std'/);
  assert.match(runbook, /Competitor pattern: garage safety reveal/);
  assert.match(runbook, /Audio feel: quiet rock beat with metal hits/);
});

test('competitive Higgsfield render runner plans Mini-compatible jobs and resumes completed URLs', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-higgs-render-'));
  const projectDir = path.join(tempRoot, 'projects', '398176513526');
  fs.mkdirSync(path.join(projectDir, 'higgsfield'), {recursive: true});
  const imagePath = path.join(projectDir, '01.jpg');
  fs.writeFileSync(imagePath, 'fake image placeholder');
  const completedJobJson = path.join(projectDir, 'higgsfield', 'competitive-01-hook.competitive-job.json');
  fs.writeFileSync(completedJobJson, JSON.stringify([{
    id: 'existing-job',
    status: 'completed',
    result_url: 'https://cdn.example.com/higgs-hook.mp4',
  }], null, 2));
  const premiumPlan = path.join(tempRoot, 'competitive-premium-render-plan.json');
  fs.writeFileSync(premiumPlan, JSON.stringify({
    selected: [{
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
      project_dir: projectDir,
      jobs: [
        {
          id: 'competitive-01-hook',
          purpose: 'Hook',
          prompt: 'Hook prompt',
          model: 'seedance_2_0',
          resolution: '720p',
          mode: 'std',
          aspect_ratio: '9:16',
          duration_seconds: 4,
          estimated_credits: 10,
          reference_images: [imagePath],
          output_hint: path.join(projectDir, 'higgsfield-renders', 'competitive-01-hook.mp4'),
        },
        {
          id: 'competitive-02-proof-detail',
          purpose: 'Proof',
          prompt: 'Proof prompt',
          model: 'seedance_2_0',
          resolution: '720p',
          mode: 'std',
          aspect_ratio: '9:16',
          duration_seconds: 4,
          estimated_credits: 10,
          reference_images: [imagePath],
          output_hint: path.join(projectDir, 'higgsfield-renders', 'competitive-02-proof-detail.mp4'),
        },
      ],
    }],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/run-competitive-higgsfield-renders.mjs',
    '--premium-plan',
    premiumPlan,
    '--model',
    'seedance_2_0_mini',
    '--credit-budget',
    '15',
    '--dry-run',
    '--skip-cost',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Competitive Higgsfield render manifest/);
  const outDir = path.join(tempRoot, 'competitive-higgsfield-render-run');
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'competitive-higgsfield-render-manifest.json'), 'utf8'));
  assert.equal(manifest.candidate_count, 2);
  assert.equal(manifest.existing_completed_count, 1);
  assert.equal(manifest.results[0].status, 'existing_completed');
  assert.equal(manifest.results[1].status, 'dry_run');
  assert.equal(manifest.results[1].model, 'seedance_2_0_mini');
  assert.ok(!manifest.results[1].command_args.includes('--mode'));
  assert.ok(manifest.results[1].command_args.includes('--aspect_ratio'));
  const urlMap = JSON.parse(fs.readFileSync(path.join(outDir, 'higgsfield-render-url-map.json'), 'utf8'));
  assert.equal(urlMap['398176513526']['competitive-01-hook'], 'https://cdn.example.com/higgs-hook.mp4');
});

test('competitive Higgsfield render runner does not exceed the first-job credit budget', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-higgs-budget-'));
  const projectDir = path.join(tempRoot, 'projects', '398176513526');
  fs.mkdirSync(projectDir, {recursive: true});
  const imagePath = path.join(projectDir, '01.jpg');
  fs.writeFileSync(imagePath, 'fake image placeholder');
  const premiumPlan = path.join(tempRoot, 'competitive-premium-render-plan.json');
  fs.writeFileSync(premiumPlan, JSON.stringify({
    selected: [{
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
      project_dir: projectDir,
      jobs: [{
        id: 'competitive-01-hook',
        prompt: 'Hook prompt',
        model: 'seedance_2_0_mini',
        resolution: '720p',
        aspect_ratio: '9:16',
        duration_seconds: 4,
        estimated_credits: 10,
        reference_images: [imagePath],
        output_hint: path.join(projectDir, 'higgsfield-renders', 'competitive-01-hook.mp4'),
      }],
    }],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/run-competitive-higgsfield-renders.mjs',
    '--premium-plan',
    premiumPlan,
    '--credit-budget',
    '5',
    '--dry-run',
    '--skip-cost',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const outDir = path.join(tempRoot, 'competitive-higgsfield-render-run');
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'competitive-higgsfield-render-manifest.json'), 'utf8'));
  assert.equal(manifest.created_count, 0);
  assert.equal(manifest.held_count, 1);
  assert.equal(manifest.results[0].status, 'held_credit_budget');
  assert.equal(manifest.planned_credits, 0);
});

test('competitive creative packet exporter writes per-listing packet folders', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-creative-packets-'));
  const projectDir = path.join(tempRoot, 'projects', '398174269080');
  const creativeDir = path.join(tempRoot, 'competitive-creative', '398174269080');
  const premiumDir = path.join(tempRoot, 'competitive-premium-render-plan');
  fs.mkdirSync(projectDir, {recursive: true});
  fs.mkdirSync(creativeDir, {recursive: true});
  fs.mkdirSync(premiumDir, {recursive: true});

  const referenceImage = path.join(projectDir, '01.jpg');
  const previewVideo = path.join(projectDir, 'preview.mp4');
  const proofFrame = path.join(projectDir, 'proof.jpg');
  fs.writeFileSync(referenceImage, 'fake image placeholder');
  fs.writeFileSync(previewVideo, 'fake video placeholder');
  fs.writeFileSync(proofFrame, 'fake proof placeholder');

  const blueprintPath = path.join(creativeDir, 'creative-blueprint.json');
  fs.writeFileSync(blueprintPath, JSON.stringify({
    listing: {item_id: '398174269080', title: 'Diehard Car Jack Stands'},
    selected_reference: {title: 'Jack stand competitor', platform: 'kalodata', hook_pattern: 'safety hook', metrics: {trend_score: 42}},
    product_truth_rules: ['Use real jack stand references only.'],
    beats: [{
      beat: 'hook',
      competitor_pattern: 'fast safety hook',
      original_execution: 'Open on the exact jack stands.',
      source_assets: ['image_1'],
      time_seconds: {start: 0, end: 2},
    }],
  }, null, 2));
  fs.writeFileSync(path.join(tempRoot, 'competitive-video-qa-report.json'), JSON.stringify({
    items: [{
      item_id: '398174269080',
      status: 'pass',
      score: 96,
      probe: {width: 1080, height: 1920, duration_seconds: 10, has_audio: true},
      audio: {mean_volume_db: -34},
      scenes: {scene_change_count: 4},
      issues: [],
      warnings: [],
    }],
  }, null, 2));
  const previewManifest = path.join(tempRoot, 'competitive-preview-render-manifest.json');
  fs.writeFileSync(previewManifest, JSON.stringify({renders: []}, null, 2));
  const statusPath = path.join(premiumDir, 'competitive-video-pipeline-status.json');
  fs.writeFileSync(statusPath, JSON.stringify({
    manifests: {preview: previewManifest},
    items: [{
      item_id: '398174269080',
      title: 'Diehard Car Jack Stands',
      status: 'research_review_required',
      next_action: 'Add stronger competitor/Kalodata reference evidence or rerun premium prep with --allow-weak-research.',
      blueprint: blueprintPath,
      preview: {final_video: previewVideo, proof_frame: proofFrame, selected_reference: {title: 'Jack stand competitor'}},
      premium: {jobs: [{id: 'competitive-01-hero', output_hint: path.join(projectDir, 'higgsfield-renders', 'competitive-01-hero.mp4'), reference_images: [referenceImage]}]},
      handoff: {jobs: [{queue_id: '398174269080:competitive-01-hero', job_id: 'competitive-01-hero', output_hint: path.join(projectDir, 'higgsfield-renders', 'competitive-01-hero.mp4'), prompt: 'Render exact jack stands.', estimated_credits: 22.5, missing_reference_images: []}]},
      premium_hold: {reason: 'research quality review required', reference_quality: {issues: ['selected reference is fallback-template']}},
      blockers: ['Research quality: selected reference is fallback-template'],
    }],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/export-competitive-creative-packets.mjs',
    '--status',
    statusPath,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Competitive creative packets/);
  const manifestPath = path.join(premiumDir, 'competitive-creative-packets', 'competitive-creative-packets-manifest.json');
  assert.ok(fs.existsSync(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.packet_count, 1);
  assert.equal(manifest.missing_asset_count, 0);
  const packetDir = manifest.packets[0].packet_dir;
  assert.ok(fs.existsSync(path.join(packetDir, 'creative-packet.json')));
  assert.ok(fs.existsSync(path.join(packetDir, 'creative-packet.md')));
  assert.ok(fs.existsSync(path.join(packetDir, 'render-queue.json')));
  assert.ok(fs.existsSync(path.join(packetDir, 'render-url-map.template.json')));
  assert.ok(fs.existsSync(path.join(packetDir, 'research', 'research-brief.md')));
  assert.ok(fs.existsSync(path.join(packetDir, 'research', 'research-brief.json')));
  assert.ok(fs.existsSync(path.join(packetDir, 'research', 'competitor-import-template.csv')));
  const markdown = fs.readFileSync(path.join(packetDir, 'creative-packet.md'), 'utf8');
  assert.match(markdown, /Selected Structure/);
  assert.match(markdown, /Beat Map/);
  assert.match(markdown, /Rejection Checklist/);
  const researchMarkdown = fs.readFileSync(path.join(packetDir, 'research', 'research-brief.md'), 'utf8');
  assert.match(researchMarkdown, /Search Queries/);
  assert.match(researchMarkdown, /Why Export First/);
  assert.match(researchMarkdown, /logged-in browser scraper/);
  assert.match(researchMarkdown, /Required Export Columns/);
  assert.match(researchMarkdown, /Import Command/);
  const packet = JSON.parse(fs.readFileSync(path.join(packetDir, 'creative-packet.json'), 'utf8'));
  assert.equal(packet.qa.status, 'pass');
  assert.equal(packet.local_assets.reference_images.length, 1);
  assert.ok(packet.research.research_brief_markdown.endsWith('research-brief.md'));
  const researchJson = JSON.parse(fs.readFileSync(path.join(packetDir, 'research', 'research-brief.json'), 'utf8'));
  assert.ok(researchJson.research_source_note.some((note) => note.includes('anti-bot checks')));
});

test('competitive research rerun helper infers project from packet breadcrumbs', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-research-rerun-'));
  const itemId = '398176513526';
  const projectDir = path.join(tempRoot, 'projects', itemId);
  const creativeDir = path.join(tempRoot, 'competitive-creative', itemId);
  const packetDir = path.join(tempRoot, 'competitive-creative-packets', `${itemId}-cat-cabinet`);
  const finalDir = path.join(projectDir, 'final');
  fs.mkdirSync(projectDir, {recursive: true});
  fs.mkdirSync(creativeDir, {recursive: true});
  fs.mkdirSync(packetDir, {recursive: true});
  fs.mkdirSync(finalDir, {recursive: true});
  fs.writeFileSync(path.join(projectDir, 'listing.json'), JSON.stringify({
    item_id: itemId,
    title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
    images: [],
  }, null, 2));
  const sourceBlueprint = path.join(creativeDir, 'creative-blueprint.json');
  fs.writeFileSync(sourceBlueprint, JSON.stringify({
    listing: {item_id: itemId, title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black'},
    selected_reference: {platform: 'fallback-template', fit_score: 0},
  }, null, 2));
  const renderManifest = path.join(finalDir, `${itemId}-competitive-preview-manifest.json`);
  fs.writeFileSync(renderManifest, JSON.stringify({project_dir: projectDir}, null, 2));
  const previewManifest = path.join(tempRoot, 'competitive-creative', 'competitive-preview-render-manifest.json');
  fs.writeFileSync(previewManifest, JSON.stringify({
    renders: [{item_id: itemId, manifest: renderManifest, final_video: path.join(finalDir, 'preview.mp4')}],
  }, null, 2));
  const statusPath = path.join(tempRoot, 'competitive-premium-render-plan', 'competitive-video-pipeline-status.json');
  fs.mkdirSync(path.dirname(statusPath), {recursive: true});
  fs.writeFileSync(statusPath, JSON.stringify({manifests: {preview: previewManifest}}, null, 2));
  fs.writeFileSync(path.join(packetDir, 'creative-packet.json'), JSON.stringify({
    item_id: itemId,
    title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
    status: 'research_review_required',
    source_status: statusPath,
    source_blueprint: sourceBlueprint,
  }, null, 2));
  const competitors = path.join(tempRoot, 'automatio-export.csv');
  fs.writeFileSync(competitors, [
    'Product Title,Creator Handle,Video URL,Hook,Video Views,Items Sold,Total Revenue',
    '"Double cat litter cabinet","@catspaces","https://example.com/cat","Hide the litter box","88K","430","US$38K"',
  ].join('\n'));

  const result = spawnSync('node', [
    'scripts/rerun-competitive-research-packet.mjs',
    '--packet-dir',
    packetDir,
    '--competitors',
    competitors,
    '--dry-run',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Competitive research rerun manifest/);
  const manifest = JSON.parse(fs.readFileSync(path.join(creativeDir, 'competitive-research-rerun-manifest.json'), 'utf8'));
  assert.equal(manifest.dry_run, true);
  assert.equal(manifest.project_dir, projectDir);
  assert.equal(manifest.steps.length, 2);
  assert.match(manifest.steps[0].command, new RegExp(projectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(manifest.steps[0].command, new RegExp(competitors.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(manifest.steps[1].command, /run-competitive-video-control-loop/);
});

test('competitive research queue exporter writes Automatio search queue', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-research-queue-'));
  const packetDir = path.join(tempRoot, 'competitive-creative-packets', '398176513526-cat-cabinet');
  const researchDir = path.join(packetDir, 'research');
  fs.mkdirSync(researchDir, {recursive: true});
  const packetJson = path.join(packetDir, 'creative-packet.json');
  const researchBrief = path.join(researchDir, 'research-brief.md');
  const researchJson = path.join(researchDir, 'research-brief.json');
  const importTemplate = path.join(researchDir, 'competitor-import-template.csv');
  fs.writeFileSync(packetJson, JSON.stringify({
    item_id: '398176513526',
    title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
    status: 'research_review_required',
    blockers: ['Research quality: selected reference is fallback-template'],
  }, null, 2));
  fs.writeFileSync(researchBrief, '# Research brief\n');
  fs.writeFileSync(importTemplate, 'Product Title,Video URL\n');
  fs.writeFileSync(researchJson, JSON.stringify({
    item_id: '398176513526',
    title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
    status: 'research_review_required',
    issues: ['selected reference is fallback-template', 'fit score 0 below minimum 1'],
    required_columns: ['Product Title', 'Video URL', 'Items Sold'],
    search_queries: [
      'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black product demo',
      'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black TikTok Shop',
    ],
    competitor_import_template: importTemplate,
  }, null, 2));
  const packetsManifest = path.join(tempRoot, 'competitive-creative-packets', 'competitive-creative-packets-manifest.json');
  fs.writeFileSync(packetsManifest, JSON.stringify({
    packets: [{
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
      packet_dir: packetDir,
      packet_json: packetJson,
      research_brief: researchBrief,
    }],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/export-competitive-research-queue.mjs',
    '--packets-manifest',
    packetsManifest,
    '--credit-budget',
    '22.5',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Search rows: 2/);
  const outDir = path.join(tempRoot, 'competitive-research-queue');
  const queueJson = JSON.parse(fs.readFileSync(path.join(outDir, 'competitive-research-queue.json'), 'utf8'));
  assert.equal(queueJson.listing_count, 1);
  assert.equal(queueJson.query_count, 2);
  assert.match(queueJson.listings[0].rerun_command, /ebay:competitive-research-rerun/);
  assert.match(queueJson.listings[0].rerun_command, /--credit-budget 22.5/);
  const csv = fs.readFileSync(path.join(outDir, 'automatio-search-queue.csv'), 'utf8');
  assert.match(csv, /Search Query/);
  assert.match(csv, /Double Cat Litter Box Enclosure Cabinet Rattan Doors Black TikTok Shop/);
  assert.match(csv, /competitor-import-template\.csv/);
  const markdown = fs.readFileSync(path.join(outDir, 'competitive-research-queue.md'), 'utf8');
  assert.match(markdown, /Competitive Research Queue/);
  assert.match(markdown, /How To Use/);
});

test('competitive research results importer fans consolidated Automatio rows into templates', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-research-import-'));
  const firstPacket = path.join(tempRoot, 'packets', '398176513526-cat-cabinet');
  const secondPacket = path.join(tempRoot, 'packets', '398176413575-socket-set');
  fs.mkdirSync(path.join(firstPacket, 'research'), {recursive: true});
  fs.mkdirSync(path.join(secondPacket, 'research'), {recursive: true});
  const firstTemplate = path.join(firstPacket, 'research', 'competitor-import-template.csv');
  const secondTemplate = path.join(secondPacket, 'research', 'competitor-import-template.csv');
  const columns = 'Product Title,Video URL,Hook,Video Views,Items Sold';
  fs.writeFileSync(firstTemplate, `${columns}\n`);
  fs.writeFileSync(secondTemplate, `${columns}\n`);
  const queuePath = path.join(tempRoot, 'competitive-research-queue.json');
  fs.writeFileSync(queuePath, JSON.stringify({
    listings: [
      {
        item_id: '398176513526',
        title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
        packet_dir: firstPacket,
        competitor_import_template: firstTemplate,
        required_columns: columns.split(','),
      },
      {
        item_id: '398176413575',
        title: 'VEVOR 34 Pc Deep Impact Socket Set Metric 8-36mm Case',
        packet_dir: secondPacket,
        competitor_import_template: secondTemplate,
        required_columns: columns.split(','),
      },
    ],
  }, null, 2));
  const resultsPath = path.join(tempRoot, 'automatio-results.csv');
  fs.writeFileSync(resultsPath, [
    'Item ID,Search Query,Product Title,Video URL,Hook,Video Views,Items Sold',
    '"398176513526","cat cabinet TikTok Shop","Double cat cabinet","https://example.com/cat","Hide the box","88K","430"',
    '"398176413575","socket set product demo","Impact socket kit","https://example.com/socket","Mechanics need this","12K","91"',
    '"000000000000","unmatched","Wrong thing","https://example.com/wrong","Nope","1M","1"',
  ].join('\n'));

  const result = spawnSync('node', [
    'scripts/import-competitive-research-results.mjs',
    '--queue',
    queuePath,
    '--results',
    resultsPath,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Imported rows: 2/);
  assert.match(fs.readFileSync(firstTemplate, 'utf8'), /Double cat cabinet,https:\/\/example\.com\/cat,Hide the box,88K,430/);
  assert.doesNotMatch(fs.readFileSync(firstTemplate, 'utf8'), /Impact socket kit/);
  assert.match(fs.readFileSync(secondTemplate, 'utf8'), /Impact socket kit,https:\/\/example\.com\/socket,Mechanics need this,12K,91/);
  assert.doesNotMatch(fs.readFileSync(secondTemplate, 'utf8'), /Double cat cabinet/);
  const manifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'competitive-research-import', 'competitive-research-import-manifest.json'), 'utf8'));
  assert.equal(manifest.imported_rows, 2);
  assert.equal(manifest.skipped_rows, 1);
  assert.equal(manifest.low_match_rows, 0);
  assert.ok(manifest.writes[0].imported_preview_rows[0]._review.product_match.score >= 0.2);
  assert.match(manifest.next_command, /competitive-research-process/);
});

test('competitive research results importer routes rows by queued search query', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-research-import-query-'));
  const firstPacket = path.join(tempRoot, 'packets', '398176513526-cat-cabinet');
  const secondPacket = path.join(tempRoot, 'packets', '398176413575-socket-set');
  fs.mkdirSync(path.join(firstPacket, 'research'), {recursive: true});
  fs.mkdirSync(path.join(secondPacket, 'research'), {recursive: true});
  const firstTemplate = path.join(firstPacket, 'research', 'competitor-import-template.csv');
  const secondTemplate = path.join(secondPacket, 'research', 'competitor-import-template.csv');
  const columns = 'Product Title,Video URL,Hook,Video Views,Items Sold';
  fs.writeFileSync(firstTemplate, `${columns}\n`);
  fs.writeFileSync(secondTemplate, `${columns}\n`);
  const queuePath = path.join(tempRoot, 'competitive-research-queue.json');
  fs.writeFileSync(queuePath, JSON.stringify({
    listings: [
      {
        item_id: '398176513526',
        title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
        packet_dir: firstPacket,
        competitor_import_template: firstTemplate,
        required_columns: columns.split(','),
      },
      {
        item_id: '398176413575',
        title: 'VEVOR 34 Pc Deep Impact Socket Set Metric 8-36mm Case',
        packet_dir: secondPacket,
        competitor_import_template: secondTemplate,
        required_columns: columns.split(','),
      },
    ],
    rows: [
      {
        item_id: '398176513526',
        search_query: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black TikTok Shop',
      },
      {
        item_id: '398176413575',
        search_query: 'VEVOR 34 Pc Deep Impact Socket Set Metric 8-36mm Case product demo',
      },
    ],
  }, null, 2));
  const resultsPath = path.join(tempRoot, 'automatio-results.csv');
  fs.writeFileSync(resultsPath, [
    'Search Query,Product Title,Video URL,Hook,Video Views,Items Sold',
    '"Double Cat Litter Box Enclosure Cabinet Rattan Doors Black TikTok Shop","Double cat cabinet","https://example.com/cat","Hide the box","88K","430"',
    '"VEVOR 34 Pc Deep Impact Socket Set Metric 8-36mm Case product demo","Impact socket kit","https://example.com/socket","Mechanics need this","12K","91"',
  ].join('\n'));

  const result = spawnSync('node', [
    'scripts/import-competitive-research-results.mjs',
    '--queue',
    queuePath,
    '--results',
    resultsPath,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Imported rows: 2/);
  assert.match(fs.readFileSync(firstTemplate, 'utf8'), /Double cat cabinet,https:\/\/example\.com\/cat,Hide the box,88K,430/);
  assert.doesNotMatch(fs.readFileSync(firstTemplate, 'utf8'), /Impact socket kit/);
  assert.match(fs.readFileSync(secondTemplate, 'utf8'), /Impact socket kit,https:\/\/example\.com\/socket,Mechanics need this,12K,91/);
  assert.doesNotMatch(fs.readFileSync(secondTemplate, 'utf8'), /Double cat cabinet/);
  const manifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'competitive-research-import', 'competitive-research-import-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.route_sources, ['Item ID', 'Competitor Import Template', 'Packet Dir', 'Search Query']);
  assert.equal(manifest.imported_rows, 2);
  assert.equal(manifest.skipped_rows, 0);
  assert.equal(manifest.low_match_rows, 0);
});

test('competitive research results importer flags low product-match rows', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-research-import-match-'));
  const packetDir = path.join(tempRoot, 'packets', '398176513526-cat-cabinet');
  fs.mkdirSync(path.join(packetDir, 'research'), {recursive: true});
  const template = path.join(packetDir, 'research', 'competitor-import-template.csv');
  fs.writeFileSync(template, 'Product Title,Video URL,Hook,Video Views,Items Sold\n');
  const queuePath = path.join(tempRoot, 'competitive-research-queue.json');
  fs.writeFileSync(queuePath, JSON.stringify({
    listings: [{
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
      packet_dir: packetDir,
      competitor_import_template: template,
      required_columns: ['Product Title', 'Video URL', 'Hook', 'Video Views', 'Items Sold'],
    }],
  }, null, 2));
  const resultsPath = path.join(tempRoot, 'automatio-results.csv');
  fs.writeFileSync(resultsPath, [
    'Item ID,Product Title,Video URL,Hook,Video Views,Items Sold',
    '"398176513526","Cordless impact drill battery pack","https://example.com/drill","Garage tools are trending","99K","350"',
  ].join('\n'));

  const result = spawnSync('node', [
    'scripts/import-competitive-research-results.mjs',
    '--queue',
    queuePath,
    '--results',
    resultsPath,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'competitive-research-import', 'competitive-research-import-manifest.json'), 'utf8'));
  assert.equal(manifest.low_match_rows, 1);
  assert.equal(manifest.writes[0].imported_preview_rows[0]._review.product_match.score, 0);
  assert.match(manifest.writes[0].imported_preview_rows[0]._review.product_match.warnings.join(' '), /low product-title match/);
});

test('competitive research import loop imports rows and plans ready reruns', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-research-loop-'));
  const packetDir = path.join(tempRoot, 'packets', '398176513526-cat-cabinet');
  fs.mkdirSync(path.join(packetDir, 'research'), {recursive: true});
  const template = path.join(packetDir, 'research', 'competitor-import-template.csv');
  fs.writeFileSync(template, 'Product Title,Video URL,Hook,Video Views,Items Sold\n');
  const queuePath = path.join(tempRoot, 'competitive-research-queue.json');
  fs.writeFileSync(queuePath, JSON.stringify({
    listings: [{
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
      packet_dir: packetDir,
      competitor_import_template: template,
      required_columns: ['Product Title', 'Video URL', 'Hook', 'Video Views', 'Items Sold'],
    }],
    rows: [{
      item_id: '398176513526',
      search_query: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black product demo',
    }],
  }, null, 2));
  const resultsPath = path.join(tempRoot, 'automatio-results.csv');
  fs.writeFileSync(resultsPath, [
    'Search Query,Product Title,Video URL,Hook,Video Views,Items Sold',
    '"Double Cat Litter Box Enclosure Cabinet Rattan Doors Black product demo","Double cat cabinet","https://example.com/cat","Hide the box","88K","430"',
  ].join('\n'));

  const result = spawnSync('node', [
    'scripts/run-competitive-research-import-loop.mjs',
    '--queue',
    queuePath,
    '--results',
    resultsPath,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Imported rows: 1/);
  assert.match(result.stdout, /Selected listings: 1/);
  assert.match(fs.readFileSync(template, 'utf8'), /Double cat cabinet,https:\/\/example\.com\/cat,Hide the box,88K,430/);
  const manifestPath = path.join(tempRoot, 'competitive-research-import-loop', 'competitive-research-import-loop-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.ok, true);
  assert.equal(manifest.import_summary.imported_rows, 1);
  assert.equal(manifest.process_summary.selected_count, 1);
  assert.equal(manifest.process_summary.dry_run, true);
  assert.ok(fs.existsSync(manifest.review_board));
  const reviewHtml = fs.readFileSync(manifest.review_board, 'utf8');
  assert.match(reviewHtml, /Competitive Research Import Review/);
  assert.match(reviewHtml, /Double cat cabinet/);
  assert.match(reviewHtml, /Product Match/);
  assert.match(reviewHtml, /planned/);
  const processManifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'competitive-research-import-loop', 'process', 'competitive-research-batch-rerun-manifest.json'), 'utf8'));
  assert.equal(processManifest.results[0].status, 'planned');
  const importManifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'competitive-research-import-loop', 'import', 'competitive-research-import-manifest.json'), 'utf8'));
  assert.equal(importManifest.writes[0].imported_preview_rows[0]['Product Title'], 'Double cat cabinet');
  assert.ok(importManifest.writes[0].imported_preview_rows[0]._review.product_match.score >= 0.2);
});

test('competitive research queue processor selects filled templates', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-research-process-'));
  const filledPacket = path.join(tempRoot, 'packets', '398176513526-cat-cabinet');
  const emptyPacket = path.join(tempRoot, 'packets', '398176413575-socket-set');
  fs.mkdirSync(path.join(filledPacket, 'research'), {recursive: true});
  fs.mkdirSync(path.join(emptyPacket, 'research'), {recursive: true});
  fs.writeFileSync(path.join(filledPacket, 'creative-packet.json'), JSON.stringify({item_id: '398176513526'}, null, 2));
  fs.writeFileSync(path.join(emptyPacket, 'creative-packet.json'), JSON.stringify({item_id: '398176413575'}, null, 2));
  const filledCsv = path.join(filledPacket, 'research', 'competitor-import-template.csv');
  const emptyCsv = path.join(emptyPacket, 'research', 'competitor-import-template.csv');
  fs.writeFileSync(filledCsv, [
    'Product Title,Video URL,Hook,Video Views,Items Sold',
    '"Double cat cabinet","https://example.com/cat","Hide the litter box","88K","430"',
  ].join('\n'));
  fs.writeFileSync(emptyCsv, 'Product Title,Video URL,Hook,Video Views,Items Sold\n');
  const queuePath = path.join(tempRoot, 'competitive-research-queue.json');
  fs.writeFileSync(queuePath, JSON.stringify({
    listings: [
      {
        item_id: '398176513526',
        title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
        packet_dir: filledPacket,
        competitor_import_template: filledCsv,
      },
      {
        item_id: '398176413575',
        title: 'VEVOR 34 Pc Deep Impact Socket Set Metric 8-36mm Case',
        packet_dir: emptyPacket,
        competitor_import_template: emptyCsv,
      },
    ],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/process-competitive-research-queue.mjs',
    '--queue',
    queuePath,
    '--dry-run',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Selected listings: 1/);
  assert.match(result.stdout, /Skipped listings: 1/);
  const manifestPath = path.join(tempRoot, 'competitive-research-batch-rerun', 'competitive-research-batch-rerun-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.selected_count, 1);
  assert.equal(manifest.skipped_count, 1);
  assert.equal(manifest.results[0].status, 'planned');
  assert.match(manifest.results[0].command, /rerun-competitive-research-packet/);
  assert.match(manifest.skipped[0].skip_reason, /no data rows/);
});

test('competitive research queue processor requires trend metrics by default', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-research-process-trend-'));
  const packetDir = path.join(tempRoot, 'packets', '398176513526-cat-cabinet');
  fs.mkdirSync(path.join(packetDir, 'research'), {recursive: true});
  fs.writeFileSync(path.join(packetDir, 'creative-packet.json'), JSON.stringify({item_id: '398176513526'}, null, 2));
  const competitors = path.join(packetDir, 'research', 'competitor-import-template.csv');
  fs.writeFileSync(competitors, [
    'Product Title,Video URL,Hook',
    '"Double cat cabinet","https://example.com/cat","Hide the litter box"',
  ].join('\n'));
  const queuePath = path.join(tempRoot, 'competitive-research-queue.json');
  fs.writeFileSync(queuePath, JSON.stringify({
    listings: [{
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
      packet_dir: packetDir,
      competitor_import_template: competitors,
    }],
  }, null, 2));

  const blocked = spawnSync('node', [
    'scripts/process-competitive-research-queue.mjs',
    '--queue',
    queuePath,
    '--dry-run',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(blocked.status, 0, blocked.stderr);
  let manifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'competitive-research-batch-rerun', 'competitive-research-batch-rerun-manifest.json'), 'utf8'));
  assert.equal(manifest.selected_count, 0);
  assert.equal(manifest.skipped_count, 1);
  assert.match(manifest.skipped[0].skip_reason, /no rows include trend metrics/);

  const override = spawnSync('node', [
    'scripts/process-competitive-research-queue.mjs',
    '--queue',
    queuePath,
    '--dry-run',
    '--allow-no-trend-metrics',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(override.status, 0, override.stderr);
  manifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'competitive-research-batch-rerun', 'competitive-research-batch-rerun-manifest.json'), 'utf8'));
  assert.equal(manifest.selected_count, 1);
  assert.equal(manifest.results[0].status, 'planned');
});

test('competitive research queue processor requires product match by default', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-research-process-match-'));
  const packetDir = path.join(tempRoot, 'packets', '398176513526-cat-cabinet');
  fs.mkdirSync(path.join(packetDir, 'research'), {recursive: true});
  const competitors = path.join(packetDir, 'research', 'competitor-import-template.csv');
  fs.writeFileSync(competitors, [
    'Product Title,Video URL,Hook,Video Views,Items Sold',
    '"Cordless impact drill battery pack","https://example.com/drill","Garage tools are trending","99K","350"',
  ].join('\n'));
  const queuePath = path.join(tempRoot, 'competitive-research-queue.json');
  fs.writeFileSync(queuePath, JSON.stringify({
    listings: [{
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
      packet_dir: packetDir,
      competitor_import_template: competitors,
    }],
  }, null, 2));

  const blocked = spawnSync('node', [
    'scripts/process-competitive-research-queue.mjs',
    '--queue',
    queuePath,
    '--dry-run',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(blocked.status, 0, blocked.stderr);
  let manifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'competitive-research-batch-rerun', 'competitive-research-batch-rerun-manifest.json'), 'utf8'));
  assert.equal(manifest.selected_count, 0);
  assert.equal(manifest.skipped_count, 1);
  assert.match(manifest.skipped[0].skip_reason, /no rows meet product-match threshold/);
  assert.equal(manifest.evaluated[0].validation.max_product_match_score, 0);

  const override = spawnSync('node', [
    'scripts/process-competitive-research-queue.mjs',
    '--queue',
    queuePath,
    '--dry-run',
    '--allow-low-product-match',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(override.status, 0, override.stderr);
  manifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'competitive-research-batch-rerun', 'competitive-research-batch-rerun-manifest.json'), 'utf8'));
  assert.equal(manifest.selected_count, 1);
  assert.equal(manifest.results[0].status, 'planned');
});

test('competitive research queue processor requires structure evidence by default', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-research-process-structure-'));
  const packetDir = path.join(tempRoot, 'packets', '398176513526-cat-cabinet');
  fs.mkdirSync(path.join(packetDir, 'research'), {recursive: true});
  const competitors = path.join(packetDir, 'research', 'competitor-import-template.csv');
  fs.writeFileSync(competitors, [
    'Product Title,Video URL,Video Views,Items Sold',
    '"Double cat cabinet","https://example.com/cat","88K","430"',
  ].join('\n'));
  const queuePath = path.join(tempRoot, 'competitive-research-queue.json');
  fs.writeFileSync(queuePath, JSON.stringify({
    listings: [{
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
      packet_dir: packetDir,
      competitor_import_template: competitors,
    }],
  }, null, 2));

  const blocked = spawnSync('node', [
    'scripts/process-competitive-research-queue.mjs',
    '--queue',
    queuePath,
    '--dry-run',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(blocked.status, 0, blocked.stderr);
  let manifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'competitive-research-batch-rerun', 'competitive-research-batch-rerun-manifest.json'), 'utf8'));
  assert.equal(manifest.selected_count, 0);
  assert.equal(manifest.skipped_count, 1);
  assert.match(manifest.skipped[0].skip_reason, /no rows include structure evidence/);
  assert.equal(manifest.evaluated[0].validation.structure_row_count, 0);

  const override = spawnSync('node', [
    'scripts/process-competitive-research-queue.mjs',
    '--queue',
    queuePath,
    '--dry-run',
    '--allow-weak-structure',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(override.status, 0, override.stderr);
  manifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'competitive-research-batch-rerun', 'competitive-research-batch-rerun-manifest.json'), 'utf8'));
  assert.equal(manifest.selected_count, 1);
  assert.equal(manifest.results[0].status, 'planned');
});

test('competitive premium render collector imports a mapped local mp4', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-collect-plan-'));
  const sourceVideo = path.join(tempRoot, 'source.mp4');
  const ffmpeg = spawnSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=180x320:d=0.5:r=24',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    sourceVideo,
  ], {encoding: 'utf8'});
  if (ffmpeg.status !== 0 || !fs.existsSync(sourceVideo)) {
    t.skip('ffmpeg is required for the collector import smoke test');
    return;
  }

  const projectDir = path.join(tempRoot, 'projects', '398174220620');
  fs.mkdirSync(path.join(projectDir, 'higgsfield-renders'), {recursive: true});
  const expectedClip = path.join(projectDir, 'higgsfield-renders', 'competitive-01-hero.mp4');
  const premiumPlan = path.join(tempRoot, 'competitive-premium-render-plan.json');
  fs.writeFileSync(premiumPlan, JSON.stringify({
    selected: [{
      item_id: '398174220620',
      title: 'Playing Card Rug',
      project_dir: projectDir,
      jobs: [{id: 'competitive-01-hero', output_hint: expectedClip}],
    }],
  }, null, 2));
  const urlMap = path.join(tempRoot, 'render-map.json');
  fs.writeFileSync(urlMap, JSON.stringify({
    '398174220620': {
      'competitive-01-hero': sourceVideo,
    },
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/collect-competitive-premium-renders.mjs',
    '--premium-plan',
    premiumPlan,
    '--url-map',
    urlMap,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Imported: 1/);
  assert.ok(fs.existsSync(expectedClip));
  const manifestPath = path.join(tempRoot, 'competitive-premium-collect-manifest.json');
  assert.ok(fs.existsSync(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.imported_count, 1);
  assert.equal(manifest.failed_count, 0);
  assert.equal(manifest.results[0].probe.has_video, true);
});

test('competitive listing video architect writes product-safe blueprints from competitor CSV', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-intel-'));
  const projectDir = path.join(tempRoot, '398160795273');
  const outDir = path.join(tempRoot, 'intel');
  fs.mkdirSync(projectDir, {recursive: true});
  fs.writeFileSync(path.join(projectDir, 'listing.json'), JSON.stringify({
    item_id: '398160795273',
    title: 'Sony a6700 26MP Mirrorless Camera + E 11mm f/1.8 Lens SmallRig Cage 4K',
    url: 'https://www.ebay.com/itm/398160795273',
    images: [],
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, '01.jpg'), 'fake image placeholder');
  const competitors = path.join(tempRoot, 'kalodata.csv');
  fs.writeFileSync(
    competitors,
    [
      'Product Title,Creator Handle,Video URL,Hook,Caption,Video Views,Items Sold,Total Revenue,Duration Seconds,Shot Breakdown',
      '"Sony camera creator kit","@creator","https://example.com/video","Stop scrolling before you buy a camera kit","Sony creator setup with lens and cage","420000","1200","65000","24","Hook, hero reveal, macro details, creator b-roll, CTA"',
    ].join('\n'),
  );

  const result = spawnSync('node', [
    'scripts/competitive-listing-video-architect.mjs',
    'plan',
    '--project-dir',
    projectDir,
    '--competitors',
    competitors,
    '--out-dir',
    outDir,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const blueprintPath = path.join(outDir, 'creative-blueprint.json');
  assert.ok(fs.existsSync(blueprintPath));
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
  assert.equal(blueprint.compliance_mode, 'structure-inspired-only');
  assert.equal(blueprint.listing.item_id, '398160795273');
  assert.equal(blueprint.selected_reference.hook_pattern, 'pattern interrupt / buyer warning');
  assert.equal(
    blueprint.selected_reference.structure_notes_for_analysis_only.shot_breakdown,
    'Hook, hero reveal, macro details, creator b-roll, CTA',
  );
  assert.equal(blueprint.beats[0].competitor_pattern, 'Hook');
  assert.equal(blueprint.beats[1].competitor_pattern, 'hero reveal');
  assert.equal(blueprint.beats[2].competitor_pattern, 'macro details');
  assert.equal(blueprint.beats[3].competitor_pattern, 'creator b-roll');
  assert.equal(blueprint.beats[4].competitor_pattern, 'CTA');
  assert.deepEqual(
    blueprint.beats.map((beat) => beat.time_seconds),
    [
      {start: 0, end: 4.8},
      {start: 4.8, end: 9.6},
      {start: 9.6, end: 14.4},
      {start: 14.4, end: 19.2},
      {start: 19.2, end: 24},
    ],
  );
  assert.ok(blueprint.product_truth_rules.some((rule) => /Do not use competitor footage/.test(rule)));
});

test('competitive listing video architect preserves Kalodata trend metrics', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-intel-trends-'));
  const projectDir = path.join(tempRoot, '398176413575');
  const outDir = path.join(tempRoot, 'intel');
  fs.mkdirSync(projectDir, {recursive: true});
  fs.writeFileSync(path.join(projectDir, 'listing.json'), JSON.stringify({
    item_id: '398176413575',
    title: 'VEVOR 34 Pc Deep Impact Socket Set Metric 8-36mm Case',
    url: 'https://www.ebay.com/itm/398176413575',
    images: [],
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, '01.jpg'), 'fake image placeholder');
  const competitors = path.join(tempRoot, 'automatio-kalodata.csv');
  fs.writeFileSync(
    competitors,
    [
      'Product Title,Creator Handle,Video URL,Hook,Video Views,Product Units Sold,Product GMV,GMV Growth Rate,Video Likes,Video Comments,Video Shares,Engagement Rate,Posting Date,Duration Seconds,Shot Breakdown,Audio Notes',
      '"VEVOR impact socket set garage tool kit","@garagefinds","https://example.com/socket","Mechanics keep this in the trunk","1.2K","32","US$2.4K","36%","96","14","8","9.8%","2026-07-14","19","Hook, case reveal, socket closeups, wrench use-case, CTA","garage whoosh hits over quiet beat"',
    ].join('\n'),
  );

  const result = spawnSync('node', [
    'scripts/competitive-listing-video-architect.mjs',
    'plan',
    '--project-dir',
    projectDir,
    '--competitors',
    competitors,
    '--out-dir',
    outDir,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const blueprint = JSON.parse(fs.readFileSync(path.join(outDir, 'creative-blueprint.json'), 'utf8'));
  assert.equal(blueprint.selected_reference.metrics.views, 1200);
  assert.equal(blueprint.selected_reference.metrics.sold, 32);
  assert.equal(blueprint.selected_reference.metrics.revenue, 2400);
  assert.equal(blueprint.selected_reference.metrics.likes, 96);
  assert.equal(blueprint.selected_reference.metrics.comments, 14);
  assert.equal(blueprint.selected_reference.metrics.shares, 8);
  assert.equal(blueprint.selected_reference.metrics.engagement_rate, 0.098);
  assert.equal(blueprint.selected_reference.metrics.posted_at, '2026-07-14T00:00:00.000Z');
  assert.ok(blueprint.selected_reference.metrics.trend_score > 0);
  assert.ok(blueprint.selected_reference.metrics.views_per_day > 0);
  assert.equal(blueprint.selected_reference.structure_notes_for_analysis_only.audio_notes, 'garage whoosh hits over quiet beat');
  assert.equal(blueprint.beats[0].imported_audio_note, 'garage whoosh hits over quiet beat');

  const trendReportPath = path.join(outDir, 'competitor-trend-report.json');
  const trendReportMarkdownPath = path.join(outDir, 'competitor-trend-report.md');
  assert.ok(fs.existsSync(trendReportPath));
  assert.ok(fs.existsSync(trendReportMarkdownPath));
  const trendReport = JSON.parse(fs.readFileSync(trendReportPath, 'utf8'));
  assert.equal(trendReport.references_considered, 1);
  assert.match(trendReport.ranked_references[0].trend_reason, /views/);
  assert.match(fs.readFileSync(trendReportMarkdownPath, 'utf8'), /Competitor Trend Report/);
});

test('research-brief Kalodata export columns clear premium research gate', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-research-clear-'));
  const projectDir = path.join(tempRoot, 'projects', '398176513526');
  const outDir = path.join(tempRoot, 'competitive-creative', '398176513526');
  const finalDir = path.join(projectDir, 'final');
  fs.mkdirSync(projectDir, {recursive: true});
  fs.mkdirSync(finalDir, {recursive: true});
  fs.writeFileSync(path.join(projectDir, 'listing.json'), JSON.stringify({
    item_id: '398176513526',
    title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
    url: 'https://www.ebay.com/itm/398176513526',
    images: [{path: path.join(projectDir, '01.jpg')}],
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, '01.jpg'), 'fake image placeholder');
  const competitors = path.join(tempRoot, 'automatio-export.csv');
  fs.writeFileSync(
    competitors,
    [
      'Product Title,Product Category,Shop Name,Creator Handle,Video URL,Video Title,Caption,Hook,Duration Seconds,Video Views,Items Sold,Total Revenue,Revenue Growth Rate,Ad Spend Estimate,Regional Ranking,Shot Breakdown,Audio Notes,Hashtags,Posting Date',
      '"Double cat litter box enclosure rattan cabinet","Pet Furniture","Cat Home Finds","@catspaces","https://example.com/cat-cabinet-video","Hidden litter box cabinet demo","Hide two litter boxes and make the room look cleaner","Your litter box can stop looking like a litter box","21","88K","430","US$38K","42%","US$120","US #18","mess reveal, cabinet hero, door open proof, room styling, CTA","soft house bed, whoosh cuts","#catroom #litterbox #petfurniture","2026-07-14"',
    ].join('\n'),
  );

  const intel = spawnSync('node', [
    'scripts/competitive-listing-video-architect.mjs',
    'plan',
    '--project-dir',
    projectDir,
    '--competitors',
    competitors,
    '--out-dir',
    outDir,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(intel.status, 0, intel.stderr);

  const blueprintPath = path.join(outDir, 'creative-blueprint.json');
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
  assert.equal(blueprint.selected_reference.url, 'https://example.com/cat-cabinet-video');
  assert.ok(blueprint.selected_reference.fit_score > 0);
  assert.equal(blueprint.selected_reference.metrics.sold, 430);
  assert.equal(blueprint.selected_reference.metrics.revenue, 38000);
  assert.ok(blueprint.selected_reference.metrics.trend_score > 0);

  const previewVideo = path.join(finalDir, '398176513526-competitive-preview-ad.mp4');
  const proofFrame = path.join(finalDir, '398176513526-competitive-preview-proof-frame.jpg');
  const renderManifestPath = path.join(finalDir, '398176513526-competitive-preview-manifest.json');
  fs.writeFileSync(previewVideo, 'fake preview video placeholder');
  fs.writeFileSync(proofFrame, 'fake proof frame placeholder');
  fs.writeFileSync(renderManifestPath, JSON.stringify({
    project_dir: projectDir,
    selected_reference: blueprint.selected_reference,
  }, null, 2));
  const previewManifestPath = path.join(tempRoot, 'competitive-preview-render-manifest.json');
  fs.writeFileSync(previewManifestPath, JSON.stringify({
    renders: [{
      ok: true,
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
      blueprint: blueprintPath,
      final_video: previewVideo,
      proof_frame: proofFrame,
      manifest: renderManifestPath,
      selected_reference: blueprint.selected_reference,
    }],
  }, null, 2));

  const prep = spawnSync('node', [
    'scripts/prepare-competitive-premium-renders.mjs',
    '--preview-manifest',
    previewManifestPath,
    '--credit-budget',
    '22.5',
    '--max-jobs-per-listing',
    '1',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(prep.status, 0, prep.stderr);
  const planPath = path.join(tempRoot, 'competitive-premium-render-plan', 'competitive-premium-render-plan.json');
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  assert.equal(plan.selected_count, 1);
  assert.equal(plan.held_count, 0);
  assert.equal(plan.selected[0].reference_quality.status, 'ready');
  assert.ok(fs.existsSync(path.join(projectDir, 'higgsfield', 'competitive-premium-render-jobs.json')));
  assert.ok(fs.existsSync(path.join(projectDir, 'higgsfield', 'render-competitive-premium-shots.sh')));
});

test('competitive listing video architect favors product-matched references over high-view mismatches', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-intel-rug-'));
  const projectDir = path.join(tempRoot, '398174220620');
  const outDir = path.join(tempRoot, 'intel');
  fs.mkdirSync(projectDir, {recursive: true});
  fs.writeFileSync(path.join(projectDir, 'listing.json'), JSON.stringify({
    item_id: '398174220620',
    title: 'Black & White Lucky You Playing Card Hearts Throw carpet, Rectangular 32 x 47',
    url: 'https://www.ebay.com/itm/398174220620',
    images: [],
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, '01.jpg'), 'fake image placeholder');
  const competitors = path.join(tempRoot, 'competitors.csv');
  fs.writeFileSync(
    competitors,
    [
      'Product Title,Creator Handle,Video URL,Hook,Caption,Video Views,Items Sold,Total Revenue,Duration Seconds,Shot Breakdown',
      '"Viral pill bottle home decor hack","@diy","https://example.com/wrong","You will never throw away pill bottles again","Huge home decor DIY transformation","9000000","10000","250000","21","Hook, DIY build, room reveal, CTA"',
      '"Playing card novelty rug room decor","@rugshop","https://example.com/rug","This playing card rug changes the room fast","Black and white rug carpet mat for game room decor","1200","30","1800","18","Hook, rug reveal, room scale, texture closeups, CTA"',
    ].join('\n'),
  );

  const result = spawnSync('node', [
    'scripts/competitive-listing-video-architect.mjs',
    'plan',
    '--project-dir',
    projectDir,
    '--competitors',
    competitors,
    '--out-dir',
    outDir,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const blueprint = JSON.parse(fs.readFileSync(path.join(outDir, 'creative-blueprint.json'), 'utf8'));
  assert.match(blueprint.selected_reference.title, /rug/i);
  assert.equal(blueprint.selected_reference.url, 'https://example.com/rug');
  assert.ok(
    blueprint.ranked_references[0].fit_score > blueprint.ranked_references[1].fit_score,
    'matched rug reference should outrank the high-view mismatch',
  );
});

test('competitive listing video architect keeps per-listing folders in projects-dir mode', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-intel-projects-'));
  const projectsDir = path.join(tempRoot, 'projects');
  const projectDir = path.join(projectsDir, '398176123925');
  const outDir = path.join(tempRoot, 'intel');
  fs.mkdirSync(projectDir, {recursive: true});
  fs.writeFileSync(path.join(projectDir, 'listing.json'), JSON.stringify({
    item_id: '398176123925',
    title: 'VEVOR Wet Dry Vac 2.6 Gallon 2.5 HP Portable Shop Vacuum',
    url: 'https://www.ebay.com/itm/398176123925',
    images: [],
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, '01.jpg'), 'fake image placeholder');

  const result = spawnSync('node', [
    'scripts/competitive-listing-video-architect.mjs',
    'plan',
    '--projects-dir',
    projectsDir,
    '--out-dir',
    outDir,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const blueprintPath = path.join(outDir, '398176123925', 'creative-blueprint.json');
  assert.ok(fs.existsSync(blueprintPath));
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
  const proofBeat = blueprint.beats.find((beat) => beat.beat === 'proof detail');
  assert.deepEqual(proofBeat.source_assets, ['image_1']);
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.listings[0].output_dir, path.join(outDir, '398176123925'));
});

test('competitive voiceover plan exporter writes seller-voice scripts and render commands', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-voiceover-plan-'));
  const projectsDir = path.join(tempRoot, 'projects');
  const projectDir = path.join(projectsDir, '398176513526');
  const blueprintsDir = path.join(tempRoot, 'competitive-creative');
  const itemBlueprintDir = path.join(blueprintsDir, '398176513526');
  const outDir = path.join(tempRoot, 'voiceover-plan');
  fs.mkdirSync(projectDir, {recursive: true});
  fs.mkdirSync(itemBlueprintDir, {recursive: true});
  fs.writeFileSync(path.join(projectDir, 'listing.json'), JSON.stringify({
    item_id: '398176513526',
    title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
    images: [{path: path.join(projectDir, '01.jpg')}],
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, '01.jpg'), 'fake image placeholder');
  fs.writeFileSync(path.join(itemBlueprintDir, 'creative-blueprint.json'), JSON.stringify({
    listing: {
      item_id: '398176513526',
      title: 'Double Cat Litter Box Enclosure Cabinet Rattan Doors Black',
    },
    target_duration_seconds: 16,
    original_script: {
      voiceover_style: 'confident seller voice',
      lines: [
        'Here is the exact cat cabinet from the listing.',
        'Look at the photos, check the details, and use eBay for checkout.',
      ],
    },
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/export-competitive-voiceover-plan.mjs',
    '--blueprints-dir',
    blueprintsDir,
    '--out-dir',
    outDir,
    '--voice-name',
    'jonathan-test-voice',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Competitive voiceover plan/);
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'latest.json'), 'utf8'));
  assert.equal(manifest.listing_count, 1);
  assert.equal(manifest.entries[0].voice_name, 'jonathan-test-voice');
  assert.match(manifest.entries[0].script.text, /exact cat cabinet/);
  assert.match(manifest.entries[0].voiceover_target_path, /voiceover\.mp3$/);
  assert.match(manifest.entries[0].render_command, /--voiceover/);
  assert.ok(fs.existsSync(manifest.entries[0].tts_prompt_file));
  assert.ok(fs.existsSync(path.join(outDir, 'render-voiceover-previews.sh')));
});

test('competitive voiceover plan exporter replaces generic marketplace narration with product pitch', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-voiceover-pitch-'));
  const projectDir = path.join(tempRoot, 'projects', '398172345288');
  const blueprintsDir = path.join(tempRoot, 'competitive-creative');
  const itemBlueprintDir = path.join(blueprintsDir, '398172345288');
  const outDir = path.join(tempRoot, 'voiceover-plan');
  fs.mkdirSync(projectDir, {recursive: true});
  fs.mkdirSync(itemBlueprintDir, {recursive: true});
  fs.writeFileSync(path.join(projectDir, 'listing.json'), JSON.stringify({
    item_id: '398172345288',
    title: '16 in Electric Dethatcher Scarifier 15 Amp Lawn Rake w 14.5 Gal Catch Bag',
    images: [{path: path.join(projectDir, '01.jpg')}],
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, '01.jpg'), 'fake image placeholder');
  fs.writeFileSync(path.join(itemBlueprintDir, 'creative-blueprint.json'), JSON.stringify({
    listing: {
      item_id: '398172345288',
      title: '16 in Electric Dethatcher Scarifier 15 Amp Lawn Rake w 14.5 Gal Catch Bag',
      inferred_category: 'marketplace product',
    },
    target_duration_seconds: 16,
    original_script: {
      lines: [
        'Here is the exact marketplace product item from the listing, shown fast and clearly.',
        'You are seeing the real photos and the real included items, not a stock fantasy version.',
        'Check the closeups, confirm the condition, and use the eBay listing for the final details.',
      ],
    },
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/export-competitive-voiceover-plan.mjs',
    '--blueprints-dir',
    blueprintsDir,
    '--out-dir',
    outDir,
    '--max-words',
    '52',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'latest.json'), 'utf8'));
  assert.match(manifest.entries[0].script.text, /Electric Dethatcher Scarifier/);
  assert.match(manifest.entries[0].script.text, /lawn needs a cleaner reset/);
  assert.doesNotMatch(manifest.entries[0].script.text, /stock fantasy version/);
});

test('eBay main photo candidate generator writes buyer-safe image manifest', {skip: spawnSync('which', ['magick']).status !== 0}, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-main-photo-'));
  const sourceRoot = path.join(tempRoot, 'supplier-video-repairs');
  const imageDir = path.join(sourceRoot, '20260715T000000Z', '398176209386-CJ-CHAIR', 'images');
  const outDir = path.join(tempRoot, 'main-photo-candidates');
  fs.mkdirSync(imageDir, {recursive: true});
  const imagePath = path.join(imageDir, '01.jpg');
  const imageResult = spawnSync('magick', [
    '-size',
    '640x420',
    'xc:white',
    '-fill',
    '#1f6feb',
    '-draw',
    'rectangle 160,90 480,330',
    imagePath,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(imageResult.status, 0, imageResult.stderr);

  const worklist = path.join(tempRoot, 'traffic-optimization-worklist.json');
  fs.writeFileSync(worklist, JSON.stringify({
    rows: [{
      item_id: '398176209386',
      title: 'PU Leather Ergonomic Office Chair Gaming Desk Chair Lumbar Support',
      url: 'https://www.ebay.com/itm/398176209386',
      impressions: 209,
      views: 0,
      ctr: 0,
      sold: 0,
      primary_action: 'main_image_title',
      issue_tags: ['no_sales', 'zero_clicks', 'video_candidate'],
      priority_score: 52,
    }],
  }, null, 2));

  const result = spawnSync('node', [
    'scripts/generate-ebay-main-photo-candidates.mjs',
    '--worklist',
    worklist,
    '--source-root',
    sourceRoot,
    '--out-dir',
    outDir,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Generated: 1/);
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'latest.json'), 'utf8'));
  assert.equal(manifest.generated_count, 1);
  assert.equal(manifest.entries[0].item_id, '398176209386');
  assert.ok(fs.existsSync(manifest.entries[0].main_photo_candidate));
  assert.ok(fs.existsSync(manifest.entries[0].thumbnail_focus_candidate));
  assert.ok(fs.existsSync(manifest.all_contact_sheet));
  assert.match(manifest.purpose, /No text overlays/);
});

test('eBay main photo apply bundle exporter writes no-price-change upload folders', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaptionai-main-photo-apply-'));
  const imagePath = path.join(tempRoot, '398176209386-main-photo-candidate.jpg');
  fs.writeFileSync(imagePath, 'fake jpg placeholder');
  const queuePath = path.join(tempRoot, 'final-main-photo-upload-queue.json');
  fs.writeFileSync(queuePath, JSON.stringify({
    live_apply_blocker: 'Auth required',
    entries: [{
      rank: 1,
      item_id: '398176209386',
      title: 'PU Leather Ergonomic Office Chair Gaming Desk Chair Lumbar Support',
      url: 'https://www.ebay.com/itm/398176209386',
      impressions: 209,
      views: 0,
      ctr: 0,
      final_status: 'ready_for_upload_preview',
      selected_main_photo: imagePath,
      selected_variant: 'standard_candidate',
    }],
  }, null, 2));
  const outDir = path.join(tempRoot, 'apply-bundle');

  const result = spawnSync('node', [
    'scripts/export-ebay-main-photo-apply-bundle.mjs',
    '--queue',
    queuePath,
    '--out-dir',
    outDir,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Ready: 1/);
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'latest.json'), 'utf8'));
  assert.equal(manifest.ready_count, 1);
  assert.equal(manifest.safety.price_changes, false);
  assert.equal(manifest.safety.preserve_existing_gallery, true);
  assert.ok(fs.existsSync(manifest.entries[0].upload_image));
  const payload = JSON.parse(fs.readFileSync(manifest.entries[0].mcp_preview_payload, 'utf8'));
  assert.equal(payload.apply_immediately, false);
  assert.equal(payload.preserve_existing_policies, true);
});
