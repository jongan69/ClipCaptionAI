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
import {prepareRendererHtml} from './renderer-html.mjs';
import path from 'node:path';

const htmlPath = path.resolve(import.meta.dirname, '..', 'dist-renderer', 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.log('No built HTML found, skipping.');
  process.exit(0);
}

const html = prepareRendererHtml(fs.readFileSync(htmlPath, 'utf8'));

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✅ Fixed HTML for Electron file:// loading (crossorigin, module, CSP)');
