import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';

export const projectRoot = path.resolve(
  new URL('..', import.meta.url).pathname,
);

export const outputsRoot = path.join(projectRoot, 'outputs');
export const outputWorkRoot = path.join(outputsRoot, 'work');
export const publicMediaRoot = path.join(projectRoot, 'public', 'media');
export const ebayCinematicAdsOutputRoot = path.join(outputsRoot, 'ebay-cinematic-ads');

export const loadEnv = () => {
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

export const requireArg = (args, key, message) => {
  if (!args[key]) {
    throw new Error(message ?? `Missing required option --${key}`);
  }

  return String(args[key]);
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

  return `media/${stagedName}`;
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

  const [fpsNumerator, fpsDenominator] = String(stream.r_frame_rate)
    .split('/')
    .map(Number);
  const fps =
    fpsNumerator && fpsDenominator ? fpsNumerator / fpsDenominator : 30;
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
      confidence:
        caption.confidence === undefined ? null : caption.confidence,
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

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed.`);
  }
};
