#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDir,
  parseArgs,
  probeVideo,
  projectRoot,
} from './lib.mjs';

const usage = `
Usage:
  npm run scene:index -- --scene-library ./custom-scenes-library [options]

Options:
  --scene-library DIR    Folder containing reusable local B-roll clips.
  --library-config FILE  Optional metadata config JSON. Defaults to DIR/library.config.json if present.
  --out FILE             Output index.json path. Defaults to DIR/index.json
  --reindex             Ignore existing index metadata and rebuild every entry from filenames + config.

Config shape:
  {
    "defaultSource": "Custom Scenes Library",
    "defaultTags": ["custom", "broll", "travel", "lifestyle"],
    "profiles": {
      "miami": {
        "match": ["miami"],
        "description": "Miami lifestyle, travel, waterfront, nightlife, palm trees.",
        "tags": ["miami", "travel", "city", "luxury", "nightlife"]
      }
    },
    "clipOverrides": {
      "Rolex-Montage-1.MOV": {
        "title": "Rolex luxury montage",
        "description": "Luxury watch closeups, status, money, wealth.",
        "tags": ["rolex", "watch", "luxury", "money", "status"]
      }
    }
  }
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const isVideoFile = (file) => /\.(mp4|mov|m4v|webm)$/i.test(file);

const slugify = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const normalizeToken = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

const humanize = (value) =>
  String(value ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const uniqueList = (items) =>
  [...new Set(items.map((item) => String(item ?? '').trim()).filter(Boolean))];

const scanSceneDir = (dir) => {
  const files = [];

  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, {withFileTypes: true})) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (isVideoFile(entry.name)) {
        files.push(entryPath);
      }
    }
  };

  walk(dir);
  return files.sort();
};

const genericFilenameTokens = new Set([
  'a',
  'an',
  'and',
  'clip',
  'clips',
  'edit',
  'final',
  'footage',
  'montage',
  'mov',
  'movie',
  'mp4',
  'm4v',
  'reel',
  'scene',
  'shot',
  'take',
  'video',
  'vlog',
  'webm',
]);

const builtinProfiles = {
  mani: {
    match: ['mani'],
    description: 'Personal creator footage, travel lifestyle, social energy, movement, confidence.',
    tags: ['mani', 'person', 'creator', 'travel', 'lifestyle', 'social', 'confidence'],
  },
  josep: {
    match: ['josep'],
    description: 'Personal creator footage, travel lifestyle, social energy, movement, confidence.',
    tags: ['josep', 'person', 'creator', 'travel', 'lifestyle', 'social', 'confidence'],
  },
  miami: {
    match: ['miami'],
    description: 'Miami travel, waterfront, nightlife, palm trees, warm weather, luxury lifestyle.',
    tags: ['miami', 'travel', 'city', 'waterfront', 'beach', 'nightlife', 'luxury', 'lifestyle', 'palm'],
  },
  vegas: {
    match: ['vegas', 'lasvegas'],
    description: 'Las Vegas nightlife, casino, neon, luxury, city energy, travel.',
    tags: ['vegas', 'las vegas', 'travel', 'city', 'nightlife', 'casino', 'money', 'luxury', 'neon'],
  },
  la: {
    match: ['la', 'losangeles'],
    description: 'Los Angeles city lifestyle, palm trees, urban movement, creator energy, luxury.',
    tags: ['la', 'los angeles', 'travel', 'city', 'urban', 'lifestyle', 'luxury', 'palm'],
  },
  rolex: {
    match: ['rolex'],
    description: 'Luxury watch closeups, status, money, wealth, premium detail shots.',
    tags: ['rolex', 'watch', 'luxury', 'status', 'wealth', 'money', 'premium', 'closeup'],
  },
  montage: {
    match: ['montage'],
    description: 'Fast-moving montage footage with multiple cinematic moments.',
    tags: ['montage', 'cinematic', 'movement', 'fast-paced', 'broll'],
  },
};

const normalizeProfile = (key, value) => {
  const profile = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    key,
    match: uniqueList([key, ...(Array.isArray(profile.match) ? profile.match : [])]).map(normalizeToken),
    description: String(profile.description ?? '').trim(),
    tags: uniqueList(profile.tags ?? []),
  };
};

const loadIndex = (indexPath) => {
  if (!fs.existsSync(indexPath)) {
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  return Array.isArray(parsed?.scenes) ? parsed.scenes : [];
};

const sceneLibraryDir = path.resolve(
  String(args['scene-library'] ?? path.join(projectRoot, 'scene-library')),
);
const configPath = args['library-config']
  ? path.resolve(String(args['library-config']))
  : path.join(sceneLibraryDir, 'library.config.json');
const outputPath = path.resolve(String(args.out ?? path.join(sceneLibraryDir, 'index.json')));
const reindex = Boolean(args.reindex);

if (!fs.existsSync(sceneLibraryDir)) {
  throw new Error(`Scene library not found: ${sceneLibraryDir}`);
}

const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : {};
const mergedProfiles = Object.fromEntries(
  Object.entries({...builtinProfiles, ...(config.profiles ?? {})}).map(([key, value]) => [
    key,
    normalizeProfile(key, value),
  ]),
);
const defaultSource = String(config.defaultSource ?? 'Custom Scenes Library').trim();
const defaultTags = uniqueList(config.defaultTags ?? ['custom', 'broll', 'travel', 'lifestyle']);
const clipOverrides =
  config.clipOverrides && typeof config.clipOverrides === 'object' && !Array.isArray(config.clipOverrides)
    ? config.clipOverrides
    : {};

const existingScenes = reindex ? [] : loadIndex(outputPath);
const existingByFile = new Map(
  existingScenes
    .filter((scene) => scene && typeof scene === 'object' && !Array.isArray(scene) && scene.file)
    .map((scene) => [String(scene.file), scene]),
);

const buildGeneratedDescription = ({matchedProfiles, coreTokens, title}) => {
  const matchedDescriptions = uniqueList(
    matchedProfiles
      .map((profile) => profile.description)
      .filter(Boolean),
  );

  if (matchedDescriptions.length > 0) {
    return matchedDescriptions.join(' ');
  }

  if (coreTokens.length > 0) {
    return `Custom ${title} B-roll clip related to ${coreTokens.join(', ')}.`;
  }

  return `Custom ${title} B-roll clip.`;
};

const videoFiles = scanSceneDir(sceneLibraryDir);
const scenes = videoFiles.map((filePath) => {
  const relativeFile = path.relative(sceneLibraryDir, filePath);
  const baseName = path.basename(relativeFile);
  const baseWithoutExt = baseName.replace(/\.[^.]+$/, '');
  const rawTokens = baseWithoutExt
    .split(/[^a-zA-Z0-9]+/)
    .map(normalizeToken)
    .filter(Boolean);
  const coreTokens = rawTokens.filter(
    (token) => !genericFilenameTokens.has(token) && !/^\d+$/.test(token),
  );
  const matchedProfiles = Object.values(mergedProfiles).filter((profile) =>
    profile.match.some((token) => rawTokens.includes(token) || coreTokens.includes(token)),
  );
  const existing = existingByFile.get(relativeFile) ?? {};
  const override =
    clipOverrides[relativeFile] ??
    clipOverrides[baseName] ??
    clipOverrides[baseWithoutExt] ??
    {};
  const metadata = probeVideo(filePath);
  const generatedTitle = humanize(baseWithoutExt);
  const tags = uniqueList([
    ...defaultTags,
    ...coreTokens,
    ...matchedProfiles.flatMap((profile) => profile.tags),
    ...(Array.isArray(existing.tags) ? existing.tags : []),
    ...(Array.isArray(override.tags) ? override.tags : []),
  ]);
  const title = String(override.title ?? existing.title ?? generatedTitle);
  const description = String(
    override.description ??
      existing.description ??
      buildGeneratedDescription({matchedProfiles, coreTokens, title}),
  ).trim();
  const source = String(override.source ?? existing.source ?? defaultSource).trim() || defaultSource;
  const startSeconds = Math.max(0, Number(override.startSeconds ?? existing.startSeconds ?? 0));
  const requestedEndSeconds = Number(
    override.endSeconds ?? existing.endSeconds ?? metadata.durationSeconds,
  );
  const endSeconds = Math.min(
    metadata.durationSeconds,
    Number.isFinite(requestedEndSeconds) ? requestedEndSeconds : metadata.durationSeconds,
  );

  return {
    id:
      String(override.id ?? existing.id ?? slugify(relativeFile.replace(/\.[^.]+$/, ''))) ||
      slugify(baseWithoutExt),
    file: relativeFile,
    title,
    source,
    description,
    tags,
    startSeconds,
    endSeconds,
    attribution: {
      ...(existing.attribution && typeof existing.attribution === 'object' && !Array.isArray(existing.attribution)
        ? existing.attribution
        : {}),
      ...(override.attribution && typeof override.attribution === 'object' && !Array.isArray(override.attribution)
        ? override.attribution
        : {}),
      kind: 'custom-library',
      originalFilename: baseName,
    },
  };
});

ensureDir(path.dirname(outputPath));
fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sceneLibraryDir,
      configPath: fs.existsSync(configPath) ? configPath : null,
      scenes,
    },
    null,
    2,
  )}\n`,
);

console.log(`Indexed ${scenes.length} scene clips.`);
console.log(`Scene library: ${sceneLibraryDir}`);
console.log(`Index: ${outputPath}`);
if (fs.existsSync(configPath)) {
  console.log(`Config: ${configPath}`);
}
