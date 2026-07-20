#!/usr/bin/env node
/**
 * build-spec.mjs — Step 2 of the logo animation pipeline. This is the piece that
 * solves the "the model can't accept images" problem.
 *
 * It converts a layered SVG into LOGO_SPEC.md: a purely TEXTUAL description of the
 * logo — geometry, layer semantics, bounding boxes, colours, anchor points — plus
 * the exact component contract any generated animation must satisfy.
 *
 * Paste that file into Codex Spark (or any text-only model) and it can animate a
 * logo it has never seen, because the spec tells it everything a picture would.
 *
 *   node scripts/logo/build-spec.mjs --slug listingos
 *   node scripts/logo/build-spec.mjs --slug listingos --variants 12
 *
 * Zero dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const arg = (flag, fallback = null) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const slug = arg('--slug');
const variantCount = Number(arg('--variants', '10'));
if (!slug) {
  console.error('Usage: node scripts/logo/build-spec.mjs --slug <brand-slug> [--variants 10]');
  process.exit(1);
}

const dir = path.join('assets', 'logos', slug);
const svgPath = [path.join(dir, 'logo.svg'), path.join(dir, 'logo.traced.svg')].find((p) =>
  fs.existsSync(p)
);
if (!svgPath) {
  console.error(`No logo.svg or logo.traced.svg found in ${dir}`);
  process.exit(1);
}
// Comments are stripped before any structural parsing: prose inside <!-- --> very
// often contains literal tag text like <g>, which would otherwise corrupt the
// nesting-depth count used to find top-level layers.
const svgRaw = fs.readFileSync(svgPath, 'utf8');
const svg = svgRaw.replace(/<!--[\s\S]*?-->/g, '');

const brandPath = path.join(dir, 'brand.json');
const brand = fs.existsSync(brandPath)
  ? JSON.parse(fs.readFileSync(brandPath, 'utf8'))
  : { name: slug, wordmark: null, palette: {} };

/* ------------------------------------------------------------------ parsing */

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
};

const viewBox = attr(svg, 'viewBox') || '0 0 1080 720';
const [vbX, vbY, vbW, vbH] = viewBox.split(/[\s,]+/).map(Number);

/**
 * Approximate bounding box by sampling every numeric pair in the path data.
 * Control points can overshoot the true bbox slightly — fine for describing
 * position and pivot to a model, and it never under-reports.
 */
const bboxOf = (dList) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of dList) {
    const nums = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = nums[i], y = nums[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!isFinite(minX)) return null;
  return { x: +minX.toFixed(1), y: +minY.toFixed(1), w: +(maxX - minX).toFixed(1), h: +(maxY - minY).toFixed(1) };
};

const rectBox = (tag) => {
  const n = (k) => Number(attr(tag, k) || 0);
  return { x: n('x'), y: n('y'), w: n('width'), h: n('height') };
};
const circleBox = (tag) => {
  const n = (k) => Number(attr(tag, k) || 0);
  const r = n('r');
  return { x: n('cx') - r, y: n('cy') - r, w: r * 2, h: r * 2 };
};

const mergeBoxes = (boxes) => {
  const b = boxes.filter(Boolean);
  if (!b.length) return null;
  const minX = Math.min(...b.map((r) => r.x));
  const minY = Math.min(...b.map((r) => r.y));
  const maxX = Math.max(...b.map((r) => r.x + r.w));
  const maxY = Math.max(...b.map((r) => r.y + r.h));
  return { x: +minX.toFixed(1), y: +minY.toFixed(1), w: +(maxX - minX).toFixed(1), h: +(maxY - minY).toFixed(1) };
};

// Top-level <g> only — nested groups stay inside their parent layer's markup.
const topLevelGroups = () => {
  const out = [];
  const re = /<g\b/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    // depth check: count unclosed <g> before this position
    const before = svg.slice(0, m.index);
    const opens = (before.match(/<g\b/g) || []).length;
    const closes = (before.match(/<\/g>/g) || []).length;
    if (opens !== closes) continue; // nested
    // find matching close
    let depth = 0, i = m.index;
    const scan = /<g\b|<\/g>/g;
    scan.lastIndex = m.index;
    let s;
    while ((s = scan.exec(svg)) !== null) {
      depth += s[0] === '</g>' ? -1 : 1;
      if (depth === 0) { i = s.index + 4; break; }
    }
    out.push(svg.slice(m.index, i));
  }
  return out;
};

