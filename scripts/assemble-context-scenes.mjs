#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
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
} from './lib.mjs';
import {ingestYouTubeScenes} from './lib-youtube-scenes.mjs';
import {
  enrichInsertionsWithPopCultureQueries,
  researchPopCultureScenes,
} from './lib-pop-culture-scenes.mjs';

const usage = `
Usage:
  npm run scene:mix -- --video clip.mp4 --captions clip.captions.json --out clip.scene-mix.mp4 [options]

Options:
  --style-config FILE       Caption style JSON. Reads contextScenes from here by default.
  --scene-library DIR       Folder containing scene clips or an index.json manifest.
  --selection-path FILE     Optional selection.json for clip hook/reason/highlight words.
  --clip-number N           1-based clip number inside selection.json.
  --context-scenes          Force-enable scene mixing for this run.
  --disable-context-scenes  Force-disable scene mixing for this run.
  --youtube-ingest       Force-enable YouTube scene ingest.
  --disable-youtube-ingest Force-disable YouTube scene ingest.
  --youtube-channel-id ID   Restrict YouTube ingest to one channel.
  --pop-culture-research    Write movie/TV scene candidate research for planned inserts.
  --disable-pop-culture-research Skip movie/TV scene candidate research.
  --movie-scenes            Bias YouTube ingest/scoring toward official movie and TV scene clips.
  --max-insertions N        Override max insertions per clip.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

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
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/(ing|ed|es|s)$/g, '');

const tokenize = (value) =>
  String(value ?? '')
    .split(/[^a-zA-Z0-9]+/)
    .map(normalizeToken)
    .filter((token) => token && !stopWords.has(token));

const slugify = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const isVideoFile = (file) => /\.(mp4|mov|m4v|webm)$/i.test(file);

const normalizeStringList = (value, fallback = []) => {
  const raw = Array.isArray(value) ? value : fallback;
  return raw
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
};

const copyVideo = (input, output) => {
  ensureDir(path.dirname(output));
  if (path.resolve(input) === path.resolve(output)) {
    return;
  }

  fs.copyFileSync(input, output);
};

const buildTranscriptChunks = (captions, targetWords) => {
  const chunks = [];
  let current = [];
  let startMs = null;
  let endMs = null;

  const flush = () => {
    if (current.length === 0 || startMs === null || endMs === null) {
      return;
    }

    chunks.push({
      startSeconds: startMs / 1000,
      endSeconds: endMs / 1000,
      text: current.join(' '),
    });
    current = [];
    startMs = null;
    endMs = null;
  };

  for (const caption of captions) {
    const text = String(caption.text ?? '').trim();
    if (!text) {
      continue;
    }

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      continue;
    }

    if (startMs === null) {
      startMs = caption.startMs;
    }

    endMs = caption.endMs;
    current.push(...words);

    if (current.length >= targetWords) {
      flush();
    }
  }

  flush();
  return chunks;
};

const resolveMaybePath = (value, baseDir = projectRoot) => {
  if (!value) {
    return null;
  }

  return path.isAbsolute(String(value))
    ? path.resolve(String(value))
    : path.resolve(baseDir, String(value));
};

const loadSelectionClip = (selectionPath, clipNumber) => {
  if (!selectionPath || !fs.existsSync(selectionPath)) {
    return null;
  }

  const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
  const clips = Array.isArray(selection.clips) ? selection.clips : [];
  const index = Math.max(0, Number(clipNumber ?? 1) - 1);
  return clips[index] ?? null;
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

const popCultureAllowedAvoidTerms = new Set([
  'anime',
  'cartoon',
  'compilation',
  'funny',
  'meme',
]);

const removePopCultureAllowedAvoidTerms = (terms) =>
  normalizeStringList(terms).filter(
    (term) => !popCultureAllowedAvoidTerms.has(term.toLowerCase()),
  );

const scanSceneDir = (dir) => {
  const files = [];

  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, {withFileTypes: true})) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (isVideoFile(entry.name)) {
        files.push(entryPath);
      }
    }
  };

  walk(dir);
  return files.sort();
};

const loadSceneManifest = (libraryDir) => {
  const manifestPath = path.join(libraryDir, 'index.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return Array.isArray(parsed?.scenes) ? parsed.scenes : null;
};

const loadSidecar = (videoPath) => {
  const sidecarPath = `${videoPath}.scene.json`;
  const fallbackPath = path.join(
    path.dirname(videoPath),
    `${path.basename(videoPath, path.extname(videoPath))}.scene.json`,
  );

  const resolved = fs.existsSync(sidecarPath)
    ? sidecarPath
    : fs.existsSync(fallbackPath)
      ? fallbackPath
      : null;

  if (!resolved) {
    return {};
  }

  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
};

const loadSceneLibrary = (libraryDir) => {
  if (!libraryDir || !fs.existsSync(libraryDir)) {
    return [];
  }

  const manifestScenes = loadSceneManifest(libraryDir);
  const rawScenes =
    manifestScenes ??
    scanSceneDir(libraryDir).map((file) => ({
      file: path.relative(libraryDir, file),
      ...loadSidecar(file),
    }));

  return rawScenes
    .map((scene, index) => {
      const filePath = resolveMaybePath(scene.file, libraryDir);
      if (!filePath || !fs.existsSync(filePath)) {
        return null;
      }

      const meta = probeVideo(filePath);
      const sceneStart = Math.max(0, Number(scene.startSeconds ?? scene.clipStartSeconds ?? 0));
      const declaredEnd = Number(
        scene.endSeconds ?? scene.clipEndSeconds ?? meta.durationSeconds,
      );
      const sceneEnd = Math.min(
        meta.durationSeconds,
        Number.isFinite(declaredEnd) ? declaredEnd : meta.durationSeconds,
      );
      const durationSeconds = Math.max(0, sceneEnd - sceneStart);

      if (durationSeconds < 0.5) {
        return null;
      }

      return {
        id:
          String(scene.id ?? slugify(scene.title ?? path.basename(filePath, path.extname(filePath)))) ||
          `scene-${index + 1}`,
        filePath,
        title:
          String(scene.title ?? path.basename(filePath, path.extname(filePath)).replace(/[_-]+/g, ' ')),
        source: String(scene.source ?? ''),
        description: String(scene.description ?? ''),
        tags: Array.isArray(scene.tags) ? scene.tags.map(String) : [],
        attribution:
          scene.attribution && typeof scene.attribution === 'object' && !Array.isArray(scene.attribution)
            ? scene.attribution
            : {},
        startSeconds: sceneStart,
        endSeconds: sceneEnd,
        durationSeconds,
        width: meta.width,
        height: meta.height,
      };
    })
    .filter(Boolean);
};

const isStockLikeScene = (scene) => {
  const text = [
    scene.title,
    scene.source,
    scene.description,
    ...(Array.isArray(scene.tags) ? scene.tags : []),
  ]
    .join(' ')
    .toLowerCase();

  return /\b(stock|b-?roll|footage|commercial|advertisement|ad\b|product demo|no copy ?right|royalty free|slow motion|4k clip)\b/i.test(
    text,
  ) || /\b(stockify|storyblocks?|shutterstock|alamy|pond5|envato|videohive|depositphotos|cliplab|media whale stock|stock depot|ai cinematic|ai generated|free to use|free download|copyright free)\b/i.test(
    text,
  );
};

const isMovieOrTvLikeScene = (scene) => {
  const text = [
    scene.title,
    scene.source,
  ]
    .join(' ')
    .toLowerCase();

  return /\b(movieclips?|filmclips?|movie clip|film clip|official clip|clip from|scene from|movie scene|film scene|tv scene|show scene|season \d|s\d+e\d+|netflix|hbo|tbs|bbc|warner bros|paramount|universal|sony pictures|20th century|rotton tomatoes|rotten tomatoes|binge society|scene city)\b/i.test(
    text,
  );
};

const popCultureMatchScore = (scene, insertion) => {
  const queries = normalizeStringList(insertion?.popCultureSearchQueries);
  if (queries.length === 0) {
    return 0;
  }

  const attribution = scene.attribution ?? {};
  const sceneText = [
    scene.title,
    scene.source,
    scene.description,
    attribution.ingestedFromQuery,
    attribution.ingestedFromSearchQuery,
    attribution.url,
  ]
    .join(' ')
    .toLowerCase();

  let best = 0;
  for (const query of queries) {
    const normalizedQuery = query.toLowerCase();
    const titleish = normalizedQuery
      .replace(/\bofficial clip\b|\bscene\b|\bhd\b|\b4k\b/gi, ' ')
      .replace(/[^\w\s:.'&-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const queryTokens = tokenize(query);
    const distinctiveTokens = [...new Set(queryTokens)].filter((token) => token.length >= 4);
    const tokenMatches = distinctiveTokens.filter((token) => sceneText.includes(token)).length;

    if (
      String(attribution.ingestedFromSearchQuery ?? '').toLowerCase() === normalizedQuery ||
      String(attribution.ingestedFromQuery ?? '').toLowerCase() === normalizedQuery
    ) {
      best = Math.max(best, 90);
    }

    if (titleish && sceneText.includes(titleish)) {
      best = Math.max(best, 75);
    }

    if (tokenMatches >= 4) {
      best = Math.max(best, 55 + Math.min(20, tokenMatches * 2));
    } else if (tokenMatches >= 2) {
      best = Math.max(best, 22 + tokenMatches * 5);
    }
  }

  return best;
};

const scoreScene = (
  scene,
  queryTokens,
  avoidTokens,
  usedSceneIds,
  insertion = {},
  {preferMovieScenes = false} = {},
) => {
  if (usedSceneIds.has(scene.id)) {
    return -Infinity;
  }

  const titleTokens = tokenize(scene.title);
  const sourceTokens = tokenize(scene.source);
  const descriptionTokens = tokenize(scene.description);
  const tagTokens = scene.tags.flatMap(tokenize);
  const searchableText = [
    scene.title,
    scene.source,
    scene.description,
    ...(Array.isArray(scene.tags) ? scene.tags : []),
  ]
    .join(' ')
    .toLowerCase();

  if (
    /\b(subscribe|watermark|storyblocks?|shutterstock|alamy|preview only|green screen|greenscreen|fan edit|sigma edit)\b/i.test(
      searchableText,
    )
  ) {
    return -Infinity;
  }

  let score = 0;
  const popScore = popCultureMatchScore(scene, insertion);
  const hasPopCultureQueries = normalizeStringList(insertion.popCultureSearchQueries).length > 0;
  const wantsMovieScene = preferMovieScenes || hasPopCultureQueries;
  const attribution = scene.attribution ?? {};
  const wasIngestedFromSearch = Boolean(
    attribution.ingestedFromSearchQuery || attribution.ingestedFromQuery,
  );

  score += popScore;
  if (wantsMovieScene && isStockLikeScene(scene)) {
    return -Infinity;
  }
  if (wantsMovieScene && !isMovieOrTvLikeScene(scene)) {
    return -Infinity;
  }
  if (hasPopCultureQueries && popScore === 0 && isStockLikeScene(scene)) {
    score -= 160;
  }
  if (hasPopCultureQueries && popScore === 0 && wasIngestedFromSearch) {
    score -= 60;
  }
  if (hasPopCultureQueries && isStockLikeScene(scene)) {
    score -= 120;
  }
  if (hasPopCultureQueries && !isMovieOrTvLikeScene(scene)) {
    score -= 80;
  }

  for (const token of queryTokens) {
    if (tagTokens.includes(token)) {
      score += 5;
    }
    if (titleTokens.includes(token)) {
      score += 3;
    }
    if (sourceTokens.includes(token)) {
      score += 2;
    }
    if (descriptionTokens.includes(token)) {
      score += 1.25;
    }
  }

  for (const token of avoidTokens) {
    if (
      tagTokens.includes(token) ||
      titleTokens.includes(token) ||
      sourceTokens.includes(token) ||
      descriptionTokens.includes(token)
    ) {
      score -= 4;
    }
  }

  if (scene.durationSeconds >= 1.6) {
    score += 0.3;
  }
  if (scene.durationSeconds >= 2.4) {
    score += 0.3;
  }

  return score;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeInsertions = (insertions, durationSeconds, config) => {
  const sorted = [...insertions]
    .map((insertion) => {
      const start = clamp(
        Number(insertion.startSeconds ?? 0),
        config.edgeBufferSeconds,
        Math.max(config.edgeBufferSeconds, durationSeconds - config.edgeBufferSeconds),
      );
      const desiredEnd = clamp(
        Number(insertion.endSeconds ?? start + config.minInsertionSeconds),
        start + config.minInsertionSeconds,
        Math.min(durationSeconds - config.edgeBufferSeconds, start + config.maxInsertionSeconds),
      );

      return {
        ...insertion,
        searchQueries: normalizeStringList(insertion.searchQueries, [insertion.query]),
        avoidTerms: normalizeStringList(insertion.avoidTerms),
        startSeconds: start,
        endSeconds: desiredEnd,
      };
    })
    .filter(
      (insertion) =>
        insertion.endSeconds - insertion.startSeconds >= config.minInsertionSeconds,
    )
    .sort((a, b) => a.startSeconds - b.startSeconds);

  const cleaned = [];
  let cursor = config.edgeBufferSeconds;
  let covered = 0;
  const maxCoverage = durationSeconds * config.maxCoverageRatio;

  for (const insertion of sorted) {
    const minStart = cursor + config.minGapSeconds;
    const availableEnd = durationSeconds - config.edgeBufferSeconds;
    const start = clamp(
      insertion.startSeconds,
      minStart,
      Math.max(minStart, availableEnd - config.minInsertionSeconds),
    );
    const end = clamp(
      insertion.endSeconds,
      start + config.minInsertionSeconds,
      Math.min(availableEnd, start + config.maxInsertionSeconds),
    );
    const duration = end - start;

    if (duration < config.minInsertionSeconds) {
      continue;
    }

    if (covered + duration > maxCoverage) {
      break;
    }

    cleaned.push({
      ...insertion,
      startSeconds: start,
      endSeconds: end,
    });
    covered += duration;
    cursor = end;
  }

  return cleaned.slice(0, config.maxInsertionsPerClip);
};

const selectScenesForInsertions = (
  insertions,
  scenes,
  allowReuse,
  globalAvoidTerms = [],
  blockedSceneIds = new Set(),
  scoreOptions = {},
) => {
  const usedSceneIds = new Set(blockedSceneIds);
  const globalBlockedSceneIds = new Set(blockedSceneIds);

  return insertions
    .map((insertion) => {
      const queryTokens = tokenize(
        [
          insertion.query,
          insertion.reason,
          ...(Array.isArray(insertion.searchQueries) ? insertion.searchQueries : []),
          ...(Array.isArray(insertion.keywords) ? insertion.keywords : []),
        ].join(' '),
      );
      const avoidTokens = tokenize(
        [
          ...globalAvoidTerms,
          ...(Array.isArray(insertion.avoidTerms) ? insertion.avoidTerms : []),
        ].join(' '),
      );

      const ranked = scenes
        .map((scene) => ({
          scene,
          score: scoreScene(
            scene,
            queryTokens,
            avoidTokens,
            allowReuse ? globalBlockedSceneIds : usedSceneIds,
            insertion,
            scoreOptions,
          ),
        }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((a, b) => b.score - a.score);

      const best = ranked[0];
      if (!best || best.score < 2.5) {
        return null;
      }

      if (!allowReuse) {
        usedSceneIds.add(best.scene.id);
      }

      const desiredDuration = insertion.endSeconds - insertion.startSeconds;
      const availableDuration = best.scene.endSeconds - best.scene.startSeconds;
      const sceneDuration = Math.min(desiredDuration, availableDuration);

      if (sceneDuration < 0.6) {
        return null;
      }

      return {
        ...insertion,
        sceneId: best.scene.id,
        sceneTitle: best.scene.title,
        sceneSource: best.scene.source,
        sceneFilePath: best.scene.filePath,
        sceneClipStartSeconds: best.scene.startSeconds,
        sceneClipEndSeconds: best.scene.startSeconds + sceneDuration,
        sceneScore: Number(best.score.toFixed(2)),
      };
    })
    .filter(Boolean);
};

const insertionCoverageStats = (insertions, durationSeconds) => {
  const coverageSeconds = insertions.reduce(
    (sum, insertion) =>
      sum + Math.max(0, Number(insertion.endSeconds ?? 0) - Number(insertion.startSeconds ?? 0)),
    0,
  );

  return {
    insertionCount: insertions.length,
    coverageSeconds: Number(coverageSeconds.toFixed(2)),
    coverageRatio: durationSeconds > 0
      ? Number((coverageSeconds / durationSeconds).toFixed(3))
      : 0,
  };
};

const buildVideoFilter = (width, height, fps) =>
  `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;

