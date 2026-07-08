import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildThoughtUnits,
  buildViralScorecard,
  buildBrollCaptionArgs,
  mergeStyleConfig,
  snapSelectionToThoughtBoundaries,
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

test('buildThoughtUnits prefers transcription segments and merges short adjacent fragments into fuller thoughts', () => {
  const plan = buildThoughtUnits({
    transcription: {
      segments: [
        {start: 0, end: 1.2, text: 'This is'},
        {start: 1.25, end: 2.4, text: 'one full thought'},
        {start: 3.4, end: 4.1, text: 'And this lands.'},
      ],
    },
  });

  assert.equal(plan.source, 'transcription.segments');
  assert.equal(plan.units.length, 2);
  assert.deepEqual(plan.units[0], {
    startSeconds: 0,
    endSeconds: 2.4,
    text: 'This is one full thought',
  });
});

test('snapSelectionToThoughtBoundaries expands a clip to nearby speaking boundaries', () => {
  const snapped = snapSelectionToThoughtBoundaries({
    startSeconds: 11.4,
    endSeconds: 21.1,
    durationSeconds: 30,
    thoughtUnits: [
      {startSeconds: 9.8, endSeconds: 14.2, text: 'First sentence.'},
      {startSeconds: 14.3, endSeconds: 22.6, text: 'Second sentence lands here.'},
    ],
    lookaroundSeconds: 4,
  });

  assert.deepEqual(snapped, {
    startSeconds: 9.8,
    endSeconds: 22.6,
    adjusted: true,
    source: {
      start: 'thought-start',
      end: 'thought-end',
    },
  });
});

test('buildViralScorecard explains why a moment was flagged', () => {
  const scorecard = buildViralScorecard({
    title: 'How I went from rock bottom to my dream life',
    hook: 'How do I make money when I move abroad?',
    reason: 'Strong practical advice with identity and emotional payoff.',
    highlightWords: ['money', 'abroad', 'dream'],
    score: 8.7,
    selectedStartSeconds: 12,
    selectedEndSeconds: 43,
    thoughtBoundaryAdjusted: true,
    thoughtBoundaryAlignment: {start: 'thought-start', end: 'thought-end'},
  });

  assert.equal(scorecard.overall, 87);
  assert.ok(scorecard.hookStrength >= 80);
  assert.ok(scorecard.thoughtCompleteness >= 95);
  assert.ok(scorecard.strongestSignals.length > 0);
  assert.match(scorecard.explanation, /Flagged for/);
});
