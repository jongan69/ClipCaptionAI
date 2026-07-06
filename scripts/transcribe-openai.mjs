#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {OpenAI} from 'openai';
import {openAiWhisperApiToCaptions} from '@remotion/openai-whisper';
import {ensureDir, loadEnv, parseArgs, projectRoot, requireArg} from './lib.mjs';

const usage = `
Usage:
  npm run transcribe -- --video input.mp4 --out captions.json [options]

Options:
  --provider ID           Transcription provider: auto, local-whispercpp, openai, youtube
  --model ID              OpenAI model. Default: whisper-1
  --local-model ID        whisper.cpp model alias or full path. Default: small.en
  --text-analysis-model ID OpenAI text model for transcript cleanup. Default: gpt-4.1-mini
  --disable-text-enhance  Skip transcript cleanup on top of the raw transcription
  --force-text-enhance    Require transcript cleanup if an OpenAI API key is available
  --retries N             Retry transient OpenAI failures. Default: 5
  --audio-bitrate RATE    Temporary MP3 bitrate. Default: 48k
  --chunk-seconds N       Split longer audio into chunks. Default: 180
  --language LANG         Spoken language. Default: en
  --prompt TEXT           Prompt words for better transcription

Provider behavior:
  auto:
    1. local-whispercpp if whisper-cli is installed
    2. openai if OPENAI_API_KEY is available
    3. youtube subtitle fallback if the file came from YouTube
`;

const DEFAULT_LOCAL_MODEL = 'small.en';
const DEFAULT_TEXT_ANALYSIS_MODEL = 'gpt-4.1-mini';
const LOCAL_MODEL_ROOT = path.join(projectRoot, 'models', 'whisper.cpp');
const LOCAL_MODEL_CATALOG = {
  'tiny.en': 'ggml-tiny.en.bin',
  'base.en': 'ggml-base.en.bin',
  'small.en': 'ggml-small.en.bin',
  'medium.en': 'ggml-medium.en.bin',
};

const args = parseArgs(process.argv.slice(2));
loadEnv();
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const video = path.resolve(requireArg(args, 'video', usage));
const out = path.resolve(requireArg(args, 'out', usage));
const tempAudio = path.join(os.tmpdir(), `caption-audio-${Date.now()}.mp3`);
const tempWav = path.join(os.tmpdir(), `caption-audio-${Date.now()}.wav`);
const retries = Math.max(1, Number(args.retries ?? 5));
const audioBitrate = String(args['audio-bitrate'] ?? '48k');
const chunkSeconds = Math.max(30, Number(args['chunk-seconds'] ?? 180));
const language = String(args.language ?? 'en');
const prompt = args.prompt ? String(args.prompt) : undefined;
const requestedProvider = String(
  args.provider ?? process.env.TRANSCRIBE_PROVIDER ?? 'auto',
).toLowerCase();
const localModelSetting = String(
  args['local-model'] ?? process.env.WHISPER_CPP_MODEL ?? DEFAULT_LOCAL_MODEL,
);
const textAnalysisModel = String(
  args['text-analysis-model'] ??
    process.env.OPENAI_TEXT_ANALYSIS_MODEL ??
    DEFAULT_TEXT_ANALYSIS_MODEL,
);
const chunkAudioPaths = [];

const commandExists = (command) => {
  try {
    execFileSync('zsh', ['-lc', `command -v ${command}`], {stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
};

const isRetryable = (error) => {
  const status = Number(error?.status ?? error?.response?.status ?? 0);
  const code = String(error?.code ?? error?.cause?.code ?? '');

  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500 ||
    ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)
  );
};

const transcribeWithRetry = async ({openai, model, promptText, audioPath, label}) => {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      console.log(
        `Transcribing ${label} with OpenAI (${model}), attempt ${attempt}/${retries}...`,
      );
      return await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model,
        response_format: 'verbose_json',
        prompt: promptText,
        timestamp_granularities: ['word'],
      });
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === retries) {
        throw error;
      }

      const delayMs = Math.min(30000, 1500 * 2 ** (attempt - 1));
      console.warn(
        `OpenAI transcription failed with ${error?.status ?? error?.code ?? 'unknown error'}; retrying in ${Math.round(delayMs / 1000)}s...`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const probeDurationSeconds = (audioPath) => {
  const output = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      audioPath,
    ],
    {encoding: 'utf8'},
  );

  return Number(output.trim());
};

