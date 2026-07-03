#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {OpenAI} from 'openai';
import {openAiWhisperApiToCaptions} from '@remotion/openai-whisper';
import {ensureDir, loadEnv, parseArgs, requireArg} from './lib.mjs';

const usage = `
Usage:
  npm run transcribe -- --video input.mp4 --out captions.json [--prompt "context words"]

Options:
  --model ID              Transcription model. Default: whisper-1
  --retries N             Retry transient OpenAI failures. Default: 5
  --audio-bitrate RATE    Temporary MP3 bitrate. Default: 48k
  --chunk-seconds N       Split longer audio into chunks. Default: 180

Requires:
  OPENAI_API_KEY in your environment.
`;

const args = parseArgs(process.argv.slice(2));
loadEnv();
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required for automatic transcription.');
}

const video = path.resolve(requireArg(args, 'video', usage));
const out = path.resolve(requireArg(args, 'out', usage));
const tempAudio = path.join(os.tmpdir(), `caption-audio-${Date.now()}.mp3`);
const retries = Math.max(1, Number(args.retries ?? 5));
const audioBitrate = String(args['audio-bitrate'] ?? '48k');
const chunkSeconds = Math.max(30, Number(args['chunk-seconds'] ?? 180));
const chunkAudioPaths = [];

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

const transcribeWithRetry = async ({openai, model, prompt, audioPath, label}) => {
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
        prompt,
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

const transcribeAudio = async ({openai, model, prompt, durationSeconds}) => {
  if (durationSeconds <= chunkSeconds) {
    return transcribeWithRetry({
      openai,
      model,
      prompt,
      audioPath: tempAudio,
      label: 'audio',
    });
  }

  const parts = [];
  const chunkCount = Math.ceil(durationSeconds / chunkSeconds);
  console.log(
    `Audio is ${durationSeconds.toFixed(1)}s; splitting into ${chunkCount} chunks of up to ${chunkSeconds}s.`,
  );

  for (let index = 0; index < chunkCount; index += 1) {
    const offsetSeconds = index * chunkSeconds;
    const duration = Math.min(chunkSeconds, durationSeconds - offsetSeconds);
    const chunkPath = makeAudioChunk({
      offsetSeconds,
      durationSeconds: duration,
      index: index + 1,
    });

    const transcription = await transcribeWithRetry({
      openai,
      model,
      prompt,
      audioPath: chunkPath,
      label: `chunk ${index + 1}/${chunkCount}`,
    });

    parts.push({transcription, offsetSeconds});
  }

  return combineTranscriptions(parts, durationSeconds);
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

  const openai = new OpenAI({maxRetries: 0});
  const transcription = await transcribeAudio({
    openai,
    model: String(args.model ?? 'whisper-1'),
    prompt: args.prompt ? String(args.prompt) : undefined,
    durationSeconds: audioDurationSeconds,
  });

  const {captions} = openAiWhisperApiToCaptions({transcription});
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        captions,
        transcription,
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${captions.length} caption tokens to ${out}`);
} finally {
  fs.rmSync(tempAudio, {force: true});
  for (const chunkPath of chunkAudioPaths) {
    fs.rmSync(chunkPath, {force: true});
  }
}
