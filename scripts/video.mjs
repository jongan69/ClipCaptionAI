#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {parseArgs, ensureDir, projectRoot, run, videoToSrc} from './lib.mjs';
import {
  VIDEO_RUN_SCHEMA_VERSION, collectMedia, createRunDir, describeAsset, emitResult,
  hashText, manifestPathFor, probeArtifact, requireManifest,
  writeJson,
} from './video-run-lib.mjs';

const usage = `
Usage:
  clipcaptionai video plan --brief-file brief.txt [--assets-dir ./assets] [--audio music.mp3] [--run-id NAME]
  clipcaptionai video render --run outputs/video-runs/NAME [--dry-run]
  clipcaptionai video run --brief-file brief.txt [--assets-dir ./assets]
  clipcaptionai video inspect --run NAME [--json]
  clipcaptionai video qa --run NAME [--json]

The video workflow is model-friendly: the calling model supplies a brief and
approved local assets, then reads the versioned run manifest and output metadata.
`;

const args = parseArgs(process.argv.slice(3));
const command = process.argv[2];
const json = Boolean(args.json);

const fail = (error, code = 2) => {
  const result = {ok: false, error: String(error instanceof Error ? error.message : error), code};
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else process.stderr.write(`Error: ${result.error}\n`);
  process.exitCode = code;
};

const readBrief = () => {
  const briefFile = args['brief-file'] || args.brief;
  if (!briefFile) throw new Error('Missing --brief-file.\n' + usage);
  const resolved = path.resolve(String(briefFile));
  if (!fs.existsSync(resolved)) throw new Error(`Brief file not found: ${resolved}`);
  const brief = fs.readFileSync(resolved, 'utf8').trim();
  if (!brief) throw new Error(`Brief file is empty: ${resolved}`);
  return {path: resolved, text: brief};
};

