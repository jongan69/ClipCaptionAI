#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';

const usage = `
Usage:
  npm run sfx:standardize -- [options]

Options:
  --dir DIR       SFX library folder. Default: ./sfx-library
  --dry-run       Print the rename/index plan without changing files.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const libraryDir = path.resolve(args.dir ?? path.join(projectRoot, 'sfx-library'));
const dryRun = Boolean(args['dry-run']);
const supportedExtensions = new Set([
  '.aac',
  '.aif',
  '.aiff',
  '.flac',
  '.m4a',
  '.mp3',
  '.mp4',
  '.ogg',
  '.wav',
]);

const categoryRules = [
  ['money', /\b(cash|coin|register|purchase|racks|dollar|money|kaching|ting)\b/i],
  ['whoosh', /\b(whoosh|woosh|swoosh|swish|swipe|swing|arrow|wind|transition|warp|slide|portal|incoming)\b/i],
  ['impact', /\b(boom|hit|punch|slam|thud|drop|subsonic|crash|struck|core|brass|grand|metal|shot|bass|beating)\b/i],
  ['glitch', /\b(glitch|error|access|denied|reboot|failure|dial|data|digits|loading|network|processing|transfer|download|switcher|intermodulation|scifi|sci-fi|terminal|electricity|static|futuristic)\b/i],
  ['click', /\b(click|mouse|select|menu|press|gun)\b/i],
  ['typing', /\b(keyboard|typing|typewriter|writing|pencil)\b/i],
  ['camera', /\b(camera|shutter|lens|flash|projector)\b/i],
  ['pop', /\b(pop|bloop|bubble|suction|cork|bottle)\b/i],
  ['alert', /\b(ding|notification|iphone|discord|twitch|alert|correct|quick[- ]?win|apple|join|leave)\b/i],
  ['suspense', /\b(suspense|spooky|horror|awkward|hmmm|confused|nope|disappointed|wrong|dark)\b/i],
  ['comedy', /\b(fart|goofy|meme|yeet|mario|minecraft|among|taco|duck|toy|cartoon|rizz|augg|faah|what|spider|illuminati|animal crossing|doraemon|kids|awww|eating|dog)\b/i],
  ['crowd', /\b(applause|crowd|party|boxing|bell)\b/i],
  ['paper', /\b(paper|crumpled|ripping|flip|page)\b/i],
  ['music', /\b(music|podcast|cinematic sounds|we own|trap|zay|purple|eyes)\b/i],
  ['mechanical', /\b(bike|wheel|gears|clock|tick|rewind|forward|disc|read|restart)\b/i],
  ['spiritual', /\b(angel|devotional)\b/i],
  ['censor', /\b(censor|beep|censorship)\b/i],
];
const categoryNames = new Set([...categoryRules.map(([category]) => category), 'misc']);

const stripNoise = (value) =>
  String(value ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/onlymp3\.to/gi, '')
    .replace(/\([^)]*(?:mp3|kbps|hd|copyright|no copyright|sound effect)[^)]*\)/gi, ' ')
    .replace(/\b(?:sound|effect|effects|sfx|fx|hd|no copyright|non copyrighted|copyright free|free use|free stock|royalty free|most viewed video|mp3|wav|m4a|aiff|cbr|kbps|technical|producer|for editing)\b/gi, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const slugify = (value) => {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 54);
  return slug || 'sound';
};

const inferCategory = (name) => {
  const source = String(name ?? '');
  for (const [category, pattern] of categoryRules) {
    if (pattern.test(source)) {
      return category;
    }
  }
  return 'misc';
};

const parseStandardizedName = (fileName) => {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  const match = base.match(/^([a-z]+)-(.+)-(\d{3})(?:-\d+)?$/);
  if (!match || !categoryNames.has(match[1])) {
    return null;
  }
  return {
    category: match[1],
    title: match[2].replace(/-/g, ' '),
    sequence: Number(match[3]),
  };
};

const probeDurationSeconds = (filePath) => {
  try {
    const output = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      {encoding: 'utf8'},
    );
    const duration = Number(output.trim());
    return Number.isFinite(duration) ? duration : null;
  } catch {
    return null;
  }
};

const hasAudioStream = (filePath) => {
  try {
    const output = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_type',
        '-of',
        'csv=p=0',
        filePath,
      ],
      {encoding: 'utf8'},
    );
    return output.trim().length > 0;
  } catch {
    return false;
  }
};

const collectFiles = (dir) => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, {withFileTypes: true})
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
    .filter((filePath) => supportedExtensions.has(path.extname(filePath).toLowerCase()));
};

ensureDir(libraryDir);
const files = collectFiles(libraryDir).sort((a, b) =>
  path.basename(a).localeCompare(path.basename(b)),
);

const categoryCounts = new Map();
const usedNames = new Set();
for (const filePath of files) {
  const parsed = parseStandardizedName(path.basename(filePath));
  if (!parsed) {
    continue;
  }
  categoryCounts.set(
    parsed.category,
    Math.max(categoryCounts.get(parsed.category) ?? 0, parsed.sequence),
  );
}

const plan = files.map((filePath) => {
  const originalName = path.basename(filePath);
  const ext = path.extname(originalName).toLowerCase();
  const parsedStandardized = parseStandardizedName(originalName);

  if (parsedStandardized) {
    usedNames.add(originalName);
    return {
      from: filePath,
      to: filePath,
      originalName,
      file: originalName,
      title: parsedStandardized.title,
      category: parsedStandardized.category,
    };
  }

  const cleanTitle = stripNoise(originalName) || path.basename(originalName, path.extname(originalName));
  const category = inferCategory(`${originalName} ${cleanTitle}`);
  const next = (categoryCounts.get(category) ?? 0) + 1;
  categoryCounts.set(category, next);

  let targetName = `${category}-${slugify(cleanTitle)}-${String(next).padStart(3, '0')}${ext}`;
  let suffix = 2;
  while (usedNames.has(targetName)) {
    targetName = `${category}-${slugify(cleanTitle)}-${String(next).padStart(3, '0')}-${suffix}${ext}`;
    suffix += 1;
  }
  usedNames.add(targetName);

  return {
    from: filePath,
    to: path.join(libraryDir, targetName),
    originalName,
    file: targetName,
    title: cleanTitle,
    category,
  };
});

if (dryRun) {
  for (const item of plan) {
    if (item.from !== item.to) {
      console.log(`${item.originalName} -> ${item.file}`);
    }
  }
  console.log(`Dry run complete. ${plan.length} files would be indexed.`);
  process.exit(0);
}

const tempRenames = [];
for (const item of plan) {
  if (item.from === item.to) {
    continue;
  }
  const tempPath = path.join(libraryDir, `.rename-${process.pid}-${path.basename(item.from)}`);
  fs.renameSync(item.from, tempPath);
  tempRenames.push({item, tempPath});
}

for (const {item, tempPath} of tempRenames) {
  fs.renameSync(tempPath, item.to);
}

const sounds = plan.map((item) => {
  const filePath = item.to;
  const durationSeconds = probeDurationSeconds(filePath);
  return {
    id: path.basename(item.file, path.extname(item.file)),
    file: item.file,
    title: item.title,
    category: item.category,
    tags: [...new Set([item.category, ...slugify(item.title).split('-')])].filter(Boolean),
    durationSeconds,
    hasAudio: hasAudioStream(filePath),
    originalName: item.originalName,
  };
});

const index = {
  createdAt: new Date().toISOString(),
  libraryDir,
  sounds,
};

fs.writeFileSync(path.join(libraryDir, 'index.json'), JSON.stringify(index, null, 2));
console.log(`Standardized ${sounds.length} SFX files in: ${libraryDir}`);
console.log(`Wrote index: ${path.join(libraryDir, 'index.json')}`);
