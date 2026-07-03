#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {
  ensureDir,
  loadEnv,
  parseArgs,
  probeVideo,
  projectRoot,
  readCaptionStyleConfig,
  run,
} from './lib.mjs';

const usage = `
Usage:
  npm run broll:enhance -- --video /path/to/video.mp4

Options:
  --video FILE              Already-edited base video to enhance.
  --captions FILE           Existing captions/transcript JSON. If omitted, transcribes with OpenAI.
  --out-dir DIR             Output root. Default: ./outputs
  --run-name NAME           Custom run folder name. Default: enhance-run-YYYY-MM-DD-HHMMSS
  --style-config FILE       Caption style JSON. Default: ./caption-style.json
  --scene-library DIR       Scene cache/library. Default: contextScenes.libraryDir or ./scene-library
  --max-insertions N        Override B-roll insertion count. Default: style config.
  --fps N                   Final render FPS. Default: 24.
  --width N                 Working/output width. Default: 1080.
  --height N                Working/output height. Default: 1920.
  --fit cover|contain       Normalize source into output frame. Default: contain.
  --transcription-prompt T  Prompt words for transcription accuracy.
  --no-normalize            Use the original video dimensions for mixing.
  --disable-context-scenes  Skip B-roll mixing; render captions only.
  --disable-youtube-ingest  Do not download new B-roll scenes during mix.
  --movie-scenes            Prefer movie/TV scene B-roll. Default: on.
  --stock-broll             Use normal literal/stock-style B-roll search instead.
  --pop-culture-research    Force movie/TV scene query enrichment.
  --disable-pop-culture-research Skip movie/TV scene query enrichment.
  --no-render               Stop after transcription and B-roll mix.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

loadEnv();

const requireOption = (key) => {
  if (!args[key]) {
    throw new Error(usage);
  }
  return String(args[key]);
};

const slugify = (value, fallback = 'video') => {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
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

const normalizeVideo = ({input, output, width, height, fit, fps}) => {
  const scaleMode = fit === 'cover' ? 'increase' : 'decrease';
  const tail = fit === 'cover'
    ? `crop=${width}:${height}`
    : `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
  const filters = [
    `scale=${width}:${height}:force_original_aspect_ratio=${scaleMode}`,
    tail,
    `fps=${fps}`,
    'setsar=1',
  ].join(',');

  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input,
      '-vf',
      filters,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      output,
    ],
    {stdio: 'inherit'},
  );
};

const sourceVideo = path.resolve(requireOption('video'));
if (!fs.existsSync(sourceVideo)) {
  throw new Error(`Video not found: ${sourceVideo}`);
}

const styleConfigPath = args['style-config']
  ? path.resolve(String(args['style-config']))
  : path.join(projectRoot, 'caption-style.json');
const styleConfig = readCaptionStyleConfig(styleConfigPath);
const contextScenesConfig = styleConfig.contextScenes ?? {};

const outRoot = path.resolve(String(args['out-dir'] ?? path.join(projectRoot, 'outputs')));
const runName = String(args['run-name'] ?? `enhance-run-${timestampSlug()}`);
const runDir = path.join(outRoot, runName);
const assetsDir = path.join(runDir, 'assets');
const finalDir = path.join(runDir, 'final');
ensureDir(assetsDir);
ensureDir(finalDir);

const safeBase = slugify(path.basename(sourceVideo, path.extname(sourceVideo)));
const width = Number(args.width ?? 1080);
const height = Number(args.height ?? 1920);
const fps = Number(args.fps ?? 24);
const fit = String(args.fit ?? 'contain');
const normalizedVideo = path.join(assetsDir, `${safeBase}.base-${width}x${height}.mp4`);
const captionsPath = path.join(assetsDir, `${safeBase}.captions.json`);
const sceneMixPath = path.join(assetsDir, `${safeBase}.broll-mix.mp4`);
const finalPath = path.join(finalDir, `${safeBase}.broll-captioned.mp4`);
const manifestPath = path.join(runDir, 'manifest.json');