const makeAudioChunk = ({offsetSeconds, durationSeconds, index}) => {
  const chunkPath = path.join(
    os.tmpdir(),
    `caption-audio-${Date.now()}-${index}.mp3`,
  );
  chunkAudioPaths.push(chunkPath);

  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(offsetSeconds),
      '-t',
      String(durationSeconds),
      '-i',
      tempAudio,
      '-acodec',
      'libmp3lame',
      '-b:a',
      audioBitrate,
      '-ar',
      '16000',
      '-ac',
      '1',
      chunkPath,
    ],
    {stdio: 'inherit'},
  );

  return chunkPath;
};

const offsetWord = (word, offsetSeconds) => ({
  ...word,
  start: Number(word.start ?? 0) + offsetSeconds,
  end: Number(word.end ?? 0) + offsetSeconds,
});

const offsetSegment = (segment, offsetSeconds) => ({
  ...segment,
  start: Number(segment.start ?? 0) + offsetSeconds,
  end: Number(segment.end ?? 0) + offsetSeconds,
});

const extractYoutubeId = (value) => {
  const text = String(value ?? '');

  try {
    const url = new URL(text);
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.replace(/^\/+/, '').slice(0, 11);
    }
    if (url.hostname.includes('youtube.com')) {
      const id = url.searchParams.get('v');
      if (id) {
        return id.slice(0, 11);
      }
    }
  } catch {
    // Not a URL; continue with filename heuristics.
  }

  const bracketMatch = text.match(/\[([A-Za-z0-9_-]{11})\]/);
  if (bracketMatch) {
    return bracketMatch[1];
  }

  const bareMatch = path.basename(text).match(/\b([A-Za-z0-9_-]{11})\b/);
  return bareMatch?.[1] ?? null;
};

