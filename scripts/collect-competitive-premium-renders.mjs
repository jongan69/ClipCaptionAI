#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs} from './lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/collect-competitive-premium-renders.mjs --premium-plan outputs/.../competitive-premium-render-plan.json
  npm run ebay:collect-premium-renders -- --premium-plan outputs/.../competitive-premium-render-plan.json --url-map render-urls.json

Options:
  --premium-plan FILE      Plan from ebay:prep-premium-renders.
  --url-map FILE           Optional JSON map of item/job IDs to local files or video URLs.
  --out-manifest FILE      Default: sibling competitive-premium-collect-manifest.json
  --dry-run                Report what would be imported without writing files.
  --overwrite              Replace existing output_hint files.
  --no-probe               Skip ffprobe verification after import.

Imports approved Higgsfield outputs into the exact higgsfield-renders/<job-id>.mp4
paths expected by ebay:finalize-premium-ads. It can copy local files, download direct
video URLs, or scan per-listing *.competitive-job.json files for result URLs.
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

const writeJson = (file, value) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value ?? ''));
const isLikelyVideoUrl = (value) => /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(String(value ?? ''));

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

const normalizeSourceMap = (value) => {
  const entries = [];
  const addEntry = ({itemId, jobId, source}) => {
    if (!itemId || !jobId || !source) return;
    entries.push({item_id: String(itemId), job_id: String(jobId), source: String(source)});
  };

  if (Array.isArray(value)) {
    for (const row of value) {
      addEntry({
        itemId: row.item_id ?? row.itemId ?? row.item,
        jobId: row.job_id ?? row.jobId ?? row.job,
        source: row.source ?? row.url ?? row.video_url ?? row.videoUrl ?? row.file ?? row.path,
      });
    }
    return entries;
  }

  if (!value || typeof value !== 'object') return entries;
  for (const [key, row] of Object.entries(value)) {
    if (typeof row === 'string') {
      const [itemId, jobId] = key.split(/[:/|]/);
      addEntry({itemId, jobId, source: row});
      continue;
    }
    if (row && typeof row === 'object') {
      if (row.source || row.url || row.video_url || row.file || row.path) {
        const [fallbackItemId, fallbackJobId] = key.split(/[:/|]/);
        addEntry({
          itemId: row.item_id ?? row.itemId ?? fallbackItemId,
          jobId: row.job_id ?? row.jobId ?? fallbackJobId,
          source: row.source ?? row.url ?? row.video_url ?? row.videoUrl ?? row.file ?? row.path,
        });
      } else {
        for (const [jobId, source] of Object.entries(row)) {
          if (typeof source === 'string') addEntry({itemId: key, jobId, source});
        }
      }
    }
  }
  return entries;
};

const sourceForJob = ({sourceEntries, itemId, jobId}) =>
  sourceEntries.find((entry) => entry.item_id === String(itemId) && entry.job_id === String(jobId))?.source ?? null;

const collectStrings = (value, context = [], results = []) => {
  if (typeof value === 'string') {
    results.push({value, context: context.join('.')});
    return results;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, [...context, String(index)], results));
    return results;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) collectStrings(child, [...context, key], results);
  }
  return results;
};

const candidateSourcesFromJobJson = ({jobJsonPath, projectDir}) => {
  if (!jobJsonPath || !fs.existsSync(jobJsonPath)) return [];
  const parsed = readJson(jobJsonPath);
  const strings = collectStrings(parsed);
  const scored = [];
  for (const item of strings) {
    const value = item.value.trim();
    const context = item.context.toLowerCase();
    if (isHttpUrl(value)) {
      let score = 10;
      if (isLikelyVideoUrl(value)) score += 40;
      if (/video|download|asset|output|result|url/.test(context)) score += 25;
      scored.push({source: value, kind: 'url', score, context: item.context});
      continue;
    }
    const localCandidates = [
      path.isAbsolute(value) ? value : null,
      path.resolve(projectDir, value),
      path.resolve(path.dirname(jobJsonPath), value),
    ].filter(Boolean);
    const local = localCandidates.find((candidate) => fs.existsSync(candidate));
    if (local) {
      let score = 15;
      if (/\.(mp4|mov|m4v|webm)$/i.test(local)) score += 35;
      if (/video|download|asset|output|result|file|path/.test(context)) score += 20;
      scored.push({source: local, kind: 'file', score, context: item.context});
    }
  }
  return scored.sort((a, b) => b.score - a.score);
};

const downloadFile = async ({url, outPath}) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, bytes);
  return bytes.length;
};

