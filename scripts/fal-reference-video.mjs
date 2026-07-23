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
  npm run fal:reference-video -- --image approved-product.jpg --prompt "Slow orbit around the exact supplied item; preserve labels, finish, and included accessories" --approved-for-generated-marketing

Options:
  --image FILE_OR_HTTPS_URL  One to three approved reference images. Repeat for each image.
  --prompt TEXT              Required animation instruction.
  --duration SECONDS         Default: 5. Must be 1-8.
  --resolution RESOLUTION    Default: 1080p. Allowed: 720p, 1080p.
  --output FILE              Default: outputs/fal/reference-video-<timestamp>/proof.mp4.
  --approved-for-generated-marketing
                              Required acknowledgement: output is a reviewed marketing/B-roll proof,
                              not evidence of actual product condition or included accessories.
  --dry-run                  Validate inputs and print the planned muted proof job without calling fal.

Requires FAL_KEY in .env or the environment. The request always disables native
audio and writes a manifest with source hashes, request ID, output hash, and QA status.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const valuesFor = (key) => process.argv.slice(2).flatMap((value, index, all) => value === `--${key}` && all[index + 1] && !all[index + 1].startsWith('--') ? [all[index + 1]] : []);
const prompt = String(args.prompt ?? '').trim();
const images = valuesFor('image');
if (!prompt) throw new Error(`Missing --prompt.\n${usage}`);
if (images.length < 1 || images.length > 3) throw new Error('Provide one to three --image values.');
if (args['approved-for-generated-marketing'] !== true) {
  throw new Error('Refusing to run without --approved-for-generated-marketing. Generated video cannot be product-condition evidence.');
}
const duration = Number(args.duration ?? 5);
if (!Number.isInteger(duration) || duration < 1 || duration > 8) throw new Error('--duration must be an integer from 1 to 8.');
const resolution = String(args.resolution ?? '1080p');
if (!['720p', '1080p'].includes(resolution)) throw new Error('--resolution must be 720p or 1080p.');
loadEnv();
if (!process.env.FAL_KEY && args['dry-run'] !== true) throw new Error('FAL_KEY is required in .env or the environment.');

const outDir = path.resolve(args.output ? path.dirname(String(args.output)) : path.join(outputsRoot, 'fal', `reference-video-${timestampSlug()}`));
const output = path.resolve(args.output ?? path.join(outDir, 'proof.mp4'));
const manifestPath = path.join(path.dirname(output), `${path.parse(output).name}.generation.json`);
if (args['dry-run'] === true) {
  console.log(JSON.stringify({provider: 'fal', model: 'fal-ai/veo3.1/reference-to-video', prompt, duration, resolution, generate_audio: false, images, output, dry_run: true}, null, 2));
  process.exit(0);
}

const references = await Promise.all(images.map(uploadImageReference));
const result = await fal.subscribe('fal-ai/veo3.1/reference-to-video', {
  input: {
    prompt,
    image_urls: references.map((entry) => entry.reference_url),
    duration: `${duration}s`,
    resolution,
    generate_audio: false,
  },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === 'IN_PROGRESS') update.logs.forEach((log) => console.log(log.message));
  },
});
const generated = result.data?.video;
if (!generated?.url) throw new Error('fal returned no generated video URL.');
ensureDir(path.dirname(output));
const downloaded = await downloadRemoteFile(generated.url, output);
fs.writeFileSync(manifestPath, `${JSON.stringify({
  created_at: new Date().toISOString(),
  script: scriptName,
  provider: 'fal',
  model: 'fal-ai/veo3.1/reference-to-video',
  request_id: result.requestId,
  prompt,
  duration_seconds: duration,
  resolution,
  generate_audio: false,
  approved_for_generated_marketing: true,
  source_images: references,
  generated_url: generated.url,
  output,
  output_sha256: downloaded.sha256,
  output_bytes: downloaded.bytes,
  qa_status: 'pending_human_review',
  prohibited_use: 'Not evidence of actual product condition, labels, or included accessories.',
}, null, 2)}\n`);
console.log(`fal reference-video proof written to ${output}`);
console.log(`Human product-truth QA is required before use. Manifest: ${manifestPath}`);
