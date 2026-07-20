#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/finalize-competitive-premium-ads.mjs --premium-plan outputs/.../competitive-premium-render-plan.json
  npm run ebay:finalize-premium-ads -- --premium-plan outputs/.../competitive-premium-render-plan.json

Options:
  --premium-plan FILE      Plan from ebay:prep-premium-renders.
  --out-manifest FILE      Default: sibling competitive-premium-finalize-manifest.json
  --energy standard|max    Assembly energy. Default: max
  --broll-position VALUE   end|interleave. Default: interleave
  --max-broll-clips N      Pass-through to assembler.
  --max-broll-seconds N    Pass-through to assembler.
  --max-clip-seconds N     Pass-through to assembler.
  --no-broll               Do not include story B-roll in assembly.
  --no-sfx                 Disable SFX in assembly.
  --no-music               Disable background music in assembly.
  --dry-run                Only report readiness; do not assemble.
  --fail-fast              Stop after the first assembly failure.
  --require-ready          Exit non-zero if any selected listing is missing expected clips.

Finalizes only listings whose expected Higgsfield output files exist.
Missing clips are reported as not_ready instead of silently falling back to slideshows.
No slideshow fallback is created.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const requireArg = (key) => {
  if (!args[key]) throw new Error(`Missing --${key}.\n${usage}`);
  return String(args[key]);
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const tail = (value, max = 2400) => {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return text.slice(text.length - max);
};

const ffprobeStreams = (file) => {
  if (!file || !fs.existsSync(file)) return null;
  try {
    const output = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,codec_name,width,height,r_frame_rate:format=duration',
        '-of',
        'json',
        file,
      ],
      {encoding: 'utf8'},
    );
    const parsed = JSON.parse(output);
    return {
      duration_seconds: Number(parsed.format?.duration ?? 0),
      streams: parsed.streams ?? [],
      has_video: (parsed.streams ?? []).some((stream) => stream.codec_type === 'video'),
      has_audio: (parsed.streams ?? []).some((stream) => stream.codec_type === 'audio'),
    };
  } catch (error) {
    return {error: error instanceof Error ? error.message : String(error)};
  }
};

const expectedClipsForPacket = (packet) =>
  (packet.jobs ?? [])
    .map((job) => ({id: job.id, path: job.output_hint}))
    .filter((job) => job.path);

const buildAssembleArgs = (packet) => {
  const assembleArgs = [
    'scripts/ebay-cinematic-ads.mjs',
    'assemble',
    '--project-dir',
    packet.project_dir,
    '--energy',
    String(args.energy ?? 'max'),
    '--broll-position',
    String(args['broll-position'] ?? 'interleave'),
  ];
  if (args['no-broll'] !== true) assembleArgs.push('--include-broll');
  for (const key of ['max-broll-clips', 'max-broll-seconds', 'max-clip-seconds']) {
    if (args[key] !== undefined && args[key] !== false) assembleArgs.push(`--${key}`, String(args[key]));
  }
  if (args['no-sfx'] === true) assembleArgs.push('--no-sfx');
  if (args['no-music'] === true) assembleArgs.push('--no-music');
  return assembleArgs;
};

const premiumPlanPath = path.resolve(requireArg('premium-plan'));
if (!fs.existsSync(premiumPlanPath)) throw new Error(`Premium plan not found: ${premiumPlanPath}`);
const premiumPlan = readJson(premiumPlanPath);
const outManifest = path.resolve(String(
  args['out-manifest'] ?? path.join(path.dirname(premiumPlanPath), 'competitive-premium-finalize-manifest.json'),
));
ensureDir(path.dirname(outManifest));

const results = [];
for (const packet of premiumPlan.selected ?? []) {
  const expectedClips = expectedClipsForPacket(packet);
  const missingClips = expectedClips.filter((clip) => !fs.existsSync(clip.path));
  const entry = {
    item_id: packet.item_id,
    title: packet.title,
    project_dir: packet.project_dir,
    expected_clips: expectedClips,
    missing_clips: missingClips,
    ready: missingClips.length === 0 && expectedClips.length > 0,
    assembled: false,
    final_video: null,
    proof_frame: null,
    final_manifest: null,
    probe: null,
    error: null,
    stdout_tail: '',
    stderr_tail: '',
  };

  if (!entry.ready) {
    entry.error = expectedClips.length === 0
      ? 'No expected Higgsfield output clips listed in premium plan.'
      : 'Missing expected Higgsfield output clips.';
    results.push(entry);
    if (args['fail-fast'] === true) break;
    continue;
  }

  if (args['dry-run'] === true) {
    results.push(entry);
    continue;
  }

  const assembleArgs = buildAssembleArgs(packet);
  const result = spawnSync('node', assembleArgs, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
  entry.stdout_tail = tail(result.stdout);
  entry.stderr_tail = tail(result.stderr);
  if (result.status !== 0) {
    entry.error = `Assembler exited with status ${result.status}`;
    results.push(entry);
    if (args['fail-fast'] === true) break;
    continue;
  }

  const finalManifestPath = path.join(packet.project_dir, 'final', 'manifest.json');
  entry.final_manifest = fs.existsSync(finalManifestPath) ? finalManifestPath : null;
  if (entry.final_manifest) {
    const finalManifest = readJson(entry.final_manifest);
    entry.final_video = finalManifest.final_video ?? null;
    entry.proof_frame = finalManifest.proof_frame ?? null;
    entry.probe = ffprobeStreams(entry.final_video);
    entry.assembled = Boolean(entry.final_video && fs.existsSync(entry.final_video) && entry.probe?.has_video);
  }
  if (!entry.assembled) entry.error = 'Assembler completed but final video verification did not pass.';
  results.push(entry);
}

const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  premium_plan: premiumPlanPath,
  dry_run: args['dry-run'] === true,
  selected_count: (premiumPlan.selected ?? []).length,
  ready_count: results.filter((entry) => entry.ready).length,
  assembled_count: results.filter((entry) => entry.assembled).length,
  not_ready_count: results.filter((entry) => !entry.ready).length,
  failed_count: results.filter((entry) => entry.ready && !entry.assembled && args['dry-run'] !== true).length,
  source_policy: 'Final assembly requires real generated/owned clips in higgsfield-renders; no slideshow fallback is allowed.',
  results,
};

fs.writeFileSync(outManifest, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Competitive premium finalize manifest: ${outManifest}`);
console.log(`Selected: ${manifest.selected_count}`);
console.log(`Ready: ${manifest.ready_count}`);
console.log(`Assembled: ${manifest.assembled_count}`);
console.log(`Not ready: ${manifest.not_ready_count}`);
console.log(`Failed: ${manifest.failed_count}`);

if (args['require-ready'] === true && manifest.not_ready_count > 0) process.exitCode = 1;
if (manifest.failed_count > 0) process.exitCode = 1;
