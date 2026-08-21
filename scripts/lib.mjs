import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';

// ── Runtime roots ──────────────────────────────────────────────────
// In CLI mode these resolve from the script's location (project root).
// In Electron mode (CCA_ELECTRON=1), the main process pre-sets env vars
// pointing to writable userData paths, so packaged apps work correctly.

const baseRoot = path.resolve(new URL('..', import.meta.url).pathname);

export const projectRoot = process.env.CCA_PROJECT_ROOT || baseRoot;
export const workspaceRoot = process.env.CCA_WORKSPACE_ROOT || process.cwd();
export const outputsRoot = process.env.CCA_OUTPUTS_ROOT || path.join(workspaceRoot, 'outputs');
export const outputWorkRoot = path.join(outputsRoot, 'work');
export const publicMediaRoot =
  process.env.CCA_PUBLIC_MEDIA_ROOT || path.join(outputsRoot, '.public', 'media');
export const ebayCinematicAdsOutputRoot = path.join(outputsRoot, 'ebay-cinematic-ads');

export const isElectron = () => !!process.env.CCA_ELECTRON;

export const loadEnv = () => {
  // In Electron, the main process injects secrets directly into process.env
  // before spawning workers — skip the .env file read.
  if (process.env.CCA_ENV_PREINJECTED === '1') return;
  dotenv.config({path: path.join(projectRoot, '.env')});
};

export const defaultCaptionStylePath = path.join(projectRoot, 'caption-style.json');

export const readCaptionStyleConfig = (styleConfigPath = defaultCaptionStylePath) => {
  const resolved = path.resolve(styleConfigPath);

  if (!fs.existsSync(resolved)) {
    return {};
  }

  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Caption style config must be a JSON object: ${resolved}`);
  }

  return parsed;
};

export const parseArgs = (argv) => {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
};

/**
 * Parse a flat options object (as received from Electron IPC).
 * Normalizes the same way parseArgs would, so scripts can use the
 * same logic regardless of whether they were invoked via CLI or IPC.
 */
export const parseOptions = (options = {}) => {
  const result = {...options};
  // Coerce string "true"/"false" to boolean for checkbox fields
  for (const [key, value] of Object.entries(result)) {
    if (value === 'true') result[key] = true;
    if (value === 'false') result[key] = false;
  }
  return result;
};

export const requireArg = (args, key, message) => {
  if (!args[key]) {
    throw new Error(message ?? `Missing required option --${key}`);
  }

  return String(args[key]);
};

/**
 * Same as requireArg but works with both CLI args and parsed options.
 */
export const requireOption = (options, key, message) => {
  if (!options[key] && options[key] !== 0 && options[key] !== false) {
    throw new Error(message ?? `Missing required option: ${key}`);
  }
  return options[key];
};

export const ensureDir = (dir) => {
  fs.mkdirSync(dir, {recursive: true});
};

export const ensureOutputDirs = () => {
  ensureDir(outputsRoot);
  ensureDir(outputWorkRoot);
  ensureDir(publicMediaRoot);
};

export const videoToSrc = (videoPath) => {
  if (/^https?:\/\//.test(videoPath)) {
    return videoPath;
  }

  const absolute = path.resolve(videoPath);
  const parsed = path.parse(absolute);
  const hash = createHash('sha1').update(absolute).digest('hex').slice(0, 10);
  const publicMediaDir = publicMediaRoot;
  const stagedName = `${parsed.name.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80)}-${hash}${parsed.ext}`;
  const stagedPath = path.join(publicMediaDir, stagedName);

  ensureDir(publicMediaDir);

  if (fs.existsSync(stagedPath)) {
    const stat = fs.lstatSync(stagedPath);
    if (stat.isSymbolicLink()) {
      fs.rmSync(stagedPath);
    }
  }

  if (!fs.existsSync(stagedPath)) {
    try {
      fs.linkSync(absolute, stagedPath);
    } catch {
      fs.copyFileSync(absolute, stagedPath);
    }
  }

  return `public/media/${stagedName}`;
};

export const probeVideo = (videoPath) => {
  const output = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,r_frame_rate:format=duration',
      '-of',
      'json',
      videoPath,
    ],
    {encoding: 'utf8'},
  );

  const metadata = JSON.parse(output);
  const stream = metadata.streams?.[0];
  if (!stream) {
    throw new Error(`No video stream found in ${videoPath}`);
  }

  const [fpsNumerator, fpsDenominator] = String(stream.r_frame_rate).split('/').map(Number);
  const fps = fpsNumerator && fpsDenominator ? fpsNumerator / fpsDenominator : 30;
  const durationSeconds = Number(metadata.format?.duration ?? 0);

  return {
    width: Number(stream.width),
    height: Number(stream.height),
    fps,
    durationSeconds,
  };
};

const normalizeCaptionText = (caption, index) => {
  const raw = String(caption.text ?? '');
  if (index === 0 || raw.startsWith(' ')) {
    return raw.trim();
  }

  return ` ${raw.trim()}`;
};

export const normalizeCaptions = (raw) => {
  const captions = Array.isArray(raw) ? raw : raw.captions;
  if (!Array.isArray(captions)) {
    throw new Error('Caption file must be an array or an object with a captions array.');
  }

  return captions.map((caption, index) => {
    const startMs = Number(caption.startMs ?? caption.start ?? caption.fromMs);
    const endMs = Number(caption.endMs ?? caption.end ?? caption.toMs);

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      throw new Error(`Caption ${index} is missing startMs/endMs.`);
    }

    return {
      text: normalizeCaptionText(caption, index),
      startMs,
      endMs,
      timestampMs:
        caption.timestampMs === undefined || caption.timestampMs === null
          ? Math.round((startMs + endMs) / 2)
          : Number(caption.timestampMs),
      confidence: caption.confidence === undefined ? null : caption.confidence,
    };
  });
};

export const readCaptions = (captionPath) => {
  const raw = JSON.parse(fs.readFileSync(captionPath, 'utf8'));
  return normalizeCaptions(raw);
};

export const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw new Error(
      `Failed to run "${command}": ${result.error.message}. Is it installed and on PATH?`,
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (exit code ${result.status}${
        result.signal ? `, signal ${result.signal}` : ''
      }).`,
    );
  }
};

