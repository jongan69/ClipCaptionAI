/**
 * verify-variant.tsx — Step 4 of the pipeline: cheap correctness gate.
 *
 * Server-renders a variant at chosen frames and writes the resulting SVG to disk.
 * This catches the failure modes that generated animation code actually hits —
 * missing layers, NaN transforms, an animation that never resolves to the static
 * logo — without paying for a full Remotion video render.
 *
 *   npx tsx scripts/logo/verify-variant.tsx --slug listingos --variant 01-scan-in
 *
 * Exits non-zero on failure, so it drops straight into CI.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {outputsRoot} from '../lib.mjs';
import {createLogoModel} from '../../src/logo/load-logo';
import type {LogoVariantProps} from '../../src/logo/types';

const argv = process.argv.slice(2);
const arg = (flag: string, fallback: string | null = null) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const slug = arg('--slug', 'listingos') as string;
const variantFile = arg('--variant', '01-scan-in') as string;
const outDir = arg('--out', path.join(outputsRoot, 'logo-verify')) as string;

const run = async () => {
  const layersPath = path.join('assets', 'logos', slug, 'layers.json');
  if (!fs.existsSync(layersPath)) {
    console.error(`No layers.json for "${slug}". Run build-spec.mjs first.`);
    process.exit(1);
  }

  const logo = createLogoModel(JSON.parse(fs.readFileSync(layersPath, 'utf8')));
  const mod = await import(`../../src/logo/variants/${variantFile}`);
  const Variant = mod.default as React.ComponentType<LogoVariantProps>;
  const meta = mod.meta as {id: string; durationInFrames: number};

  if (!Variant || !meta?.id) {
    console.error(`${variantFile} must export a default component and a \`meta\` object.`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, {recursive: true});

  const last = meta.durationInFrames - 1;
  const frames = [0, Math.round(last * 0.25), Math.round(last * 0.5), last];
  const failures: string[] = [];
  const fingerprints = new Map<number, string>();

  for (const frame of frames) {
    let markup: string;
    try {
      markup = renderToStaticMarkup(
        React.createElement(Variant, {logo, frame, fps: 30, width: 1080, height: 1080})
      );
    } catch (err) {
      failures.push(`frame ${frame}: threw ${(err as Error).message}`);
      continue;
    }

    // NaN/Infinity in a transform silently blanks the frame in a real render.
    if (/NaN|Infinity/.test(markup)) {
      failures.push(`frame ${frame}: produced NaN/Infinity in an attribute`);
    }
    if (markup.trim().length === 0) {
      failures.push(`frame ${frame}: rendered empty`);
    }

    // Fingerprint the animated values only. If these are identical across frames
    // the component is static — the most common way a generated variant is
    // silently broken (it renders, it just never animates).
    fingerprints.set(
      frame,
      [
        ...(markup.match(/opacity="[\d.]+"/g) ?? []),
        ...(markup.match(/stroke-dashoffset="[-\d.]+"/g) ?? []),
        ...(markup.match(/(?:translate|scale|rotate)\([^)]*\)/g) ?? []),
      ].join('|')
    );

    const file = path.join(outDir, `${slug}-${meta.id}-f${String(frame).padStart(3, '0')}.svg`);
    fs.writeFileSync(
      file,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo.viewBox}">` +
        `<rect width="100%" height="100%" fill="${logo.brand.palette.background ?? '#000'}"/>` +
        markup.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') +
        `</svg>`
    );
    console.log(`  frame ${String(frame).padStart(3)} -> ${file}`);
  }

  // The final frame must be the resolved logo: no lingering transforms, full opacity.
  const finalMarkup = renderToStaticMarkup(
    React.createElement(Variant, {logo, frame: last, fps: 30, width: 1080, height: 1080})
  );
  const lowOpacity = [...finalMarkup.matchAll(/opacity="([\d.]+)"/g)]
    .map((m) => Number(m[1]))
    .filter((o) => o < 0.99);
  if (lowOpacity.length) {
    failures.push(
      `final frame still has faded elements (opacity ${lowOpacity.join(', ')}) — animation does not resolve`
    );
  }

  const distinct = new Set(fingerprints.values());
  if (distinct.size <= 1) {
    failures.push('animated values never change across frames — variant is effectively static');
  }
  if (fingerprints.get(0) === fingerprints.get(last)) {
    failures.push('first and last frame are identical — no visible animation arc');
  }

  if (failures.length) {
    console.error(`\nFAIL ${variantFile}`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`\nPASS ${variantFile} (${frames.length} frames, resolves cleanly)`);
};

run();
