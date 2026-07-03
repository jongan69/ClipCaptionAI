#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import OpenAI from 'openai';
import {
  ensureDir,
  loadEnv,
  parseArgs,
  probeVideo,
  projectRoot,
  readCaptionStyleConfig,
  readCaptions,
  requireArg,
  run,
} from './lib.mjs';

const usage = `
Usage:
  npm run smart:clips -- --video original.mp4 [options]

Options:
  --out-dir DIR           Output folder. Default: outputs/smart-clips
  --work-dir DIR          Intermediate folder. Default: work/smart-clips
  --max-clips N           Number of clips to create. Default: 3
  --min-seconds N         Minimum clip length. Default: 18
  --max-seconds N         Maximum clip length. Default: 55
  --padding-seconds N     Extra seconds before and after each selected clip. Default: 2
  --review-width N        Downscale selected clips before captioning. Default: 1280
  --review-fps N          Render review clips at this FPS. Default: 15
  --reselect              Ignore existing selection.json and ask the model again.
  --vertical              Render selected clips as 1080x1920.
  --vertical-contain      Render selected clips as 1080x1920 with full horizontal video and black bars.
  --style-config FILE     Caption style JSON. Default: ./caption-style.json if present.
  --scene-library DIR     Folder of tagged scene clips for context-matched cutaways.
  --context-scenes        Force-enable context scene mixing.
  --disable-context-scenes Disable context scene mixing for this run.
  --sfx-library DIR       Folder of indexed sound effects. Default: soundEffects.libraryDir, then ./sfx-library.
  --sound-effects         Force-enable automatic low-volume sound effects.
  --disable-sound-effects Disable automatic sound effects for this run.
  --selection-model ID    OpenAI model for editorial selection. Default: OPENAI_SELECTION_MODEL or gpt-5.5.
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

const video = path.resolve(requireArg(args, 'video', usage));
const outDir = path.resolve(args['out-dir'] ?? path.join(projectRoot, 'outputs', 'smart-clips'));
const workDir = path.resolve(args['work-dir'] ?? path.join(projectRoot, 'work', 'smart-clips'));
const maxClips = Number(args['max-clips'] ?? 3);
const minSeconds = Number(args['min-seconds'] ?? 18);
const maxSeconds = Number(args['max-seconds'] ?? 55);
const paddingSeconds = Math.max(0, Number(args['padding-seconds'] ?? 2));
const reviewWidth = Number(args['review-width'] ?? 1280);
const reviewFps = Number(args['review-fps'] ?? 15);
const verticalContain = Boolean(args['vertical-contain']);
const vertical = Boolean(args.vertical) || verticalContain;
const styleConfig = args['style-config'] ? path.resolve(String(args['style-config'])) : null;
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
const sfxLibraryPath = args['sfx-library']
  ? path.resolve(String(args['sfx-library']))
  : soundEffectsConfig.libraryDir
    ? path.resolve(projectRoot, String(soundEffectsConfig.libraryDir))
    : path.join(projectRoot, 'sfx-library');

ensureDir(outDir);
ensureDir(workDir);

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

const wordRows = captions.map((caption) => ({
  start: Math.round(caption.startMs / 100) / 10,
  end: Math.round(caption.endMs / 100) / 10,
  text: caption.text.trim(),
}));

const chunkSize = 38;
const chunks = [];
for (let index = 0; index < wordRows.length; index += chunkSize) {
  const slice = wordRows.slice(index, index + chunkSize);
  if (slice.length === 0) {
    continue;
  }
  chunks.push(
    `[${slice[0].start.toFixed(1)}-${slice.at(-1).end.toFixed(1)}] ${slice
      .map((word) => word.text)
      .join(' ')}`,
  );
}

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

const client = new OpenAI();
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
  for (const model of candidateModels) {
    try {
      const response = await client.responses.create({
        model,
        input,
        reasoning: {effort: 'low'},
        text: {
          verbosity: 'low',
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

  if (!selection) {
    throw lastError;
  }

  selection.model = usedModel;
  selection.sourceVideo = video;
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

selection.clips.forEach((clip, index) => {
  const selectedStart = Math.max(0, Number(clip.startSeconds));
  const selectedEnd = Math.min(videoMeta.durationSeconds, Number(clip.endSeconds));
  const start = Math.max(0, selectedStart - paddingSeconds);
  const end = Math.min(videoMeta.durationSeconds, selectedEnd + paddingSeconds);
  const duration = Math.max(1, end - start);
  clip.selectedStartSeconds = selectedStart;
  clip.selectedEndSeconds = selectedEnd;
  clip.paddedStartSeconds = start;
  clip.paddedEndSeconds = end;
  clip.paddingSeconds = paddingSeconds;
  const clipSlug = `${String(index + 1).padStart(2, '0')}-${clip.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42)}`;
  const rawClipPath = path.join(workDir, `${clipSlug}.mp4`);
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

  fs.writeFileSync(
    captionsPath,
    JSON.stringify({captions: shiftCaptions(start, end)}, null, 2),
  );

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
    if (args['scene-library'] || contextScenesConfig.libraryDir) {
      sceneArgs.push('--scene-library', sceneLibraryPath);
    }
    if (args['context-scenes']) {
      sceneArgs.push('--context-scenes');
    }
    if (args['disable-context-scenes']) {
      sceneArgs.push('--disable-context-scenes');
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

writeSelection();

console.log(`Done. Review clips in: ${outDir}`);
