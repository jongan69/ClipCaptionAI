#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';
import {
  loadSceneBlacklist,
  readSceneBlacklistPath,
  sceneBlacklistKeys,
  saveSceneBlacklist,
} from './lib-youtube-scenes.mjs';

const usage = `
Usage:
  npm run scene:blacklist
  npm run scene:blacklist -- --scene-library scene-library

Options:
  --scene-library DIR   Scene cache folder. Default: ./scene-library
  --prune-index         Remove blacklisted and missing-file scenes from index.json. Default: true.
  --keep-index          Do not edit index.json.
  --dry-run             Show what would be blacklisted without writing files.

Workflow:
  1. Manually delete bad MP4s from scene-library/.
  2. Leave their matching *.scene.json files in place.
  3. Run this command.
  4. Those YouTube video IDs/URLs are written to scene-library/blacklist.json.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const sceneLibraryDir = path.resolve(
  String(args['scene-library'] ?? path.join(projectRoot, 'scene-library')),
);
const dryRun = Boolean(args['dry-run']);
const pruneIndex = args['keep-index'] ? false : args['prune-index'] === undefined || Boolean(args['prune-index']);

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const sceneIdFromSidecarName = (fileName, metadata) => {
  const videoId = metadata?.attribution?.videoId;
  if (videoId) {
    return `yt-${videoId}`;
  }

  const match = fileName.match(/^yt-([a-zA-Z0-9_-]{8,})-/);
  return match ? `yt-${match[1]}` : fileName.replace(/\.scene\.json$/, '');
};

const sidecarVideoPath = (sidecarPath) =>
  sidecarPath.replace(/\.scene\.json$/, '');

const sidecarFiles = () => {
  if (!fs.existsSync(sceneLibraryDir)) {
    return [];
  }

  return fs
    .readdirSync(sceneLibraryDir)
    .filter((file) => file.endsWith('.scene.json'))
    .sort()
    .map((file) => path.join(sceneLibraryDir, file));
};

const toBlacklistEntry = (sidecarPath) => {
  const fileName = path.basename(sidecarPath);
  const metadata = readJson(sidecarPath);
  const attribution = metadata.attribution ?? {};
  const videoPath = sidecarVideoPath(sidecarPath);

  return {
    id: sceneIdFromSidecarName(fileName, metadata),
    videoId: attribution.videoId ?? null,
    url: attribution.url ?? null,
    title: metadata.title ?? null,
    source: metadata.source ?? attribution.channelTitle ?? null,
    file: path.basename(videoPath),
    sidecar: fileName,
    reason: 'manual_delete_mp4',
    blacklistedAt: new Date().toISOString(),
    ingestedFromQuery: attribution.ingestedFromQuery ?? null,
    ingestedFromSearchQuery: attribution.ingestedFromSearchQuery ?? null,
  };
};

const mergeEntries = (existingEntries, newEntries) => {
  const byKey = new Map();
  for (const entry of existingEntries) {
    const key = entry.videoId || entry.url || entry.id || entry.file;
    if (key) {
      byKey.set(String(key), entry);
    }
  }

  for (const entry of newEntries) {
    const key = entry.videoId || entry.url || entry.id || entry.file;
    if (!key) {
      continue;
    }

    byKey.set(String(key), {
      ...byKey.get(String(key)),
      ...entry,
    });
  }

  return [...byKey.values()].sort((a, b) =>
    String(a.videoId ?? a.id ?? a.file).localeCompare(String(b.videoId ?? b.id ?? b.file)),
  );
};

const pruneIndexFile = (blacklist) => {
  const indexPath = path.join(sceneLibraryDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    return {before: 0, after: 0, removed: 0};
  }

  const parsed = readJson(indexPath);
  const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
  const keys = sceneBlacklistKeys(blacklist);
  const keptScenes = scenes.filter((scene) => {
    const filePath = path.join(sceneLibraryDir, String(scene.file ?? ''));
    const videoId = scene.attribution?.videoId;
    const url = scene.attribution?.url;
    const id = String(scene.id ?? '');

    if (!fs.existsSync(filePath)) {
      return false;
    }
    if (id && keys.ids.has(id)) {
      return false;
    }
    if (videoId && keys.videoIds.has(String(videoId))) {
      return false;
    }
    if (url && keys.urls.has(String(url))) {
      return false;
    }
    return true;
  });

  if (!dryRun) {
    fs.writeFileSync(indexPath, `${JSON.stringify({scenes: keptScenes}, null, 2)}\n`);
  }

  return {
    before: scenes.length,
    after: keptScenes.length,
    removed: scenes.length - keptScenes.length,
  };
};

ensureDir(sceneLibraryDir);

const orphanEntries = sidecarFiles()
  .filter((sidecarPath) => !fs.existsSync(sidecarVideoPath(sidecarPath)))
  .map(toBlacklistEntry);

const currentBlacklist = loadSceneBlacklist(sceneLibraryDir);
const mergedEntries = mergeEntries(currentBlacklist.entries, orphanEntries);
const nextBlacklist = {
  version: 1,
  updatedAt: new Date().toISOString(),
  entries: mergedEntries,
};

const indexResult = pruneIndex ? pruneIndexFile(nextBlacklist) : null;

if (!dryRun) {
  saveSceneBlacklist(sceneLibraryDir, nextBlacklist);
}

console.log(`Scene library: ${sceneLibraryDir}`);
console.log(`Blacklist file: ${readSceneBlacklistPath(sceneLibraryDir)}`);
console.log(`Orphaned sidecars found: ${orphanEntries.length}`);
console.log(`Blacklist entries before: ${currentBlacklist.entries.length}`);
console.log(`Blacklist entries after: ${mergedEntries.length}`);
if (indexResult) {
  console.log(`Index scenes pruned: ${indexResult.removed} (${indexResult.before} -> ${indexResult.after})`);
}
if (dryRun) {
  console.log('Dry run only. Nothing written.');
}
