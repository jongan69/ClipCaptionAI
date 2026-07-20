#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import OpenAI from 'openai';
import {
  ensureDir,
  loadEnv,
  outputsRoot,
  parseArgs,
  probeVideo,
  projectRoot,
  readCaptionStyleConfig,
  readCaptions,
  requireArg,
  run,
} from './lib.mjs';
import {
  buildViralScorecard,
  buildThoughtUnits,
  snapSelectionToThoughtBoundaries,
} from './clipkit-lib.mjs';

const usage = `
Usage:
  npm run smart:clips -- --video original.mp4 [options]

Options:
  --out-dir DIR           Output folder. Default: outputs/smart-clips
  --work-dir DIR          Intermediate folder. Default: outputs/smart-clips/work
  --max-clips N           Number of clips to create. Default: 3
  --min-seconds N         Minimum clip length. Default: 18
  --max-seconds N         Maximum clip length. Default: 55
  --padding-seconds N     Extra seconds before and after each selected clip. Default: 2
  --boundary-lookaround-seconds N
                          Max extra seconds to expand toward thought boundaries. Default: 6
  --disable-thought-snapping
                          Keep raw AI timestamps without sentence/thought snapping.
  --review-width N        Downscale selected clips before captioning. Default: 1280
  --review-fps N          Render review clips at this FPS. Default: 15
  --raw-clips-only        Stop after exporting the selected source clips for manual editing.
  --reselect              Ignore existing selection.json and ask the model again.
  --vertical              Render selected clips as 1080x1920.
  --vertical-contain      Render selected clips as 1080x1920 with full horizontal video and black bars.
  --style-config FILE     Caption style JSON. Default: ./caption-style.json if present.
  --source-profile NAME   Prefer matching custom scene-library footage for this source/person.
  --scene-library DIR     Folder of tagged scene clips for context-matched cutaways.
  --library-config FILE   Optional scene-library metadata config used by scene:index.
  --context-scenes        Force-enable context scene mixing.
  --disable-context-scenes Disable context scene mixing for this run.
  --youtube-ingest        Force-enable YouTube B-roll ingest while planning cutaways.
  --disable-youtube-ingest Disable YouTube B-roll ingest for this run.
  --local-scenes-only     Use only clips already in the local scene library.
  --reindex-scene-library Rebuild scene-library/index.json before generating clips.
  --sfx-library DIR       Folder of indexed sound effects. Default: soundEffects.libraryDir, then ./sfx-library.
  --sound-effects         Force-enable automatic low-volume sound effects.
  --disable-sound-effects Disable automatic sound effects for this run.
  --selection-model ID    OpenAI model for editorial selection. Default: OPENAI_SELECTION_MODEL or gpt-5.5.
`;

const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'his',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'she',
  'so',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'to',
  'was',
  'we',
  'were',
  'with',
  'you',
  'your',
]);

const normalizeToken = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9$]+/g, '')
    .replace(/(ing|ed|es|s)$/g, '');

const tokenize = (value) =>
  String(value ?? '')
    .split(/[^a-zA-Z0-9$]+/)
    .map(normalizeToken)
    .filter((token) => token && !stopWords.has(token));

const titleCaseWords = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const fallbackKeywordWeights = {
  money: 4,
  rich: 4,
  broke: 4,
  identity: 3.8,
  discipline: 3.5,
  manifest: 3.4,
  manifested: 3.4,
  abroad: 3.2,
  europe: 3.2,
  budapest: 3.2,
  hungary: 3.2,
  hungarian: 3.2,
  language: 3,
  friend: 2.8,
  friends: 2.8,
  business: 2.8,
  online: 2.8,
  watch: 2.6,
  cartier: 3.4,
  place: 2.4,
  live: 2.4,
  move: 2.4,
  moved: 2.4,
  hardest: 3.4,
  hard: 2.4,
  life: 2.3,
  change: 2.6,
  changed: 2.6,
  college: 2.4,
  nothing: 2.2,
  first: 2.2,
  foundation: 2.2,
  success: 2.5,
  luxury: 2.2,
  faith: 2.4,
  spiritual: 2.4,
  purpose: 2.4,
};

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

loadEnv();