const combineTranscriptions = (parts, durationSeconds) => {
  const first = parts[0]?.transcription ?? {};

  return {
    ...first,
    duration: durationSeconds,
    text: parts
      .map(({transcription}) => transcription.text ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
    words: parts.flatMap(({transcription, offsetSeconds}) =>
      (transcription.words ?? []).map((word) => offsetWord(word, offsetSeconds)),
    ),
    segments: parts.flatMap(({transcription, offsetSeconds}) =>
      (transcription.segments ?? []).map((segment) =>
        offsetSegment(segment, offsetSeconds),
      ),
    ),
  };
};

const decodeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");

const parseTimestampSeconds = (value) => {
  const parts = String(value ?? '').trim().replace(',', '.').split(':').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return 0;
  }

  return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

const normalizeSubtitleToken = (value) =>
  decodeHtml(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^>>\s*/, '')
    .trim();

const parseYoutubeWordCaptions = (vttText) => {
  const lines = String(vttText ?? '').split(/\r?\n/);
  const captions = [];
  let cueStartSeconds = 0;
  let cueEndSeconds = 0;

  const pushCaption = (text, startSeconds, endSeconds) => {
    const cleanText = normalizeSubtitleToken(text);
    if (!cleanText || /^\[[^\]]+\]$/.test(cleanText)) {
      return;
    }

    const startMs = Math.max(0, Math.round(startSeconds * 1000));
    const endMs = Math.max(startMs + 1, Math.round(endSeconds * 1000));
    captions.push({
      text: cleanText,
      startMs,
      endMs,
      timestampMs: Math.round((startMs + endMs) / 2),
      confidence: null,
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const cueMatch = line.match(
      /^(\d{2}:\d{2}:\d{2}[.,]\d{3}) --> (\d{2}:\d{2}:\d{2}[.,]\d{3})/,
    );
    if (cueMatch) {
      cueStartSeconds = parseTimestampSeconds(cueMatch[1]);
      cueEndSeconds = parseTimestampSeconds(cueMatch[2]);
      continue;
    }

    if (!line.includes('<c>')) {
      continue;
    }

    const matches = [...line.matchAll(/<(\d{2}:\d{2}:\d{2}[.,]\d{3})><c>(.*?)<\/c>/g)];
    if (matches.length === 0) {
      continue;
    }

    const leadingText = line.slice(0, matches[0].index ?? 0);
    if (normalizeSubtitleToken(leadingText)) {
      pushCaption(
        leadingText,
        cueStartSeconds,
        parseTimestampSeconds(matches[0][1]),
      );
    }

    for (const [index, match] of matches.entries()) {
      const next = matches[index + 1];
      const startSeconds = parseTimestampSeconds(match[1]);
      const endSeconds = next ? parseTimestampSeconds(next[1]) : cueEndSeconds;
      pushCaption(match[2], startSeconds, endSeconds);
    }
  }

  return captions;
};

const transcribeFromYoutubeSubtitles = ({videoRef}) => {
  const youtubeId = extractYoutubeId(videoRef);
  if (!youtubeId) {
    return null;
  }

  const subtitleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaption-subs-'));
  try {
    execFileSync(
      'yt-dlp',
      [
        '--skip-download',
        '--write-auto-sub',
        '--write-sub',
        '--sub-langs',
        'en.*,en',
        '--convert-subs',
        'vtt',
        '--output',
        path.join(subtitleDir, '%(id)s.%(ext)s'),
        `https://www.youtube.com/watch?v=${youtubeId}`,
      ],
      {stdio: 'ignore'},
    );

    const subtitlePath = fs
      .readdirSync(subtitleDir)
      .filter((file) => file.startsWith(`${youtubeId}.`) && file.endsWith('.vtt'))
      .sort((a, b) => {
        const aScore = a.includes('.en-orig.') ? 2 : a.includes('.en.') ? 1 : 0;
        const bScore = b.includes('.en-orig.') ? 2 : b.includes('.en.') ? 1 : 0;
        return bScore - aScore;
      })
      .map((file) => path.join(subtitleDir, file))[0];

    if (!subtitlePath || !fs.existsSync(subtitlePath)) {
      return null;
    }

    const captions = parseYoutubeWordCaptions(fs.readFileSync(subtitlePath, 'utf8'));
    if (captions.length === 0) {
      return null;
    }

    const text = captions
      .map((caption) => String(caption.text ?? '').trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      provider: 'youtube',
      model: 'youtube-subtitles',
      captions,
      transcription: {
        source: 'youtube-subtitles',
        youtubeId,
        text,
        words: captions.map((caption) => ({
          word: String(caption.text ?? '').trim(),
          start: Number(caption.startMs ?? 0) / 1000,
          end: Number(caption.endMs ?? 0) / 1000,
        })),
        segments: [],
      },
    };
  } finally {
    fs.rmSync(subtitleDir, {recursive: true, force: true});
  }
};

const transcribeAudioWithOpenAI = async ({audioDurationSeconds}) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for OpenAI transcription.');
  }

  const openai = new OpenAI({maxRetries: 0});
  const model = String(args.model ?? 'whisper-1');

  const transcribeAudio = async () => {
    if (audioDurationSeconds <= chunkSeconds) {
      return transcribeWithRetry({
        openai,
        model,
        promptText: prompt,
        audioPath: tempAudio,
        label: 'audio',
      });
    }

    const parts = [];
    const chunkCount = Math.ceil(audioDurationSeconds / chunkSeconds);
    console.log(
      `Audio is ${audioDurationSeconds.toFixed(1)}s; splitting into ${chunkCount} chunks of up to ${chunkSeconds}s.`,
    );

    for (let index = 0; index < chunkCount; index += 1) {
      const offsetSeconds = index * chunkSeconds;
      const duration = Math.min(chunkSeconds, audioDurationSeconds - offsetSeconds);
      const chunkPath = makeAudioChunk({
        offsetSeconds,
        durationSeconds: duration,
        index: index + 1,
      });

      const transcription = await transcribeWithRetry({
        openai,
        model,
        promptText: prompt,
        audioPath: chunkPath,
        label: `chunk ${index + 1}/${chunkCount}`,
      });

      parts.push({transcription, offsetSeconds});
    }

    return combineTranscriptions(parts, audioDurationSeconds);
  };

  const transcription = await transcribeAudio();
  const {captions} = openAiWhisperApiToCaptions({transcription});
  return {
    provider: 'openai',
    model,
    captions,
    transcription,
  };
};

