#!/usr/bin/env node
/**
 * render-all.mjs — Step 5: batch-render every brand x variant composition.
 *
 *   npm run logo:render                      # everything
 *   npm run logo:render -- --slug listingos  # one brand
 *   npm run logo:render -- --format webm     # transparent background
 *
 * Composition ids come from src/logo/registry.ts and follow Logo-<slug>-<variant>.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const arg = (flag, fallback = null) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const onlySlug = arg('--slug');
const format = arg('--format', 'mp4');
const outRoot = arg('--out', path.join('outputs', 'logo-animations'));

// Ask Remotion for the composition list rather than duplicating the registry here.
const raw = execFileSync(
  'npx',
  ['remotion', 'compositions', 'src/index.tsx', '--quiet'],
  {encoding: 'utf8'}
);

const ids = (raw.match(/\S+/g) ?? [])
  .filter((id) => id && id.startsWith('Logo-'))
  .filter((id) => (onlySlug ? id.startsWith(`Logo-${onlySlug}-`) : true));

if (!ids.length) {
  console.error(
    `No logo compositions found${onlySlug ? ` for slug "${onlySlug}"` : ''}.\n` +
      `Check that the brand and its variants are registered in src/logo/registry.ts.`
  );
  process.exit(1);
}

fs.mkdirSync(outRoot, {recursive: true});
console.log(`Rendering ${ids.length} composition(s) to ${outRoot}/\n`);

const failed = [];
for (const id of ids) {
  const out = path.join(outRoot, `${id}.${format}`);
  process.stdout.write(`  ${id} ... `);
  try {
    execFileSync(
      'npx',
      [
        'remotion',
        'render',
        'src/index.tsx',
        id,
        out,
        ...(format === 'webm' ? ['--codec', 'vp8', '--pixel-format', 'yuva420p'] : []),
        '--log',
        'error',
      ],
      {stdio: ['ignore', 'ignore', 'inherit']}
    );
    console.log('ok');
  } catch {
    console.log('FAILED');
    failed.push(id);
  }
}

console.log(`\nDone. ${ids.length - failed.length}/${ids.length} rendered.`);
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}
