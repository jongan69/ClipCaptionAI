#!/usr/bin/env node
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureDir, loadEnv, outputsRoot, parseArgs} from './lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
loadEnv();
const usage = `
Usage:
  npm run voiceover:library -- --budget 36000
  npm run voiceover:library -- --resume --budget 36000

Options:
  --budget N               Maximum planned characters. Default: 36000.
  --reserve N              Safety reserve below the account limit. Default: 2000.
  --out-dir DIR            Default: outputs/voiceover/elevenlabs-library.
  --model ID               Default: eleven_multilingual_v2.
  --output-format FORMAT   Default: mp3_44100_128.
  --resume                 Skip clips whose audio and manifest already exist.
  --dry-run                Show the planned library and estimated character cost.
  --max-clips N            Generate at most N clips after planning.

Requires ELEVENLABS_API_KEY in .env or the environment. The key is never
written to output files or printed.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const numeric = (value, fallback) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid numeric value: ${value}`);
  return parsed;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const voices = [
  ['jon', process.env.ELEVENLABS_VOICE_ID, 'configured cloned voice'],
  ['bella', 'hpp4J3VqNfWAUOO0d1Us', 'professional bright warm'],
  ['roger', 'CwhRBWXzGAHq8TQ4Fs17', 'laid-back casual resonant'],
  ['sarah', 'EXAVITQu4vr4xnSDxMaL', 'mature reassuring confident'],
  ['laura', 'FGY2WhTYpPnrIDTdsKH5', 'enthusiastic social creator'],
  ['charlie', 'IKne3meq5aSn9XLyUdCD', 'deep confident energetic'],
  ['liam', 'TX3LPaxmHKxFdv7VOQHJ', 'energetic social creator'],
  ['alice', 'Xb7hH8MSUJpSbSDYk0k2', 'clear engaging educator'],
  ['eric', 'cjVigY5qzO86Huf0OWal', 'smooth trustworthy'],
  ['george', 'JBFqnCBsd6RMkjVDRZzb', 'warm captivating storyteller'],
  ['callum', 'N2lVS1w4EtoT3dr4eOWO', 'husky character voice'],
  ['river', 'SAz9YHcvj6GT2YYXdXww', 'relaxed neutral informative'],
  ['harry', 'SOYHLrjzK2X1ezoPC6cr', 'fierce character voice'],
  ['matilda', 'XrExE9yKIg1WjnnlVkGX', 'knowledgeable professional'],
  ['will', 'bIHbv24MWmeRgasZH58o', 'relaxed optimist'],
  ['jessica', 'cgSgspJ2msm6clMCkdW9', 'playful bright warm'],
  ['brian', 'nPczCjzI2devNBz1zQrb', 'deep resonant comforting'],
  ['daniel', 'onwK4e9ZLuTAKqWW03F9', 'steady broadcaster'],
  ['lily', 'pFZP5JQG7iQjIQuC4Bku', 'velvety actress'],
  ['adam', 'pNInz6obpgDQGcFmaJgB', 'dominant firm'],
  ['bill', 'pqHfZKP75CvOlQylNhV4', 'wise mature balanced'],
].filter(([, voiceId]) => clean(voiceId));

