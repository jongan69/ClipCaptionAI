#!/usr/bin/env bun
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {slugify} from './clipkit-lib.mjs';
import {ensureDir, loadEnv, parseArgs, requireArg} from './lib.mjs';
import {writeJsonAtomic} from './platform/jobs.mjs';

loadEnv();
const action = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const usage = `Usage:
  clipcaptionai stock doctor
  clipcaptionai stock search --query <text> [--count N]
  clipcaptionai stock download --query <text> --out <directory> [--count N]`;
if (action === '--help' || action === '-h' || args.help || args.h) {
  console.log(usage);
  process.exit(0);
}
const licenseUrl = 'https://www.pexels.com/license/';
const docsUrl = 'https://www.pexels.com/api/documentation/';
const providerUrl = 'https://www.pexels.com/';
const baseUrl = String(process.env.CCA_PEXELS_API_BASE_URL || 'https://api.pexels.com/v1').replace(
  /\/$/,
  '',
);
const print = (value) => console.log(JSON.stringify(value));

const positiveInteger = (value, fallback, maximum) => {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum)
    throw new Error(`Expected an integer from 1 to ${maximum}.`);
  return parsed;
};

const requireKey = () => {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error(`PEXELS_API_KEY is required. Request one at ${docsUrl}`);
  return key;
};

const search = async () => {
  const query = String(requireArg(args, 'query')).trim();
  if (!query || query.length > 200)
    throw new Error('Stock query must contain 1 to 200 characters.');
  const count = positiveInteger(args.count, 10, 20);
  const minWidth = positiveInteger(args['min-width'], 1080, 20_000);
  const minHeight = positiveInteger(args['min-height'], 1920, 20_000);
  const url = new URL(`${baseUrl}/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'portrait');
  url.searchParams.set('size', 'large');
  url.searchParams.set('per_page', String(Math.min(80, Math.max(count, 15))));
  const response = await fetch(url, {headers: {Authorization: requireKey()}});
  if (!response.ok) throw new Error(`Pexels search failed with HTTP ${response.status}.`);
  const payload = await response.json();
  const photos = Array.isArray(payload.photos) ? payload.photos : [];
  const results = photos
    .filter(
      (photo) =>
        Number(photo.width) >= minWidth &&
        Number(photo.height) >= minHeight &&
        photo.url &&
        photo.photographer,
    )
    .slice(0, count)
    .map((photo) => ({
      id: String(photo.id),
      width: Number(photo.width),
      height: Number(photo.height),
      alt: String(photo.alt || ''),
      creator: String(photo.photographer || 'Unknown'),
      creatorUrl: photo.photographer_url ? String(photo.photographer_url) : undefined,
      sourceUrl: String(photo.url),
      licenseUrl,
      imageUrl: String(photo.src?.original || photo.src?.large2x || photo.src?.portrait || ''),
    }))
    .filter((photo) => photo.imageUrl);
  if (results.length === 0)
    throw new Error(`No portrait Pexels images met ${minWidth}x${minHeight} for: ${query}`);
  return {provider: 'pexels', providerUrl, query, orientation: 'portrait', size: 'large', results};
};

const assertDownloadUrl = (value) => {
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    throw new Error('Stock image downloads require HTTPS.');
  return url;
};

const download = async () => {
  const found = await search();
  const output = path.resolve(requireArg(args, 'out'));
  ensureDir(output);
  const files = [];
  for (const [index, photo] of found.results.entries()) {
    const response = await fetch(assertDownloadUrl(photo.imageUrl));
    if (!response.ok) throw new Error(`Stock image download failed with HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.startsWith('image/'))
      throw new Error(`Stock download returned ${contentType} instead of an image.`);
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > 50_000_000) throw new Error('Stock image exceeds the 50 MB safety limit.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 50_000_000)
      throw new Error('Stock image is empty or exceeds the 50 MB safety limit.');
    const target = path.join(
      output,
      `${String(index + 1).padStart(2, '0')}-${slugify(found.query, 'stock')}-${photo.id}.jpg`,
    );
    const temporary = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, target);
    files.push({
      ...photo,
      path: target,
      hash: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
  }
  const manifest = path.join(output, 'stock-manifest.json');
  writeJsonAtomic(manifest, {
    schemaVersion: 1,
    provider: found.provider,
    providerUrl,
    query: found.query,
    downloadedAt: new Date().toISOString(),
    docsUrl,
    licenseUrl,
    files,
  });
  return {manifest, files};
};

if (action === 'doctor')
  print({
    ok: true,
    provider: 'pexels',
    providerUrl,
    configured: Boolean(process.env.PEXELS_API_KEY),
    defaults: {orientation: 'portrait', size: 'large', minWidth: 1080, minHeight: 1920},
    docsUrl,
    licenseUrl,
  });
else if (action === 'search') print(await search());
else if (action === 'download') print(await download());
else throw new Error(`Unknown stock action: ${action || ''}`);
