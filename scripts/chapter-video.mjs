#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDir,
  formatTimestamp,
  loadEnv,
  outputsRoot,
  parseArgs,
  probeVideo,
  requireArg,
  run,
  slugify,
  splitVideoSegment,
} from './lib.mjs';
import {resolveProvider, createClient, resolveModel, chatCompletion} from './ai-provider.mjs';

const usage = `
Usage:
  npm run chapter:auto -- --video input.mp4 [options]

Options:
  --out FILE              Output chapters JSON. Default: outputs/chapters/<slug>.chapters.json
  --split                 Also export each chapter as a separate video file.
  --split-dir DIR         Directory for split chapter videos. Default: outputs/chapters/<slug>/
  --chapter-model ID      Model for chapter detection. Auto-detected from provider (see ai-provider.mjs).
  --provider ID           LLM provider: deepseek or openai. Default: auto-detect from available keys.
  --min-chapter-seconds N Minimum chapter length in seconds. Default: 45
  --max-chapters N        Maximum number of chapters. Default: 20
  --language LANG         Spoken language. Default: en
  --context TEXT          Extra context hint for the chapter model (e.g. "podcast interview about AI").

Environment variables:
  DEEPSEEK_API_KEY        DeepSeek API key.
  OPENAI_API_KEY          OpenAI API key.
  If both are set, DeepSeek is preferred. Override with --provider.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

loadEnv();

const video = path.resolve(requireArg(args, 'video', usage));
const minChapterSeconds = Math.max(20, Number(args['min-chapter-seconds'] ?? 45));
const maxChapters = Math.max(2, Number(args['max-chapters'] ?? 20));
const language = String(args.language ?? 'en');
const contextHint = args.context ? String(args.context) : null;
const shouldSplit = Boolean(args.split);

// ── Resolve provider ──────────────────────────────────────────────────

const resolved = resolveProvider({provider: args.provider});
const chapterModel = resolveModel({
  resolved,
  model: args['chapter-model'],
  envModelKey: 'OPENAI_CHAPTER_MODEL',
});

// ── Setup output dirs ─────────────────────────────────────────────────

const videoMeta = probeVideo(video);
const safeBase = path
  .basename(video, path.extname(video))
  .replace(/[^a-z0-9._-]+/gi, '_')
  .slice(0, 90);
const chaptersDir = path.join(outputsRoot, 'chapters');
const workDir = path.join(chaptersDir, 'work');
const defaultOut = path.join(chaptersDir, `${safeBase}.chapters.json`);
const outPath = args.out ? path.resolve(String(args.out)) : defaultOut;
const splitDir = args['split-dir']
  ? path.resolve(String(args['split-dir']))
  : path.join(chaptersDir, safeBase);

ensureDir(chaptersDir);
ensureDir(workDir);
if (shouldSplit) {
  ensureDir(splitDir);
}

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

const chunkSize = 40;
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
            .map((word) => word.text)
            .join(' ')}`,
        );
      }
      return fallbackChunks;
    })();

// ── Step 3: AI chapter detection ──────────────────────────────────────

const jsonOutputSchema = `{
  "chapters": [
    {
      "title": "Short descriptive title (2-7 words)",
      "startSeconds": 0.0,
      "endSeconds": 145.2,
      "description": "Brief description (1-3 sentences) of what is discussed"
    }
  ]
}`;

const systemPrompt = `You are an expert podcast and conversation editor. Your job is to analyze a transcript and detect natural topic changes to create meaningful chapters.

Rules:
- Find chapters where the TOPIC or THEME of conversation genuinely changes. Do NOT split mid-topic just because time passed.
- Each chapter must be at least ${minChapterSeconds} seconds long.
- Chapters must cover the ENTIRE video from 0:00 to the end with NO gaps and NO overlaps.
- Chapter 1 MUST start at 0.0 seconds. The final chapter MUST end at ${videoMeta.durationSeconds.toFixed(1)} seconds.
- Use exact timestamps from the transcript. Round to the nearest second.
- Give each chapter a short, descriptive title (2-7 words) and a brief description (1-3 sentences) of what is discussed.
- Aim for chapters that represent distinct conversation segments. A 30-minute conversation might have 5-12 chapters.
- Prefer quality over quantity — it's better to have fewer well-defined chapters than many fragmented ones.

Return ONLY a valid JSON object with this exact structure:
${jsonOutputSchema}`;