const renderSegment = ({
  inputPath,
  startSeconds,
  durationSeconds,
  outputPath,
  width,
  height,
  fps,
}) => {
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(startSeconds),
      '-t',
      String(durationSeconds),
      '-i',
      inputPath,
      '-an',
      '-vf',
      buildVideoFilter(width, height, fps),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      outputPath,
    ],
    {stdio: 'inherit'},
  );
};

const buildSceneMix = ({
  sourceVideo,
  outputPath,
  insertions,
  metadata,
}) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipcaption-scene-mix-'));
  const durationSeconds = metadata.durationSeconds;
  let segmentIndex = 0;
  let cursor = 0;
  const segmentPaths = [];

  const pushSource = (startSeconds, endSeconds) => {
    const duration = endSeconds - startSeconds;
    if (duration <= 0.05) {
      return;
    }

    const segmentPath = path.join(
      tempDir,
      `${String(segmentIndex).padStart(3, '0')}-source.mp4`,
    );
    renderSegment({
      inputPath: sourceVideo,
      startSeconds,
      durationSeconds: duration,
      outputPath: segmentPath,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
    });
    segmentPaths.push(segmentPath);
    segmentIndex += 1;
  };

  const pushScene = (insertion) => {
    const duration = insertion.endSeconds - insertion.startSeconds;
    if (duration <= 0.05) {
      return;
    }

    const segmentPath = path.join(
      tempDir,
      `${String(segmentIndex).padStart(3, '0')}-scene.mp4`,
    );
    renderSegment({
      inputPath: insertion.sceneFilePath,
      startSeconds: insertion.sceneClipStartSeconds,
      durationSeconds: duration,
      outputPath: segmentPath,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
    });
    segmentPaths.push(segmentPath);
    segmentIndex += 1;
  };

  for (const insertion of insertions) {
    pushSource(cursor, insertion.startSeconds);
    pushScene(insertion);
    cursor = insertion.endSeconds;
  }

  pushSource(cursor, durationSeconds);

  const concatListPath = path.join(tempDir, 'segments.txt');
  fs.writeFileSync(
    concatListPath,
    segmentPaths.map((segmentPath) => `file '${segmentPath.replaceAll("'", "'\\''")}'`).join('\n'),
  );

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
      concatListPath,
      '-i',
      sourceVideo,
      '-map',
      '0:v:0',
      '-map',
      '1:a?',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      outputPath,
    ],
    {stdio: 'inherit'},
  );

  fs.rmSync(tempDir, {recursive: true, force: true});
};