const copyFile = ({source, outPath}) => {
  try {
    fs.linkSync(source, outPath);
  } catch {
    fs.copyFileSync(source, outPath);
  }
  return fs.statSync(outPath).size;
};

const importSource = async ({source, outPath}) => {
  ensureDir(path.dirname(outPath));
  const tempPath = `${outPath}.tmp-${process.pid}`;
  if (fs.existsSync(tempPath)) fs.rmSync(tempPath, {force: true});
  try {
    const bytes = isHttpUrl(source)
      ? await downloadFile({url: source, outPath: tempPath})
      : copyFile({source, outPath: tempPath});
    fs.renameSync(tempPath, outPath);
    return {bytes};
  } finally {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, {force: true});
  }
};

const premiumPlanPath = path.resolve(requireArg('premium-plan'));
if (!fs.existsSync(premiumPlanPath)) throw new Error(`Premium plan not found: ${premiumPlanPath}`);
const premiumPlan = readJson(premiumPlanPath);
const sourceEntries = args['url-map']
  ? normalizeSourceMap(readJson(path.resolve(String(args['url-map']))))
  : [];
const outManifest = path.resolve(String(
  args['out-manifest'] ?? path.join(path.dirname(premiumPlanPath), 'competitive-premium-collect-manifest.json'),
));
const dryRun = args['dry-run'] === true;
const overwrite = args.overwrite === true;
const probeEnabled = args['no-probe'] !== true;

const results = [];
for (const packet of premiumPlan.selected ?? []) {
  for (const job of packet.jobs ?? []) {
    const outPath = job.output_hint;
    const jobJsonPath = path.join(packet.project_dir, 'higgsfield', `${job.id}.competitive-job.json`);
    const mappedSource = sourceForJob({sourceEntries, itemId: packet.item_id, jobId: job.id});
    const jobJsonCandidates = mappedSource ? [] : candidateSourcesFromJobJson({jobJsonPath, projectDir: packet.project_dir});
    const source = mappedSource ?? jobJsonCandidates[0]?.source ?? null;
    const entry = {
      item_id: packet.item_id,
      title: packet.title,
      job_id: job.id,
      output_hint: outPath,
      existing: Boolean(outPath && fs.existsSync(outPath)),
      source,
      source_kind: source ? (isHttpUrl(source) ? 'url' : 'file') : null,
      job_json: fs.existsSync(jobJsonPath) ? jobJsonPath : null,
      imported: false,
      skipped: false,
      missing_source: false,
      probe: null,
      error: null,
    };

    try {
      if (entry.existing && !overwrite) {
        entry.skipped = true;
        entry.probe = probeEnabled ? ffprobeStreams(outPath) : null;
        results.push(entry);
        continue;
      }
      if (!source) {
        entry.missing_source = true;
        results.push(entry);
        continue;
      }
      if (!isHttpUrl(source) && !fs.existsSync(source)) {
        entry.error = `Source file does not exist: ${source}`;
        results.push(entry);
        continue;
      }
      if (dryRun) {
        entry.skipped = true;
        results.push(entry);
        continue;
      }
      await importSource({source, outPath});
      entry.imported = true;
      entry.probe = probeEnabled ? ffprobeStreams(outPath) : null;
      if (probeEnabled && !entry.probe?.has_video) {
        entry.error = 'Imported file did not pass video probe.';
      }
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
    }
    results.push(entry);
  }
}

const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  premium_plan: premiumPlanPath,
  url_map: args['url-map'] ? path.resolve(String(args['url-map'])) : null,
  dry_run: dryRun,
  overwrite,
  probe_enabled: probeEnabled,
  expected_count: results.length,
  existing_count: results.filter((entry) => entry.existing).length,
  imported_count: results.filter((entry) => entry.imported && !entry.error).length,
  missing_source_count: results.filter((entry) => entry.missing_source).length,
  failed_count: results.filter((entry) => entry.error).length,
  ready_count: results.filter((entry) => fs.existsSync(entry.output_hint) && !entry.error).length,
  results,
};

writeJson(outManifest, manifest);

console.log(`Competitive premium collect manifest: ${outManifest}`);
console.log(`Expected: ${manifest.expected_count}`);
console.log(`Existing: ${manifest.existing_count}`);
console.log(`Imported: ${manifest.imported_count}`);
console.log(`Ready: ${manifest.ready_count}`);
console.log(`Missing source: ${manifest.missing_source_count}`);
console.log(`Failed: ${manifest.failed_count}`);

if (manifest.failed_count > 0) process.exitCode = 1;
