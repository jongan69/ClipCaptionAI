#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {
  ensureDir,
  parseArgs,
  projectRoot,
  requireArg,
} from './lib.mjs';

const usage = `
Usage:
  npm run transcribe:benchmark -- --video /path/to/video.mp4 [options]

Options:
  --out-dir DIR           Output root. Default: ./outputs/transcription-benchmarks
  --sample-start N        Sample start seconds. Default: 0
  --sample-seconds N      Sample duration in seconds. Default: 30
  --reference-provider ID Reference provider. Default: openai
  --candidate-provider ID Candidate provider. Default: local-whispercpp
  --local-model ID        Local whisper.cpp model alias/path for candidate run
  --prompt TEXT           Optional transcription prompt
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const video = path.resolve(requireArg(args, 'video', usage));
const outRoot = path.resolve(
  String(args['out-dir'] ?? path.join(projectRoot, 'outputs', 'transcription-benchmarks')),
);
const sampleStart = Math.max(0, Number(args['sample-start'] ?? 0));
const sampleSeconds = Math.max(8, Number(args['sample-seconds'] ?? 30));
const referenceProvider = String(args['reference-provider'] ?? 'openai');
const candidateProvider = String(args['candidate-provider'] ?? 'local-whispercpp');
const localModel = args['local-model'] ? String(args['local-model']) : null;
const prompt = args.prompt ? String(args.prompt) : null;

const slugify = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'video';

const timestampSlug = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
  ].join('-');
};

const normalizeText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^\w\s$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value) => normalizeText(value).split(' ').filter(Boolean);

const levenshteinDistance = (a, b) => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({length: rows}, () => Array(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    dp[row][0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    dp[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      dp[row][col] = Math.min(
        dp[row - 1][col] + 1,
        dp[row][col - 1] + 1,
        dp[row - 1][col - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
};

const compareTexts = (referenceText, candidateText) => {
  const refWords = tokenize(referenceText);
  const candWords = tokenize(candidateText);
  const refChars = normalizeText(referenceText).replace(/\s+/g, '');
  const candChars = normalizeText(candidateText).replace(/\s+/g, '');

  const wordDistance = levenshteinDistance(refWords, candWords);
  const charDistance = levenshteinDistance([...refChars], [...candChars]);
  const wordErrorRate = refWords.length === 0 ? 0 : wordDistance / refWords.length;
  const charErrorRate = refChars.length === 0 ? 0 : charDistance / refChars.length;

  return {
    referenceWordCount: refWords.length,
    candidateWordCount: candWords.length,
    wordDistance,
    charDistance,
    wordErrorRate: Number(wordErrorRate.toFixed(4)),
    charErrorRate: Number(charErrorRate.toFixed(4)),
    wordAccuracyEstimate: Number((1 - wordErrorRate).toFixed(4)),
    charAccuracyEstimate: Number((1 - charErrorRate).toFixed(4)),
  };
};

const runTranscribe = ({provider, outputPath, inputVideoPath}) => {
  const startMs = Date.now();
  const scriptArgs = [
    'scripts/transcribe-openai.mjs',
    '--video',
    inputVideoPath,
    '--out',
    outputPath,
    '--provider',
    provider,
  ];

  if (provider === 'local-whispercpp' && localModel) {
    scriptArgs.push('--local-model', localModel);
  }
  if (prompt) {
    scriptArgs.push('--prompt', prompt);
  }

  try {
    execFileSync('node', scriptArgs, {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    const elapsedMs = Date.now() - startMs;
    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return {
      ok: true,
      provider,
      elapsedSeconds: Number((elapsedMs / 1000).toFixed(2)),
      outputPath,
      actualProvider: parsed?.metadata?.provider ?? provider,
      actualModel: parsed?.metadata?.model ?? null,
      parsed,
    };
  } catch (error) {
    return {
      ok: false,
      provider,
      elapsedSeconds: Number(((Date.now() - startMs) / 1000).toFixed(2)),
      outputPath,
      error: error.message,
    };
  }
};

const extractWindowText = (parsed, {startSeconds = 0, endSeconds = null} = {}) => {
  const captions = Array.isArray(parsed?.captions) ? parsed.captions : [];
  if (captions.length === 0) {
    return String(parsed?.transcription?.text ?? '').trim();
  }

  return captions
    .filter((caption) => {
      const captionStart = Number(caption.startMs ?? 0) / 1000;
      const captionEnd = Number(caption.endMs ?? 0) / 1000;
      return captionEnd >= startSeconds && (endSeconds === null || captionStart <= endSeconds);
    })
    .map((caption) => String(caption.text ?? '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const runName = `bench-${timestampSlug()}-${slugify(path.basename(video, path.extname(video)))}`;
const runDir = path.join(outRoot, runName);
ensureDir(runDir);

const sampleVideoPath = path.join(runDir, 'sample.mp4');
const referencePath = path.join(runDir, `${referenceProvider}.json`);
const candidatePath = path.join(runDir, `${candidateProvider}.json`);

execFileSync(
  'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    String(sampleStart),
    '-t',
    String(sampleSeconds),
    '-i',
    video,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    sampleVideoPath,
  ],
  {stdio: 'inherit'},
);

console.log(`Benchmark sample: ${sampleVideoPath}`);
console.log(`Reference provider: ${referenceProvider}`);
console.log(`Candidate provider: ${candidateProvider}`);

const referenceRun = runTranscribe({
  provider: referenceProvider,
  outputPath: referencePath,
  inputVideoPath: referenceProvider === 'youtube' ? video : sampleVideoPath,
});
const candidateRun = runTranscribe({
  provider: candidateProvider,
  outputPath: candidatePath,
  inputVideoPath: sampleVideoPath,
});

const summary = {
  createdAt: new Date().toISOString(),
  video,
  sampleVideoPath,
  sampleStart,
  sampleSeconds,
  referenceProvider,
  candidateProvider,
  referenceRun: {
    ok: referenceRun.ok,
    elapsedSeconds: referenceRun.elapsedSeconds,
    outputPath: referenceRun.outputPath,
    actualProvider: referenceRun.actualProvider ?? null,
    actualModel: referenceRun.actualModel ?? null,
    error: referenceRun.error ?? null,
  },
  candidateRun: {
    ok: candidateRun.ok,
    elapsedSeconds: candidateRun.elapsedSeconds,
    outputPath: candidateRun.outputPath,
    actualProvider: candidateRun.actualProvider ?? null,
    actualModel: candidateRun.actualModel ?? null,
    error: candidateRun.error ?? null,
  },
  comparison: null,
};

if (referenceRun.ok && candidateRun.ok) {
  const referenceText = extractWindowText(referenceRun.parsed, {
    startSeconds: referenceProvider === 'youtube' ? sampleStart : 0,
    endSeconds: referenceProvider === 'youtube' ? sampleStart + sampleSeconds : null,
  });
  const candidateText = extractWindowText(candidateRun.parsed);
  summary.comparison = compareTexts(referenceText, candidateText);
}

fs.writeFileSync(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log(`Benchmark folder: ${runDir}`);
if (summary.comparison) {
  console.log(
    `Candidate vs reference WER: ${(summary.comparison.wordErrorRate * 100).toFixed(2)}% | estimated word accuracy: ${(summary.comparison.wordAccuracyEstimate * 100).toFixed(2)}%`,
  );
} else {
  console.log('Comparison not available because one of the runs failed.');
}
