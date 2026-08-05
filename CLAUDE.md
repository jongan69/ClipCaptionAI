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
| `./ai-provider.mjs` | `resolveProvider`, `createClient`, `resolveModel`, `chatCompletion`, `structuredChatCompletion`, `runStructuredCompletion`, `providerSupports` | Any script that calls an LLM |
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
- `--json` → machine-readable stdout, logs to stderr
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
npm test                    # 98 tests across 3 suites, all pass required
node --test tests/cli-smoke.test.mjs        # 68 CLI smoke/integration tests
node --test tests/clipkit-lib.test.mjs      # 8 unit tests
node --test tests/ai-provider.test.mjs      # 22 provider abstraction tests
```

Tests use Node's built-in test runner. Integration tests create temp dirs, run the actual CLI, generate real MP4s, and clean up. They skip gracefully when ffmpeg/ImageMagick are absent.

## Key conventions

- **ESM only** — `.mjs` extension, `import`/`export`, no CommonJS
- **No TypeScript in scripts/** — TS is only for `src/` Remotion compositions
- **`import.meta.url`-based paths** — `lib.mjs` resolves `projectRoot` from its own location, so scripts work from any cwd
- **Spawn, don't import** — for heavy or side-effect-heavy work, spawn sub-scripts via `lib.run('npm', ['run', 'script-name', '--', ...args])` rather than importing
- **Output manifests** — every pipeline stage writes a JSON manifest with hashes, provider/model info, and timestamps
- **Whisper transcription** uses local whisper.cpp by default (falls back to OpenAI Whisper if `OPENAI_API_KEY` is set, then YouTube CC)
- **DeepSeek** is the preferred chat/analysis provider when `DEEPSEEK_API_KEY` is set; override with `--provider openai`

## Known issues / future work

- 10+ remaining scripts still duplicate `slugify` instead of importing from `lib.mjs` — incremental migration in progress
- `examples/project.config.example.json` was dead config — removed
- Some remaining scripts call ffprobe directly instead of `lib.probeVideo` — incremental migration in progress
- 86 KB README overlaps with WORKFLOWS.md — consider trimming README to a quickstart and pointing to docs/ for full workflow reference
