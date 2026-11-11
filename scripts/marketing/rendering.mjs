import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectRoot, publicMediaRoot, videoToSrc} from '../lib.mjs';
import {writeJsonAtomic} from '../platform/jobs.mjs';
import {copyAsset} from './assets.mjs';

export const renderVariant = (state, variant) => {
  const propsPath = path.join(state.directory, 'artifacts', 'previews', `${variant.id}-props.json`);
  const renderPath = path.join(state.directory, 'artifacts', 'previews', `${variant.id}.mp4`);
  const normalizedPath = path.join(
    state.directory,
    'artifacts',
    'previews',
    `${variant.id}-normalized.mp4`,
  );
  const props = {
    width: variant.width,
    height: variant.height,
    fps: variant.fps,
    durationSeconds: variant.durationSeconds,
    timeline: variant.timeline.map((entry) => ({
      ...entry,
      src: entry.src ? videoToSrc(entry.src) : undefined,
    })),
    captions: variant.captions,
    voice: variant.voice ? videoToSrc(variant.voice) : undefined,
    music: variant.music ? videoToSrc(variant.music) : undefined,
    musicVolume: variant.musicVolume,
    theme: variant.theme,
  };
  writeJsonAtomic(propsPath, props);
  const result = spawnSync(
    'bunx',
    [
      'remotion',
      'render',
      path.join(projectRoot, 'src', 'index.tsx'),
      'MarketingTimeline',
      renderPath,
      `--props=${propsPath}`,
      '--codec=h264',
      '--concurrency=1',
      `--public-dir=${path.dirname(publicMediaRoot)}`,
      '--overwrite',
    ],
    {cwd: projectRoot, encoding: 'utf8', shell: false},
  );
  if (result.error || result.status !== 0)
    throw new Error(`Marketing render failed: ${result.stderr || result.error?.message}`);
  const audioTargetLufs = variant.audioTargetLufs ?? -16;
  const normalized = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      renderPath,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      'copy',
      '-af',
      `loudnorm=I=${audioTargetLufs}:TP=-1.5:LRA=11`,
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      normalizedPath,
    ],
    {cwd: projectRoot, encoding: 'utf8', shell: false},
  );
  if (normalized.error || normalized.status !== 0)
    throw new Error(
      `Marketing audio normalization failed: ${normalized.stderr || normalized.error?.message}`,
    );
  const asset = copyAsset(
    state,
    variant,
    {type: 'source', source: normalizedPath},
    normalizedPath,
    'final',
    {
      adapter: 'remotion',
      adapterVersion: '3',
      composition: 'MarketingTimeline',
      propsPath,
      audioNormalization: 'ffmpeg-loudnorm',
      audioTargetLufs,
    },
  );
  fs.rmSync(renderPath, {force: true});
  fs.rmSync(normalizedPath, {force: true});
  return asset;
};

export const renderCarousel = (state, variant) =>
  variant.slides.map((slide, index) => {
    const number = index + 1;
    const basename = `${variant.id}-slide-${String(number).padStart(2, '0')}`;
    const propsPath = path.join(state.directory, 'artifacts', 'previews', `${basename}-props.json`);
    const renderPath = path.join(state.directory, 'artifacts', 'previews', `${basename}.png`);
    writeJsonAtomic(propsPath, {
      width: variant.width,
      height: variant.height,
      fps: variant.fps,
      durationSeconds: 1,
      timeline: [
        {
          type: 'image',
          startSeconds: 0,
          durationSeconds: 1,
          src: videoToSrc(slide.src),
          fit: slide.fit,
          transition: 'cut',
        },
        {
          type: 'slide-text',
          startSeconds: 0,
          durationSeconds: 1,
          eyebrow: slide.eyebrow,
          headline: slide.headline,
          body: slide.body,
          textPosition: slide.textPosition,
          transition: 'cut',
        },
      ],
      captions: [],
      theme: variant.theme,
    });
    const result = spawnSync(
      'bunx',
      [
        'remotion',
        'still',
        path.join(projectRoot, 'src', 'index.tsx'),
        'MarketingTimeline',
        renderPath,
        `--props=${propsPath}`,
        '--frame=0',
        '--image-format=png',
        `--public-dir=${path.dirname(publicMediaRoot)}`,
        '--overwrite',
      ],
      {cwd: projectRoot, encoding: 'utf8', shell: false},
    );
    if (result.error || result.status !== 0)
      throw new Error(
        `Marketing carousel render failed: ${result.stderr || result.error?.message}`,
      );
    const asset = copyAsset(
      state,
      variant,
      {type: 'source', source: renderPath, slideIndex: number},
      renderPath,
      'final',
      {
        adapter: 'remotion',
        adapterVersion: '3',
        composition: 'MarketingTimeline',
        outputFormat: 'carousel',
        slideIndex: number,
        propsPath,
      },
    );
    fs.rmSync(renderPath, {force: true});
    return asset;
  });
