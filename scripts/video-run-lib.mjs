import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {outputsRoot, ensureDir, projectRoot} from './lib.mjs';

export const VIDEO_RUN_SCHEMA_VERSION = 1;
export const videoRunsRoot = path.join(outputsRoot, 'video-runs');

const mediaExtensions = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.mp4', '.mov', '.m4v', '.webm',
  '.mp3', '.wav', '.m4a', '.aac',
]);

export const hashFile = (filePath) => {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
};

export const hashText = (value) => createHash('sha256').update(String(value)).digest('hex');

export const writeJson = (filePath, value) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

export const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

export const runIdFrom = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 64) || `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;

export const resolveRunDir = (run) => {
  const candidate = path.resolve(run);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
  return path.join(videoRunsRoot, runIdFrom(run));
};

export const manifestPathFor = (runDir) => path.join(runDir, 'run.json');

export const collectMedia = (root) => {
  const resolved = path.resolve(root);
  if (!fs.existsSync(resolved)) return [];
  const entries = fs.readdirSync(resolved, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(resolved, entry.name);
    if (entry.isDirectory()) files.push(...collectMedia(fullPath));
    else if (mediaExtensions.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
  }
  return files.sort();
};

export const describeAsset = (filePath, root = projectRoot) => ({
  path: path.relative(root, filePath) || path.basename(filePath),
  absolutePath: filePath,
  type: ['.mp4', '.mov', '.m4v', '.webm'].includes(path.extname(filePath).toLowerCase()) ? 'video'
    : ['.mp3', '.wav', '.m4a', '.aac'].includes(path.extname(filePath).toLowerCase()) ? 'audio' : 'image',
  extension: path.extname(filePath).toLowerCase(),
  bytes: fs.statSync(filePath).size,
  sha256: hashFile(filePath),
});

export const createRunDir = (runId) => {
  const runDir = path.join(videoRunsRoot, runIdFrom(runId));
  ensureDir(runDir);
  return runDir;
};

export const requireManifest = (run) => {
  const runDir = resolveRunDir(run);
  const manifestPath = manifestPathFor(runDir);
  if (!fs.existsSync(manifestPath)) throw new Error(`Run manifest not found: ${manifestPath}`);
  const manifest = readJson(manifestPath);
  if (manifest.schemaVersion !== VIDEO_RUN_SCHEMA_VERSION) {
    throw new Error(`Unsupported run manifest schema: ${manifest.schemaVersion}`);
  }
  return {runDir, manifestPath, manifest};
};

export const probeArtifact = (filePath) => {
  const output = execFileSync('ffprobe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath,
  ], {encoding: 'utf8'});
  const parsed = JSON.parse(output);
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video') ?? null;
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio') ?? null;
  if (!video) throw new Error(`Artifact has no video stream: ${filePath}`);
  let meanVolumeDb = null;
  if (audio) {
    const volumeResult = spawnSync('ffmpeg', [
      '-i', filePath, '-af', 'volumedetect', '-f', 'null', '-',
    ], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    const volumeOutput = `${volumeResult.stdout ?? ''}\n${volumeResult.stderr ?? ''}`;
    meanVolumeDb = Number(volumeOutput.match(/mean_volume:\s*(-?[0-9.]+) dB/)?.[1] ?? null);
  }
  return {
    path: filePath,
    sha256: hashFile(filePath),
    bytes: fs.statSync(filePath).size,
    durationSeconds: Number(parsed.format?.duration ?? video.duration ?? 0),
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
    fps: video.r_frame_rate ?? null,
    videoCodec: video.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    hasAudio: Boolean(audio),
    meanVolumeDb: Number.isFinite(meanVolumeDb) ? meanVolumeDb : null,
  };
};

export const emitResult = (result, json = false) => {
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else process.stdout.write(`${result.message ?? JSON.stringify(result, null, 2)}\n`);
};
