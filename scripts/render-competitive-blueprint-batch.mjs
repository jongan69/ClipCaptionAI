#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/render-competitive-blueprint-batch.mjs --blueprints-dir outputs/.../competitive-creative
  npm run ebay:render-blueprint-batch -- --blueprints-dir outputs/.../competitive-creative --limit 3

Options:
  --blueprints-dir DIR     Directory to scan recursively for creative-blueprint.json files.
  --out-manifest FILE      Default: <blueprints-dir>/competitive-preview-render-manifest.json
  --limit N                Render at most N blueprints after sorting.
  --duration N             Pass-through duration seconds for each preview render.
  --width N                Pass-through width. Default renderer uses 1080.
  --height N               Pass-through height. Default renderer uses 1920.
  --fps N                  Pass-through FPS. Default renderer uses 30.
  --music-track FILE       Pass-through quiet background music.
  --music-volume N         Pass-through music volume.
  --no-music               Disable background music.
  --voiceover FILE         Pass-through seller voiceover MP3/WAV/M4A.
  --voiceover-volume N     Pass-through voiceover volume.
  --sfx-library DIR        Pass-through SFX library directory.
  --sfx-volume N           Pass-through SFX volume.
  --no-sfx                 Disable transition SFX.
  --dry-run                Write the batch manifest without rendering.
  --fail-fast              Stop after the first failed render.

This batch command keeps the same product-safe policy as the single renderer:
it copies competitor structure only, never competitor footage/audio/captions.
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

const ignoredDirs = new Set([
  '.git',
  'node_modules',
  'work',
  'final',
  'downloads',
  'higgsfield-renders',
  'story-broll',
  'reference-video-analysis',
]);

const findBlueprints = (root) => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) walk(full);
        continue;
      }
      if (entry.name === 'creative-blueprint.json') files.push(full);
    }
  };
  walk(root);
  return files.sort((a, b) => a.localeCompare(b));
};

const pushOption = (renderArgs, key) => {
  if (args[key] === undefined || args[key] === false) return;
  renderArgs.push(`--${key}`, String(args[key]));
};

const pushFlag = (renderArgs, key) => {
  if (args[key] === true) renderArgs.push(`--${key}`);
};

const parseRenderPaths = (stdout) => {
  const finalVideo = stdout.match(/^Competitive preview ad:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const proofFrame = stdout.match(/^Proof frame:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const manifest = stdout.match(/^Manifest:\s*(.+)$/m)?.[1]?.trim() ?? null;
  return {finalVideo, proofFrame, manifest};
};

const blueprintsDir = path.resolve(requireArg('blueprints-dir'));
if (!fs.existsSync(blueprintsDir) || !fs.statSync(blueprintsDir).isDirectory()) {
  throw new Error(`Blueprints directory not found: ${blueprintsDir}`);
}

const allBlueprints = findBlueprints(blueprintsDir);
const limit = args.limit === undefined ? allBlueprints.length : Number(args.limit);
if (!Number.isFinite(limit) || limit < 1) throw new Error(`Invalid --limit: ${args.limit}`);
const blueprints = allBlueprints.slice(0, limit);
if (blueprints.length === 0) throw new Error(`No creative-blueprint.json files found under ${blueprintsDir}`);

const outManifest = path.resolve(String(
  args['out-manifest'] ?? path.join(blueprintsDir, 'competitive-preview-render-manifest.json'),
));
ensureDir(path.dirname(outManifest));

const renderOptions = ['duration', 'width', 'height', 'fps', 'music-track', 'music-volume', 'voiceover', 'voiceover-volume', 'sfx-library', 'sfx-volume'];
const renders = [];
const startedAt = new Date().toISOString();

for (const blueprint of blueprints) {
  const entry = {
    blueprint,
    item_id: null,
    title: null,
    ok: false,
    skipped: args['dry-run'] === true,
    final_video: null,
    proof_frame: null,
    manifest: null,
    duration_seconds: null,
    selected_reference: null,
    error: null,
    stdout_tail: '',
    stderr_tail: '',
  };

  try {
    const parsed = readJson(blueprint);
    entry.item_id = parsed.listing?.item_id ?? null;
    entry.title = parsed.listing?.title ?? null;
    entry.selected_reference = parsed.selected_reference ?? null;

    if (args['dry-run'] === true) {
      entry.ok = true;
      renders.push(entry);
      continue;
    }

    const renderArgs = ['scripts/render-competitive-blueprint-ad.mjs', '--blueprint', blueprint];
    for (const key of renderOptions) pushOption(renderArgs, key);
    pushFlag(renderArgs, 'no-music');
    pushFlag(renderArgs, 'no-sfx');

    const result = spawnSync('node', renderArgs, {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20,
    });
    entry.stdout_tail = tail(result.stdout);
    entry.stderr_tail = tail(result.stderr);

    if (result.status !== 0) {
      entry.error = `Renderer exited with status ${result.status}`;
      renders.push(entry);
      if (args['fail-fast'] === true) break;
      continue;
    }

    const paths = parseRenderPaths(result.stdout);
    entry.final_video = paths.finalVideo;
    entry.proof_frame = paths.proofFrame;
    entry.manifest = paths.manifest;

    if (entry.manifest && fs.existsSync(entry.manifest)) {
      const renderManifest = readJson(entry.manifest);
      entry.duration_seconds = renderManifest.duration_seconds ?? null;
      entry.final_video = renderManifest.final_video ?? entry.final_video;
      entry.proof_frame = renderManifest.proof_frame ?? entry.proof_frame;
      entry.selected_reference = renderManifest.selected_reference ?? entry.selected_reference;
    }

    entry.ok = Boolean(entry.final_video && fs.existsSync(entry.final_video));
  } catch (error) {
    entry.error = error instanceof Error ? error.message : String(error);
    if (args['fail-fast'] === true) {
      renders.push(entry);
      break;
    }
  }

  renders.push(entry);
}

const manifest = {
  created_at: new Date().toISOString(),
  started_at: startedAt,
  script: scriptName,
  blueprints_dir: blueprintsDir,
  dry_run: args['dry-run'] === true,
  requested_count: blueprints.length,
  discovered_count: allBlueprints.length,
  rendered_count: renders.filter((entry) => entry.ok && !entry.skipped).length,
  skipped_count: renders.filter((entry) => entry.skipped).length,
  failed_count: renders.filter((entry) => !entry.ok).length,
  source_policy: 'structure-only competitor analysis; final previews use listing images, local/cleared B-roll if present, local music, and local SFX',
  renders,
};

fs.writeFileSync(outManifest, `${JSON.stringify(manifest, null, 2)}\n`);

const failed = manifest.failed_count;
console.log(`Competitive preview batch manifest: ${outManifest}`);
console.log(`Blueprints discovered: ${manifest.discovered_count}`);
console.log(`Rendered: ${manifest.rendered_count}`);
console.log(`Skipped: ${manifest.skipped_count}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exitCode = 1;
