import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildBrollCaptionArgs,
  mergeStyleConfig,
  slugify,
  timestampSlug,
} from '../scripts/clipkit-lib.mjs';

test('slugify normalizes human titles into safe slugs', () => {
  assert.equal(slugify('How I Manifested Getting Rich At 20'), 'how-i-manifested-getting-rich-at-20');
  assert.equal(slugify('***', 'fallback'), 'fallback');
});

test('timestampSlug formats dates into a stable sortable slug', () => {
  const date = new Date(2026, 6, 6, 1, 23, 45);
  assert.equal(timestampSlug(date), '2026-07-06-01-23-45');
});

test('mergeStyleConfig overlays overrides on top of the base style', () => {
  const merged = mergeStyleConfig(
    {position: 'left-hook', textOpacity: 0.6, effectLayerEnabled: true},
    {position: 'center-impact', effectLayerEnabled: false},
  );

  assert.deepEqual(merged, {
    position: 'center-impact',
    textOpacity: 0.6,
    effectLayerEnabled: false,
  });
});

test('buildBrollCaptionArgs applies workflow defaults without stomping explicit user flags', () => {
  const projectRoot = '/tmp/ClipCaptionAI';
  const args = buildBrollCaptionArgs({
    projectRoot,
    args: ['--vertical', '--sound-effects'],
    maxClips: '4',
    paddingSeconds: '3',
  });

  assert.ok(args.includes('--vertical'));
  assert.ok(args.includes('--sound-effects'));
  assert.ok(!args.includes('--vertical-contain'));
  assert.ok(!args.includes('--disable-sound-effects'));
  assert.equal(args[args.indexOf('--scene-library') + 1], path.join(projectRoot, 'custom-scenes-library'));
  assert.equal(args[args.indexOf('--max-clips') + 1], '4');
  assert.equal(args[args.indexOf('--padding-seconds') + 1], '3');
});

test('buildBrollCaptionArgs falls back to conservative defaults when no explicit overrides are present', () => {
  const projectRoot = '/tmp/ClipCaptionAI';
  const args = buildBrollCaptionArgs({
    projectRoot,
    args: [],
  });

  assert.ok(args.includes('--disable-sound-effects'));
  assert.ok(args.includes('--vertical-contain'));
  assert.ok(args.includes('--context-scenes'));
  assert.ok(args.includes('--local-scenes-only'));
});
