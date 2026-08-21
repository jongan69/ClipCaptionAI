#!/usr/bin/env bun
/**
 * Interview Q&A Detection
 *
 * Takes a transcribed video and uses AI to identify speaker turns,
 * questions, and answers — slicing the interview into discrete Q&A clips.
 *
 * Usage:
 *   bun scripts/interview-qa.mjs --video video.mp4 [--captions captions.json]
 *
 * Output: Writes outputs/interview-qa/<slug>.qa-segments.json
 */

import {
  ensureDir,
  loadEnv,
  outputsRoot,
  parseArgs,
  probeVideo,
  readCaptions,
  requireArg,
} from './lib.mjs';
import {slugify} from './clipkit-lib.mjs';
import {
  resolveProvider,
  prepareProvider,
  createClient,
  resolveModel,
  chatCompletion,
} from './ai-provider.mjs';
import fs from 'node:fs';
import path from 'node:path';

const usage = `
Usage: bun scripts/interview-qa.mjs --video <path> [options]

Options:
  --video <path>          Input video file (required)
  --captions <path>       Pre-existing captions JSON (auto-transcribes if omitted)
  --provider <id>         AI provider: deepseek or openai (default: auto-detect)
  --model <name>          Override the AI model
  --min-segment-seconds   Minimum Q&A segment duration (default: 5)
  --max-segments          Maximum Q&A segments to detect (default: 20)
  --out <path>            Output JSON path
  --dry-run               Analyze without writing output
  --help, -h              Show this help
`.trim();

// ── Helpers ──────────────────────────────────────────────────────

function resolveTranscriptSource(videoPath, args) {
  if (args.captions && fs.existsSync(args.captions)) {
    return {type: 'provided', path: args.captions};
  }

  // Auto-discover captions from standard output location
  const slug = slugify(path.parse(videoPath).name);
  const standardPath = path.join(outputsRoot, 'transcriptions', `${slug}.captions.json`);
  if (fs.existsSync(standardPath)) {
    return {type: 'discovered', path: standardPath};
  }

  return null;
}

// ── AI Prompt ────────────────────────────────────────────────────