const video = path.resolve(requireArg(args, 'video', usage));
const outDir = path.resolve(args['out-dir'] ?? path.join(outputsRoot, 'smart-clips'));
const workDir = path.resolve(
  args['work-dir'] ?? path.join(outputsRoot, 'smart-clips', 'work'),
);
const maxClips = Number(args['max-clips'] ?? 3);
const minSeconds = Number(args['min-seconds'] ?? 18);
const maxSeconds = Number(args['max-seconds'] ?? 55);
const paddingSeconds = Math.max(0, Number(args['padding-seconds'] ?? 2));
const boundaryLookaroundSeconds = Math.max(
  0,
  Number(args['boundary-lookaround-seconds'] ?? 6),
);
const thoughtSnappingEnabled = !args['disable-thought-snapping'];
const reviewWidth = Number(args['review-width'] ?? 1280);
const reviewFps = Number(args['review-fps'] ?? 15);
const rawClipsOnly = Boolean(args['raw-clips-only']);
const verticalContain = Boolean(args['vertical-contain']);
const vertical = Boolean(args.vertical) || verticalContain;
const styleConfig = args['style-config'] ? path.resolve(String(args['style-config'])) : null;
const sourceProfile = args['source-profile']
  ? String(args['source-profile']).trim().toLowerCase()
  : null;
const styleConfigObject = readCaptionStyleConfig(styleConfig ?? undefined);
const contextScenesConfig = styleConfigObject.contextScenes ?? {};
const soundEffectsConfig = styleConfigObject.soundEffects ?? {};
const contextScenesEnabled = args['disable-context-scenes']
  ? false
  : args['context-scenes']
    ? true
    : Boolean(contextScenesConfig.enabled);
const soundEffectsEnabled = args['disable-sound-effects']
  ? false
  : args['sound-effects']
    ? true
    : Boolean(soundEffectsConfig.enabled);
const sceneLibraryPath = args['scene-library']
  ? path.resolve(String(args['scene-library']))
  : contextScenesConfig.libraryDir
    ? path.resolve(projectRoot, String(contextScenesConfig.libraryDir))
    : path.join(projectRoot, 'scene-library');
const libraryConfigPath = args['library-config']
  ? path.resolve(String(args['library-config']))
  : path.join(sceneLibraryPath, 'library.config.json');
const sfxLibraryPath = args['sfx-library']
  ? path.resolve(String(args['sfx-library']))
  : soundEffectsConfig.libraryDir
    ? path.resolve(projectRoot, String(soundEffectsConfig.libraryDir))
    : path.join(projectRoot, 'sfx-library');

ensureDir(outDir);
ensureDir(workDir);

if (
  contextScenesEnabled &&
  (args['local-scenes-only'] || args['reindex-scene-library'] || fs.existsSync(libraryConfigPath))
) {
  const indexArgs = ['run', 'scene:index', '--', '--scene-library', sceneLibraryPath];
  if (fs.existsSync(libraryConfigPath)) {
    indexArgs.push('--library-config', libraryConfigPath);
  }
  if (args['reindex-scene-library']) {
    indexArgs.push('--reindex');
  }
  run('npm', indexArgs);
}

const safeBase = path.basename(video, path.extname(video)).replace(/[^a-z0-9._-]+/gi, '_').slice(0, 90);
const transcriptPath = path.join(workDir, `${safeBase}.transcript.json`);
const selectionPath = path.join(outDir, 'selection.json');

const readExistingSelection = () => {
  if (!fs.existsSync(selectionPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
};

const writeSelection = () => {
  const existingSelection = readExistingSelection();
  if (existingSelection?.generatedUsage) {
    selection.generatedUsage = existingSelection.generatedUsage;
  }
  fs.writeFileSync(selectionPath, `${JSON.stringify(selection, null, 2)}\n`);
};

if (!fs.existsSync(transcriptPath)) {
  run('npm', [
    'run',
    'transcribe',
    '--',
    '--video',
    video,
    '--out',
    transcriptPath,
    '--prompt',
    'Entrepreneurship, AI, organic dropshipping, going viral, TikTok, first video, ecommerce.',
  ]);
}

const transcriptBundle = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
const captions = readCaptions(transcriptPath);
const transcription = transcriptBundle.transcription ?? {};
const videoMeta = probeVideo(video);
const transcriptEnhancement =
  transcriptBundle.analysis?.textEnhancement &&
  Array.isArray(transcriptBundle.analysis.textEnhancement.chunks)
    ? transcriptBundle.analysis.textEnhancement
    : null;
const thoughtBoundaryPlan = buildThoughtUnits({
  transcription,
  transcriptEnhancement,
  captions,
});

const wordRows = captions.map((caption) => ({
  start: Math.round(caption.startMs / 100) / 10,
  end: Math.round(caption.endMs / 100) / 10,
  text: caption.text.trim(),
}));

const chunkSize = 38;
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
        if (slice.length === 0) {
          continue;
        }
        fallbackChunks.push(
          `[${slice[0].start.toFixed(1)}-${slice.at(-1).end.toFixed(1)}] ${slice
            .map((word) => word.text)
            .join(' ')}`,
        );
      }
      return fallbackChunks;
    })();

