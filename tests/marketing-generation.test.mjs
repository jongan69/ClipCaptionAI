import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  artifactMatchesFile,
  generationAssetsReady,
  generationKey,
  parseSubmissionResult,
} from '../scripts/marketing/generation.mjs';

test('provider responses preserve job objects and reject ambiguous payloads', () => {
  assert.deepEqual(parseSubmissionResult(''), {submitted: true});
  assert.deepEqual(parseSubmissionResult('Progress\n{"id":"job"}\n'), {id: 'job'});
  for (const value of ['garbage', 'null', '[]', '"job"', 'true', '1']) {
    assert.throws(() => parseSubmissionResult(value), /SUBMISSION_UNCERTAIN/);
  }
});

test('generation readiness binds the intent, capability, variant, and real file hash', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cca-generation-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'footage.mp4');
  fs.writeFileSync(file, 'footage');
  const intent = {type: 'generation', prompt: 'Walk'};
  const variant = {id: 'vertical', intents: [intent]};
  const asset = {
    type: 'generated',
    path: file,
    hash: crypto.createHash('sha256').update('footage').digest('hex'),
    provenance: {variantId: variant.id, generationKey: generationKey(intent, 'capability')},
  };
  assert.equal(artifactMatchesFile(asset), true);
  assert.equal(generationAssetsReady(variant, [asset], 'capability'), true);
  assert.equal(
    generationAssetsReady({...variant, intents: [{type: 'source'}]}, [], 'capability'),
    true,
  );
  assert.equal(generationAssetsReady(variant, [], 'capability'), false);
  assert.equal(generationAssetsReady(variant, [asset], 'changed-capability'), false);
  assert.equal(generationAssetsReady({...variant, id: 'different'}, [asset], 'capability'), false);
  assert.equal(generationAssetsReady(variant, [{...asset, type: 'final'}], 'capability'), false);
  assert.equal(
    generationAssetsReady(
      {...variant, intents: [{...intent, prompt: 'Run'}]},
      [asset],
      'capability',
    ),
    false,
  );
  fs.writeFileSync(file, 'changed');
  assert.equal(generationAssetsReady(variant, [asset], 'capability'), false);
  fs.rmSync(file);
  assert.equal(artifactMatchesFile(asset), false);
});