// ── Media utilities (ffmpeg / ffprobe) ─────────────────────────────────

/**
 * Probe any media file — returns duration and streams.
 * Prefer probeVideo() for video-specific metadata (width, height, fps).
 */
export const probeMedia = (mediaPath) => {
  const output = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', mediaPath],
    {encoding: 'utf8'},
  );

  return {
    durationSeconds: Number(output.trim()),
    path: mediaPath,
  };
};

/**
 * Extract audio from a video file to MP3 (default) or WAV.
 * Returns the path to the extracted audio file.
 */
export const extractAudio = (
  videoPath,
  outputPath,
  {bitrate = '48k', sampleRate = '16000', channels = 1, format = 'mp3'} = {},
) => {
  const codec = format === 'wav' ? 'pcm_s16le' : 'libmp3lame';

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    videoPath,
    '-vn',
    '-acodec',
    codec,
    '-b:a',
    bitrate,
    '-ar',
    sampleRate,
    '-ac',
    String(channels),
  ];

  if (format === 'mp3') {
    args.push('-f', 'mp3');
  }

  args.push(outputPath);
  execFileSync('ffmpeg', args, {stdio: 'inherit'});

  return outputPath;
};

/**
 * Split a video segment by start time and duration.
 * Returns the path to the output segment.
 */
export const splitVideoSegment = (
  videoPath,
  startSeconds,
  durationSeconds,
  outputPath,
  {width = 1280} = {},
) => {
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
      videoPath,
      '-map',
      '0:v?',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-vf',
      `scale='min(${width},iw)':-2`,
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      outputPath,
    ],
    {stdio: 'inherit'},
  );

  return outputPath;
};

// ── Formatting utilities ───────────────────────────────────────────────

/**
 * Format seconds as MM:SS.
 */
export const formatTimestamp = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/**
 * Write a JSON result to stdout when --json mode is enabled.
 *
 * The project's machine-readable-output convention: scripts that support
 * `--json` print ONLY the JSON result to stdout and route every human log
 * to stderr (see scripts/video.mjs for the reference implementation).
 */
export const emitJsonResult = (result, enabled) => {
  if (enabled) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
};

/**
 * Create a safe filename slug from a human-readable string.
 */
export const slugify = (value, fallback = 'untitled') => {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return slug || fallback;
};
