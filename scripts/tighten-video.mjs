#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {
  ensureDir,
  formatTimestamp,
  loadEnv,
  outputsRoot,
  parseArgs,
  probeVideo,
  requireArg,
  run,
  splitVideoSegment,
} from './lib.mjs';
import {resolveProvider, createClient, resolveModel, chatCompletion} from './ai-provider.mjs';

const usage = `
Usage:
  npm run tighten:auto -- --video input.mp4 [options]

Detects filler words, repetitive sections, and tangents in a conversation
video, then optionally produces a tightened edit with those sections removed.

Options:
  --out FILE              Output cuts JSON. Default: outputs/tighten/<slug>.cuts.json
  --tighten               Generate a tightened video with filler/repetition removed.
  --tighten-out FILE      Path for the tightened video. Default: outputs/tighten/<slug>.tightened.mp4
  --model ID              Model for filler detection. Default: provider-specific.
  --provider ID           LLM provider: deepseek or openai. Default: auto-detect.
  --aggressiveness LEVEL  How aggressively to cut: light, medium, or heavy. Default: medium.
                            light: only clear filler words and dead air
                            medium: filler, repetition, and obvious tangents
                            heavy: any non-essential content, tight edit
  --min-gap-seconds N     Minimum silence/filler gap to flag. Default: 2.0
  --language LANG         Spoken language. Default: en
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

loadEnv();

const video = path.resolve(requireArg(args, 'video', usage));
const aggressiveness = String(args.aggressiveness ?? 'medium').toLowerCase();
const minGapSeconds = Math.max(1.0, Number(args['min-gap-seconds'] ?? 2.0));
const language = String(args.language ?? 'en');
const shouldTighten = Boolean(args.tighten);

if (!['light', 'medium', 'heavy'].includes(aggressiveness)) {
  throw new Error('--aggressiveness must be light, medium, or heavy.');
}

// ── Resolve provider ──────────────────────────────────────────────────

const resolved = resolveProvider({provider: args.provider});
const tightenModel = resolveModel({
  resolved,
  model: args.model,
  envModelKey: 'OPENAI_TIGHTEN_MODEL',
});

// ── Setup output dirs ─────────────────────────────────────────────────

const videoMeta = probeVideo(video);
const safeBase = path
  .basename(video, path.extname(video))
  .replace(/[^a-z0-9._-]+/gi, '_')
  .slice(0, 90);
const tightenDir = path.join(outputsRoot, 'tighten');
const workDir = path.join(tightenDir, 'work');
const defaultOut = path.join(tightenDir, `${safeBase}.cuts.json`);
const outPath = args.out ? path.resolve(String(args.out)) : defaultOut;
const defaultTightenOut = path.join(tightenDir, `${safeBase}.tightened.mp4`);
const tightenOut = args['tighten-out']
  ? path.resolve(String(args['tighten-out']))
  : defaultTightenOut;

ensureDir(tightenDir);
ensureDir(workDir);

// ── Step 1: Transcribe ────────────────────────────────────────────────

const transcriptPath = path.join(workDir, `${safeBase}.transcript.json`);

if (!fs.existsSync(transcriptPath)) {
  console.log('Transcribing video...');
  const transcribeArgs = ['run', 'transcribe', '--', '--video', video, '--out', transcriptPath];
  if (args.language) {
    transcribeArgs.push('--language', String(args.language));
  }
  run('npm', transcribeArgs);
} else {
  console.log(`Using existing transcript: ${transcriptPath}`);
}

const transcriptBundle = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
const captions = Array.isArray(transcriptBundle.captions) ? transcriptBundle.captions : [];
const transcriptEnhancement =
  transcriptBundle.analysis?.textEnhancement &&
  Array.isArray(transcriptBundle.analysis.textEnhancement.chunks)
    ? transcriptBundle.analysis.textEnhancement
    : null;

// ── Step 2: Build transcript chunks with timestamps ───────────────────

const wordRows = captions.map((caption) => ({
  start: Math.round(caption.startMs / 100) / 10,
  end: Math.round(caption.endMs / 100) / 10,
  text: String(caption.text ?? '').trim(),
}));

const chunkSize = 30;
const chunks = transcriptEnhancement
  ? transcriptEnhancement.chunks.map(
      (chunk) =>
        `[${Number(chunk.startSeconds ?? 0).toFixed(1)}-${Number(chunk.endSeconds ?? 0).toFixed(1)}] ${String(
          chunk.correctedText ?? chunk.rawText ?? '',
        ).trim()}`,
    )
  : (() => {
      const fallbackChunks = [];
      for (let index = 0; index < wordRows.length; index += chunkSize) {
        const slice = wordRows.slice(index, index + chunkSize);
        if (slice.length === 0) continue;
        fallbackChunks.push(
          `[${slice[0].start.toFixed(1)}-${slice.at(-1).end.toFixed(1)}] ${slice
            .map((w) => w.text)
            .join(' ')}`,
        );
      }
      return fallbackChunks;
    })();

// ── Step 3: AI filler/repetition detection ────────────────────────────

const aggressivenessProfiles = {
  light:
    'Cut only clear filler words (um, uh, er, ah), repeated stuttering, dead air, and false starts. Keep ALL content, tangents, and conversational asides. Only remove what is clearly non-content.',
  medium:
    'Cut filler words, dead air, clear repetition of the same point, and obvious tangents that do not advance the conversation. Keep related anecdotes and natural conversational flow. A typical podcast edit level.',
  heavy:
    'Cut filler, repetition, tangents, wordiness, and any non-essential content. Keep only the strongest, clearest version of each point. Produce a tight, high-density edit suitable for short-form content.',
};

const jsonExample = `{
  "cuts": [
    {
      "startSeconds": 12.5,
      "endSeconds": 16.0,
      "reason": "filler",
      "description": "Um, uh filler and dead air between thoughts"
    },
    {
      "startSeconds": 45.0,
      "endSeconds": 58.0,
      "reason": "repetition",
      "description": "Repeats the same point about morning routine from 30s-42s"
    },
    {
      "startSeconds": 120.0,
      "endSeconds": 135.0,
      "reason": "tangent",
      "description": "Off-topic discussion about weather that doesn't connect to main thread"
    }
  ]
}`;

const systemPrompt = `You are a professional video editor specializing in conversation and podcast tightening. Your job is to analyze a transcript and identify sections that should be cut to produce a cleaner, tighter edit.