const buildFallbackSelection = ({captions, durationSeconds}) => {
  const targetDuration = Math.max(minSeconds, Math.min(maxSeconds, 28));
  const candidateStarts = [];
  const seenStarts = new Set();

  for (const caption of captions) {
    const startSeconds = Math.max(0, Math.floor(caption.startMs / 1000));
    if (!seenStarts.has(startSeconds)) {
      candidateStarts.push(startSeconds);
      seenStarts.add(startSeconds);
    }
  }

  const clipForWindow = (startSeconds) => {
    const endTarget = Math.min(durationSeconds, startSeconds + targetDuration);
    const windowCaptions = captions.filter(
      (caption) =>
        caption.endMs / 1000 >= startSeconds && caption.startMs / 1000 <= endTarget,
    );
    if (windowCaptions.length < 16) {
      return null;
    }

    const text = windowCaptions
      .map((caption) => String(caption.text ?? '').trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const tokens = tokenize(text);
    if (tokens.length < 12) {
      return null;
    }

    let score = 10;
    const counts = new Map();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
      score += fallbackKeywordWeights[token] ?? 0.35;
      if (/^\$?\d/.test(token)) {
        score += 0.7;
      }
    }
    if (/[?!]/.test(text)) {
      score += 1.6;
    }
    if (/\b(i|you)\b/i.test(text)) {
      score += 0.6;
    }
    if (startSeconds <= 20) {
      score += 1.2;
    }

    const topKeywords = [...counts.entries()]
      .sort(
        (a, b) =>
          (fallbackKeywordWeights[b[0]] ?? 0) + b[1] -
          ((fallbackKeywordWeights[a[0]] ?? 0) + a[1]),
      )
      .map(([token]) => token)
      .filter((token) => token.length >= 4)
      .slice(0, 6);

    const titleSource = titleCaseWords(topKeywords.slice(0, 5).join(' ')) || 'Heuristic Clip';
    const hook = text.split(/\s+/).slice(0, 14).join(' ');

    return {
      title: titleSource,
      startSeconds,
      endSeconds: Math.min(durationSeconds, Math.max(startSeconds + minSeconds, endTarget)),
      score: Number(score.toFixed(1)),
      reason: `Fallback pick from transcript intensity around ${topKeywords.slice(0, 4).join(', ') || 'strong narrative hook'}.`,
      hook,
      highlightWords: topKeywords.length > 0 ? topKeywords : tokens.slice(0, 4),
    };
  };

  const candidates = candidateStarts
    .map((startSeconds) => clipForWindow(startSeconds))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const selected = [];
  for (const candidate of candidates) {
    const overlaps = selected.some(
      (clip) =>
        candidate.startSeconds < clip.endSeconds + paddingSeconds &&
        candidate.endSeconds > clip.startSeconds - paddingSeconds,
    );
    if (overlaps) {
      continue;
    }
    selected.push(candidate);
    if (selected.length >= maxClips) {
      break;
    }
  }

  if (selected.length > 0) {
    return {clips: selected};
  }

  const fallbackEnd = Math.min(durationSeconds, Math.max(minSeconds, targetDuration));
  const fallbackText = captions
    .slice(0, 120)
    .map((caption) => String(caption.text ?? '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const fallbackWords = tokenize(fallbackText).slice(0, 6);

  return {
    clips: [
      {
        title: titleCaseWords(fallbackWords.slice(0, 4).join(' ')) || 'Fallback Clip',
        startSeconds: 0,
        endSeconds: fallbackEnd,
        score: 10,
        reason: 'Fallback first-pass selection because AI clip ranking was unavailable.',
        hook: fallbackText.split(/\s+/).slice(0, 14).join(' '),
        highlightWords: fallbackWords.length > 0 ? fallbackWords : ['clip'],
      },
    ],
  };
};

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['clips'],
  properties: {
    clips: {
      type: 'array',
      minItems: 1,
      maxItems: maxClips,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'startSeconds',
          'endSeconds',
          'score',
          'reason',
          'hook',
          'highlightWords',
        ],
        properties: {
          title: {type: 'string'},
          startSeconds: {type: 'number'},
          endSeconds: {type: 'number'},
          score: {type: 'number'},
          reason: {type: 'string'},
          hook: {type: 'string'},
          highlightWords: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: {type: 'string'},
          },
        },
      },
    },
  },
};

