# CLAUDE.md — ClipCaptionAI

CLI-first AI video editor: transcribe, chapter, caption, add B-roll/SFX, and render short-form video. Node.js ESM, Remotion rendering, Whisper transcription, AI provider abstraction over DeepSeek/OpenAI.

## Architecture

```
scripts/
├── lib.mjs                  # Root shared module — parseArgs, loadEnv, outputsRoot, run, probeVideo, extractAudio, splitVideoSegment, slugify, formatTimestamp
├── clipkit-lib.mjs          # 2nd tier — buildThoughtUnits, buildViralScorecard, snapSelectionToThoughtBoundaries
├── ai-provider.mjs           # Provider registry (DeepSeek + OpenAI), createClient, resolveModel, chatCompletion
├── command-utils.mjs         # commandExists, commandPath
├── clipkit.mjs               # Commander CLI hub (imports from shared modules only)
├── lib-youtube-scenes.mjs    # Scene-library helpers
├── lib-youtube-download.mjs  # YouTube download helpers
├── lib-pop-culture-scenes.mjs # Pop-culture B-roll research (client-injected)
├── video-run-lib.mjs         # Video run manifest helpers
├── fal-provider-utils.mjs    # fal.ai provider helpers
│
├── transcribe-openai.mjs     # Transcription: whisper.cpp → OpenAI Whisper → YouTube CC
├── smart-clips.mjs           # AI clip selection from transcript
├── chapter-video.mjs         # AI chapter detection
├── tighten-video.mjs         # AI filler/repetition detection + video tightening
├── caption-video.mjs         # Caption one existing video
├── enhance-video-with-broll.mjs  # Timed cutaways + captions
├── assemble-context-scenes.mjs   # B-roll cutaway planning + YouTube ingest
├── render-clip.mjs / render-batch.mjs / rerender-clip.mjs  # Remotion renders
├── video.mjs                 # Model-directed video runs (plan → render → QA)
│
├── ebay/                     # eBay competitive ad pipeline (~23 scripts)
│   ├── ebay-cinematic-ads.mjs
│   ├── competitive-listing-video-architect.mjs
│   ├── run-competitive-video-control-loop.mjs
│   └── ...
├── logo/                     # Logo animation scripts
│
├── download-youtube.mjs / download-and-split.mjs / split-local-video.mjs
├── process-links.mjs         # Batch auto-clips from links.txt
├── find-broll-from-text.mjs / mix-sfx.mjs / index-scene-library.mjs
├── generate-elevenlabs-voiceover.mjs / fal-image-edit.mjs / fal-reference-video.mjs
├── cleanup.mjs / benchmark-transcription.mjs / review-moments.mjs
│
src/                          # Remotion compositions (TypeScript/TSX)
├── root.tsx / captioned-clip.tsx / prompt-video.tsx / types.ts
└── logo/                     # Logo animation variants
```

**Dependency rules:**
- Shared modules (`lib*.mjs`, `ai-provider.mjs`, `command-utils.mjs`) import nothing from each other except `clipkit-lib → lib`. Zero circular dependencies.
- Workflow scripts import from shared modules only — never from other workflow scripts.
- `src/` is TypeScript, rendered by Remotion — not importable from `scripts/`.

## Shared modules — what lives where

| Module | What it provides | When to use |
|--------|-----------------|-------------|
| `./lib.mjs` | `parseArgs`, `loadEnv`, `outputsRoot`, `run`, `probeVideo`, `ensureDir`, `readCaptions`, `normalizeCaptions`, `requireArg` | Every CLI script |
| `./clipkit-lib.mjs` | `slugify`, `timestampSlug`, `mergeStyleConfig`, `buildThoughtUnits`, `buildViralScorecard`, `snapSelectionToThoughtBoundaries` | Scripts that process transcripts or name outputs |
| `./ai-provider.mjs` | `resolveProvider`, `createClient`, `resolveModel`, `chatCompletion`, `structuredChatCompletion` | Any script that calls an LLM |
| `./command-utils.mjs` | `commandExists`, `commandPath` | Checking for system binaries |

## AI provider pattern

Every AI call in the project follows this pattern:

```js
import {resolveProvider, createClient, resolveModel, chatCompletion} from './ai-provider.mjs';

const resolved = resolveProvider({provider: args.provider}); // auto-detects from env
if (!resolved.config) throw new Error('No DEEPSEEK_API_KEY or OPENAI_API_KEY');

const client = createClient(resolved);
const model = resolveModel({resolved, model: args.model});

const text = await chatCompletion(client, {
  model,
  systemPrompt: '...',
  userPrompt: '...',
  jsonMode: true,  // adds response_format: {type: 'json_object'}
});
const parsed = JSON.parse(text);
```

For JSON workflows prefer `structuredChatCompletion(client, {model, systemPrompt, userPrompt})` — it adds `jsonMode`, strips fences, and retries once with a repair prompt when the model returns invalid JSON (network/API errors are NOT retried). Clients are created with a 180s default timeout (`createClient(resolved, {timeout, maxRetries})`) so a hung provider can't hang a pipeline. `resolveModel` returns `null` when no provider is configured — heuristic fallback paths rely on that; paths that require AI fail at `createClient`.

