import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export const readUrlsFromLinksFile = (linksPath) => {
  if (!fs.existsSync(linksPath)) {
    throw new Error(`Links file not found: ${linksPath}`);
  }

  const urls = fs
    .readFileSync(linksPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  if (urls.length === 0) {
    throw new Error(`No URLs found in ${linksPath}`);
  }

  return urls;
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