let videoForMix = sourceVideo;
if (args['no-normalize']) {
  fs.copyFileSync(sourceVideo, normalizedVideo);
  videoForMix = normalizedVideo;
} else {
  console.log(`Normalizing base video to ${width}x${height} (${fit})...`);
  normalizeVideo({
    input: sourceVideo,
    output: normalizedVideo,
    width,
    height,
    fit,
    fps,
  });
  videoForMix = normalizedVideo;
}

if (args.captions) {
  fs.copyFileSync(path.resolve(String(args.captions)), captionsPath);
} else if (!fs.existsSync(captionsPath)) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to transcribe when --captions is not supplied.');
  }

  const transcriptionPrompt = String(
    args['transcription-prompt'] ??
      'Budapest, Hungary, Hungarian, szia, hogy van, jó napot, living abroad, making money online, Airbnb, Reddit, apartment hunting.',
  );
  run('npm', [
    'run',
    'transcribe',
    '--',
    '--video',
    videoForMix,
    '--out',
    captionsPath,
    '--prompt',
    transcriptionPrompt,
  ]);
}

let videoForRender = videoForMix;
const contextScenesEnabled = !args['disable-context-scenes'];

if (contextScenesEnabled) {
  const sceneLibraryPath = path.resolve(
    String(
      args['scene-library'] ??
        contextScenesConfig.libraryDir ??
        path.join(projectRoot, 'scene-library'),
    ),
  );

  const sceneArgs = [
    'run',
    'scene:mix',
    '--',
    '--video',
    videoForMix,
    '--captions',
    captionsPath,
    '--out',
    sceneMixPath,
    '--style-config',
    styleConfigPath,
    '--scene-library',
    sceneLibraryPath,
    '--context-scenes',
    '--youtube-ingest',
  ];

  if (!args['stock-broll']) {
    sceneArgs.push('--movie-scenes');
  }
  if (args['disable-youtube-ingest']) {
    sceneArgs.push('--disable-youtube-ingest');
  }
  if (args['max-insertions']) {
    sceneArgs.push('--max-insertions', String(args['max-insertions']));
  }
  if (args['pop-culture-research']) {
    sceneArgs.push('--pop-culture-research');
  }
  if (args['disable-pop-culture-research']) {
    sceneArgs.push('--disable-pop-culture-research');
  }

  run('npm', sceneArgs);
  if (fs.existsSync(sceneMixPath)) {
    videoForRender = sceneMixPath;
  }
}

if (!args['no-render']) {
  const renderArgs = [
    'run',
    'render:clip',
    '--',
    '--video',
    videoForRender,
    '--captions',
    captionsPath,
    '--out',
    finalPath,
    '--fps',
    String(fps),
    '--style-config',
    styleConfigPath,
    '--vertical-contain',
  ];

  run('npm', renderArgs);
}

const manifest = {
  createdAt: new Date().toISOString(),
  sourceVideo,
  runDir,
  assetsDir,
  finalDir,
  normalizedVideo,
  captionsPath,
  sceneMixPath: fs.existsSync(sceneMixPath) ? sceneMixPath : null,
  scenePlanPath: fs.existsSync(sceneMixPath)
    ? `${sceneMixPath.replace(/\.[^.]+$/, '')}.scene-plan.json`
    : null,
  finalPath: fs.existsSync(finalPath) ? finalPath : null,
  config: {
    width,
    height,
    fps,
    fit,
    styleConfigPath,
    contextScenesEnabled,
    normalized: !args['no-normalize'],
    movieScenes: !args['stock-broll'],
  },
  metadata: {
    source: probeVideo(sourceVideo),
    working: probeVideo(videoForMix),
    final: fs.existsSync(finalPath) ? probeVideo(finalPath) : null,
  },
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Done. Run folder: ${runDir}`);
if (manifest.finalPath) {
  console.log(`Final video: ${manifest.finalPath}`);
}
console.log(`Manifest: ${manifestPath}`);