const userPrompt = `Video duration: ${videoMeta.durationSeconds.toFixed(1)} seconds
Language: ${language}
${contextHint ? `Context: ${contextHint}` : ''}
Minimum chapter length: ${minChapterSeconds}s
Maximum chapters: ${maxChapters}

Break this transcript into chapters where the topic changes naturally. Cover the full duration with no gaps.

Transcript:
${chunks.join('\n')}`;

let chapters;
let usedModel;

const runTimeFallback = () => {
  const fallbackDuration = Math.max(minChapterSeconds, 180);
  const count = Math.max(
    2,
    Math.min(maxChapters, Math.ceil(videoMeta.durationSeconds / fallbackDuration)),
  );
  const segmentLength = videoMeta.durationSeconds / count;

  chapters = Array.from({length: count}, (_, index) => ({
    title: `Part ${index + 1}`,
    startSeconds: Math.round(index * segmentLength),
    endSeconds: Math.round(Math.min(videoMeta.durationSeconds, (index + 1) * segmentLength)),
    description: `Segment ${index + 1} of ${count} from the conversation.`,
  }));
  usedModel = 'time-fallback';
};

if (!resolved.config) {
  console.warn(
    'No DEEPSEEK_API_KEY or OPENAI_API_KEY found. Using simple time-based chaptering as fallback.',
  );
  runTimeFallback();
} else {
  const client = createClient(resolved);

  try {
    console.log(`Detecting chapters with ${resolved.config.label} (${chapterModel})...`);

    const jsonText = await chatCompletion(client, {
      model: chapterModel,
      systemPrompt,
      userPrompt,
      jsonMode: true,
      temperature: 0.3,
    });

    const parsed = JSON.parse(jsonText);
    chapters = (parsed.chapters ?? []).map((chapter, index) => ({
      ...chapter,
      index: index + 1,
    }));
    usedModel = `${resolved.provider}:${chapterModel}`;
  } catch (error) {
    console.warn(
      `Chapter detection failed with ${resolved.config.label}: ${error?.message ?? error?.code ?? error?.status ?? 'unknown error'}. Using time-based fallback.`,
    );
    runTimeFallback();
  }
}

// ── Step 4: Normalize and validate chapters ────────────────────────────

if (chapters.length > 0) {
  chapters[0].startSeconds = 0;
  chapters[chapters.length - 1].endSeconds = Math.round(videoMeta.durationSeconds);
}

for (let index = 1; index < chapters.length; index += 1) {
  const prevEnd = chapters[index - 1].endSeconds;
  if (chapters[index].startSeconds > prevEnd) {
    chapters[index - 1].endSeconds = chapters[index].startSeconds;
  } else {
    chapters[index].startSeconds = prevEnd;
  }
}

for (const chapter of chapters) {
  chapter.durationSeconds = Math.round((chapter.endSeconds - chapter.startSeconds) * 10) / 10;
  if (chapter.index === undefined) {
    chapter.index = chapters.indexOf(chapter) + 1;
  }
}

// ── Step 5: Write output ──────────────────────────────────────────────

const output = {
  sourceVideo: video,
  durationSeconds: videoMeta.durationSeconds,
  model: usedModel,
  provider: resolved.provider ?? 'fallback',
  chapterCount: chapters.length,
  chapters,
};

fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${chapters.length} chapters to ${outPath}`);

console.log('\nChapters:');
for (const chapter of chapters) {
  console.log(`  ${formatTimestamp(chapter.startSeconds)}  ${chapter.title}`);
  console.log(`         ${chapter.description}`);
}

// ── Step 6: Split video into chapter files (optional) ─────────────────

if (shouldSplit) {
  console.log(`\nSplitting video into ${chapters.length} chapter files...`);

  for (const chapter of chapters) {
    const chapterSlug = `${String(chapter.index).padStart(2, '0')}-${slugify(chapter.title, 'chapter')}`;
    const chapterPath = path.join(splitDir, `${chapterSlug}.mp4`);
    const duration = chapter.endSeconds - chapter.startSeconds;

    console.log(
      `  Exporting chapter ${chapter.index}/${chapters.length}: ${chapter.title} (${duration.toFixed(1)}s)`,
    );

    splitVideoSegment(video, chapter.startSeconds, duration, chapterPath);
    chapter.filePath = chapterPath;
  }

  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nChapter files written to: ${splitDir}`);
}

console.log('\nDone.');

process.on('unhandledRejection', (error) => {
  console.error(`Fatal error: ${error?.message ?? error}`);
  process.exit(1);
});