const makeShots = (brief) => {
  const lines = brief.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const shotLines = lines.filter((line) => !/^#/.test(line));
  const source = shotLines.length ? shotLines : [brief];
  return source.slice(0, 24).map((text, index) => ({
    id: `shot-${String(index + 1).padStart(2, '0')}`,
    prompt: text.replace(/^[-*]\s*/, ''),
    durationSeconds: 4,
    assetIndex: index,
  }));
};

const plan = () => {
  const brief = readBrief();
  const assetsDir = path.resolve(String(args['assets-dir'] || path.dirname(brief.path)));
  const runDir = createRunDir(args['run-id'] || path.basename(brief.path, path.extname(brief.path)));
  const assets = collectMedia(assetsDir).map((file) => describeAsset(file, projectRoot));
  const audioPath = args.audio ? path.resolve(String(args.audio)) : null;
  if (audioPath && !fs.existsSync(audioPath)) throw new Error(`Audio file not found: ${audioPath}`);
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const shots = makeShots(brief.text).map((shot, index) => ({
    ...shot,
    asset: imageAssets.length ? imageAssets[index % imageAssets.length] : null,
  }));
  const manifest = {
    schemaVersion: VIDEO_RUN_SCHEMA_VERSION,
    kind: 'clipcaptionai.video.run',
    runId: path.basename(runDir),
    status: 'planned',
    createdAt: new Date().toISOString(),
    brief: {path: brief.path, sha256: hashText(brief.text), text: brief.text},
    assets,
    audio: audioPath ? describeAsset(audioPath, projectRoot) : null,
    plan: {
      shots,
      durationSeconds: shots.reduce((total, shot) => total + shot.durationSeconds, 0),
      fps: Number(args.fps || 30),
      width: Number(args.width || (args.vertical ? 1080 : 1920)),
      height: Number(args.height || (args.vertical ? 1920 : 1080)),
      preset: String(args.preset || (args.vertical ? 'vertical-social' : 'landscape-master')),
    },
    providers: {
      transcription: {provider: String(args['transcription-provider'] || 'local-whispercpp'), status: 'not_requested'},
      narration: {provider: String(args['narration-provider'] || 'none'), status: 'not_requested'},
      generation: {provider: String(args['generation-provider'] || 'local-remotion'), status: 'planned'},
    },
    artifact: null,
    qa: {status: 'not_run', checks: []},
  };
  writeJson(manifestPathFor(runDir), manifest);
  return {ok: true, runDir, manifestPath: manifestPathFor(runDir), runId: manifest.runId, status: manifest.status, message: `Planned video run ${manifest.runId}`};
};

const render = () => {
  const {runDir, manifestPath, manifest} = requireManifest(args.run);
  if (manifest.artifact?.path && fs.existsSync(manifest.artifact.path) && !args.force) {
    return {ok: true, resumed: true, runDir, manifestPath, artifact: manifest.artifact, message: `Reusing existing artifact ${manifest.artifact.path}`};
  }
  const output = path.resolve(String(args.output || path.join(runDir, 'final', `${manifest.runId}.mp4`)));
  ensureDir(path.dirname(output));
  if (args['dry-run']) {
    return {ok: true, dryRun: true, runDir, manifestPath, plannedOutput: output, message: `Dry run: would render ${output}`};
  }
  const propsPath = path.join(os.tmpdir(), `clipcaptionai-video-${Date.now()}.json`);
  const props = {
    width: manifest.plan.width,
    height: manifest.plan.height,
    fps: manifest.plan.fps,
    audio: manifest.audio?.absolutePath ? videoToSrc(manifest.audio.absolutePath) : null,
    shots: manifest.plan.shots.map((shot) => ({
      ...shot,
      asset: shot.asset?.absolutePath ? videoToSrc(shot.asset.absolutePath) : null,
    })),
  };
  fs.writeFileSync(propsPath, JSON.stringify(props));
  try {
    run('npx', ['remotion', 'render', 'src/index.tsx', 'PromptVideo', output, `--props=${propsPath}`, '--codec=h264'], {
      stdio: json ? ['ignore', 'ignore', 'inherit'] : 'inherit',
    });
  } finally {
    fs.rmSync(propsPath, {force: true});
  }
  const artifact = probeArtifact(output);
  const updated = {...manifest, status: 'rendered', renderedAt: new Date().toISOString(), artifact, qa: {status: 'not_run', checks: []}};
  writeJson(manifestPath, updated);
  return {ok: true, runDir, manifestPath, artifact, status: updated.status, message: `Rendered ${output}`};
};

const qa = () => {
  const {runDir, manifestPath, manifest} = requireManifest(args.run);
  if (!manifest.artifact?.path || !fs.existsSync(manifest.artifact.path)) throw new Error('No rendered artifact found. Run video render first.');
  const artifact = probeArtifact(manifest.artifact.path);
  const checks = [
    {name: 'file-exists', ok: fs.existsSync(artifact.path)},
    {name: 'video-stream', ok: artifact.width > 0 && artifact.height > 0},
    {name: 'duration', ok: artifact.durationSeconds > 0},
    {name: 'h264-video', ok: artifact.videoCodec === 'h264'},
    {name: 'audio-not-silent', ok: !artifact.hasAudio || artifact.meanVolumeDb === null || artifact.meanVolumeDb > -60},
  ];
  const status = checks.every((check) => check.ok) ? 'passed' : 'failed';
  const updated = {...manifest, artifact, qa: {status, checkedAt: new Date().toISOString(), checks}};
  writeJson(manifestPath, updated);
  return {ok: status === 'passed', runDir, manifestPath, artifact, qa: updated.qa, status, message: `QA ${status}: ${artifact.path}`};
};

const inspect = () => {
  const {runDir, manifestPath, manifest} = requireManifest(args.run);
  return {ok: true, runDir, manifestPath, manifest, message: `Run ${manifest.runId}: ${manifest.status}`};
};

const main = () => {
  if (!command || args.help || args.h) { process.stdout.write(usage); return; }
  if (command === 'plan') return plan();
  if (command === 'render') return render();
  if (command === 'run') { const planned = plan(); if (!planned.ok) return planned; args.run = planned.runDir; return render(); }
  if (command === 'inspect') return inspect();
  if (command === 'qa') return qa();
  throw new Error(`Unknown video command: ${command}\n${usage}`);
};

try {
  const result = main();
  if (result) emitResult(result, json);
  if (result?.ok === false) process.exitCode = 1;
} catch (error) {
  fail(error);
}
