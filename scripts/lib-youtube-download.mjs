import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const normalizeSourceProfile = (value, {fromSectionHeading = false} = {}) => {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/^#+/, '')
    .replace(/['’]s\b/gi, '')
    .replace(/\b(videos?|video|links?|clips?|sources?)\b/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();

  if (!cleaned) {
    return null;
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const [firstToken] = tokens;
  if (
    fromSectionHeading &&
    tokens.length === 1 &&
    firstToken.length > 4 &&
    firstToken.endsWith('s')
  ) {
    return firstToken.slice(0, -1);
  }

  return firstToken;
};

const parseLinkLine = (line, currentSourceProfile) => {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) {
    return {entry: null, nextSourceProfile: currentSourceProfile};
  }

  if (trimmed.startsWith('#')) {
    return {
      entry: null,
      nextSourceProfile:
        normalizeSourceProfile(trimmed, {fromSectionHeading: true}) ?? currentSourceProfile,
    };
  }

  const inlineMatch = trimmed.match(
    /^(?<label>[^#|:]+?)\s*(?:\||:)\s*(?<url>https?:\/\/\S+)$/i,
  );
  if (inlineMatch?.groups?.url) {
    return {
      entry: {
        url: inlineMatch.groups.url.trim(),
        sourceProfile:
          normalizeSourceProfile(inlineMatch.groups.label) ?? currentSourceProfile ?? null,
      },
      nextSourceProfile: currentSourceProfile,
    };
  }

  return {
    entry: {
      url: trimmed,
      sourceProfile: currentSourceProfile ?? null,
    },
    nextSourceProfile: currentSourceProfile,
  };
};

export const readLinkEntriesFromLinksFile = (linksPath) => {
  if (!fs.existsSync(linksPath)) {
    throw new Error(`Links file not found: ${linksPath}`);
  }

  const entries = [];
  let currentSourceProfile = null;

  for (const line of fs.readFileSync(linksPath, 'utf8').split(/\r?\n/)) {
    const {entry, nextSourceProfile} = parseLinkLine(line, currentSourceProfile);
    currentSourceProfile = nextSourceProfile;
    if (!entry?.url) {
      continue;
    }
    entries.push(entry);
  }

  if (entries.length === 0) {
    throw new Error(`No URLs found in ${linksPath}`);
  }

  return entries;
};

export const readUrlsFromLinksFile = (linksPath) => {
  return readLinkEntriesFromLinksFile(linksPath).map((entry) => entry.url);
};

export const downloadYoutubeVideo = (url, downloadRoot) => {
  const outputTemplate = path.join(downloadRoot, '%(title).180B [%(id)s].%(ext)s');
  const baseArgs = [
    '--no-playlist',
    '--extractor-args',
    'youtube:player_client=android,web',
    '--merge-output-format',
    'mp4',
    '--remux-video',
    'mp4',
    '--output',
    outputTemplate,
    '--print',
    'after_move:filepath',
    url,
  ];

  let stdout = '';
  try {
    stdout = execFileSync('yt-dlp', baseArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  } catch {
    console.warn('Download failed without browser cookies. Retrying with Chrome cookies...');
    stdout = execFileSync('yt-dlp', ['--cookies-from-browser', 'chrome', ...baseArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  }

  const downloaded = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!downloaded) {
    throw new Error(`yt-dlp did not report a downloaded file for ${url}`);
  }

  return path.resolve(downloaded);
};
