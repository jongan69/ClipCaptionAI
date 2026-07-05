#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDir,
  loadEnv,
  parseArgs,
  projectRoot,
  readCaptionStyleConfig,
} from './lib.mjs';
import {
  ingestYouTubeScenes,
  loadSceneBlacklist,
  sceneIsBlacklisted,
} from './lib-youtube-scenes.mjs';

const usage = `
Usage:
  npm run broll:find
  npm run broll:find -- --prompts broll-prompts.txt

Options:
  --prompts FILE             Text file with one B-roll prompt per line. Default: ./broll-prompts.txt
  --out-dir DIR              Output root. Default: ./outputs
  --run-name NAME            Custom run folder name. Default: broll-run-YYYY-MM-DD-HHMMSS
  --scene-library DIR        Reusable cache folder. Default: ./scene-library
  --style-config FILE        Reads contextScenes.youtubeIngest/queryStyle defaults.
  --max-results N            YouTube search results fetched per prompt. Default: style config or 8
  --max-downloads N          Clips copied/downloaded per prompt. Default: style config or 3
  --max-duration-seconds N   Skip anything longer than this. Default: style config or 60
  --min-candidate-score N    Search score cutoff. Default: 5 for manual B-roll finding
  --max-expanded-queries N   Search variants per prompt. Default: 5
  --movie-scenes             Search for pop-culture/movie/TV scene clips instead of stock B-roll
  --channel-id ID            Restrict YouTube ingest to one channel.
  --no-copy                  Only ingest into scene-library; do not copy clips into the run folder.
`;

const slugify = (value, fallback = 'prompt') => {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
  return slug || fallback;
};

const timestampSlug = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('-');
};

