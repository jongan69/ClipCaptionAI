#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs} from './lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/qa-competitive-videos.mjs --status outputs/.../competitive-video-pipeline-status.json
  node scripts/qa-competitive-videos.mjs --preview-manifest outputs/.../competitive-preview-render-manifest.json
  node scripts/qa-competitive-videos.mjs --video final-ad.mp4 --item-id 123
  npm run ebay:competitive-qa -- --status outputs/.../competitive-video-pipeline-status.json

Options:
  --status FILE             Pipeline status JSON from ebay:competitive-status.
  --preview-manifest FILE   Preview batch manifest from ebay:render-blueprint-batch.
  --video FILE              One MP4 to QA.
  --item-id VALUE           Optional item id for --video.
  --out FILE                JSON output. Default: sibling competitive-video-qa-report.json.
  --markdown FILE           Markdown output. Default: sibling competitive-video-qa-report.md.
  --strict                  Exit non-zero when any item fails.

Checks whether competitive listing videos are actually usable sales assets:
vertical resolution, duration, audio stream, loudness, black frames, frozen/slideshow
risk, and scene/cut density.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const commandExists = (command) => {
  try {
    execFileSync('zsh', ['-lc', `command -v ${command}`], {stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const numberValue = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const basenameNoExt = (file) => path.basename(file, path.extname(file));

const secondsSumFromMatches = (text, regex) => {
  let total = 0;
  for (const match of text.matchAll(regex)) {
    total += numberValue(match.groups?.duration, 0);
  }
  return Number(total.toFixed(3));
};

const maxSecondsFromMatches = (text, regex) => {
  let max = 0;
  for (const match of text.matchAll(regex)) {
    max = Math.max(max, numberValue(match.groups?.duration, 0));
  }
  return Number(max.toFixed(3));
};

const runFfmpegLog = (ffmpegArgs) => {
  const result = spawnSync('ffmpeg', ffmpegArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    log: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  };
};

const probeVideo = (file) => {
  const raw = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=index,codec_type,codec_name,width,height,r_frame_rate:format=duration,bit_rate',
      '-of',
      'json',
      file,
    ],
    {encoding: 'utf8'},
  );
  const parsed = JSON.parse(raw);
  const video = (parsed.streams ?? []).find((stream) => stream.codec_type === 'video');
  const audio = (parsed.streams ?? []).find((stream) => stream.codec_type === 'audio');
  return {
    duration_seconds: numberValue(parsed.format?.duration, 0),
    bit_rate: numberValue(parsed.format?.bit_rate, 0),
    has_video: Boolean(video),
    has_audio: Boolean(audio),
    width: numberValue(video?.width, 0),
    height: numberValue(video?.height, 0),
    video_codec: video?.codec_name ?? null,
    audio_codec: audio?.codec_name ?? null,
    fps: fpsFromRate(video?.r_frame_rate),
    streams: parsed.streams ?? [],
  };
};

const fpsFromRate = (rate) => {
  const [num, den] = String(rate ?? '').split('/').map(Number);
  if (!num || !den) return 0;
  return Number((num / den).toFixed(3));
};

const measureBlack = (file) => {
  const {log} = runFfmpegLog([
    '-hide_banner',
    '-i',
    file,
    '-vf',
    'blackdetect=d=0.25:pix_th=0.10',
    '-an',
    '-f',
    'null',
    '-',
  ]);
  return {
    black_seconds: secondsSumFromMatches(log, /black_duration:(?<duration>[0-9.]+)/g),
    events: [...log.matchAll(/black_start:(?<start>[0-9.]+)\s+black_end:(?<end>[0-9.]+)\s+black_duration:(?<duration>[0-9.]+)/g)]
      .map((match) => ({
        start_seconds: numberValue(match.groups?.start, 0),
        end_seconds: numberValue(match.groups?.end, 0),
        duration_seconds: numberValue(match.groups?.duration, 0),
      })),
  };
};

const measureFreeze = (file) => {
  const {log} = runFfmpegLog([
    '-hide_banner',
    '-i',
    file,
    '-vf',
    'freezedetect=n=-45dB:d=0.75',
    '-an',
    '-f',
    'null',
    '-',
  ]);
  return {
    frozen_seconds: secondsSumFromMatches(log, /freeze_duration:\s*(?<duration>[0-9.]+)/g),
    longest_freeze_seconds: maxSecondsFromMatches(log, /freeze_duration:\s*(?<duration>[0-9.]+)/g),
  };
};

const measureSceneCuts = (file) => {
  const {log} = runFfmpegLog([
    '-hide_banner',
    '-i',
    file,
    '-vf',
    "select='gt(scene,0.16)',showinfo",
    '-an',
    '-f',
    'null',
    '-',
  ]);
  const cuts = [...log.matchAll(/pts_time:(?<time>[0-9.]+)/g)]
    .map((match) => numberValue(match.groups?.time, 0))
    .filter((time) => time > 0);
  return {
    scene_change_count: cuts.length,
    scene_change_times: cuts.slice(0, 80),
  };
};

const measureAudio = (file, hasAudio) => {
  if (!hasAudio) return {mean_volume_db: null, max_volume_db: null, silence_seconds: null};
  const volume = runFfmpegLog([
    '-hide_banner',
    '-i',
    file,
    '-af',
    'volumedetect',
    '-vn',
    '-f',
    'null',
    '-',
  ]).log;
  const silence = runFfmpegLog([
    '-hide_banner',
    '-i',
    file,
    '-af',
    'silencedetect=noise=-45dB:d=0.75',
    '-vn',
    '-f',
    'null',
    '-',
  ]).log;
  const mean = volume.match(/mean_volume:\s*(?<value>-?[0-9.]+)\s*dB/)?.groups?.value;
  const max = volume.match(/max_volume:\s*(?<value>-?[0-9.]+)\s*dB/)?.groups?.value;
  return {
    mean_volume_db: mean === undefined ? null : numberValue(mean, null),
    max_volume_db: max === undefined ? null : numberValue(max, null),
    silence_seconds: secondsSumFromMatches(silence, /silence_duration:\s*(?<duration>[0-9.]+)/g),
  };
};

const qaVideo = ({file, itemId, title}) => {
  const resolved = path.resolve(file);
  const issues = [];
  const warnings = [];
  if (!fs.existsSync(resolved)) {
    return {
      item_id: itemId ?? basenameNoExt(file),
      title: title ?? null,
      file: resolved,
      status: 'fail',
      score: 0,
      issues: [`Video file not found: ${resolved}`],
      warnings,
    };
  }
  if (!commandExists('ffprobe') || !commandExists('ffmpeg')) {
    return {
      item_id: itemId ?? basenameNoExt(file),
      title: title ?? null,
      file: resolved,
      status: 'fail',
      score: 0,
      issues: ['ffmpeg and ffprobe are required for competitive video QA.'],
      warnings,
    };
  }

  let probe;
  try {
    probe = probeVideo(resolved);
  } catch (error) {
    return {
      item_id: itemId ?? basenameNoExt(file),
      title: title ?? null,
      file: resolved,
      status: 'fail',
      score: 0,
      issues: [`ffprobe failed: ${error instanceof Error ? error.message : String(error)}`],
      warnings,
    };
  }

  const black = measureBlack(resolved);
  const freeze = measureFreeze(resolved);
  const scenes = measureSceneCuts(resolved);
  const audio = measureAudio(resolved, probe.has_audio);

  if (!probe.has_video) issues.push('Missing video stream.');
  if (!probe.has_audio) issues.push('Missing audio stream.');
  if (probe.width < 720 || probe.height < 1280) issues.push(`Resolution too low for premium vertical listing video: ${probe.width}x${probe.height}.`);
  if (probe.height <= probe.width) issues.push(`Video is not vertical: ${probe.width}x${probe.height}.`);
  if (probe.duration_seconds < 6) issues.push(`Video is too short: ${probe.duration_seconds.toFixed(2)}s.`);
  if (probe.duration_seconds > 60) warnings.push(`Video is long for a fast listing ad: ${probe.duration_seconds.toFixed(2)}s.`);
  if (probe.fps > 0 && probe.fps < 24) warnings.push(`Frame rate is low: ${probe.fps}fps.`);

  if (black.black_seconds > Math.max(0.75, probe.duration_seconds * 0.12)) {
    warnings.push(`Black frames detected for ${black.black_seconds.toFixed(2)}s.`);
  }
  if (freeze.longest_freeze_seconds > Math.max(2.25, probe.duration_seconds * 0.35)) {
    warnings.push(`Long frozen segment detected: ${freeze.longest_freeze_seconds.toFixed(2)}s.`);
  }
  if (freeze.frozen_seconds > probe.duration_seconds * 0.55) {
    warnings.push(`High slideshow/freeze risk: ${freeze.frozen_seconds.toFixed(2)}s frozen.`);
  }
  if (scenes.scene_change_count < 2 && probe.duration_seconds >= 8) {
    warnings.push(`Low cut/scene density: ${scenes.scene_change_count} detected changes.`);
  }
  if (audio.mean_volume_db !== null && audio.mean_volume_db < -42) {
    warnings.push(`Audio bed may be too quiet: mean ${audio.mean_volume_db.toFixed(1)} dB.`);
  }
  if (audio.silence_seconds !== null && audio.silence_seconds > probe.duration_seconds * 0.7) {
    warnings.push(`Mostly silent audio track: ${audio.silence_seconds.toFixed(2)}s silence.`);
  }

  let score = 100;
  score -= issues.length * 25;
  score -= warnings.length * 8;
  if (probe.width >= 1080 && probe.height >= 1920) score += 4;
  if (probe.has_audio && audio.mean_volume_db !== null && audio.mean_volume_db >= -35) score += 4;
  if (scenes.scene_change_count >= 4) score += 4;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const status = issues.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass';
  return {
    item_id: itemId ?? basenameNoExt(file),
    title: title ?? null,
    file: resolved,
    status,
    score,
    issues,
    warnings,
    probe,
    black,
    freeze,
    scenes,
    audio,
  };
};

const entriesFromPreviewManifest = (file) => {
  const manifest = readJson(file);
  return (manifest.renders ?? [])
    .filter((render) => render.final_video)
    .map((render) => ({
      itemId: render.item_id,
      title: render.title,
      file: render.final_video,
      source: file,
    }));
};

const entriesFromStatus = (file) => {
  const status = readJson(file);
  return (status.items ?? [])
    .map((item) => ({
      itemId: item.item_id,
      title: item.title,
      file: item.finalization?.final_video || item.preview?.final_video,
      source: file,
    }))
    .filter((entry) => entry.file);
};

const inputEntries = () => {
  if (args.video) {
    return [{
      itemId: args['item-id'] ? String(args['item-id']) : basenameNoExt(String(args.video)),
      title: args.title ? String(args.title) : null,
      file: path.resolve(String(args.video)),
      source: null,
    }];
  }
  if (args.status) return entriesFromStatus(path.resolve(String(args.status)));
  if (args['preview-manifest']) return entriesFromPreviewManifest(path.resolve(String(args['preview-manifest'])));
  throw new Error(`Missing --status, --preview-manifest, or --video.\n${usage}`);
};

const defaultOutBase = () => {
  if (args.out) return path.resolve(String(args.out));
  const source = args.status ?? args['preview-manifest'] ?? args.video;
  return path.join(path.dirname(path.resolve(String(source))), 'competitive-video-qa-report.json');
};

const markdownForReport = (report) => [
  '# Competitive Video QA Report',
  '',
  `Items: ${report.summary.items}`,
  `Passed: ${report.summary.pass}`,
  `Warn: ${report.summary.warn}`,
  `Failed: ${report.summary.fail}`,
  `Average score: ${report.summary.average_score}`,
  '',
  '| Item | Status | Score | Duration | Resolution | Audio | Scene Changes | Issues / Warnings |',
  '| --- | --- | ---: | ---: | --- | --- | ---: | --- |',
  ...report.items.map((item) => [
    item.item_id,
    item.status,
    item.score,
    item.probe?.duration_seconds ? `${item.probe.duration_seconds.toFixed(2)}s` : '',
    item.probe ? `${item.probe.width}x${item.probe.height}` : '',
    item.probe?.has_audio ? `${item.audio?.mean_volume_db ?? 'n/a'} dB mean` : 'missing',
    item.scenes?.scene_change_count ?? '',
    [...(item.issues ?? []), ...(item.warnings ?? [])].join('; ') || 'OK',
  ].map((cell) => String(cell).replace(/\|/g, '/')).join(' | ')).map((row) => `| ${row} |`),
  '',
  '## Gate Meaning',
  '',
  '- `pass`: meets the baseline for a listing-safe vertical video.',
  '- `warn`: usable for review, but fix before uploading if the warning affects buyer trust or energy.',
  '- `fail`: do not upload; regenerate or repair first.',
  '',
].join('\n');

const entries = inputEntries();
const items = entries.map((entry) => qaVideo(entry));
const summary = {
  items: items.length,
  pass: items.filter((item) => item.status === 'pass').length,
  warn: items.filter((item) => item.status === 'warn').length,
  fail: items.filter((item) => item.status === 'fail').length,
  average_score: items.length
    ? Number((items.reduce((sum, item) => sum + item.score, 0) / items.length).toFixed(1))
    : 0,
};

const outFile = defaultOutBase();
const markdownFile = path.resolve(String(
  args.markdown ?? path.join(path.dirname(outFile), 'competitive-video-qa-report.md'),
));
ensureDir(path.dirname(outFile));
ensureDir(path.dirname(markdownFile));

const report = {
  created_at: new Date().toISOString(),
  script: scriptName,
  source: args.status
    ? path.resolve(String(args.status))
    : args['preview-manifest']
      ? path.resolve(String(args['preview-manifest']))
      : args.video
        ? path.resolve(String(args.video))
        : null,
  summary,
  items,
};

fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(markdownFile, `${markdownForReport(report)}\n`);

console.log(`Competitive video QA report: ${outFile}`);
console.log(`Markdown report: ${markdownFile}`);
console.log(`Items: ${summary.items}`);
console.log(`Passed: ${summary.pass}`);
console.log(`Warn: ${summary.warn}`);
console.log(`Failed: ${summary.fail}`);
console.log(`Average score: ${summary.average_score}`);

if (args.strict && summary.fail > 0) {
  process.exit(1);
}