// These are intentionally complete, reusable spoken assets rather than one long ad.
// Each phrase can be cut into a hook, explainer, transition, or CTA in a future edit.
const phrases = [
  ['hook', 'Meet ClipCaptionAI, the command-line video editor built for creative teams and AI models.'],
  ['hook', 'Start with a brief, a folder of approved assets, and a clear outcome. ClipCaptionAI turns that direction into a video run.'],
  ['hook', 'Your next product video should not begin with a blank timeline. It should begin with a plan you can inspect.'],
  ['hook', 'From idea to finished cut, ClipCaptionAI keeps the creative brief, assets, render, and quality checks connected.'],
  ['workflow', 'Plan a run before spending provider credits. Review the shots, sources, prompts, framing, and export settings first.'],
  ['workflow', 'The model can direct the workflow, while the CLI keeps every decision explicit, reproducible, and easy to resume.'],
  ['workflow', 'A run manifest records what was requested, what was rendered, which files were used, and what passed technical QA.'],
  ['workflow', 'Use dry-run mode to validate paths, providers, and output settings before an external generation call begins.'],
  ['workflow', 'Resume an existing run instead of starting over. The manifest is the handoff point between planning, rendering, and review.'],
  ['feature', 'Bring your own footage, product photos, logos, captions, music, sound effects, and approved B-roll into one composition.'],
  ['feature', 'Generate clean vertical, horizontal, or contained layouts from versioned configuration instead of editing source code.'],
  ['feature', 'Choose shot recipes, caption styles, audio presets, and export settings that match the channel you are publishing to.'],
  ['feature', 'Add narration as a real audio input, mix it above a music bed, and verify that the final file is not silently broken.'],
  ['feature', 'Use local assets for reliable demos, then add OpenAI, ElevenLabs, or fal generation when the brief calls for it.'],
  ['feature', 'The renderer stays deterministic, so a model can make creative choices without losing control of the final export.'],
  ['feature', 'Every successful run produces a final artifact, a manifest, hashes, media metadata, and a machine-readable QA result.'],
  ['feature', 'The desktop app is optional and thin. The CLI is the production surface that works for people, scripts, and coding agents.'],
  ['captions', 'Captions are part of the composition, not an afterthought. Keep the message readable, paced, and safe inside the frame.'],
  ['captions', 'Use a clear headline for the hook, supporting copy for the proof, and a concise call to action at the end.'],
  ['captions', 'A good caption survives muted playback. A good voiceover adds rhythm, context, and confidence without fighting the visuals.'],
  ['broll', 'Show the work as it happens: the brief becomes a plan, the plan becomes a render, and the render becomes a checked deliverable.'],
  ['broll', 'Use interface captures, product details, source footage, and workflow cards to make the benefit visible in seconds.'],
  ['broll', 'B-roll should prove the product promise. Show inputs, decisions, transformations, and the final result instead of decorative noise.'],
  ['quality', 'Before you ship, check that the file exists, the duration is valid, the dimensions are correct, the codec is supported, and the audio is present.'],
  ['quality', 'Technical QA catches black screens, missing audio, wrong framing, broken paths, and incomplete renders before your audience does.'],
  ['quality', 'A passing manifest is evidence about this artifact and this run. It does not pretend that an unverified provider completed work remotely.'],
  ['quality', 'Keep secrets in the environment. Keep prompts, model IDs, request IDs, hashes, and QA state in the non-secret manifest.'],
  ['cta', 'ClipCaptionAI. Prompt it, render it, inspect it, and ship the cut.'],
  ['cta', 'Turn the next creative brief into a video you can actually review. Try ClipCaptionAI today.'],
  ['cta', 'Stop losing the story between the prompt and the export. Keep the whole run in one place with ClipCaptionAI.'],
  ['cta', 'Build once, review clearly, and reuse the assets that work. ClipCaptionAI is your model-facing video production CLI.'],
  ['cta', 'When the brief is ready, the next step is simple: plan the run, render the cut, and let QA tell you what shipped.'],
];

const apiKey = clean(process.env.ELEVENLABS_API_KEY);
const budget = numeric(args.budget, 36000);
const reserve = numeric(args.reserve, 2000);
const modelId = clean(args.model ?? 'eleven_multilingual_v2');
const outputFormat = clean(args['output-format'] ?? 'mp3_44100_128');
const outDir = path.resolve(args['out-dir'] ?? path.join(outputsRoot, 'voiceover', 'elevenlabs-library'));
const indexPath = path.join(outDir, 'library.json');
const resume = args.resume === true;

if (!voices.length) throw new Error('No ElevenLabs voices configured. Set ELEVENLABS_VOICE_ID in .env.');
const planned = [];
for (const [voiceKey, voiceId, voiceDescription] of voices) {
  for (const [index, [category, text]] of phrases.entries()) {
    const id = `${String(index + 1).padStart(2, '0')}-${category}-${voiceKey}`;
    const audio = path.join(outDir, voiceKey, `${id}.mp3`);
    planned.push({id, category, voice_key: voiceKey, voice_id: voiceId, voice_description: voiceDescription, text, text_characters: text.length, audio});
  }
}
const maxClips = args['max-clips'] === undefined ? planned.length : Math.floor(numeric(args['max-clips'], planned.length));
const selected = planned.slice(0, maxClips);
const pending = resume
  ? selected.filter((item) => {
    const manifestPath = item.audio.replace(/\\.mp3$/i, '.generation.json');
    return !(fs.existsSync(item.audio) && fs.existsSync(manifestPath));
  })
  : selected;
// eleven_multilingual_v2 currently reports a character cost near 0.5x raw text
// for this account. Keep a conservative ceil per clip, while recording the
// authoritative provider cost in each generation manifest.
const estimated = pending.reduce((sum, item) => sum + Math.ceil(item.text_characters * 0.5), 0);
if (estimated > budget) throw new Error(`Planned text costs ${estimated} characters, above --budget ${budget}. Reduce --max-clips or increase the budget.`);