Aggressiveness level: ${aggressiveness.toUpperCase()}
${aggressivenessProfiles[aggressiveness]}

What to flag:
- filler: Filler words (um, uh, er, ah, like, you know, I mean), stuttering, false starts, dead air
- repetition: The same point, story, or idea expressed multiple times — keep the strongest version, flag the rest
- tangent: Off-topic discussion that doesn't connect to the main conversation thread
- wordiness: Overly long explanations that could be said in fewer words (heavy mode only)

Rules:
- Cuts MUST be at least ${minGapSeconds.toFixed(1)} seconds long.
- Cuts must NOT overlap — keep them separated by at least 1 second.
- Do NOT cut the first 10 seconds or last 10 seconds of the video.
- Do NOT flag natural conversational flow as filler. A thoughtful pause or "I think..." is not filler.
- Do NOT cut the only instance of an important point. If a point is made only once, keep it.
- For repetition, always identify which section is the STRONGER version and flag the weaker one.
- Return ONLY a valid JSON object with the structure shown below.

Return ONLY a valid JSON object with this structure:
${jsonExample}`;

const userPrompt = `Video duration: ${videoMeta.durationSeconds.toFixed(1)} seconds
Language: ${language}
Aggressiveness: ${aggressiveness}
Minimum cut length: ${minGapSeconds}s

Analyze this transcript and identify sections to cut for a tighter edit.

