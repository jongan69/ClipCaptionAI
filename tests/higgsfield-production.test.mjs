import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHiggsfieldProductionPrompt,
  higgsfieldPromptMarker,
  withHiggsfieldProductionPrompt,
} from '../scripts/higgsfield-production.mjs';

test('Higgsfield prompts compile into the shared shot contract', () => {
  const prompt = buildHiggsfieldProductionPrompt({
    prompt: 'A fit woman walks past the camera on a park path.',
    purpose: 'Create a native fitness hook.',
    durationSeconds: 3,
    aspectRatio: '9:16',
    subjectLock: 'Use the approved fitness avatar in the same black athleisure.',
  });

  assert.ok(prompt.startsWith(higgsfieldPromptMarker));
  assert.match(prompt, /PURPOSE\nCreate a native fitness hook\./);
  assert.match(prompt, /DELIVERY\n3s, 9:16/);
  assert.match(prompt, /GLOBAL LOCK/);
  assert.match(prompt, /SHOT INSTRUCTION/);
  assert.match(prompt, /CONTINUITY IN/);
  assert.match(prompt, /CONTINUITY OUT/);
  assert.match(prompt, /PHYSICAL REQUIREMENTS/);
  assert.match(prompt, /AUDIO REQUIREMENTS/);
  assert.match(prompt, /AVOID/);
  assert.equal(buildHiggsfieldProductionPrompt({prompt}), prompt);
});

test('Higgsfield argv compilation is safe, immutable, and format-aware', () => {
  const argv = [
    'generate',
    'create',
    '--prompt',
    'Side-angle walking shot.',
    '--duration',
    '4',
    '--aspect_ratio',
    '9:16',
  ];
  const compiled = withHiggsfieldProductionPrompt(argv);

  assert.deepEqual(argv.slice(0, 4), [
    'generate',
    'create',
    '--prompt',
    'Side-angle walking shot.',
  ]);
  assert.notEqual(compiled, argv);
  assert.match(compiled[3], /^CLIPCAPTION HIGGSFIELD SHOT v1/);
  assert.match(compiled[3], /DELIVERY\n4s, 9:16/);
  assert.deepEqual(compiled.slice(4), argv.slice(4));
  assert.throws(
    () => withHiggsfieldProductionPrompt(['generate', 'create', '--prompt']),
    /requires a value/,
  );
});

test('prompt options support equals syntax and reject ambiguous or missing values', () => {
  const compiled = withHiggsfieldProductionPrompt([
    'generate',
    'create',
    '--prompt=Walking shot.',
    '--duration=4',
    '--aspect-ratio=9:16',
  ]);
  assert.match(compiled[2], /^--prompt=CLIPCAPTION HIGGSFIELD SHOT v1/);
  assert.match(compiled[2], /DELIVERY\n4s, 9:16/);
  for (const argv of [
    ['--prompt', '--duration', '4'],
    ['--prompt='],
    ['--prompt', 'First shot', '--prompt=Second shot'],
  ])
    assert.throws(() => withHiggsfieldProductionPrompt(argv), /prompt/i);
});

test('optional blank locks retain production defaults and empty prompts fail', () => {
  assert.throws(() => buildHiggsfieldProductionPrompt(), /non-empty prompt/);
  assert.throws(() => buildHiggsfieldProductionPrompt({prompt: '  '}), /non-empty prompt/);
  const prompt = buildHiggsfieldProductionPrompt({prompt: 'Walking shot.', subjectLock: '  '});
  assert.match(prompt, /Subject\/product: Preserve the exact/);
  const argv = ['generate', 'cost', 'model'];
  assert.deepEqual(withHiggsfieldProductionPrompt(argv), argv);
});