const groups = topLevelGroups().map((g) => {
  const openTag = g.slice(0, g.indexOf('>') + 1);
  const id = attr(openTag, 'id') || attr(openTag, 'data-layer') || 'unnamed';
  const role = attr(openTag, 'data-role') || attr(openTag, 'data-layer') || 'unspecified';

  const ds = [...g.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((x) => x[1]);
  const rects = [...g.matchAll(/<rect\b[^>]*>/g)].map((x) => rectBox(x[0]));
  const circles = [...g.matchAll(/<circle\b[^>]*>/g)].map((x) => circleBox(x[0]));

  let box = mergeBoxes([bboxOf(ds), ...rects, ...circles]);

  // <text> has no intrinsic geometry we can read statically. If the layer carries
  // the data-* hints the harness needs, estimate a box from font metrics so the
  // model still gets a position and pivot to animate around.
  if (!box) {
    const cx = Number(attr(openTag, 'data-center-x'));
    const by = Number(attr(openTag, 'data-baseline-y'));
    const fs_ = Number(attr(openTag, 'data-font-size'));
    const text = attr(openTag, 'data-text') || '';
    if (!Number.isNaN(cx) && !Number.isNaN(by) && fs_) {
      const w = text.length * fs_ * 0.55; // rough advance width for a bold geometric sans
      box = {
        x: +(cx - w / 2).toFixed(1),
        y: +(by - fs_ * 0.74).toFixed(1),
        w: +w.toFixed(1),
        h: +(fs_ * 0.96).toFixed(1),
      };
    }
  }
  const fill = attr(openTag, 'fill') || attr(openTag, 'data-fill');
  const stroke = attr(openTag, 'stroke');
  const strokeWidth = attr(openTag, 'stroke-width');

  const children = [...g.matchAll(/<(path|rect|circle|text|g)\b[^>]*\bid="([^"]+)"/g)]
    .map((x) => x[2])
    .filter((cid) => cid !== id);

  const dataAttrs = Object.fromEntries(
    [...openTag.matchAll(/data-([a-z-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]])
  );

  return { id, role, box, fill, stroke, strokeWidth, children, dataAttrs, markup: g, pathCount: ds.length };
});

const gradients = [...svg.matchAll(/<(linear|radial)Gradient\b[^>]*\bid="([^"]+)"[\s\S]*?<\/\1Gradient>/g)].map(
  (m) => ({
    id: m[2],
    type: m[1],
    stops: [...m[0].matchAll(/<stop[^>]*offset="([^"]*)"[^>]*stop-color="([^"]*)"/g)].map((s) => ({
      offset: s[1],
      color: s[2],
    })),
  })
);

/* ------------------------------------------------------------------- output */

const pct = (v, total) => `${((v / total) * 100).toFixed(1)}%`;

const layerTable = groups
  .map((g) => {
    const b = g.box;
    const pos = b
      ? `x ${b.x} y ${b.y} w ${b.w} h ${b.h}`
      : 'n/a (text or empty)';
    const center = b ? `${(b.x + b.w / 2).toFixed(0)}, ${(b.y + b.h / 2).toFixed(0)}` : 'n/a';
    return `| \`${g.id}\` | ${g.role} | ${pos} | ${center} | ${g.fill || g.stroke || '—'} |`;
  })
  .join('\n');

const layerDetail = groups
  .map((g) => {
    const b = g.box;
    const lines = [
      `### \`${g.id}\``,
      '',
      `- **Role:** ${g.role}`,
      b
        ? `- **Bounding box:** x=${b.x}, y=${b.y}, w=${b.w}, h=${b.h} — occupies ${pct(b.w, vbW)} of canvas width, ${pct(b.h, vbH)} of height`
        : `- **Bounding box:** not geometric (text layer)`,
      b ? `- **Transform origin / pivot:** \`${(b.x + b.w / 2).toFixed(0)}px ${(b.y + b.h / 2).toFixed(0)}px\`` : null,
      g.fill ? `- **Fill:** \`${g.fill}\`` : null,
      g.stroke ? `- **Stroke:** \`${g.stroke}\` at width \`${g.strokeWidth || 1}\`` : null,
      g.children.length ? `- **Addressable children:** ${g.children.map((c) => `\`${c}\``).join(', ')}` : null,
      Object.keys(g.dataAttrs).length
        ? `- **Data:** ${Object.entries(g.dataAttrs).map(([k, v]) => `\`${k}=${v}\``).join(', ')}`
        : null,
      '',
      '```svg',
      g.markup.trim(),
      '```',
      '',
    ].filter(Boolean);
    return lines.join('\n');
  })
  .join('\n');

