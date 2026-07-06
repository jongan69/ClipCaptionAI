import path from 'node:path';

export const slugify = (value, fallback = 'run') => {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return slug || fallback;
};

export const timestampSlug = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
};

export const mergeStyleConfig = (baseConfig = {}, overrides = {}) => ({
  ...baseConfig,
  ...overrides,
});

const hasFlag = (args, flag) => args.includes(`--${flag}`);

export const buildBrollCaptionArgs = ({
  projectRoot,
  args = [],
  maxClips = '3',
  paddingSeconds = '2',
}) => {
  const mergedArgs = [
    '--links',
    path.join(projectRoot, 'links.txt'),
    '--out-dir',
    path.join(projectRoot, 'outputs'),
    '--max-clips',
    maxClips,
    '--padding-seconds',
    paddingSeconds,
    '--scene-library',
    path.join(projectRoot, 'custom-scenes-library'),
    '--library-config',
    path.join(projectRoot, 'custom-scenes-library', 'library.config.json'),
    '--style-config',
    path.join(projectRoot, 'styles', 'broll-heavy-custom-scenes.json'),
    '--context-scenes',
    '--local-scenes-only',
    ...args,
  ];

  if (!hasFlag(args, 'sound-effects') && !hasFlag(args, 'disable-sound-effects')) {
    mergedArgs.push('--disable-sound-effects');
  }

  if (!hasFlag(args, 'vertical') && !hasFlag(args, 'vertical-contain')) {
    mergedArgs.push('--vertical-contain');
  }

  return mergedArgs;
};
