#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import {
  loadEnv,
  parseArgs,
  probeVideo,
  readCaptions,
  requireArg,
} from './lib.mjs';
import {researchPopCultureScenes} from './lib-pop-culture-scenes.mjs';

const usage = `
Usage:
  npm run scene:research-pop-culture -- --scene-plan clip.scene-plan.json [options]

Options:
  --scene-plan FILE    Existing *.scene-plan.json to research.
  --captions FILE      Captions file. Defaults to captionsPath inside the scene plan.
  --out FILE           Output JSON path. Default: next to scene plan as *.pop-culture-scenes.json.
  --model ID           OpenAI model. Default: gpt-4.1.
  --candidates N       Candidate scenes per segment, 5-10. Default: 8.
  --json-only          Do not write the companion Markdown report.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

loadEnv();

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required. Add it to .env or your shell.');
}

const scenePlanPath = path.resolve(requireArg(args, 'scene-plan', usage));
const scenePlan = JSON.parse(fs.readFileSync(scenePlanPath, 'utf8'));
const captionsPath = args.captions
  ? path.resolve(String(args.captions))
  : scenePlan.captionsPath
    ? path.resolve(String(scenePlan.captionsPath))
    : null;

if (!captionsPath || !fs.existsSync(captionsPath)) {
  throw new Error('A captions file is required. Pass --captions or use a scene plan with captionsPath.');
}

const insertions = Array.isArray(scenePlan.insertions) ? scenePlan.insertions : [];
if (insertions.length === 0) {
  throw new Error(`No insertions found in ${scenePlanPath}`);
}

const outputPath = args.out
  ? path.resolve(String(args.out))
  : scenePlanPath.replace(/\.scene-plan\.json$/i, '.pop-culture-scenes.json');

const sourceVideo = scenePlan.sourceVideo && fs.existsSync(scenePlan.sourceVideo)
  ? scenePlan.sourceVideo
  : null;

const result = await researchPopCultureScenes({
  client: new OpenAI(),
  model: String(args.model ?? 'gpt-4.1'),
  insertions,
  captions: readCaptions(captionsPath),
  selectionClip: scenePlan.selectionClip ?? null,
  clipMetadata: sourceVideo ? probeVideo(sourceVideo) : null,
  outputPath,
  candidatesPerSegment: Number(args.candidates ?? 8),
  writeMarkdown: !args['json-only'],
});

console.log(`Pop culture research written to: ${result.jsonPath}`);
if (result.markdownPath) {
  console.log(`Markdown report written to: ${result.markdownPath}`);
}
