#!/usr/bin/env node
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureDir, loadEnv, outputsRoot, parseArgs} from './lib.mjs';
import {timestampSlug} from './clipkit-lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  npm run voiceover:elevenlabs -- --script narration.txt --voice-id VOICE_ID
  npm run voiceover:elevenlabs -- --text "A short narration." --voice-id VOICE_ID --output outputs/demo/narration.mp3

Options:
  --script FILE            UTF-8 narration text file.
  --text TEXT              Inline narration text. Use --script for longer copy.
  --voice-id ID            ElevenLabs voice ID. Defaults to ELEVENLABS_VOICE_ID.
  --model ID               Default: eleven_multilingual_v2.
  --output FILE            Default: outputs/voiceover/elevenlabs-<timestamp>/voiceover.mp3.
  --output-format FORMAT   Default: mp3_44100_128.
  --dry-run                Print the request plan without calling ElevenLabs.

Requires ELEVENLABS_API_KEY in .env or the environment. The key is never
accepted as a command argument, written to a manifest, or exposed to Electron.
Writes the audio file and a non-secret generation manifest beside it.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const requireValue = (value, label) => {
  const resolved = cleanText(value);
  if (!resolved) throw new Error(`Missing ${label}.\n${usage}`);
  return resolved;
};

loadEnv();
const text = args.script
  ? cleanText(fs.readFileSync(path.resolve(String(args.script)), 'utf8'))
  : cleanText(args.text);
const voiceId = cleanText(args['voice-id'] ?? process.env.ELEVENLABS_VOICE_ID);
const modelId = cleanText(args.model ?? 'eleven_multilingual_v2');
const outputFormat = cleanText(args['output-format'] ?? 'mp3_44100_128');
const apiKey = cleanText(process.env.ELEVENLABS_API_KEY);

requireValue(text, '--script or --text');
requireValue(voiceId, '--voice-id or ELEVENLABS_VOICE_ID');

const outDir = path.resolve(
  args.output
    ? path.dirname(String(args.output))
    : path.join(outputsRoot, 'voiceover', `elevenlabs-${timestampSlug()}`),
);
const output = path.resolve(args.output ?? path.join(outDir, 'voiceover.mp3'));
const manifestPath = path.join(path.dirname(output), `${path.parse(output).name}.generation.json`);
const requestPlan = {
  provider: 'elevenlabs',
  model_id: modelId,
  voice_id: voiceId,
  output_format: outputFormat,
  text_sha256: sha256(text),
  text_characters: text.length,
  output,
};

if (args['dry-run'] === true) {
  console.log(JSON.stringify({...requestPlan, dry_run: true}, null, 2));
  process.exit(0);
}

if (!apiKey) {
  throw new Error('ELEVENLABS_API_KEY is required in .env or the environment.');
}

const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'xi-api-key': apiKey,
  },
  body: JSON.stringify({text, model_id: modelId}),
});

if (!response.ok) {
  const detail = (await response.text()).slice(0, 1000);
  throw new Error(`ElevenLabs voice generation failed (${response.status}): ${detail}`);
}

const audio = Buffer.from(await response.arrayBuffer());
if (!audio.length) throw new Error('ElevenLabs returned an empty audio response.');
ensureDir(path.dirname(output));
fs.writeFileSync(output, audio);
fs.writeFileSync(manifestPath, `${JSON.stringify({
  ...requestPlan,
  created_at: new Date().toISOString(),
  script: scriptName,
  audio_sha256: sha256(audio),
  audio_bytes: audio.length,
  character_cost: response.headers.get('character-cost'),
  request_id: response.headers.get('request-id'),
}, null, 2)}\n`);

console.log(`ElevenLabs voiceover written to ${output}`);
console.log(`Generation manifest written to ${manifestPath}`);