const input = [
  {
    role: 'system',
    content:
      'You are a ruthless short-form video editor with a taste for clips that make people stop, save, and send. Select moments that can earn retention through clear hooks, counterintuitive insights, concrete tactics, emotional stakes, strong curiosity gaps, motivation, inspiration, identity-shifting ideas, spiritual resonance, discipline, purpose, faith, destiny, self-belief, or a grounded "this changed how I see life" feeling. Prefer complete thought arcs. Avoid bland intros, housekeeping, and repeated filler.',
  },
  {
    role: 'user',
    content: `Pick the ${maxClips} most viral-worthy variable-length clips from this transcript.

Rules:
- Clip length must be ${minSeconds}-${maxSeconds} seconds.
- Use exact timestamps from the transcript; add at most 1.0s padding before/after.
- The renderer will automatically add ${paddingSeconds.toFixed(1)}s before and after your chosen timestamps, so choose the core moment rather than inflating timestamps yourself.
- Prefer clips that stand alone without needing earlier context.
- Consider business/tactical clips, but also motivational, inspirational, spiritually interesting, purpose-driven, discipline-focused, or identity-shifting clips.
- Do not force every clip to be tactical. A clip can win because it feels emotionally true, spiritually charged, aspirational, or worldview-changing.
- Choose highlightWords that should appear in the alternate attention-grabbing font, like the example screenshot where one high-value word is in a different italic/script style.
- Return JSON only.

Video duration: ${videoMeta.durationSeconds.toFixed(1)} seconds
Transcript:
${chunks.join('\n')}`,
  },
];

const client = process.env.OPENAI_API_KEY ? new OpenAI() : null;
const candidateModels = [
  args['selection-model'],
  process.env.OPENAI_SELECTION_MODEL,
  'gpt-5.5',
  'gpt-4.1',
].filter(Boolean);

let selection;
let usedModel;
let lastError;

if (fs.existsSync(selectionPath) && !args.reselect) {
  selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
  usedModel = selection.model;
  console.log(`Using existing selection plan: ${selectionPath}`);
} else {
  if (client) {
    for (const model of candidateModels) {
      try {
        const response = await client.responses.create({
          model,
          input,
          text: {
            verbosity: 'medium',
            format: {
              type: 'json_schema',
              name: 'viral_clip_selection',
              strict: true,
              schema,
            },
          },
        });

        selection = JSON.parse(response.output_text);
        usedModel = model;
        break;
      } catch (error) {
        lastError = error;
        if (args['selection-model'] || process.env.OPENAI_SELECTION_MODEL) {
          break;
        }
      }
    }
  }

  if (!selection) {
    console.warn(
      `AI clip selection unavailable${lastError ? ` (${lastError.code ?? lastError.status ?? 'error'})` : ''}. Using heuristic fallback selection.`,
    );
    selection = buildFallbackSelection({
      captions,
      durationSeconds: videoMeta.durationSeconds,
    });
    usedModel = 'heuristic-fallback';
  }

  selection.model = usedModel;
  selection.sourceVideo = video;
  selection.sourceProfile = sourceProfile;
  selection.transcriptSource = transcriptEnhancement?.enabled
    ? `analysis-text-enhancement:${transcriptEnhancement.model}`
    : transcriptBundle.metadata?.provider ?? 'raw-captions';
  selection.thoughtBoundaryConfig = {
    enabled: thoughtSnappingEnabled,
    lookaroundSeconds: boundaryLookaroundSeconds,
    source: thoughtBoundaryPlan.source,
    unitCount: thoughtBoundaryPlan.units.length,
  };
  writeSelection();
  console.log(`Wrote selection plan: ${selectionPath}`);
}

const shiftCaptions = (startSeconds, endSeconds) => {
  const startMs = startSeconds * 1000;
  const endMs = endSeconds * 1000;

  return captions
    .filter((caption) => caption.endMs >= startMs && caption.startMs <= endMs)
    .map((caption, index) => ({
      ...caption,
      text: index === 0 ? caption.text.trim() : caption.text,
      startMs: Math.max(0, Math.round(caption.startMs - startMs)),
      endMs: Math.max(1, Math.round(caption.endMs - startMs)),
      timestampMs: Math.max(0, Math.round((caption.timestampMs ?? caption.startMs) - startMs)),
    }));
};