loadEnv();

const video = path.resolve(requireArg(args, 'video', usage));
const captionsPath = path.resolve(requireArg(args, 'captions', usage));
const outPath = path.resolve(requireArg(args, 'out', usage));
const styleConfigPath = args['style-config']
  ? path.resolve(String(args['style-config']))
  : undefined;
const styleConfig = readCaptionStyleConfig(styleConfigPath);
const contextScenes = styleConfig.contextScenes ?? {};
const youtubeIngestConfig = contextScenes.youtubeIngest ?? {};
const queryStyleConfig = contextScenes.queryStyle ?? {};
const popCultureResearchConfig = contextScenes.popCultureResearch ?? {};
const enabled = args['disable-context-scenes']
  ? false
  : args['context-scenes']
    ? true
    : Boolean(contextScenes.enabled);
const youtubeIngestEnabled = args['disable-youtube-ingest']
  ? false
  : args['youtube-ingest']
    ? true
    : Boolean(youtubeIngestConfig.enabled);
const popCultureResearchEnabled = args['disable-pop-culture-research']
  ? false
  : args['pop-culture-research']
    ? true
    : Boolean(popCultureResearchConfig.enabled);

ensureDir(path.dirname(outPath));

if (!enabled) {
  copyVideo(video, outPath);
  process.exit(0);
}

