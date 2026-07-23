#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fal} from '@fal-ai/client';
import {ensureDir, loadEnv, outputsRoot, parseArgs} from './lib.mjs';
import {timestampSlug} from './clipkit-lib.mjs';
import {downloadRemoteFile, uploadImageReference} from './fal-provider-utils.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const usage = `
Usage:
  npm run fal:image-edit -- --image approved-source.jpg --prompt "Replace only the background with a studio sweep" --approved-for-generated-marketing

Options:
  --image FILE_OR_HTTPS_URL  Source image. Repeat the flag for multiple references.
  --prompt TEXT              Required edit instruction.
  --mask FILE_OR_HTTPS_URL   Optional black/white mask; white pixels may change.
  --quality LEVEL            low, medium, or high. Default: medium.
  --output FILE              Default: outputs/fal/image-edit-<timestamp>/edited.png.
  --approved-for-generated-marketing
                              Required acknowledgement: output is for reviewed marketing/B-roll,
                              not an eBay source-of-truth or main listing image.
  --dry-run                  Validate local inputs and print the provider request without calling fal.

Requires FAL_KEY in .env or the environment. This local CLI only runs in Node;
the key is not sent to Electron's renderer or saved in its generation manifest.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const valuesFor = (key) => process.argv.slice(2).flatMap((value, index, all) => value === `--${key}` && all[index + 1] && !all[index + 1].startsWith('--') ? [all[index + 1]] : []);
const prompt = String(args.prompt ?? '').trim();
const images = valuesFor('image');
if (!prompt) throw new Error(`Missing --prompt.\n${usage}`);
if (!images.length) throw new Error(`Provide at least one --image.\n${usage}`);
if (args['approved-for-generated-marketing'] !== true) {
  throw new Error('Refusing to run without --approved-for-generated-marketing. Generated assets must not be used as source-of-truth or eBay main listing images.');
}
loadEnv();
if (!process.env.FAL_KEY && args['dry-run'] !== true) throw new Error('FAL_KEY is required in .env or the environment.');

const quality = String(args.quality ?? 'medium');
if (!['low', 'medium', 'high'].includes(quality)) throw new Error('--quality must be low, medium, or high.');
const outDir = path.resolve(args.output ? path.dirname(String(args.output)) : path.join(outputsRoot, 'fal', `image-edit-${timestampSlug()}`));
const output = path.resolve(args.output ?? path.join(outDir, 'edited.png'));
const manifestPath = path.join(path.dirname(output), `${path.parse(output).name}.generation.json`);

if (args['dry-run'] === true) {
  const sources = images.map((source) => {
    if (/^https:\/\//i.test(source)) return {source, remote: true};
    const resolved = path.resolve(source);
    return {source: resolved, remote: false, exists: fs.existsSync(resolved)};
  });
  console.log(JSON.stringify({provider: 'fal', model: 'openai/gpt-image-2/edit', prompt, quality, sources, output, dry_run: true}, null, 2));
  process.exit(0);
}

const references = await Promise.all(images.map(uploadImageReference));
const mask = args.mask ? await uploadImageReference(args.mask) : null;
const result = await fal.subscribe('openai/gpt-image-2/edit', {
  input: {
    prompt,
    image_urls: references.map((entry) => entry.reference_url),
    ...(mask ? {mask_image_url: mask.reference_url} : {}),
    image_size: 'auto',
    quality,
    num_images: 1,
    output_format: 'png',
  },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === 'IN_PROGRESS') update.logs.forEach((log) => console.log(log.message));
  },
});
const generated = result.data?.images?.[0];
if (!generated?.url) throw new Error('fal returned no edited image URL.');
ensureDir(path.dirname(output));
const downloaded = await downloadRemoteFile(generated.url, output);
fs.writeFileSync(manifestPath, `${JSON.stringify({
  created_at: new Date().toISOString(),
  script: scriptName,
  provider: 'fal',
  model: 'openai/gpt-image-2/edit',
  request_id: result.requestId,
  prompt,
  quality,
  approved_for_generated_marketing: true,
  source_images: references,
  mask_image: mask,
  generated_url: generated.url,
  output,
  output_sha256: downloaded.sha256,
  output_bytes: downloaded.bytes,
  qa_status: 'pending_human_review',
  prohibited_use: 'Not an eBay source-of-truth or main listing image.',
}, null, 2)}\n`);
console.log(`fal edited image written to ${output}`);
console.log(`Human review is required before use. Manifest: ${manifestPath}`);