const resolveLocalModelPath = (modelSetting) => {
  const explicitPath = path.isAbsolute(modelSetting)
    ? modelSetting
    : modelSetting.includes(path.sep)
      ? path.resolve(projectRoot, modelSetting)
      : null;

  if (explicitPath) {
    return {
      alias: path.basename(explicitPath),
      filePath: explicitPath,
      downloadable: false,
    };
  }

  const filename = LOCAL_MODEL_CATALOG[modelSetting];
  if (!filename) {
    throw new Error(
      `Unknown local whisper model "${modelSetting}". Use one of: ${Object.keys(LOCAL_MODEL_CATALOG).join(', ')}, or pass a direct model path.`,
    );
  }

  return {
    alias: modelSetting,
    filePath: path.join(LOCAL_MODEL_ROOT, filename),
    downloadable: true,
  };
};

const ensureLocalModel = ({alias, filePath, downloadable}) => {
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  if (!downloadable) {
    throw new Error(`Local whisper model not found: ${filePath}`);
  }

  ensureDir(path.dirname(filePath));
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${path.basename(filePath)}?download=true`;
  console.log(`Downloading local whisper model ${alias}...`);
  execFileSync('curl', ['-L', url, '-o', filePath], {stdio: 'inherit'});
  return filePath;
};

const normalizeWhisperTokenText = (value) =>
  String(value ?? '')
    .replace(/\[_[A-Z0-9_]+\]/g, '')
    .replace(/\s+/g, ' ');

const parseWhisperCppCaptions = (jsonPath) => {
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const segments = Array.isArray(parsed.transcription) ? parsed.transcription : [];
  const captions = [];
  const words = [];

  let current = null;
  const flush = () => {
    if (!current || !current.text.trim()) {
      return;
    }

    captions.push({
      text: current.text.trim(),
      startMs: current.startMs,
      endMs: Math.max(current.startMs + 1, current.endMs),
      timestampMs: Math.round((current.startMs + current.endMs) / 2),
      confidence: current.confidenceValues.length > 0
        ? Number(
            (
              current.confidenceValues.reduce((sum, value) => sum + value, 0) /
              current.confidenceValues.length
            ).toFixed(4),
          )
        : null,
    });
  };

  for (const segment of segments) {
    const tokens = Array.isArray(segment.tokens) ? segment.tokens : [];
    for (const token of tokens) {
      const rawText = normalizeWhisperTokenText(token.text);
      const trimmed = rawText.trim();
      if (!trimmed) {
        continue;
      }

      const startMs = Number(token.offsets?.from ?? 0);
      const endMs = Number(token.offsets?.to ?? startMs + 1);
      const confidence = Number(token.p ?? 0);
      const startsNewWord = /^\s/.test(rawText) || current === null;
      const looksLikeWord = /[A-Za-z0-9$]/.test(trimmed);

      if (startsNewWord && looksLikeWord) {
        flush();
        current = {
          text: trimmed,
          startMs,
          endMs,
          confidenceValues: Number.isFinite(confidence) ? [confidence] : [],
        };
      } else if (current) {
        current.text += trimmed;
        current.endMs = endMs;
        if (Number.isFinite(confidence)) {
          current.confidenceValues.push(confidence);
        }
      } else {
        current = {
          text: trimmed,
          startMs,
          endMs,
          confidenceValues: Number.isFinite(confidence) ? [confidence] : [],
        };
      }
    }
  }

  flush();

  for (const caption of captions) {
    words.push({
      word: caption.text,
      start: Number(caption.startMs) / 1000,
      end: Number(caption.endMs) / 1000,
      confidence: caption.confidence,
    });
  }

  const text = captions.map((caption) => caption.text).join(' ').replace(/\s+/g, ' ').trim();

  return {
    raw: parsed,
    captions,
    transcription: {
      source: 'whispercpp',
      text,
      words,
      segments: segments.map((segment) => ({
        start: Number(segment.offsets?.from ?? 0) / 1000,
        end: Number(segment.offsets?.to ?? 0) / 1000,
        text: String(segment.text ?? '').trim(),
      })),
    },
  };
};

const transcribeAudioWithWhisperCpp = async () => {
  if (!commandExists('whisper-cli')) {
    throw new Error('whisper-cli is not installed. Install whisper-cpp first.');
  }

  const modelInfo = resolveLocalModelPath(localModelSetting);
  const modelPath = ensureLocalModel(modelInfo);
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      video,
      '-vn',
      '-ar',
      '16000',
      '-ac',
      '1',
      tempWav,
    ],
    {stdio: 'inherit'},
  );

  const jsonStem = path.join(os.tmpdir(), `clipcaption-whispercpp-${Date.now()}`);
  const cliArgs = [
    '-m',
    modelPath,
    '-f',
    tempWav,
    '-l',
    language,
    '-ojf',
    '-of',
    jsonStem,
    '-np',
  ];

  if (prompt) {
    cliArgs.push('--prompt', prompt);
  }

  console.log(`Transcribing with local whisper.cpp (${modelInfo.alias})...`);
  execFileSync('whisper-cli', cliArgs, {stdio: 'inherit'});
  const jsonPath = `${jsonStem}.json`;
  const parsed = parseWhisperCppCaptions(jsonPath);
  fs.rmSync(jsonPath, {force: true});

  return {
    provider: 'local-whispercpp',
    model: modelInfo.alias,
    captions: parsed.captions,
    transcription: {
      ...parsed.transcription,
      raw: parsed.raw,
    },
  };
};

const countWords = (value) =>
  String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const batchItems = (items, batchSize) => {
  const batches = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
};

const buildTextEnhancementChunks = (captions) => {
  const chunks = [];
  let current = null;

  const flush = () => {
    if (!current || !current.rawText.trim()) {
      return;
    }

    chunks.push({
      index: chunks.length,
      startSeconds: Number((current.startMs / 1000).toFixed(3)),
      endSeconds: Number((current.endMs / 1000).toFixed(3)),
      rawText: current.rawText.trim(),
    });
    current = null;
  };

  for (const caption of captions) {
    const text = String(caption.text ?? '').trim();
    if (!text) {
      continue;
    }

    if (!current) {
      current = {
        startMs: Number(caption.startMs ?? 0),
        endMs: Number(caption.endMs ?? caption.startMs ?? 0),
        rawText: text,
      };
      continue;
    }

    const nextText = `${current.rawText} ${text}`.replace(/\s+/g, ' ').trim();
    const nextEndMs = Number(caption.endMs ?? current.endMs);
    const durationSeconds = (nextEndMs - current.startMs) / 1000;
    const wordCount = countWords(nextText);

    if (durationSeconds > 18 || wordCount > 42 || nextText.length > 260) {
      flush();
      current = {
        startMs: Number(caption.startMs ?? 0),
        endMs: Number(caption.endMs ?? caption.startMs ?? 0),
        rawText: text,
      };
      continue;
    }

    current.rawText = nextText;
    current.endMs = nextEndMs;
  }

  flush();
  return chunks;
};

const buildTranscriptCleanupInput = (chunks) =>
  chunks
    .map(
      (chunk) =>
        `[${chunk.index}] ${chunk.startSeconds.toFixed(1)}-${chunk.endSeconds.toFixed(1)}s :: ${chunk.rawText}`,
    )
    .join('\n');

const enhanceTranscriptText = async ({captions, provider}) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for transcript text enhancement.');
  }

  const chunks = buildTextEnhancementChunks(captions);
  if (chunks.length === 0) {
    return {
      attempted: true,
      enabled: false,
      model: textAnalysisModel,
      sourceProvider: provider,
      reason: 'no_chunks',
      chunkCount: 0,
      changeCount: 0,
      correctedText: '',
      chunks: [],
    };
  }

  const openai = new OpenAI({maxRetries: 1});
  const correctedByIndex = new Map();
  const cleanupSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['chunks'],
    properties: {
      chunks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'text'],
          properties: {
            index: {type: 'integer'},
            text: {type: 'string'},
          },
        },
      },
    },
  };

  for (const batch of batchItems(chunks, 12)) {
    const response = await openai.responses.create({
      model: textAnalysisModel,
      input: [
        {
          role: 'system',
          content:
            'You clean up raw speech-to-text transcript chunks for downstream editorial analysis. Keep the same order, meaning, and near-literal wording. Fix only obvious ASR mistakes, casing, punctuation, and proper nouns strongly implied by context. Do not summarize. Do not embellish. Do not add facts. Return one corrected text string per chunk index.',
        },
        {
          role: 'user',
          content: `Transcription source: ${provider}
Language: ${language}
Context hints: ${prompt ?? 'none'}

Return corrected text for each chunk index below.

${buildTranscriptCleanupInput(batch)}`,
        },
      ],
      text: {
        verbosity: 'medium',
        format: {
          type: 'json_schema',
          name: 'transcript_cleanup',
          strict: true,
          schema: cleanupSchema,
        },
      },
    });

    const parsed = JSON.parse(response.output_text);
    for (const item of parsed.chunks ?? []) {
      correctedByIndex.set(Number(item.index), String(item.text ?? '').trim());
    }
  }

  const normalizedChunks = chunks.map((chunk) => {
    const correctedText = correctedByIndex.get(chunk.index) ?? chunk.rawText;
    return {
      ...chunk,
      correctedText,
    };
  });

  const changeCount = normalizedChunks.filter(
    (chunk) =>
      chunk.correctedText.replace(/\s+/g, ' ').trim() !==
      chunk.rawText.replace(/\s+/g, ' ').trim(),
  ).length;

  return {
    attempted: true,
    enabled: true,
    model: textAnalysisModel,
    sourceProvider: provider,
    chunkCount: normalizedChunks.length,
    changeCount,
    correctedText: normalizedChunks.map((chunk) => chunk.correctedText).join(' ').trim(),
    chunks: normalizedChunks,
  };
};

const resolveAutoProvider = () => {
  if (commandExists('whisper-cli')) {
    return 'local-whispercpp';
  }
  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  if (extractYoutubeId(video)) {
    return 'youtube';
  }
  throw new Error(
    'No transcription provider available. Install whisper-cpp, add OPENAI_API_KEY, or use a YouTube-sourced file.',
  );
};

const writeOutput = ({
  provider,
  model,
  captions,
  transcription,
  metadata = {},
  analysis = null,
}) => {
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        captions,
        transcription,
        ...(analysis ? {analysis} : {}),
        metadata: {
          provider,
          model,
          createdAt: new Date().toISOString(),
          ...metadata,
        },
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${captions.length} caption tokens to ${out}`);
  console.log(`Transcription source: ${provider}${model ? ` (${model})` : ''}`);
};

