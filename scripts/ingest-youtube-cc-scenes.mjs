#!/usr/bin/env node
import path from 'node:path';
import {
  ensureDir,
  loadEnv,
  parseArgs,
  projectRoot,
} from './lib.mjs';
import {ingestYouTubeScenes} from './lib-youtube-scenes.mjs';

const usage = `
Usage:
  npm run scene:ingest:youtube -- --query "money celebration movie scene" [options]

Options:
  --query TEXT              Search query. Repeat by using --queries-file for many.
  --queries-file FILE       Newline-delimited file of search queries.
  --scene-library DIR       Target scene-library folder. Default: ./scene-library
  --max-results N           YouTube search results fetched per query. Default: 6
  --max-downloads N         Clips downloaded per query. Default: 2
  --max-duration-seconds N  Skip anything longer than this. Default: 60
  --channel-id ID           Restrict search to one channel.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

loadEnv();

const sceneLibraryDir = path.resolve(
  String(args['scene-library'] ?? path.join(projectRoot, 'scene-library')),
);
ensureDir(sceneLibraryDir);

const queries = [];
if (args.query) {
  queries.push(String(args.query));
}
if (args['queries-file']) {
  const filePath = path.resolve(String(args['queries-file']));
  const fs = await import('node:fs');
  queries.push(
    ...fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

if (queries.length === 0) {
  throw new Error('Pass --query or --queries-file.');
}

const result = await ingestYouTubeScenes({
  apiKey: process.env.YOUTUBE_API_KEY ?? null,
  sceneLibraryDir,
  queries,
  maxResultsPerQuery: Number(args['max-results'] ?? 6),
  maxDownloadsPerQuery: Number(args['max-downloads'] ?? 2),
  maxDurationSeconds: Number(args['max-duration-seconds'] ?? 60),
  channelId: args['channel-id'] ? String(args['channel-id']) : null,
});

console.log(`Downloaded ${result.downloaded.length} new YouTube scene clips into ${sceneLibraryDir}`);
