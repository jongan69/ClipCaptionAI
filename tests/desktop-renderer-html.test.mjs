import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareRendererHtml} from '../desktop/lib/renderer-html.mjs';

test('production renderer defers mounting and enforces CSP before script loading', () => {
  const html = prepareRendererHtml(
    '<html><head><script type="module" crossorigin src="./app.js"></script></head><body><div id="root"></div></body></html>',
  );
  assert.match(html, /<script defer src="\.\/app.js">/);
  assert.doesNotMatch(html, /crossorigin|type="module"/);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
  assert.match(html, /script-src 'self'/);
  assert.equal(prepareRendererHtml(html), html);
});