const sceneLibraryDir = resolveMaybePath(
  args['scene-library'] ?? contextScenes.libraryDir ?? './scene-library',
);

if (!sceneLibraryDir) {
  console.warn('Scene library path could not be resolved. Using source clip only.');
  copyVideo(video, outPath);
  process.exit(0);
}

ensureDir(sceneLibraryDir);

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY missing, so context scene planning is disabled for this render.');
  copyVideo(video, outPath);
  process.exit(0);
}

const config = {
  maxInsertionsPerClip: Math.max(
    1,
    Number(args['max-insertions'] ?? contextScenes.maxInsertionsPerClip ?? 3),
  ),
  minInsertionSeconds: Math.max(
    0.6,
    Number(contextScenes.minInsertionSeconds ?? 1.1),
  ),
  maxInsertionSeconds: Math.max(
    1.2,
    Number(contextScenes.maxInsertionSeconds ?? 3.2),
  ),
  minGapSeconds: Math.max(0, Number(contextScenes.minGapSeconds ?? 1.2)),
  edgeBufferSeconds: Math.max(0, Number(contextScenes.edgeBufferSeconds ?? 1.0)),
  targetCoverageRatio: clamp(Number(contextScenes.targetCoverageRatio ?? 0.5), 0.05, 0.85),
  maxCoverageRatio: clamp(Number(contextScenes.maxCoverageRatio ?? 0.38), 0.05, 0.9),
  transcriptChunkWords: Math.max(
    5,
    Number(contextScenes.transcriptChunkWords ?? 10),
  ),
  allowSceneReuseWithinClip: Boolean(contextScenes.allowSceneReuseWithinClip),
  popCultureResearch: {
    enabled: popCultureResearchEnabled,
    model: String(popCultureResearchConfig.model ?? 'gpt-4.1'),
    candidatesPerSegment: Math.max(
      5,
      Math.min(10, Number(popCultureResearchConfig.candidatesPerSegment ?? 8)),
    ),
    useForYoutubeQueries: popCultureResearchConfig.useForYoutubeQueries !== false,
    maxQueriesPerInsertion: Math.max(
      4,
      Math.min(30, Number(popCultureResearchConfig.maxQueriesPerInsertion ?? 16)),
    ),
    minQueryConfidence: Math.max(
      1,
      Math.min(10, Number(popCultureResearchConfig.minQueryConfidence ?? 6)),
    ),
    writeMarkdown: popCultureResearchConfig.writeMarkdown !== false,
  },
  youtubeIngest: {
    enabled: youtubeIngestEnabled,
    maxResultsPerQuery: Math.max(
      1,
      Number(youtubeIngestConfig.maxResultsPerQuery ?? 6),
    ),
    maxDownloadsPerQuery: Math.max(
      1,
      Number(youtubeIngestConfig.maxDownloadsPerQuery ?? 2),
    ),
    maxDurationSeconds: Math.max(
      5,
      Number(youtubeIngestConfig.maxDurationSeconds ?? 60),
    ),
    channelId: args['youtube-channel-id']
      ? String(args['youtube-channel-id'])
      : youtubeIngestConfig.channelId
        ? String(youtubeIngestConfig.channelId)
        : null,
    queryStyle: {
      queriesPerInsertion: Math.max(
        3,
        Math.min(12, Number(queryStyleConfig.queriesPerInsertion ?? 8)),
      ),
      maxExpandedQueriesPerBase: Math.max(
        1,
        Math.min(10, Number(queryStyleConfig.maxExpandedQueriesPerBase ?? 5)),
      ),
      minCandidateScore: Number(
        args['movie-scenes']
          ? queryStyleConfig.movieSceneMinCandidateScore ?? queryStyleConfig.minCandidateScore ?? 20
          : queryStyleConfig.minCandidateScore ?? 0,
      ),
      preferMotion: queryStyleConfig.preferMotion !== false,
      preferCinematic: queryStyleConfig.preferCinematic !== false,
      preferMovieScenes: args['movie-scenes']
        ? true
        : Boolean(queryStyleConfig.preferMovieScenes),
      avoidTalkingHeads: queryStyleConfig.avoidTalkingHeads !== false,
      officialClipBoost: Number(queryStyleConfig.officialClipBoost ?? 10),
      movieSceneBoost: Number(queryStyleConfig.movieSceneBoost ?? 12),
      stockFootagePenalty: Number(queryStyleConfig.stockFootagePenalty ?? 0),
      watermarkPenalty: Number(queryStyleConfig.watermarkPenalty ?? 35),
      trailerPenalty: Number(queryStyleConfig.trailerPenalty ?? 8),
      lowQualityPenalty: Number(queryStyleConfig.lowQualityPenalty ?? 10),
      nonScenePenalty: Number(queryStyleConfig.nonScenePenalty ?? 18),
      styleModifiers: normalizeStringList(queryStyleConfig.styleModifiers, [
        'cinematic',
        '4k',
        'close up',
        'dramatic',
        'slow motion',
        'commercial',
        'b roll',
      ]),
      themeBoosts: normalizeStringList(queryStyleConfig.themeBoosts, [
        'money',
        'discipline',
        'faith',
        'urgency',
        'luxury',
        'transformation',
        'motivation',
      ]),
      avoidTerms: normalizeStringList(queryStyleConfig.avoidTerms, [
        'podcast',
        'interview',
        'reaction',
        'slideshow',
        'lyrics',
        'compilation',
        'news',
        'talk show',
      ]),
    },
  },
};