ensureDir(path.dirname(out));

try {
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      video,
      '-vn',
      '-acodec',
      'libmp3lame',
      '-b:a',
      audioBitrate,
      '-ar',
      '16000',
      '-ac',
      '1',
      tempAudio,
    ],
    {stdio: 'inherit'},
  );

  const audioSizeMb = fs.statSync(tempAudio).size / 1024 / 1024;
  const audioDurationSeconds = probeDurationSeconds(tempAudio);
  console.log(
    `Prepared transcription audio: ${audioSizeMb.toFixed(1)} MB, ${audioDurationSeconds.toFixed(1)}s (${audioBitrate}, mono, 16kHz)`,
  );

  const provider = requestedProvider === 'auto' ? resolveAutoProvider() : requestedProvider;

  let result;
  let metadata = {audioDurationSeconds};

  if (provider === 'local-whispercpp') {
    result = await transcribeAudioWithWhisperCpp();
  } else if (provider === 'openai') {
    try {
      result = await transcribeAudioWithOpenAI({audioDurationSeconds});
    } catch (error) {
      const youtubeFallback = transcribeFromYoutubeSubtitles({videoRef: video});
      const canFallback =
        youtubeFallback &&
        (Number(error?.status ?? 0) === 429 ||
          ['insufficient_quota', 'rate_limit_exceeded'].includes(String(error?.code ?? '')));

      if (!canFallback) {
        throw error;
      }

      console.warn(
        `OpenAI transcription failed with ${error?.code ?? error?.status ?? 'unknown error'}. Using YouTube subtitle fallback instead.`,
      );
      result = youtubeFallback;
      metadata = {
        ...metadata,
        fallbackFrom: 'openai',
        fallbackReason: String(error?.code ?? error?.status ?? 'unknown'),
      };
    }
  } else if (provider === 'youtube') {
    result = transcribeFromYoutubeSubtitles({videoRef: video});
    if (!result) {
      throw new Error('YouTube subtitle fallback was requested, but no subtitles were available.');
    }
  } else {
    throw new Error(`Unsupported transcription provider: ${provider}`);
  }

  let analysis = null;
  const wantsTextEnhancement = Boolean(args['force-text-enhance']) || (
    !args['disable-text-enhance'] &&
    result.provider !== 'openai' &&
    Boolean(process.env.OPENAI_API_KEY)
  );

  if (args['force-text-enhance'] && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when --force-text-enhance is used.');
  }

  if (wantsTextEnhancement) {
    try {
      console.log(`Cleaning transcript text with OpenAI (${textAnalysisModel})...`);
      analysis = {
        textEnhancement: await enhanceTranscriptText({
          captions: result.captions,
          provider: result.provider,
        }),
      };
    } catch (error) {
      if (args['force-text-enhance']) {
        throw error;
      }
      console.warn(
        `Transcript text cleanup failed with ${error?.code ?? error?.status ?? 'unknown error'}. Continuing with raw transcription.`,
      );
      analysis = {
        textEnhancement: {
          attempted: true,
          enabled: false,
          model: textAnalysisModel,
          sourceProvider: result.provider,
          reason: 'error',
          error: String(error?.code ?? error?.status ?? 'unknown'),
        },
      };
    }
  }

  writeOutput({
    provider: result.provider,
    model: result.model,
    captions: result.captions,
    transcription: result.transcription,
    metadata,
    analysis,
  });
  process.exit(0);
} finally {
  fs.rmSync(tempAudio, {force: true});
  fs.rmSync(tempWav, {force: true});
  for (const chunkPath of chunkAudioPaths) {
    fs.rmSync(chunkPath, {force: true});
  }
}
