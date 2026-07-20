# Logo Animation Pipeline

Generating Remotion logo animations with a **text-only** code model (Codex Spark,
or any model without vision).

## The problem, and the actual fix

Codex Spark can't accept an image, so it can't see your logo. The instinct is to
find a way to smuggle the image in. Don't — that's solving the wrong problem.

A model doesn't need to *see* a logo to animate it. It needs to know **what the
parts are, where they sit, and what colour they are**. That is all expressible as
text. So we convert the logo into a structured text spec once, and from then on
the model works from the spec.

This has a second, larger payoff: because variants are written against *named
layers* rather than baked-in path data, **the animations you generate today work
on every logo you onboard later**. Adding a new brand is a 3-command job with no
new model calls.

```
logo.png ──vectorize──> layered SVG ──build-spec──> LOGO_SPEC.md ──paste──> Codex Spark
                                          │                                     │
                                          └──> layers.json ──> Remotion harness <┘
                                                                    │
                                                              verify ──> render
```

## One-time setup

```bash
npm i -D imagetracerjs pngjs
```

Only needed for the auto-trace path. If you always have vector source, skip it.

## Onboarding a logo

### 1. Get a layered SVG

**If you have vector source** (Figma, Illustrator, an existing `.svg`) — use it.
Export as SVG and hand-name the groups. Skip to step 2.

**If you only have a PNG:**

```bash
npm run logo:vectorize -- --in path/to/logo.png --slug acme
```

This traces the raster into `assets/logos/acme/logo.traced.svg`, grouping paths by
colour into `layer-0`, `layer-1`, ... and printing what it found.

Now do the one genuinely manual step: **rename those groups to semantic ids** and
save the result as `assets/logos/acme/logo.svg`.

```svg
<g id="layer-2" data-fill="#2563eb">   →   <g id="brackets" data-role="scan-frame">
```

This takes about two minutes and is the highest-leverage part of the whole
pipeline. `layer-2` tells a model nothing. `brackets` with `data-role="scan-frame"`
tells it this is a frame that should draw on like a viewfinder. The names are the
semantics, and the semantics are what the model animates against.

Use consistent names across brands — `mark`, `wordmark`, `accent`, `frame` — and
variants port between logos for free.

Add `assets/logos/acme/brand.json` with the palette, wordmark text, and a one-line
note on what the brand should *feel* like.

### 2. Generate the spec

```bash
npm run logo:spec -- --slug acme
```

Writes two files:

- **`LOGO_SPEC.md`** — the human/model-readable brief: canvas, layer map with
  bounding boxes and pivots, gradients, full path data, the component contract,
  and a list of animation directions to cover. This is what you paste.
- **`layers.json`** — the machine-readable version the Remotion harness imports.

Both come from the same source, so the spec the model reads and the data the code
uses can never drift apart.

### 3. Hand it to Codex Spark

Paste the entire `LOGO_SPEC.md`, then:

> Follow this spec. Generate the 10 variants described in section 6. Use
> `src/logo/variants/01-scan-in.tsx` as the reference for the contract.

Also paste `01-scan-in.tsx`. A worked example is worth more than any amount of
instruction — it shows the model the import style, the `meta` export, and how to
read from `logo` instead of hardcoding.

Save the output into `src/logo/variants/` and register each variant in
`src/logo/registry.ts`.

### 4. Verify before rendering

```bash
npm run logo:verify -- --slug acme --variant 02-assemble
```

Server-renders the variant at four frames in about a second and fails on the things
generated animation code actually gets wrong:

- throws on a layer the brand doesn't have
- `NaN`/`Infinity` in a transform (silently blanks the frame in a real render)
- animated values that never change — it renders, it just doesn't animate
- an arc that never resolves to the finished logo

Exits non-zero, so it drops straight into CI. Run this before you spend minutes on
a video render.

### 5. Render

```bash
npm run logo:render -- --slug acme              # mp4
npm run logo:render -- --slug acme --format webm # transparent background
npm run studio                                   # preview interactively
```

Compositions are auto-registered as `Logo-<slug>-<variant>`, so N brands x M
variants gives you N×M renders with no extra wiring.

## Adding your *next* logo

Steps 1, 2, and 5. **No model call.** Every variant already in the registry picks
up the new brand automatically, because variants read layers by name and never
reference a specific logo.

That is the whole reason for the layer indirection — the expensive part (generating
animation code) happens once, not once per brand.

## Rules for generated variants

Enforced by review and partly by `logo:verify`:

1. Never hardcode path data, colours, or coordinates — read them from `logo`.
2. Import only from `remotion` and `react`.
3. Animate with `interpolate` / `spring`. Never CSS `@keyframes` or `setTimeout`.
4. Deterministic output — `random()` from `remotion` with a fixed seed if needed.
5. Handle `logo.layer(id) === null` gracefully; brands differ.
6. Land on the correct static logo by the final frame.

## Files

| Path | Role |
|---|---|
| `assets/logos/<slug>/logo.svg` | Layered source of truth |
| `assets/logos/<slug>/brand.json` | Palette, wordmark, tone notes |
| `assets/logos/<slug>/LOGO_SPEC.md` | Generated brief for the model |
| `assets/logos/<slug>/layers.json` | Generated data for the harness |
| `scripts/logo/vectorize.mjs` | PNG → layered SVG |
| `scripts/logo/build-spec.mjs` | SVG → spec + layers.json |
| `scripts/logo/verify-variant.tsx` | Correctness gate |
| `scripts/logo/render-all.mjs` | Batch render |
| `src/logo/types.ts` | Variant contract |
| `src/logo/load-logo.ts` | layers.json → LogoModel |
| `src/logo/logo-stage.tsx` | Stage, `RawLayer`, `LogoSvg` |
| `src/logo/registry.ts` | Brand + variant registration |
| `src/logo/variants/` | Generated animations |

## Notes

- The `<text>` wordmark carries `data-*` hints (`data-text`, `data-accent-text`,
  `data-center-x`) because text has no static geometry to measure. `build-spec`
  estimates its box from font metrics so the model still gets a pivot.
- Auto-tracing suits flat-colour logos. Heavy gradients need a higher `--colors`
  value, and photographic marks won't trace usefully — supply vector for those.
- `build-spec` strips XML comments before parsing. Prose inside `<!-- -->`
  frequently contains literal tag text like `<g>`, which corrupts the nesting
  count used to find top-level layers.