if (config.popCultureResearch.enabled && config.popCultureResearch.useForYoutubeQueries) {
  config.youtubeIngest.queryStyle.avoidTerms = removePopCultureAllowedAvoidTerms(
    config.youtubeIngest.queryStyle.avoidTerms,
  );
}

const selectionClip = loadSelectionClip(
  args['selection-path'] ? path.resolve(String(args['selection-path'])) : null,
  Number(args['clip-number'] ?? 1),
);
const selectionPath = args['selection-path'] ? path.resolve(String(args['selection-path'])) : null;
const clipNumber = Number(args['clip-number'] ?? 1);
const blockedSceneIds = usedIdsFromSelection(
  selectionPath,
  'contextScenes',
  clipNumber,
);

const captions = readCaptions(captionsPath);
const metadata = probeVideo(video);
const transcriptChunks = buildTranscriptChunks(captions, config.transcriptChunkWords);
const client = new OpenAI();
const targetInsertionCount = Math.min(
  config.maxInsertionsPerClip,
  Math.max(
    1,
    Math.ceil(
      (metadata.durationSeconds * config.targetCoverageRatio) /
        Math.max(config.minInsertionSeconds, config.maxInsertionSeconds),
    ),
  ),
);

const response = await client.responses.create({
  model: String(contextScenes.planningModel ?? 'gpt-4.1-mini'),
  text: {
    verbosity: 'medium',
    format: {
      type: 'json_schema',
      name: 'context_scene_insertions',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['insertions'],
        properties: {
          insertions: {
            type: 'array',
            minItems: targetInsertionCount,
            maxItems: config.maxInsertionsPerClip,
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'startSeconds',
                'endSeconds',
                'query',
                'reason',
                'visualBrief',
                'searchQueries',
                'keywords',
                'avoidTerms',
              ],
              properties: {
                startSeconds: {type: 'number'},
                endSeconds: {type: 'number'},
                query: {type: 'string'},
                reason: {type: 'string'},
                visualBrief: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['emotion', 'visualMetaphor', 'energy', 'idealShot', 'motion'],
                  properties: {
                    emotion: {type: 'string'},
                    visualMetaphor: {type: 'string'},
                    energy: {type: 'string'},
                    idealShot: {type: 'string'},
                    motion: {type: 'string'},
                  },
                },
                searchQueries: {
                  type: 'array',
                  minItems: 3,
                  maxItems: config.youtubeIngest.queryStyle.queriesPerInsertion,
                  items: {type: 'string'},
                },
                keywords: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 8,
                  items: {type: 'string'},
                },
                avoidTerms: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 8,
                  items: {type: 'string'},
                },
              },
            },
          },
        },
      },
    },
  },
  input: [
    {
      role: 'system',
      content: `You are planning high-energy cinematic cutaway inserts for a vertical short-form clip. Keep retention high with frequent visual changes. Pick moments where cutting away to an evocative scene would strengthen emotion, tension, irony, aspiration, power, fear, urgency, discipline, money, status, spirituality, grit, or transformation. Prefer short punchy ${config.minInsertionSeconds.toFixed(1)}-${config.maxInsertionSeconds.toFixed(1)} second windows, aim for a fresh visual beat every 2-4 seconds when justified, and favor scenes that are instantly readable in under a second. Target about ${(config.targetCoverageRatio * 100).toFixed(0)}% of the finished clip as B-roll/cutaway footage while keeping the original speaker visible for the strongest personal lines. Do not cover the entire clip.

For each insertion, first think in terms of a visual brief: emotion, visual metaphor, energy, ideal shot, and motion. Then write ${config.youtubeIngest.queryStyle.queriesPerInsertion} distinct YouTube search queries that could find better B-roll. ${config.youtubeIngest.queryStyle.preferMovieScenes ? 'Prioritize recognizable, high-quality movie and TV scene searches: official clips, specific scene names, film/show scene wording, and instantly readable cinematic moments. Avoid stock-footage phrasing unless the transcript is asking for literal location or object coverage.' : 'Mix literal, cinematic, metaphorical, aspirational, spiritual/motivational, and high-motion angles.'} Prefer search phrases with visible actions and objects instead of abstract words. ${config.youtubeIngest.queryStyle.preferCinematic ? `Use style language like ${config.youtubeIngest.queryStyle.styleModifiers.slice(0, 8).join(', ')} when it helps.` : ''} ${config.youtubeIngest.queryStyle.preferMotion ? 'Prefer clips with movement, camera motion, closeups, and instantly readable visual events.' : ''} ${config.youtubeIngest.queryStyle.avoidTalkingHeads ? `Avoid talking heads, podcasts, reactions, slideshows, lyric videos, news, lectures, and low-motion screen recordings.` : ''}

Return exact clip-relative timings.`,
    },
    {
      role: 'user',
      content: `Clip duration: ${metadata.durationSeconds.toFixed(2)} seconds
Max insertions: ${config.maxInsertionsPerClip}
Target insertions: ${targetInsertionCount}
Insertion length: ${config.minInsertionSeconds.toFixed(1)}-${config.maxInsertionSeconds.toFixed(1)} seconds
Target B-roll coverage: ${(config.targetCoverageRatio * 100).toFixed(0)}%
Maximum B-roll coverage: ${(config.maxCoverageRatio * 100).toFixed(0)}%
Queries per insertion: ${config.youtubeIngest.queryStyle.queriesPerInsertion}
Preferred query modifiers: ${config.youtubeIngest.queryStyle.styleModifiers.join(', ')}
Theme boosts: ${config.youtubeIngest.queryStyle.themeBoosts.join(', ')}
Avoid search/result traits: ${config.youtubeIngest.queryStyle.avoidTerms.join(', ')}

Editorial context:
- clip title: ${selectionClip?.title ?? 'n/a'}
- hook: ${selectionClip?.hook ?? 'n/a'}
- reason: ${selectionClip?.reason ?? 'n/a'}
- highlight words: ${(selectionClip?.highlightWords ?? []).join(', ') || 'n/a'}

Transcript chunks:
${transcriptChunks
  .map(
    (chunk) =>
      `[${chunk.startSeconds.toFixed(1)}-${chunk.endSeconds.toFixed(1)}] ${chunk.text}`,
  )
  .join('\n')}`,
    },
  ],
});