const shiftTranscriptEnhancementChunks = (startSeconds, endSeconds) => {
  if (!transcriptEnhancement?.enabled || !Array.isArray(transcriptEnhancement.chunks)) {
    return null;
  }

  const startMs = startSeconds * 1000;
  const endMs = endSeconds * 1000;
  const shiftedChunks = transcriptEnhancement.chunks
    .filter((chunk) => {
      const chunkStartMs = Number(chunk.startSeconds ?? 0) * 1000;
      const chunkEndMs = Number(chunk.endSeconds ?? 0) * 1000;
      return chunkEndMs >= startMs && chunkStartMs <= endMs;
    })
    .map((chunk, index) => ({
      index,
      startSeconds: Math.max(0, Number(chunk.startSeconds ?? 0) - startSeconds),
      endSeconds: Math.max(0, Number(chunk.endSeconds ?? 0) - startSeconds),
      rawText: String(chunk.rawText ?? '').trim(),
      correctedText: String(chunk.correctedText ?? chunk.rawText ?? '').trim(),
    }))
    .filter((chunk) => chunk.correctedText || chunk.rawText);

  if (shiftedChunks.length === 0) {
    return null;
  }

  return {
    attempted: true,
    enabled: true,
    model: transcriptEnhancement.model,
    sourceProvider: transcriptEnhancement.sourceProvider,
    chunkCount: shiftedChunks.length,
    changeCount: shiftedChunks.filter((chunk) => chunk.correctedText !== chunk.rawText).length,
    correctedText: shiftedChunks.map((chunk) => chunk.correctedText).join(' ').trim(),
    chunks: shiftedChunks,
  };
};

