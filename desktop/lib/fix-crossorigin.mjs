#!/usr/bin/env node
/**
 * Post-build: Prepare HTML for Electron file:// loading.
 *
 * - Strips crossorigin attributes (breaks file:// CORS)
 * - Strips type="module" from script tags (we build IIFE)
 * - Injects a strict CSP meta (defense-in-depth for the privileged
 *   IPC bridge; the renderer never needs to reach the network —
 *   all API traffic happens in spawned CLI child processes)
 */
import fs from 'node:fs';
import path from 'node:path';

const htmlPath = path.resolve(import.meta.dirname, '..', 'dist-renderer', 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.log('No built HTML found, skipping.');
  process.exit(0);
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

let html = fs.readFileSync(htmlPath, 'utf8');

// Remove crossorigin from all script/link tags
html = html.replace(/ crossorigin(?:="[^"]*")?/g, '');
// Remove type="module" — we build IIFE for file:// compat
html = html.replace(/ type="module"/g, '');
// Replace any existing CSP meta with ours
html = html.replace(/<meta[^>]*Content-Security-Policy[^>]*\/?>/g, '');
html = html.replace(
  '</head>',
  `  <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n  </head>`,
);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✅ Fixed HTML for Electron file:// loading (crossorigin, module, CSP)');