const planned = JSON.parse(response.output_text);
let insertions = normalizeInsertions(
  Array.isArray(planned.insertions) ? planned.insertions : [],
  metadata.durationSeconds,
  config,
);

let popCultureResearchResult = null;
const popCultureResearchPath = `${outPath.replace(/\.[^.]+$/, '')}.pop-culture-scenes.json`;
if (config.popCultureResearch.enabled && insertions.length > 0) {
  popCultureResearchResult = await researchPopCultureScenes({
    client,
    model: config.popCultureResearch.model,
    insertions,
    captions,
    selectionClip,
    clipMetadata: metadata,
    outputPath: popCultureResearchPath,
    candidatesPerSegment: config.popCultureResearch.candidatesPerSegment,
    maxIntegratedQueriesPerSegment: config.popCultureResearch.maxQueriesPerInsertion,
    minIntegratedConfidence: config.popCultureResearch.minQueryConfidence,
    writeMarkdown: config.popCultureResearch.writeMarkdown,
  });

  if (config.popCultureResearch.useForYoutubeQueries) {
    insertions = enrichInsertionsWithPopCultureQueries(
      insertions,
      popCultureResearchResult.research,
      {
        maxQueriesPerInsertion: config.popCultureResearch.maxQueriesPerInsertion,
        minConfidence: config.popCultureResearch.minQueryConfidence,
      },
    );
  }
}

