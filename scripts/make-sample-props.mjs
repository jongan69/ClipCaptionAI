#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDir,
  probeVideo,
  projectRoot,
  videoToSrc,
} from './lib.mjs';

const sampleVideo =
  '/Users/jonathangan/Desktop/SnapInsta.to_AQOnjXcwwSsXCDfDeK6kDri2SJIf3xFt-Sc2P-5BY-evzUrBK7sh8-VS_TR65thlO1hRJdjzIOiCGX8S4p11s2QppnRd8sapBcGxk1I.mp4';

const words = [
  ['we', 4900, 5400],
  [' want', 5400, 5850],
  [' to', 14500, 14950],
  [' travel', 14950, 15650],
  [' with', 28200, 28600],
  [' one', 28600, 29200],
  [' person', 29200, 30100],
];

const metadata = probeVideo(sampleVideo);
const fps = 30;
const props = {
  videoSrc: videoToSrc(sampleVideo),
  captions: words.map(([text, startMs, endMs]) => ({
    text,
    startMs,
    endMs,
    timestampMs: Math.round((Number(startMs) + Number(endMs)) / 2),
    confidence: null,
  })),
  width: metadata.width,
  height: metadata.height,
  fps,
  durationInFrames: Math.ceil(metadata.durationSeconds * fps),
  style: {
    position: 'left-hook',
    fit: 'cover',
    combineTokensWithinMilliseconds: 620,
    textColor: '#ffffff',
    shadowColor: 'rgba(0, 0, 0, 0.52)',
    activeScale: 1,
    inactiveScale: 0.62,
    uppercase: false,
  },
};

const samplePropsDir = path.join(projectRoot, 'outputs', 'studio', 'sample-props');
const outPath = path.join(samplePropsDir, 'sample-props.json');
const captionsPath = path.join(samplePropsDir, 'sample-captions.json');
ensureDir(samplePropsDir);
fs.writeFileSync(outPath, JSON.stringify(props, null, 2));
fs.writeFileSync(
  captionsPath,
  JSON.stringify({captions: props.captions}, null, 2),
);
console.log(outPath);
console.log(captionsPath);