const readPrompts = (promptsPath) =>
  fs.readFileSync(promptsPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

const mergeStringLists = (...lists) =>
  [...new Set(
    lists
      .filter(Array.isArray)
      .flat()
      .map((item) => String(item ?? '').trim())
      .filter(Boolean),
  )];

const manualBrollAvoidTerms = [
  'jail',
  'prison',
  'cell',
  'police',
  'crime',
  'chromakey',
  'green screen',
  'template',
  'videohive',
  'watermark',
  'animation',
  'cartoon',
  'ai generated',
  'tutorial',
  'review',
  'walkthrough',
  'official trailer',
  'trailer',
  'episode',
  'documentary',
  'movie',
  'film',
  'tv show',
  'parts unknown',
  'monty python',
  'grand budapest hotel',
];

const movieSceneAvoidTerms = [
  'podcast',
  'interview',
  'reaction',
  'review',
  'recap',
  'explained',
  'analysis',
  'essay',
  'behind the scenes',
  'making of',
  'watermark',
  'watermarked',
  'preview only',
  'storyblocks',
  'shutterstock',
  'alamy',
  'pond5',
  'envato',
  'videohive',
  'depositphotos',
  'trailer',
  'teaser',
  'commercial',
  'ads',
  'ad ',
  'top 10',
  'best movies',
  'best scenes',
  'list',
  'music video',
  'lyrics',
  'soundtrack',
  'compilation',
  'full movie',
  'full episode',
  'watch online',
  'streaming',
  'gameplay',
  'fan edit',
  'edit',
  'amv',
  'tribute',
];

const movieSceneQueriesForPrompt = (prompt) => {
  const base = String(prompt ?? '').trim();
  if (!base) {
    return [];
  }

  return [
    `${base} movie scene`,
    `${base} official clip`,
    `${base} tv scene`,
    `${base} iconic scene`,
    `${base} famous movie scene`,
    `movie scene about ${base}`,
  ];
};

const stockQueriesForPrompt = (prompt) => [prompt];

const loadSceneIndex = (sceneLibraryDir) => {
  const indexPath = path.join(sceneLibraryDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    return {scenes: []};
  }

  const blacklist = loadSceneBlacklist(sceneLibraryDir);
  const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  return {
    scenes: Array.isArray(parsed?.scenes)
      ? parsed.scenes.filter((scene) => !sceneIsBlacklisted(scene, blacklist))
      : [],
  };
};

const sceneFilePath = (sceneLibraryDir, scene) =>
  path.resolve(sceneLibraryDir, String(scene.file ?? ''));

const sameQuery = (a, b) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

const sceneMatchesPrompt = (scene, prompt) => {
  const attribution = scene.attribution ?? {};
  return (
    sameQuery(attribution.ingestedFromQuery, prompt) ||
    sameQuery(attribution.ingestedFromSearchQuery, prompt)
  );
};

const copiedFileName = ({promptNumber, clipNumber, scene, sourcePath}) => {
  const ext = path.extname(sourcePath) || '.mp4';
  return `${String(promptNumber).padStart(2, '0')}-${String(clipNumber).padStart(2, '0')}-${slugify(scene.title ?? scene.id, scene.id)}${ext}`;
};

const copySceneToPromptFolder = ({
  sceneLibraryDir,
  runDir,
  prompt,
  promptNumber,
  clipNumber,
  scene,
}) => {
  const sourcePath = sceneFilePath(sceneLibraryDir, scene);
  if (!fs.existsSync(sourcePath)) {
    return null;
  }

  const promptDir = path.join(
    runDir,
    `${String(promptNumber).padStart(2, '0')}-${slugify(prompt)}`,
  );
  const clipsDir = path.join(promptDir, 'clips');
  ensureDir(clipsDir);

  const outputPath = path.join(
    clipsDir,
    copiedFileName({promptNumber, clipNumber, scene, sourcePath}),
  );
  fs.copyFileSync(sourcePath, outputPath);

  const sourceSidecar = `${sourcePath}.scene.json`;
  const outputSidecar = `${outputPath}.scene.json`;
  if (fs.existsSync(sourceSidecar)) {
    fs.copyFileSync(sourceSidecar, outputSidecar);
  } else {
    fs.writeFileSync(outputSidecar, JSON.stringify(scene, null, 2));
  }

  return outputPath;
};

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

loadEnv();

const promptsPath = path.resolve(
  String(args.prompts ?? path.join(projectRoot, 'broll-prompts.txt')),
);
if (!fs.existsSync(promptsPath)) {
  throw new Error(`Prompt file not found: ${promptsPath}`);
}

const prompts = readPrompts(promptsPath);
if (prompts.length === 0) {
  throw new Error(`No prompts found in ${promptsPath}. Add one phrase, sentence, or visual idea per line.`);
}

const styleConfig = readCaptionStyleConfig(
  args['style-config'] ? path.resolve(String(args['style-config'])) : undefined,
);
const youtubeIngestConfig = styleConfig.contextScenes?.youtubeIngest ?? {};
const queryStyleConfig = styleConfig.contextScenes?.queryStyle ?? {};
const movieScenesMode = Boolean(args['movie-scenes']);

const outRoot = path.resolve(String(args['out-dir'] ?? path.join(projectRoot, 'outputs')));
const runName = String(args['run-name'] ?? `broll-run-${timestampSlug()}`);
const runDir = path.join(outRoot, runName);
const sceneLibraryDir = path.resolve(
  String(args['scene-library'] ?? styleConfig.contextScenes?.libraryDir ?? path.join(projectRoot, 'scene-library')),
);
const shouldCopy = args.copy === true || args['no-copy'] !== true;

ensureDir(runDir);
ensureDir(sceneLibraryDir);
fs.copyFileSync(promptsPath, path.join(runDir, 'prompts.txt'));

const config = {
  promptsPath,
  runDir,
  sceneLibraryDir,
  searchKind: movieScenesMode ? 'movie-scenes' : 'stock-broll',
  maxResultsPerPrompt: Math.max(
    1,
    Number(args['max-results'] ?? youtubeIngestConfig.maxResultsPerQuery ?? 8),
  ),
  maxDownloadsPerPrompt: Math.max(
    1,
    Number(args['max-downloads'] ?? youtubeIngestConfig.maxDownloadsPerQuery ?? 3),
  ),
  maxDurationSeconds: Math.max(
    5,
    Number(args['max-duration-seconds'] ?? youtubeIngestConfig.maxDurationSeconds ?? 60),
  ),
  channelId: args['channel-id']
    ? String(args['channel-id'])
    : youtubeIngestConfig.channelId
      ? String(youtubeIngestConfig.channelId)
      : null,
  queryStyle: {
    maxExpandedQueriesPerBase: Math.max(
      1,
      Math.min(
        10,
        Number(args['max-expanded-queries'] ?? 5),
      ),
    ),
    minCandidateScore: Number(
      args['min-candidate-score'] ?? (movieScenesMode ? 14 : 5),
    ),
    minCoreQueryMatches: Math.max(
      1,
      Number(args['min-core-query-matches'] ?? 1),
    ),
    preferMotion: queryStyleConfig.preferMotion !== false,
    preferCinematic: queryStyleConfig.preferCinematic !== false,
    preferMovieScenes: movieScenesMode || Boolean(queryStyleConfig.preferMovieScenes),
    avoidTalkingHeads: queryStyleConfig.avoidTalkingHeads !== false,
    officialClipBoost: Number(queryStyleConfig.officialClipBoost ?? (movieScenesMode ? 12 : 10)),
    movieSceneBoost: Number(queryStyleConfig.movieSceneBoost ?? (movieScenesMode ? 14 : 12)),
    stockFootagePenalty: Number(queryStyleConfig.stockFootagePenalty ?? (movieScenesMode ? 18 : 0)),
    watermarkPenalty: Number(queryStyleConfig.watermarkPenalty ?? 55),
    trailerPenalty: Number(queryStyleConfig.trailerPenalty ?? (movieScenesMode ? 14 : 8)),
    lowQualityPenalty: Number(queryStyleConfig.lowQualityPenalty ?? (movieScenesMode ? 16 : 10)),
    nonScenePenalty: Number(queryStyleConfig.nonScenePenalty ?? (movieScenesMode ? 22 : 18)),
    styleModifiers: movieScenesMode
      ? ['official clip', 'movie scene', 'tv scene', 'iconic scene', 'famous scene']
      : Array.isArray(queryStyleConfig.styleModifiers)
        ? queryStyleConfig.styleModifiers
        : undefined,
    themeBoosts: Array.isArray(queryStyleConfig.themeBoosts)
      ? queryStyleConfig.themeBoosts
      : undefined,
    avoidTerms: movieScenesMode
      ? movieSceneAvoidTerms
      : mergeStringLists(queryStyleConfig.avoidTerms, manualBrollAvoidTerms),
  },
  shouldCopy,
};

const manifest = {
  createdAt: new Date().toISOString(),
  prompts,
  config,
  results: [],
};

console.log(`B-roll finder`);
console.log(`Prompt file: ${promptsPath}`);
console.log(`Output run: ${runDir}`);
console.log(`Scene cache: ${sceneLibraryDir}`);
console.log(`Search kind: ${config.searchKind}`);
console.log('');

for (const [promptIndex, prompt] of prompts.entries()) {
  const promptNumber = promptIndex + 1;
  console.log(`[${promptNumber}/${prompts.length}] ${prompt}`);
  const searchQueries = movieScenesMode
    ? movieSceneQueriesForPrompt(prompt)
    : stockQueriesForPrompt(prompt);

  const ingestResult = await ingestYouTubeScenes({
    apiKey: process.env.YOUTUBE_API_KEY ?? null,
    sceneLibraryDir,
    queries: searchQueries,
    maxResultsPerQuery: config.maxResultsPerPrompt,
    maxDownloadsPerQuery: movieScenesMode
      ? 1
      : config.maxDownloadsPerPrompt,
    maxDurationSeconds: config.maxDurationSeconds,
    channelId: config.channelId,
    queryStyle: config.queryStyle,
    log: console,
  });

  const index = loadSceneIndex(sceneLibraryDir);
  const scenesById = new Map(index.scenes.map((scene) => [String(scene.id), scene]));
  const sceneIds = [];

  for (const item of ingestResult.downloaded) {
    if (item.sceneId && !sceneIds.includes(item.sceneId)) {
      sceneIds.push(item.sceneId);
    }
  }

  for (const item of ingestResult.skipped) {
    if (item.reason !== 'already_ingested' || !item.videoId) {
      continue;
    }

    const sceneId = `yt-${item.videoId}`;
    if (!sceneIds.includes(sceneId)) {
      sceneIds.push(sceneId);
    }
  }

  for (const scene of index.scenes) {
    if (sceneIds.length >= config.maxDownloadsPerPrompt) {
      break;
    }

    if (sceneMatchesPrompt(scene, prompt) && !sceneIds.includes(scene.id)) {
      sceneIds.push(scene.id);
    }
  }

  const selectedScenes = sceneIds
    .map((sceneId) => scenesById.get(String(sceneId)))
    .filter(Boolean)
    .slice(0, config.maxDownloadsPerPrompt);

  const copied = [];
  if (config.shouldCopy) {
    selectedScenes.forEach((scene, index) => {
      const copiedPath = copySceneToPromptFolder({
        sceneLibraryDir,
        runDir,
        prompt,
        promptNumber,
        clipNumber: index + 1,
        scene,
      });

      if (copiedPath) {
        copied.push(copiedPath);
      }
    });
  }

  manifest.results.push({
    prompt,
    promptNumber,
    searchQueries,
    downloaded: ingestResult.downloaded,
    skipped: ingestResult.skipped,
    selectedScenes: selectedScenes.map((scene, index) => ({
      clipNumber: index + 1,
      id: scene.id,
      title: scene.title,
      source: scene.source,
      tags: scene.tags,
      attribution: scene.attribution,
      sceneLibraryFile: sceneFilePath(sceneLibraryDir, scene),
      copiedFile: copied[index] ?? null,
    })),
  });

  console.log(`  selected ${selectedScenes.length} clip(s)`);
  for (const selected of selectedScenes) {
    console.log(`  - ${selected.title}`);
  }
  console.log('');
}

const manifestPath = path.join(runDir, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`Done. Manifest: ${manifestPath}`);
console.log(`Review B-roll clips in: ${runDir}`);