**Do not** `import OpenAI from 'openai'` directly — use `ai-provider.mjs`. The only exception is `transcribe-openai.mjs` which needs the raw SDK for `audio.transcriptions.create` (Whisper — DeepSeek doesn't support this). That script imports both `openai` for transcription AND `ai-provider` for text enhancement.

## Adding a new workflow script

1. Create `scripts/your-script.mjs`
2. Import from shared modules only:
   ```js
   import {ensureDir, loadEnv, outputsRoot, parseArgs, probeVideo, requireArg, run} from './lib.mjs';
   import {slugify} from './clipkit-lib.mjs';
   import {resolveProvider, createClient, resolveModel, chatCompletion} from './ai-provider.mjs';
   ```
3. Define a `usage` string and check `args.help || args.h`
4. Call `loadEnv()` before accessing `process.env`
5. Use `outputsRoot` (or `path.join(outputsRoot, 'your-namespace')`) for all output paths — never hardcode `outputs/`
6. Add an npm script to `package.json`: `"your:script": "node scripts/your-script.mjs"`
7. Optionally add to `clipkit.mjs`: menu option + `configurePassthroughCommand`
8. Add a smoke test in `tests/cli-smoke.test.mjs` that at minimum runs `--help`

## CLI conventions

- `--help` / `-h` → print usage, exit 0
- `--video <path>` → input video (always resolve with `path.resolve`)
- `--out <path>` → output file
- `--provider <id>` → deepseek or openai (pass through to ai-provider)
- `--dry-run` → plan without executing paid calls or renders
- `--json` → machine-readable stdout, logs to stderr. Use `emitJsonResult(obj, enabled)` from `lib.mjs` for the stdout half; adoption is per-script (video.mjs and compress-video.mjs are the references)
- All timestamps in seconds (not milliseconds) in AI prompts and output JSON

## Configuration sources

1. `.env` — API keys, transcription provider preference, model overrides
2. `caption-style.json` — default caption rendering (fonts, position, colors, motion)
3. `styles/*.json` — caption style presets, selected via `--style-config`
4. CLI flags — per-run overrides
5. `caption-style.json` `contextScenes` / `soundEffects` blocks — feature toggles per style
6. `.env.example` — documents the most common env vars; see `scripts/ai-provider.mjs` for full model override vars

## Testing

```bash
npm test                    # 107 tests across 6 suites, all pass required
node --test tests/cli-smoke.test.mjs        # 73 CLI smoke/integration tests
node --test tests/clipkit-lib.test.mjs      # 8 unit tests
node --test tests/ai-provider.test.mjs      # 26 provider abstraction tests (incl. mocked network layer)
npm run lint                # ESLint: scripts/, desktop/, tests/ — zero errors required
npm run format              # Prettier (write) over the same scope
npm run check               # typecheck + desktop typecheck + full test suite
```

Tests use Node's built-in test runner. Integration tests create temp dirs, run the actual CLI, generate real MP4s, and clean up. They skip loudly (`t.skip`) when ffmpeg/ImageMagick are absent.

## Desktop (Electron)

- Entry: `desktop/main.mjs` (package.json `main`). Renderer: `desktop/src/` (React, strict TS via `desktop/tsconfig.json`, `npm run typecheck:desktop`).
- Preload: `desktop/preload.cjs` — **CommonJS on purpose**: the window runs `sandbox: true`, and sandboxed preloads cannot be ESM.
- IPC: `desktop/shared/protocol.mjs` is the single source of truth for channel names + validators (`validateSecretKey`, `validateRunRequest`). Every `ipcMain.handle` must call `assertTrustedSender(event)` (main-frame check). Renderer navigation is locked down in `createWindow` (`will-navigate` + `setWindowOpenHandler`) — keep both, the IPC bridge is privileged.
- Packaged builds unpack `bin/ scripts/ src/` etc. from the asar (`asarUnpack` in package.json) because spawned `node` children can't read through an asar; `shared/paths.mjs` points at `app.asar.unpacked` when packaged.
- Build: `npm run desktop:build` (injects CSP into `dist-renderer/index.html` via `desktop/lib/fix-crossorigin.mjs`). `desktop/dist-renderer/` is gitignored — never commit it.
- macOS: `desktop/scripts/notarize.cjs` runs after signing when `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` are set; without them packaging still works locally.

## Key conventions

- **ESM only** — `.mjs` extension, `import`/`export`, no CommonJS
- **No TypeScript in scripts/** — TS is only for `src/` Remotion compositions
- **`import.meta.url`-based paths** — `lib.mjs` resolves `projectRoot` from its own location, so scripts work from any cwd
- **Spawn, don't import** — for heavy or side-effect-heavy work, spawn sub-scripts via `lib.run('npm', ['run', 'script-name', '--', ...args])` rather than importing
- **Output manifests** — every pipeline stage writes a JSON manifest with hashes, provider/model info, and timestamps
- **Whisper transcription** uses local whisper.cpp by default (falls back to OpenAI Whisper if `OPENAI_API_KEY` is set, then YouTube CC)
- **DeepSeek** is the preferred chat/analysis provider when `DEEPSEEK_API_KEY` is set; override with `--provider openai`

## Known issues / future work

- `examples/project.config.example.json` was dead config — removed
- Some remaining scripts call ffprobe directly instead of `lib.probeVideo` — incremental migration in progress
- README is a quickstart + command reference; walkthroughs live in `docs/WORKFLOWS.md`. Keep the split — do not grow walkthrough content back into README
- Caption fonts are NOT bundled: render machines must have the caption fonts installed (`src/fonts.ts` warns on missing ones). Bundling via `loadFont` + `staticFile` is the real fix
- The caption layout memo in `src/captioned-clip.tsx` rebuilds the SVG masks per frame by design (per-frame pop/motion is baked into the masks); the stable-input memoization only covers `containerPositionStyle` and page segmentation
- `--json` output convention is implemented in ~2 of 38 scripts — migrate incrementally using `emitJsonResult`
- ESLint covers `scripts/`, `desktop/`, `tests/`; Remotion `src/` is covered by strict tsc only — extend typescript-eslint there later