if (args['dry-run'] === true) {
  console.log(JSON.stringify({provider: 'elevenlabs', model_id: modelId, output_format: outputFormat, voices: voices.map(([key, id, description]) => ({key, voice_id: id, description})), clips: selected.length, pending_clips: pending.length, estimated_characters: estimated, budget, reserve, output_directory: outDir, dry_run: true}, null, 2));
  process.exit(0);
}
if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required in .env or the environment.');
ensureDir(outDir);

const subscriptionResponse = await fetch('https://api.elevenlabs.io/v1/user/subscription', {headers: {'xi-api-key': apiKey}});
if (!subscriptionResponse.ok) throw new Error(`Could not read ElevenLabs subscription (${subscriptionResponse.status}).`);
const subscription = await subscriptionResponse.json();
const remaining = Math.max(0, Number(subscription.character_limit ?? 0) - Number(subscription.character_count ?? 0));
if (estimated > Math.max(0, remaining - reserve)) {
  throw new Error(`Planned text costs ${estimated} characters, but only ${remaining} remain after the ${reserve}-character safety reserve.`);
}

const existing = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : null;
const entries = new Map((existing?.entries ?? []).map((entry) => [entry.id, entry]));
const failures = [];
for (const [position, item] of selected.entries()) {
  const manifestPath = item.audio.replace(/\.mp3$/i, '.generation.json');
  if (resume && fs.existsSync(item.audio) && fs.existsSync(manifestPath)) continue;
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(item.voice_id)}?output_format=${encodeURIComponent(outputFormat)}`;
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await fetch(endpoint, {method: 'POST', headers: {'content-type': 'application/json', 'xi-api-key': apiKey}, body: JSON.stringify({text: item.text, model_id: modelId})});
    if (response.ok || ![408, 409, 429, 500, 502, 503, 504].includes(response.status) || attempt === 3) break;
    await sleep(1500 * attempt);
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    failures.push({id: item.id, status: response.status, detail});
    console.error(`Failed ${position + 1}/${selected.length}: ${item.id} (${response.status})`);
    continue;
  }
  const audioBuffer = Buffer.from(await response.arrayBuffer());
  if (!audioBuffer.length) throw new Error(`ElevenLabs returned empty audio for ${item.id}.`);
  ensureDir(path.dirname(item.audio));
  fs.writeFileSync(item.audio, audioBuffer);
  const entry = {...item, model_id: modelId, output_format: outputFormat, text_sha256: sha256(item.text), audio_sha256: sha256(audioBuffer), audio_bytes: audioBuffer.length, character_cost: Number(response.headers.get('character-cost') ?? item.text_characters), request_id: response.headers.get('request-id'), created_at: new Date().toISOString(), manifest: manifestPath};
  fs.writeFileSync(manifestPath, `${JSON.stringify({provider: 'elevenlabs', script: scriptName, ...entry}, null, 2)}\n`);
  entries.set(item.id, entry);
  fs.writeFileSync(indexPath, `${JSON.stringify({provider: 'elevenlabs', model_id: modelId, output_format: outputFormat, generated_at: new Date().toISOString(), entries: [...entries.values()], failures}, null, 2)}\n`);
  console.error(`Generated ${position + 1}/${selected.length}: ${item.id}`);
  await sleep(250);
}

const finalEntries = [...entries.values()];
const totalTextCharacters = selected.reduce((sum, item) => sum + item.text_characters, 0);
const totalBilledCharacters = finalEntries.reduce((sum, entry) => sum + Number(entry.character_cost ?? entry.text_characters), 0);
fs.writeFileSync(indexPath, `${JSON.stringify({provider: 'elevenlabs', model_id: modelId, output_format: outputFormat, generated_at: new Date().toISOString(), planned_clips: selected.length, planned_text_characters: totalTextCharacters, estimated_billable_characters: estimated, generated_clips: finalEntries.length, generated_billable_characters: totalBilledCharacters, failures, entries: finalEntries}, null, 2)}\n`);
console.log(JSON.stringify({provider: 'elevenlabs', output_directory: outDir, index: indexPath, planned_clips: selected.length, generated_clips: finalEntries.length, planned_text_characters: totalTextCharacters, generated_billable_characters: totalBilledCharacters, failures: failures.length, remaining_before_run: remaining}, null, 2));