Transcript:
${chunks.join('\n')}`;

let rawCuts = [];
let usedModel;

if (!resolved.config) {
  console.warn('No DEEPSEEK_API_KEY or OPENAI_API_KEY found. No cuts will be suggested.');
  usedModel = 'none';
} else {
  const client = createClient(resolved);

  try {
    console.log(
      `Analyzing transcript for filler/repetition with ${resolved.config.label} (${tightenModel}) at "${aggressiveness}" aggressiveness...`,
    );

    const jsonText = await chatCompletion(client, {
      model: tightenModel,
      systemPrompt,
      userPrompt,
      jsonMode: true,
      temperature: 0.3,
    });

    const parsed = JSON.parse(jsonText);
    rawCuts = Array.isArray(parsed.cuts) ? parsed.cuts : [];
    usedModel = `${resolved.provider}:${tightenModel}`;
  } catch (error) {
    console.warn(
      `Filler detection failed: ${error?.message ?? error?.code ?? 'unknown error'}. No cuts will be suggested.`,
    );
    usedModel = 'error';
  }
}

// ── Step 4: Validate and normalize cuts ────────────────────────────────

const isValidCut = (cut) =>
  Number.isFinite(Number(cut.startSeconds)) &&
  Number.isFinite(Number(cut.endSeconds)) &&
  Number(cut.startSeconds) >= 10 &&
  Number(cut.endSeconds) <= videoMeta.durationSeconds - 10 &&
  Number(cut.endSeconds) - Number(cut.startSeconds) >= minGapSeconds;

const normalizeCut = (cut, index) => ({
  index: index + 1,
  startSeconds: Math.round(Number(cut.startSeconds) * 10) / 10,
  endSeconds: Math.round(Number(cut.endSeconds) * 10) / 10,
  durationSeconds: Math.round((Number(cut.endSeconds) - Number(cut.startSeconds)) * 10) / 10,
  reason: ['filler', 'repetition', 'tangent', 'wordiness'].includes(
    String(cut.reason ?? '').toLowerCase(),
  )
    ? String(cut.reason).toLowerCase()
    : 'filler',
  description: String(cut.description ?? 'No description provided.').slice(0, 200),
});

let cuts = rawCuts.filter(isValidCut).map(normalizeCut);

// Deduplicate overlapping cuts (merge or pick longer)
cuts.sort((a, b) => a.startSeconds - b.startSeconds);
const deduped = [];
for (const cut of cuts) {
  const prev = deduped.at(-1);
  if (prev && cut.startSeconds < prev.endSeconds) {
    // Merge overlapping
    prev.endSeconds = Math.max(prev.endSeconds, cut.endSeconds);
    prev.durationSeconds = Math.round((prev.endSeconds - prev.startSeconds) * 10) / 10;
    prev.reason = prev.reason === cut.reason ? prev.reason : 'mixed';
    prev.description += '; ' + cut.description;
  } else {
    deduped.push({...cut});
  }
}
cuts = deduped;

// ── Step 5: Calculate kept segments ───────────────────────────────────

const keptSegments = [];
let cursor = 0;

for (const cut of cuts) {
  if (cut.startSeconds > cursor + 0.5) {
    keptSegments.push({
      startSeconds: Math.round(cursor * 10) / 10,
      endSeconds: cut.startSeconds,
      durationSeconds: Math.round((cut.startSeconds - cursor) * 10) / 10,
    });
  }
  cursor = cut.endSeconds;
}

// Final segment to end
if (cursor < videoMeta.durationSeconds - 0.5) {
  keptSegments.push({
    startSeconds: Math.round(cursor * 10) / 10,
    endSeconds: Math.round(videoMeta.durationSeconds * 10) / 10,
    durationSeconds: Math.round((videoMeta.durationSeconds - cursor) * 10) / 10,
  });
}

const totalCutSeconds = cuts.reduce((sum, c) => sum + c.durationSeconds, 0);
const keptDuration = Math.round((videoMeta.durationSeconds - totalCutSeconds) * 10) / 10;

// ── Step 6: Write cuts JSON ───────────────────────────────────────────

const output = {
  sourceVideo: video,
  originalDuration: videoMeta.durationSeconds,
  model: usedModel,
  provider: resolved.provider ?? 'none',
  aggressiveness,
  cutCount: cuts.length,
  totalCutSeconds: Math.round(totalCutSeconds * 10) / 10,
  keptDuration,
  timeSaved: formatTimestamp(totalCutSeconds),
  cuts,
  keptSegments,
};

fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  `\nFound ${cuts.length} sections to cut (${formatTimestamp(totalCutSeconds)} removed, ${formatTimestamp(keptDuration)} kept)`,
);
console.log(`Cuts written to: ${outPath}`);

if (cuts.length > 0) {
  console.log('\nSuggested cuts:');
  for (const cut of cuts) {
    console.log(
      `  ${formatTimestamp(cut.startSeconds)}-${formatTimestamp(cut.endSeconds)} [${cut.reason}] ${cut.description}`,
    );
  }
} else {
  console.log('  No cuts identified — the conversation looks tight already.');
}

// ── Step 7: Generate tightened video (optional) ───────────────────────

if (shouldTighten && keptSegments.length > 0) {
  console.log(`\nGenerating tightened video...`);

  // Write ffmpeg concat file
  const concatPath = path.join(workDir, `${safeBase}.concat.txt`);
  const concatLines = [];
  const segmentDir = path.join(workDir, `${safeBase}-segments`);
  ensureDir(segmentDir);

  // Extract each kept segment
  for (const [index, seg] of keptSegments.entries()) {
    const segPath = path.join(segmentDir, `${String(index).padStart(3, '0')}.mp4`);
    splitVideoSegment(video, seg.startSeconds, seg.durationSeconds, segPath);
    concatLines.push(`file '${segPath}'`);
  }

  fs.writeFileSync(concatPath, concatLines.join('\n') + '\n');

  // Concat all segments
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatPath,
      '-c',
      'copy',
      tightenOut,
    ],
    {stdio: 'inherit'},
  );

  output.tightenedVideo = tightenOut;
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Tightened video: ${tightenOut}`);
}

console.log('\nDone.');
