import assert from 'node:assert/strict';
import test from 'node:test';

import {sanitizeLogText} from '../desktop/worker/progress.mjs';

test('progress logs redact structured and unstructured credentials', () => {
  const raw = JSON.stringify({
    token: 'provider-secret-value',
    apiKey: 'another-provider-secret',
  });
  const sanitized = sanitizeLogText(
    `${raw} password=plain-secret Bearer abcdefghijklmnopqrstuv`,
  );

  assert.equal(sanitized.includes('provider-secret-value'), false);
  assert.equal(sanitized.includes('another-provider-secret'), false);
  assert.equal(sanitized.includes('plain-secret'), false);
  assert.equal(sanitized.includes('abcdefghijklmnopqrstuv'), false);
  assert.match(sanitized, /"token":"\[redacted\]"/);
  assert.match(sanitized, /"apiKey":"\[redacted\]"/);
});