const autoIngestQueries = [...new Set(
  insertions
    .flatMap((insertion) => [
      insertion.query,
      ...(Array.isArray(insertion.searchQueries) ? insertion.searchQueries : []),
    ])
    .map((query) => String(query ?? '').trim())
    .filter(Boolean),
)];
let autoIngestResult = null;

if (config.youtubeIngest.enabled && autoIngestQueries.length > 0) {
  autoIngestResult = await ingestYouTubeScenes({
    apiKey: process.env.YOUTUBE_API_KEY ?? null,
    sceneLibraryDir,
    queries: autoIngestQueries,
    maxResultsPerQuery: config.youtubeIngest.maxResultsPerQuery,
    maxDownloadsPerQuery: config.youtubeIngest.maxDownloadsPerQuery,
    maxDurationSeconds: config.youtubeIngest.maxDurationSeconds,
    channelId: config.youtubeIngest.channelId,
    queryStyle: config.youtubeIngest.queryStyle,
    log: console,
  });
}

const sceneLibrary = loadSceneLibrary(sceneLibraryDir);

if (sceneLibrary.length === 0) {
  console.warn(`No scene clips were found in ${sceneLibraryDir}. Using source clip only.`);
  copyVideo(video, outPath);
  fs.writeFileSync(
    `${outPath.replace(/\.[^.]+$/, '')}.scene-plan.json`,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        sourceVideo: video,
        captionsPath,
        outputVideo: outPath,
        sceneLibraryDir,
        config,
        selectionClip,
        autoIngestQueries,
        autoIngestResult,
        popCultureResearch: popCultureResearchResult,
        insertions: [],
        note: 'No scene clips were available after planning and optional auto-ingest.',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const chosenScenes = selectScenesForInsertions(
  insertions,
  sceneLibrary,
  config.allowSceneReuseWithinClip,
  config.youtubeIngest.queryStyle.avoidTerms,
  blockedSceneIds,
  {preferMovieScenes: config.youtubeIngest.queryStyle.preferMovieScenes},
);
const plannedSceneStats = insertionCoverageStats(insertions, metadata.durationSeconds);
const chosenSceneStats = insertionCoverageStats(chosenScenes, metadata.durationSeconds);
const chosenInsertionKeys = new Set(
  chosenScenes.map((insertion) =>
    [
      Number(insertion.startSeconds ?? 0).toFixed(2),
      Number(insertion.endSeconds ?? 0).toFixed(2),
      insertion.query ?? '',
    ].join('|'),
  ),
);
const droppedInsertions = insertions.filter(
  (insertion) =>
    !chosenInsertionKeys.has(
      [
        Number(insertion.startSeconds ?? 0).toFixed(2),
        Number(insertion.endSeconds ?? 0).toFixed(2),
        insertion.query ?? '',
      ].join('|'),
    ),
);

const planPath = `${outPath.replace(/\.[^.]+$/, '')}.scene-plan.json`;

if (chosenScenes.length === 0) {
  copyVideo(video, outPath);
  fs.writeFileSync(
    planPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        sourceVideo: video,
        outputVideo: outPath,
        sceneLibraryDir,
        autoIngestQueries,
        autoIngestResult,
        popCultureResearch: popCultureResearchResult,
        selectionStats: {
          planned: plannedSceneStats,
          selected: chosenSceneStats,
          droppedInsertionCount: droppedInsertions.length,
        },
        plannedInsertions: insertions,
        droppedInsertions,
        insertions: [],
        note: 'No sufficiently strong context-scene matches were found for this clip.',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

buildSceneMix({
  sourceVideo: video,
  outputPath: outPath,
  insertions: chosenScenes,
  metadata,
});

fs.writeFileSync(
  planPath,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      sourceVideo: video,
      captionsPath,
      outputVideo: outPath,
      sceneLibraryDir,
      config,
      selectionClip,
      autoIngestQueries,
      autoIngestResult,
      popCultureResearch: popCultureResearchResult,
      selectionStats: {
        planned: plannedSceneStats,
        selected: chosenSceneStats,
        droppedInsertionCount: droppedInsertions.length,
      },
      plannedInsertions: insertions,
      droppedInsertions,
      insertions: chosenScenes,
    },
    null,
    2,
  ),
);

writeIdsToSelection(
  selectionPath,
  'contextScenes',
  clipNumber,
  chosenScenes.map((scene) => scene.sceneId),
);

console.log(`Context scene mix written to: ${outPath}`);
console.log(`Context scene plan written to: ${planPath}`);