selection.clips.forEach((clip, index) => {
  const aiSelectedStart = Math.max(0, Number(clip.startSeconds));
  const aiSelectedEnd = Math.min(videoMeta.durationSeconds, Number(clip.endSeconds));
  const boundaryAdjusted = thoughtSnappingEnabled
    ? snapSelectionToThoughtBoundaries({
        startSeconds: aiSelectedStart,
        endSeconds: aiSelectedEnd,
        durationSeconds: videoMeta.durationSeconds,
        thoughtUnits: thoughtBoundaryPlan.units,
        lookaroundSeconds: boundaryLookaroundSeconds,
      })
    : {
        startSeconds: aiSelectedStart,
        endSeconds: aiSelectedEnd,
        adjusted: false,
        source: null,
      };
  const selectedStart = boundaryAdjusted.startSeconds;
  const selectedEnd = boundaryAdjusted.endSeconds;
  const start = Math.max(0, selectedStart - paddingSeconds);
  const end = Math.min(videoMeta.durationSeconds, selectedEnd + paddingSeconds);
  const duration = Math.max(1, end - start);
  clip.aiSelectedStartSeconds = aiSelectedStart;
  clip.aiSelectedEndSeconds = aiSelectedEnd;
  clip.selectedStartSeconds = selectedStart;
  clip.selectedEndSeconds = selectedEnd;
  clip.paddedStartSeconds = start;
  clip.paddedEndSeconds = end;
  clip.paddingSeconds = paddingSeconds;
  clip.thoughtBoundaryAdjusted = boundaryAdjusted.adjusted;
  clip.thoughtBoundarySource = thoughtBoundaryPlan.source;
  clip.thoughtBoundaryLookaroundSeconds = boundaryLookaroundSeconds;
  clip.thoughtBoundaryAlignment = boundaryAdjusted.source;
  clip.sourceProfile = sourceProfile;
  clip.viralScorecard = buildViralScorecard(clip);
  const clipSlug = `${String(index + 1).padStart(2, '0')}-${clip.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42)}`;
  const rawClipPath = path.join(workDir, `${clipSlug}.mp4`);
  const momentExportPath = path.join(outDir, `${clipSlug}.moment.mp4`);
  const sceneMixPath = path.join(workDir, `${clipSlug}.scene-mix.mp4`);
  const sfxMixPath = path.join(workDir, `${clipSlug}.sfx-mix.mp4`);
  const captionsPath = path.join(workDir, `${clipSlug}.captions.json`);
  const renderedPath = path.join(outDir, `${clipSlug}.captioned.mp4`);

  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(start),
      '-t',
      String(duration),
      '-i',
      video,
      '-map',
      '0:v?',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-vf',
      `scale='min(${reviewWidth},iw)':-2`,
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      rawClipPath,
    ],
    {stdio: 'inherit'},
  );

  clip.rawClipPath = rawClipPath;
  clip.momentExportPath = momentExportPath;

  const shiftedEnhancement = shiftTranscriptEnhancementChunks(start, end);
  fs.writeFileSync(
    captionsPath,
    JSON.stringify(
      {
        captions: shiftCaptions(start, end),
        ...(shiftedEnhancement
          ? {
              analysis: {
                textEnhancement: shiftedEnhancement,
              },
            }
          : {}),
      },
      null,
      2,
    ),
  );

  if (rawClipsOnly) {
    fs.copyFileSync(rawClipPath, momentExportPath);
    clip.exportedPath = momentExportPath;
    return;
  }

  let videoForRender = rawClipPath;

  if (contextScenesEnabled) {
    const sceneArgs = [
      'run',
      'scene:mix',
      '--',
      '--video',
      rawClipPath,
      '--captions',
      captionsPath,
      '--out',
      sceneMixPath,
      '--selection-path',
      selectionPath,
      '--clip-number',
      String(index + 1),
    ];

    if (styleConfig) {
      sceneArgs.push('--style-config', styleConfig);
    }
    if (sourceProfile) {
      sceneArgs.push('--source-profile', sourceProfile);
    }
    if (args['scene-library'] || contextScenesConfig.libraryDir) {
      sceneArgs.push('--scene-library', sceneLibraryPath);
    }
    if (args['library-config'] || fs.existsSync(libraryConfigPath)) {
      sceneArgs.push('--library-config', libraryConfigPath);
    }
    if (args['context-scenes']) {
      sceneArgs.push('--context-scenes');
    }
    if (args['disable-context-scenes']) {
      sceneArgs.push('--disable-context-scenes');
    }
    if (args['youtube-ingest']) {
      sceneArgs.push('--youtube-ingest');
    }
    if (args['disable-youtube-ingest'] || args['local-scenes-only']) {
      sceneArgs.push('--disable-youtube-ingest');
    }

    run('npm', sceneArgs);

    if (fs.existsSync(sceneMixPath)) {
      videoForRender = sceneMixPath;
      clip.contextSceneMixPath = sceneMixPath;
      clip.contextScenePlanPath = `${sceneMixPath.replace(/\.[^.]+$/, '')}.scene-plan.json`;
    }
  }

  if (soundEffectsEnabled) {
    const sfxArgs = [
      'run',
      'sfx:mix',
      '--',
      '--video',
      videoForRender,
      '--captions',
      captionsPath,
      '--out',
      sfxMixPath,
      '--selection-path',
      selectionPath,
      '--clip-number',
      String(index + 1),
    ];

    const inferredScenePlanPath = `${sceneMixPath.replace(/\.[^.]+$/, '')}.scene-plan.json`;
    if (fs.existsSync(inferredScenePlanPath)) {
      sfxArgs.push('--scene-plan', inferredScenePlanPath);
    }
    if (styleConfig) {
      sfxArgs.push('--style-config', styleConfig);
    }
    if (args['sfx-library'] || soundEffectsConfig.libraryDir) {
      sfxArgs.push('--sfx-library', sfxLibraryPath);
    }

    run('npm', sfxArgs);

    if (fs.existsSync(sfxMixPath)) {
      videoForRender = sfxMixPath;
      clip.soundEffectsMixPath = sfxMixPath;
      clip.soundEffectsPlanPath = `${sfxMixPath.replace(/\.[^.]+$/, '')}.sfx-plan.json`;
    }
  }

  const renderArgs = [
    'run',
    'render:clip',
    '--',
    '--video',
    videoForRender,
    '--captions',
    captionsPath,
    '--out',
    renderedPath,
    '--fps',
    String(reviewFps),
    '--highlight-words',
    clip.highlightWords.join(','),
  ];

  if (styleConfig) {
    renderArgs.push('--style-config', styleConfig);
  }

  if (verticalContain) {
    renderArgs.push('--vertical-contain');
  } else if (vertical) {
    renderArgs.push('--vertical');
  }

  run('npm', renderArgs);
});

selection.thoughtBoundaryConfig = {
  enabled: thoughtSnappingEnabled,
  lookaroundSeconds: boundaryLookaroundSeconds,
  source: thoughtBoundaryPlan.source,
  unitCount: thoughtBoundaryPlan.units.length,
};

writeSelection();

console.log(
  rawClipsOnly
    ? `Done. Exported selected source moments to: ${outDir}`
    : `Done. Review clips in: ${outDir}`,
);