function buildQAPrompt(captions, durationSeconds, maxSegments) {
  const transcriptText = captions
    .map((c) => `[${formatTimestamp(c.startMs / 1000)}] ${c.text}`)
    .join('\n');

  return {
    systemPrompt: `You are an expert video editor specializing in interview content. Your task is to analyze interview transcripts and identify Question & Answer pairs suitable for short-form video clips.

RULES:
1. Identify clear question-answer pairs where a question is asked and a substantive answer follows.
2. Mark who is speaking — label the questioner as "Interviewer" and answerer as "Guest" by default. If you detect names or roles from context, use those.
3. Each Q&A pair must be a self-contained segment that makes sense on its own.
4. Skip greetings, small talk, technical setup, and filler exchanges.
5. A good Q&A clip has: a clear question, a compelling/insightful answer, and is between 15-90 seconds.
6. Return at most ${maxSegments} segments, ordered by how interesting/valuable they are.
7. Timestamps must be in seconds, derived from the transcript timestamps.
8. If the transcript has clear speaker labels (e.g., "Speaker 1:", "Interviewer:"), preserve them.

OUTPUT: Valid JSON object with this exact shape:
{
  "sourceVideo": "filename",
  "durationSeconds": number,
  "segmentCount": number,
  "segments": [
    {
      "index": 1,
      "question": "The question text",
      "answer": "The answer text",
      "speakerQ": "Interviewer",
      "speakerA": "Guest",
      "startSeconds": number,
      "endSeconds": number,
      "durationSeconds": number,
      "confidence": 0.0-1.0
    }
  ]
}`,

    userPrompt: `Analyze this interview transcript and extract the best Q&A segments for short-form video clips.

VIDEO DURATION: ${Math.round(durationSeconds)} seconds (${formatTimestamp(durationSeconds)})
MAX SEGMENTS: ${maxSegments}

TRANSCRIPT:
${transcriptText.slice(0, 15000)}

Return ONLY the JSON object — no markdown, no explanation.`,
  };
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Validation ──────────────────────────────────────────────────

function validateQASegments(parsed, durationSeconds, maxSegments) {
  if (!parsed || !Array.isArray(parsed.segments)) {
    throw new Error('AI response missing segments array');
  }

  const segments = parsed.segments
    .filter((s) => s.startSeconds >= 0 && s.endSeconds <= durationSeconds + 1)
    .filter((s) => s.endSeconds - s.startSeconds >= 3) // Min 3 seconds
    .slice(0, maxSegments)
    .map((s, i) => ({
      index: i + 1,
      question: String(s.question || '').trim(),
      answer: String(s.answer || '').trim(),
      speakerQ: String(s.speakerQ || 'Interviewer').trim(),
      speakerA: String(s.speakerA || 'Guest').trim(),
      startSeconds: Number(s.startSeconds),
      endSeconds: Number(s.endSeconds),
      durationSeconds: Number(s.durationSeconds || s.endSeconds - s.startSeconds),
      confidence: Number(s.confidence ?? 0.5),
    }));

  if (segments.length === 0) {
    // Fallback: time-based even splits
    const splitCount = Math.min(maxSegments, Math.floor(durationSeconds / 30));
    const splitDuration = durationSeconds / splitCount;
    return Array.from({length: splitCount}, (_, i) => ({
      index: i + 1,
      question: `Segment ${i + 1}`,
      answer: `Content from ${formatTimestamp(i * splitDuration)} to ${formatTimestamp((i + 1) * splitDuration)}`,
      speakerQ: 'Speaker A',
      speakerA: 'Speaker B',
      startSeconds: Math.round(i * splitDuration * 10) / 10,
      endSeconds: Math.round((i + 1) * splitDuration * 10) / 10,
      durationSeconds: Math.round(splitDuration * 10) / 10,
      confidence: 0.3,
    }));
  }

  return segments;
}

// ── Main ────────────────────────────────────────────────────────

async function runInterviewQA(options = {}, context = {}) {
  const args = {
    video: options.video,
    captions: options.captions,
    minSegmentSeconds: Number(options.minSegmentSeconds || options['min-segment-seconds']) || 5,
    maxSegments: Number(options.maxSegments || options['max-segments']) || 20,
    out: options.out,
    provider: options.provider,
    model: options.model,
    dryRun: options.dryRun || options['dry-run'],
  };

  const videoPath = path.resolve(args.video);
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const videoName = path.parse(videoPath).name;
  const slug = slugify(videoName);
  const outDir = path.join(outputsRoot, 'interview-qa');
  ensureDir(outDir);

  const outPath = args.out || path.join(outDir, `${slug}.qa-segments.json`);

  // Probe video for duration
  let durationSeconds;
  try {
    const probe = probeVideo(videoPath);
    durationSeconds = probe.durationSeconds;
    if (context.onProgress) {
      context.onProgress({
        stage: 'Probe',
        percent: 5,
        message: `Video: ${Math.round(durationSeconds)}s`,
      });
    }
  } catch {
    durationSeconds = 300; // Fallback assumption
  }

  // Get transcript
  const transcriptSource = resolveTranscriptSource(videoPath, args);
  if (!transcriptSource) {
    throw new Error(
      'No captions found. Transcribe the video first:\n' +
        `  bun scripts/transcribe-openai.mjs --video "${videoPath}"`,
    );
  }

  const captions = readCaptions(transcriptSource.path);
  if (context.onProgress) {
    context.onProgress({
      stage: 'Transcript',
      percent: 10,
      message: `Loaded ${captions.length} captions from ${transcriptSource.type}`,
    });
  }

  // Run AI analysis
  const resolved = await prepareProvider(resolveProvider({provider: args.provider}));
  if (!resolved.config) {
    // No AI provider available — generate time-based splits
    console.log('No AI provider available. Using time-based splits.');
    const splitCount = Math.min(args.maxSegments, Math.floor(durationSeconds / 25));
    const splitDuration = durationSeconds / splitCount;

    const segments = Array.from({length: splitCount}, (_, i) => ({
      index: i + 1,
      question: `Segment ${i + 1}`,
      answer: '',
      speakerQ: 'Speaker A',
      speakerA: 'Speaker B',
      startSeconds: Math.round(i * splitDuration * 10) / 10,
      endSeconds: Math.round((i + 1) * splitDuration * 10) / 10,
      durationSeconds: Math.round(splitDuration * 10) / 10,
      confidence: 0.2,
    }));

    const output = {
      sourceVideo: videoPath,
      durationSeconds,
      segmentCount: segments.length,
      provider: 'time-based',
      model: 'none',
      createdAt: new Date().toISOString(),
      segments,
    };

    if (!args.dryRun) {
      fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
    }

    if (context.onProgress) {
      context.onProgress({
        stage: 'Done',
        percent: 100,
        message: `${segments.length} segments (time-based)`,
      });
    }

    return output;
  }

  if (context.onProgress) {
    context.onProgress({
      stage: 'AI Analysis',
      percent: 30,
      message: `Calling ${resolved.provider}...`,
    });
  }

  const client = createClient(resolved);
  const model = resolveModel({resolved, model: args.model});

  const {systemPrompt, userPrompt} = buildQAPrompt(captions, durationSeconds, args.maxSegments);

  const text = await chatCompletion(client, {
    model,
    systemPrompt,
    userPrompt,
    jsonMode: true,
    temperature: 0.3,
  });

  if (context.onProgress) {
    context.onProgress({stage: 'Parse', percent: 80, message: 'Parsing Q&A segments...'});
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown fences
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) parsed = JSON.parse(match[1]);
    else throw new Error('Failed to parse AI response as JSON');
  }

  const segments = validateQASegments(parsed, durationSeconds, args.maxSegments);

  const output = {
    sourceVideo: videoPath,
    durationSeconds,
    segmentCount: segments.length,
    provider: resolved.provider,
    model,
    createdAt: new Date().toISOString(),
    transcriptSource: transcriptSource.path,
    segments,
  };

  if (!args.dryRun) {
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  }

  console.log(`✅ Detected ${segments.length} Q&A segments`);
  console.log(`   Output: ${outPath}`);
  for (const seg of segments.slice(0, 5)) {
    console.log(
      `   #${seg.index}: ${formatTimestamp(seg.startSeconds)}-${formatTimestamp(seg.endSeconds)} (${seg.durationSeconds}s) — ${seg.question.slice(0, 60)}...`,
    );
  }
  if (segments.length > 5) console.log(`   ... and ${segments.length - 5} more`);

  if (context.onProgress) {
    context.onProgress({
      stage: 'Done',
      percent: 100,
      message: `${segments.length} Q&A segments detected`,
    });
  }

  return output;
}

// ── CLI Entry ────────────────────────────────────────────────────

const isDirectRun =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*[\\/]/, ''));

if (isDirectRun) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    console.log(usage);
    process.exit(0);
  }

  loadEnv();

  runInterviewQA({
    video: requireArg(args, 'video', 'Missing --video <path>'),
    captions: args.captions,
    'min-segment-seconds': args['min-segment-seconds'],
    'max-segments': args['max-segments'],
    out: args.out,
    provider: args.provider,
    model: args.model,
    dryRun: !!args['dry-run'],
  })
    .then(() => process.exit(0))
    .catch(() => {
      console.error('Interview analysis failed. Review the redacted job log for details.');
      process.exit(1);
    });
}

export {runInterviewQA};
