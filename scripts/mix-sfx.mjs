#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {
  ensureDir,
  parseArgs,
  probeVideo,
  projectRoot,
  readCaptionStyleConfig,
  readCaptions,
  requireArg,
} from './lib.mjs';

const usage = `
Usage:
  npm run sfx:mix -- --video input.mp4 --captions clip.captions.json --out output.mp4 [options]

Options:
  --style-config FILE     Caption style JSON. Default: ./caption-style.json if present.
  --sfx-library DIR       SFX library folder. Default: soundEffects.libraryDir, then ./sfx-library.
  --selection-path FILE   Optional selection.json for clip-level context.
  --clip-number N         Clip number inside selection.json.
  --scene-plan FILE       Optional context scene plan JSON.
  --disable-sfx           Copy the input video without adding sound effects.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const video = path.resolve(requireArg(args, 'video', usage));
const captionsPath = path.resolve(requireArg(args, 'captions', usage));
const outPath = path.resolve(requireArg(args, 'out', usage));
const styleConfig = readCaptionStyleConfig(args['style-config']);
const soundConfig = styleConfig.soundEffects ?? {};

const resolveMaybePath = (value) => {
  if (!value) {
    return null;
  }
  const raw = String(value);
  return path.isAbsolute(raw) ? raw : path.resolve(projectRoot, raw);
};

const enabled = args['disable-sfx'] ? false : Boolean(soundConfig.enabled ?? true);
const libraryDir = resolveMaybePath(args['sfx-library'] ?? soundConfig.libraryDir ?? './sfx-library');
const baseVolume = clamp(Number(soundConfig.volume ?? 0.065), 0, 0.4);
const originalAudioVolume = clamp(Number(soundConfig.originalAudioVolume ?? 1), 0, 1.5);
const maxEffectsPerClip = Math.max(0, Number(soundConfig.maxEffectsPerClip ?? 8));
const minGapSeconds = Math.max(0, Number(soundConfig.minGapSeconds ?? 2.2));
const edgeBufferSeconds = Math.max(0, Number(soundConfig.edgeBufferSeconds ?? 0.45));
const maxSfxDurationSeconds = Math.max(0.08, Number(soundConfig.maxSfxDurationSeconds ?? 1.2));
const transitionVolumeMultiplier = clamp(Number(soundConfig.transitionVolumeMultiplier ?? 0.78), 0, 2);
const keywordVolumeMultiplier = clamp(Number(soundConfig.keywordVolumeMultiplier ?? 1), 0, 2);
const sceneTransitionSfxEnabled = soundConfig.sceneTransitionSfxEnabled !== false;
const captionKeywordSfxEnabled = soundConfig.captionKeywordSfxEnabled !== false;
const allowSfxReuseWithinClip = Boolean(soundConfig.allowReuseWithinClip);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const normalize = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value) => normalize(value).split(/\s+/).filter(Boolean);

const defaultKeywordMap = {
  alert: ['correct', 'yes', 'win', 'works', 'key', 'idea', 'signal', 'important', 'first'],
  camera: ['camera', 'record', 'video', 'clip', 'content', 'screenshot', 'watch'],
  click: ['click', 'button', 'select', 'menu', 'account', 'link'],
  glitch: ['ai', 'algorithm', 'data', 'digital', 'system', 'hack', 'code', 'error', 'loading', 'reboot'],
  impact: ['power', 'serious', 'locked', 'changed', 'transform', 'discipline', 'focus', 'hard', 'excuses', 'boom'],
  money: ['money', 'cash', 'coin', 'coins', 'sale', 'sales', 'profit', 'revenue', 'dollar', 'dollars', 'paid', 'buy', 'purchase', 'shopify', 'rich', 'wealth', 'rolex', 'corvette', 'order', 'customer'],
  paper: ['paper', 'document', 'notes', 'copy', 'page', 'script', 'reviews'],
  pop: ['wow', 'cool', 'what', 'hook', 'attention', 'stop', 'new', 'wait'],
  spiritual: ['god', 'faith', 'bless', 'pray', 'prayer', 'spiritual', 'glory'],
  suspense: ['broke', 'homeless', 'fail', 'failure', 'wrong', 'fear', 'problem', 'dark', 'nobody', 'hesitate'],
  typing: ['type', 'typing', 'write', 'writing', 'keyboard', 'search', 'claude', 'document'],
  whoosh: ['fast', 'speed', 'viral', 'scroll', 'move', 'momentum', 'go', 'transition', 'flow', 'volume', 'post'],
};

const mergeKeywordMap = (customMap) => {
  const merged = {...defaultKeywordMap};
  if (!customMap || typeof customMap !== 'object' || Array.isArray(customMap)) {
    return merged;
  }
  for (const [category, words] of Object.entries(customMap)) {
    if (!Array.isArray(words)) {
      continue;
    }
    merged[category] = [...new Set([...(merged[category] ?? []), ...words.map(String)])];
  }
  return merged;
};

const keywordMap = mergeKeywordMap(soundConfig.contextKeywords);

const categoryForText = (text, fallback = 'whoosh') => {
  const normalized = ` ${normalize(text)} `;
  const tokenSet = new Set(tokenize(text));
  let best = {category: fallback, score: 0};
  for (const [category, words] of Object.entries(keywordMap)) {
    let score = 0;
    for (const word of words) {
      const normalizedWord = normalize(word);
      if (!normalizedWord) {
        continue;
      }
      if (normalizedWord.includes(' ')) {
        if (normalized.includes(` ${normalizedWord} `)) {
          score += 3;
        }
        continue;
      }
      if (tokenSet.has(normalizedWord)) {
        score += 1;
      }
    }
    if (score > best.score) {
      best = {category, score};
    }
  }
  return best.score > 0 ? best.category : fallback;
};

const stableHash = (value) => {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const probeDurationSeconds = (filePath) => {
  try {
    const output = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      {encoding: 'utf8'},
    );
    const duration = Number(output.trim());
    return Number.isFinite(duration) ? duration : null;
  } catch {
    return null;
  }
};

const hasAudioStream = (filePath) => {
  try {
    const output = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_type',
        '-of',
        'csv=p=0',
        filePath,
      ],
      {encoding: 'utf8'},
    );
    return output.trim().length > 0;
  } catch {
    return false;
  }
};

const loadSelectionClip = () => {
  const selectionPath = args['selection-path'] ? path.resolve(String(args['selection-path'])) : null;
  if (!selectionPath || !fs.existsSync(selectionPath)) {
    return null;
  }
  const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
  const clipNumber = Math.max(1, Number(args['clip-number'] ?? 1));
  return selection.clips?.[clipNumber - 1] ?? null;
};

const readSelectionFile = (selectionPath) => {
  if (!selectionPath || !fs.existsSync(selectionPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
};

const usedIdsFromSelection = (selectionPath, usageKey, clipNumber) => {
  const selection = readSelectionFile(selectionPath);
  const usage = selection?.generatedUsage?.[usageKey];
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return new Set();
  }

  const currentKey = String(Math.max(1, Number(clipNumber ?? 1)));
  return new Set(
    Object.entries(usage)
      .filter(([key]) => key !== currentKey)
      .flatMap(([, ids]) => (Array.isArray(ids) ? ids : []))
      .map(String)
      .filter(Boolean),
  );
};

const writeIdsToSelection = (selectionPath, usageKey, clipNumber, ids) => {
  if (!selectionPath) {
    return;
  }

  const selection = readSelectionFile(selectionPath);
  if (!selection) {
    return;
  }

  selection.generatedUsage ??= {};
  selection.generatedUsage[usageKey] ??= {};
  selection.generatedUsage[usageKey][String(Math.max(1, Number(clipNumber ?? 1)))] = [
    ...new Set(ids.map(String).filter(Boolean)),
  ];
  fs.writeFileSync(selectionPath, `${JSON.stringify(selection, null, 2)}\n`);
};

const loadScenePlan = () => {
  const explicit = args['scene-plan'] ? path.resolve(String(args['scene-plan'])) : null;
  const inferred = `${video.replace(/\.[^.]+$/, '')}.scene-plan.json`;
  const scenePlanPath = explicit ?? (fs.existsSync(inferred) ? inferred : null);
  if (!scenePlanPath || !fs.existsSync(scenePlanPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(scenePlanPath, 'utf8'));
};

const loadSfxLibrary = () => {
  if (!libraryDir || !fs.existsSync(libraryDir)) {
    return [];
  }
  const indexPath = path.join(libraryDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  return (Array.isArray(index.sounds) ? index.sounds : [])
    .filter((sound) => sound.hasAudio !== false)
    .map((sound) => ({
      ...sound,
      filePath: path.resolve(libraryDir, sound.file),
    }))
    .filter((sound) => fs.existsSync(sound.filePath) && hasAudioStream(sound.filePath));
};

const pickSound = (library, category, seed, usedSoundIds) => {
  const unused = (sounds) =>
    allowSfxReuseWithinClip
      ? sounds
      : sounds.filter((sound) => !usedSoundIds.has(String(sound.id)));
  const preferred = unused(library.filter((sound) => sound.category === category));
  const fallback = unused(library.filter((sound) => ['whoosh', 'impact', 'pop', 'alert'].includes(sound.category)));
  const anyUnused = unused(library);
  const candidates = preferred.length > 0 ? preferred : fallback.length > 0 ? fallback : anyUnused;
  if (candidates.length === 0) {
    return null;
  }
  return candidates[stableHash(`${category}:${seed}`) % candidates.length];
};

const addEventIfAllowed = (events, event, durationSeconds) => {
  if (event.startSeconds < edgeBufferSeconds || event.startSeconds > durationSeconds - edgeBufferSeconds) {
    return;
  }
  if (events.some((existing) => Math.abs(existing.startSeconds - event.startSeconds) < minGapSeconds)) {
    return;
  }
  events.push(event);
};

const buildEvents = ({
  captions,
  selectionClip,
  scenePlan,
  library,
  durationSeconds,
  blockedSoundIds = new Set(),
}) => {
  const events = [];

  if (sceneTransitionSfxEnabled && Array.isArray(scenePlan?.insertions)) {
    for (const insertion of scenePlan.insertions) {
      const startSeconds = Number(insertion.startSeconds ?? 0);
      const text = [
        insertion.query,
        insertion.reason,
        ...(Array.isArray(insertion.keywords) ? insertion.keywords : []),
      ].join(' ');
      const category = categoryForText(text, 'whoosh');
      addEventIfAllowed(
        events,
        {
          startSeconds,
          category: category === 'money' ? 'money' : category === 'spiritual' ? 'spiritual' : 'whoosh',
          reason: `scene transition: ${String(insertion.query ?? '').slice(0, 90)}`,
          priority: 100,
          volumeMultiplier: transitionVolumeMultiplier,
        },
        durationSeconds,
      );
    }
  }

  if (captionKeywordSfxEnabled) {
    const selectionText = [
      selectionClip?.title,
      selectionClip?.hook,
      selectionClip?.reason,
      ...(Array.isArray(selectionClip?.highlightWords) ? selectionClip.highlightWords : []),
    ].join(' ');

    const clipCategory = categoryForText(selectionText, null);
    for (const [index, caption] of captions.entries()) {
      const nearby = captions
        .slice(Math.max(0, index - 2), Math.min(captions.length, index + 3))
        .map((item) => item.text)
        .join(' ');
      const category = categoryForText(`${nearby} ${selectionText}`, clipCategory ?? 'pop');
      if (!category) {
        continue;
      }
      const exactCategory = categoryForText(caption.text, null);
      const isHighlight =
        Array.isArray(selectionClip?.highlightWords) &&
        selectionClip.highlightWords.some((word) => normalize(word) === normalize(caption.text));
      if (!exactCategory && !isHighlight) {
        continue;
      }
      addEventIfAllowed(
        events,
        {
          startSeconds: Math.max(0, Number(caption.startMs ?? 0) / 1000),
          category,
          reason: `caption keyword: ${String(caption.text ?? '').trim()}`,
          priority: isHighlight ? 80 : 50,
          volumeMultiplier: keywordVolumeMultiplier,
        },
        durationSeconds,
      );
    }
  }

  const ranked = events.sort((a, b) => b.priority - a.priority || a.startSeconds - b.startSeconds);
  const usedSoundIds = new Set(blockedSoundIds);
  const selected = [];

  for (const [index, event] of ranked.entries()) {
    if (selected.length >= maxEffectsPerClip) {
      break;
    }
    const sound = pickSound(
      library,
      event.category,
      `${event.startSeconds}:${event.reason}:${index}`,
      usedSoundIds,
    );
    if (!sound) {
      continue;
    }
    usedSoundIds.add(String(sound.id));
    const soundDuration = Number(sound.durationSeconds ?? probeDurationSeconds(sound.filePath) ?? maxSfxDurationSeconds);
    selected.push({
      ...event,
      soundId: sound.id,
      soundFile: sound.file,
      soundPath: sound.filePath,
      durationSeconds: Math.min(maxSfxDurationSeconds, Math.max(0.08, soundDuration)),
      volume: Number((baseVolume * event.volumeMultiplier).toFixed(4)),
    });
  }

  return selected.sort((a, b) => a.startSeconds - b.startSeconds);
};

const copyVideo = () => {
  ensureDir(path.dirname(outPath));
  fs.copyFileSync(video, outPath);
};

if (!enabled || maxEffectsPerClip === 0 || baseVolume <= 0) {
  copyVideo();
  process.exit(0);
}

const metadata = probeVideo(video);
const captions = readCaptions(captionsPath);
const selectionClip = loadSelectionClip();
const selectionPath = args['selection-path'] ? path.resolve(String(args['selection-path'])) : null;
const clipNumber = Math.max(1, Number(args['clip-number'] ?? 1));
const scenePlan = loadScenePlan();
const library = loadSfxLibrary();

if (library.length === 0) {
  console.warn(`No indexed SFX were found in ${libraryDir}. Run npm run sfx:standardize first.`);
  copyVideo();
  process.exit(0);
}

const events = buildEvents({
  captions,
  selectionClip,
  scenePlan,
  library,
  durationSeconds: metadata.durationSeconds,
  blockedSoundIds: usedIdsFromSelection(selectionPath, 'soundEffects', clipNumber),
});

ensureDir(path.dirname(outPath));

const planPath = `${outPath.replace(/\.[^.]+$/, '')}.sfx-plan.json`;
fs.writeFileSync(
  planPath,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      sourceVideo: video,
      captionsPath,
      outputVideo: outPath,
      sfxLibraryDir: libraryDir,
      config: {
        volume: baseVolume,
        originalAudioVolume,
        maxEffectsPerClip,
        minGapSeconds,
        edgeBufferSeconds,
        maxSfxDurationSeconds,
        allowReuseWithinClip: allowSfxReuseWithinClip,
      },
      selectionClip,
      events: events.map(({soundPath, ...event}) => event),
    },
    null,
    2,
  ),
);

writeIdsToSelection(
  selectionPath,
  'soundEffects',
  clipNumber,
  events.map((event) => event.soundId),
);

if (events.length === 0) {
  copyVideo();
  console.log(`No SFX events selected. Copied source video and wrote plan: ${planPath}`);
  process.exit(0);
}

const inputArgs = events.flatMap((event) => ['-i', event.soundPath]);
const sourceHasAudio = hasAudioStream(video);
const filters = [];
if (sourceHasAudio) {
  filters.push(`[0:a]aformat=channel_layouts=stereo,volume=${originalAudioVolume}[base]`);
} else {
  filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${metadata.durationSeconds.toFixed(3)}[base]`);
}

events.forEach((event, index) => {
  const inputIndex = index + 1;
  const delayMs = Math.max(0, Math.round(event.startSeconds * 1000));
  filters.push(
    `[${inputIndex}:a]aformat=channel_layouts=stereo,atrim=0:${event.durationSeconds.toFixed(3)},asetpts=PTS-STARTPTS,volume=${event.volume},adelay=${delayMs}|${delayMs}[sfx${index}]`,
  );
});

const mixInputs = ['[base]', ...events.map((_, index) => `[sfx${index}]`)].join('');
filters.push(
  `${mixInputs}amix=inputs=${events.length + 1}:duration=first:normalize=0:dropout_transition=0,alimiter=limit=0.96[aout]`,
);

execFileSync(
  'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    video,
    ...inputArgs,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    outPath,
  ],
  {stdio: 'inherit'},
);

console.log(`SFX mix written to: ${outPath}`);
console.log(`SFX plan written to: ${planPath}`);