const spec = `# LOGO_SPEC — ${brand.name || slug}

> Generated by \`scripts/logo/build-spec.mjs\` from \`${svgPath}\`.
> This file is the complete, image-free description of the logo. Paste it into a
> text-only coding model to have it author Remotion animations for a logo it
> cannot see.

## 1. Canvas

| Property | Value |
|---|---|
| viewBox | \`${viewBox}\` |
| Width x Height | ${vbW} x ${vbH} |
| Origin | ${vbX}, ${vbY} |
| Layer count | ${groups.length} |

## 2. Layer map

Every layer below is an independently animatable group. Bounding boxes are in
viewBox units. "Pivot" is the box centre — use it as \`transform-origin\` unless
the animation calls for something else.

| Layer id | Role | Bounding box | Pivot | Paint |
|---|---|---|---|---|
${layerTable}

## 3. Gradients

${
  gradients.length
    ? gradients
        .map(
          (g) =>
            `- \`#${g.id}\` (${g.type}): ${g.stops
              .map((s) => `${s.offset} → \`${s.color}\``)
              .join(', ')}`
        )
        .join('\n')
    : '_None._'
}

## 4. Layer geometry (full path data)

${layerDetail}

## 5. Brand

\`\`\`json
${JSON.stringify(brand, null, 2)}
\`\`\`

## 6. What you must produce

Generate **${variantCount} distinct Remotion logo-animation variants**. Each variant is a
single \`.tsx\` file in \`src/logo/variants/\` exporting a default React component.

### Hard contract

\`\`\`tsx
import type {LogoVariantProps} from '../types';

export const meta = {
  id: 'kebab-case-id',        // must match the filename
  name: 'Human Readable Name',
  durationInFrames: 120,      // at 30fps
  description: 'One line on what the animation does.',
};

export default function Variant({logo, frame, fps, width, height}: LogoVariantProps) {
  // ...
}
\`\`\`

### Rules

1. **Never hardcode path data.** Read every path, colour, and box from the \`logo\`
   prop. The same variant must work for any brand that ships a spec. Access
   layers as \`logo.layer('l-mark')\`, \`logo.layer('brackets')\`, etc.
2. Import only from \`remotion\` and \`react\`. No new dependencies, no external
   assets, no network calls.
3. Animate with \`interpolate\`, \`spring\`, and \`useCurrentFrame\`. Never use
   CSS \`@keyframes\`, \`transition\`, or \`setTimeout\`.
4. Everything must be **deterministic** — identical output for a given frame.
   If you need randomness, use \`random()\` from \`remotion\` with a fixed seed.
5. Wrap SVG content in \`<svg viewBox="${viewBox}">\` and let the harness scale it.
6. Assume the layer may be missing: \`logo.layer(id)\` returns \`null\` if a brand
   lacks it. Degrade gracefully rather than throwing.
7. Land on the **static, correct logo** by the final frame. An animation that ends
   mid-transform is a bug.
8. Keep each variant under ~120 lines.

### Variant directions to cover

Aim for range — do not produce ${variantCount} easings of the same idea.

1. **Scan-in** — brackets draw on via \`stroke-dasharray\`, then the mark fades up inside them.
2. **Assemble** — layers fly in from offscreen edges and settle with a spring.
3. **Card deal** — the card layer slides and rotates into place like a dealt card.
4. **Mask wipe** — a diagonal gradient wipe reveals the mark left to right.
5. **Letter cascade** — wordmark letters rise and fade in one at a time.
6. **Depth parallax** — layers translate at different Z-rates on a slow push-in.
7. **Liquid morph** — the mark scales from a dot with an overshoot spring.
8. **Glitch resolve** — RGB-split offsets converge onto the clean logo.
9. **Bracket pulse** — logo settles first, brackets pulse as a shutter/capture beat.
10. **Gradient sweep** — a highlight travels across the mark after it lands.

Number the files \`01-scan-in.tsx\`, \`02-assemble.tsx\`, and so on. After writing them,
register each in \`src/logo/registry.ts\`.
`;

const outPath = path.join(dir, 'LOGO_SPEC.md');
fs.writeFileSync(outPath, spec);

const layersJson = groups.map((g) => ({
  id: g.id,
  role: g.role,
  box: g.box,
  fill: g.fill,
  stroke: g.stroke,
  strokeWidth: g.strokeWidth ? Number(g.strokeWidth) : null,
  children: g.children,
  data: g.dataAttrs,
  markup: g.markup,
}));

fs.writeFileSync(
  path.join(dir, 'layers.json'),
  JSON.stringify({ slug, viewBox, width: vbW, height: vbH, brand, gradients, defs: (svg.match(/<defs>[\s\S]*?<\/defs>/) || [''])[0], layers: layersJson }, null, 2)
);

console.log(`\nWrote ${outPath}`);
console.log(`Wrote ${path.join(dir, 'layers.json')}`);
console.log(`\n${groups.length} layers: ${groups.map((g) => g.id).join(', ')}`);
console.log(`\nNext: paste ${outPath} into Codex Spark and ask for the variants.\n`);
