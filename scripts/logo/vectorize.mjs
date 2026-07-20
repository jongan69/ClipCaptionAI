#!/usr/bin/env node
/**
 * vectorize.mjs — Step 1 of the logo animation pipeline.
 *
 * Traces a raster logo (PNG) into a COLOR-LAYERED SVG. Each distinct flat colour
 * in the source becomes its own <g id="layer-N" data-fill="#rrggbb">, which is
 * exactly the granularity a text-only code model needs in order to animate parts
 * of a logo independently.
 *
 *   node scripts/logo/vectorize.mjs --in assets/logos/acme/source.png --slug acme
 *
 * Output: assets/logos/<slug>/logo.traced.svg  (+ a colour report on stdout)
 *
 * Auto-tracing is the FALLBACK path. If you have vector source, drop a
 * hand-layered logo.svg in the same folder and skip this step entirely — the
 * spec generator reads either one.
 *
 * Deps (pure JS, no native build): npm i -D imagetracerjs pngjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const arg = (flag, fallback = null) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const inPath = arg('--in');
const slug = arg('--slug');
const colors = Number(arg('--colors', '8'));
const scale = Number(arg('--scale', '1'));

if (!inPath || !slug) {
  console.error(`
Usage: node scripts/logo/vectorize.mjs --in <logo.png> --slug <brand-slug> [--colors 8] [--scale 1]

  --in      Path to the source PNG (flat-colour logos trace best).
  --slug    Brand folder name under assets/logos/.
  --colors  Palette size. Raise it for gradient-heavy logos, lower it for flat ones.
  --scale   Upscale factor before tracing; 2 gives smoother curves on small PNGs.
`);
  process.exit(1);
}

let ImageTracer, PNG;
try {
  ImageTracer = (await import('imagetracerjs')).default;
  ({ PNG } = await import('pngjs'));
} catch {
  console.error(
    'Missing tracer dependencies. Install them once with:\n\n  npm i -D imagetracerjs pngjs\n'
  );
  process.exit(1);
}

const raw = PNG.sync.read(fs.readFileSync(inPath));

// Nearest-neighbour upscale keeps edges crisp for the tracer.
const upscale = (src, factor) => {
  if (factor === 1) return src;
  const w = src.width * factor;
  const h = src.height * factor;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((y / factor) | 0) * src.width * 4 + ((x / factor) | 0) * 4;
      src.data.copy(data, (y * w + x) * 4, s, s + 4);
    }
  }
  return { width: w, height: h, data };
};

const img = upscale(raw, scale);
const imgd = { width: img.width, height: img.height, data: img.data };

const traced = ImageTracer.imagedataToSVG(imgd, {
  numberofcolors: colors,
  colorquantcycles: 5,
  pathomit: 12,        // drop specks
  ltres: 0.6,          // straight-line fidelity
  qtres: 0.6,          // curve fidelity
  rightangleenhance: true,
  strokewidth: 0,
  linefilter: true,
  blurradius: 0,
  viewbox: true,
});

/**
 * imagetracerjs emits a flat list of <path fill="rgb(r,g,b)">. Regroup them by
 * fill so each colour becomes an addressable, animatable layer.
 */
const toHex = (fill) => {
  const m = fill.match(/rgb\((\d+),(\d+),(\d+)\)/i);
  if (!m) return fill;
  return (
    '#' +
    [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, '0'))
      .join('')
  );
};

const viewBox = (traced.match(/viewBox="([^"]+)"/) || [])[1] || `0 0 ${img.width} ${img.height}`;
const pathRe = /<path([^>]*?)d="([^"]+)"([^>]*?)\/>/g;

const buckets = new Map();
let m;
while ((m = pathRe.exec(traced)) !== null) {
  const attrs = m[1] + m[3];
  const fillMatch = attrs.match(/fill="([^"]+)"/);
  const opacityMatch = attrs.match(/opacity="([^"]+)"/);
  if (!fillMatch) continue;
  if (opacityMatch && Number(opacityMatch[1]) === 0) continue; // fully transparent
  const hex = toHex(fillMatch[1]);
  if (!buckets.has(hex)) buckets.set(hex, []);
  buckets.get(hex).push(m[2]);
}

// Biggest ink area first — usually background, then the mark, then details.
const layers = [...buckets.entries()]
  .map(([fill, ds]) => ({ fill, ds, weight: ds.join('').length }))
  .sort((a, b) => b.weight - a.weight);

const body = layers
  .map(
    ({ fill, ds }, i) =>
      `  <g id="layer-${i}" data-layer="layer-${i}" data-fill="${fill}" fill="${fill}">\n` +
      ds.map((d) => `    <path d="${d}"/>`).join('\n') +
      `\n  </g>`
  )
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
  <!--
    AUTO-TRACED from ${path.basename(inPath)}. Layers are grouped by colour and named
    generically. Before generating a spec, rename each group id to something
    semantic (brackets, l-mark, card, wordmark, ...) — the animation model uses
    those names to decide what moves how.
  -->
${body}
</svg>
`;

const outDir = path.join('assets', 'logos', slug);
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'logo.traced.svg');
fs.writeFileSync(outPath, svg);

console.log(`\nTraced ${inPath} -> ${outPath}`);
console.log(`Source ${raw.width}x${raw.height}, traced at ${img.width}x${img.height}\n`);
console.log('Layers found (rename these to semantic ids before generating the spec):');
for (const [i, l] of layers.entries()) {
  console.log(`  layer-${i}  ${l.fill}  ${l.ds.length} path(s)`);
}
console.log(`\nNext: rename ids, save as ${path.join(outDir, 'logo.svg')}, then run:`);
console.log(`  node scripts/logo/build-spec.mjs --slug ${slug}\n`);
