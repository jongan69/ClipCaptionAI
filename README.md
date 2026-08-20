# ClipCaptionAI

A CLI-first local AI video editor and model harness. An agent can turn a brief and approved assets into a versioned video run, render deterministic Remotion compositions, call optional AI providers, and validate final media without relying on the Electron UI.

Useful search terms this project is built around: AI video editor, YouTube shorts generator, TikTok captions, Reels captions, Remotion captions, automatic B-roll, viral clip finder, faceless video generator, AI shorts automation, podcast clipper, transcript-based video editing, and contextual movie-scene B-roll.

## Quickstart

This first run is local and does not require an OpenAI, ElevenLabs, or fal API key. It creates a deterministic Remotion video from the included example brief, then verifies the finished MP4.

### 1. Install prerequisites

You need:

- Node.js 20 or newer
- `ffmpeg` and `ffprobe`

On macOS with Homebrew:

```bash
brew install node ffmpeg
```

On Windows or Linux, install Node.js 20+ and FFmpeg using your normal package manager or the official installers, then continue with `npm run doctor` below.

Optional extras:

- ImageMagick — used by some asset pipelines and test suites
- whisper.cpp (`whisper-cli`) — fully local transcription without an API key

Run `npm run doctor` to see which capabilities are available on your machine.

### 2. Install ClipCaptionAI

```bash
git clone https://github.com/jongan69/ClipCaptionAI.git
cd ClipCaptionAI
npm install
npm run doctor
```

The doctor command tells you exactly which required dependency is missing. Do not create `.env` yet; it is only needed for optional provider workflows.

### 3. Configure AI providers (optional)

Copy the example environment file only when you need provider-backed workflows:

```bash
cp .env.example .env
```

Then add only the keys for the providers you intend to use:

- `DEEPSEEK_API_KEY=...` — preferred for chat/analysis (auto-detected first)
- `OPENAI_API_KEY=...` — required for OpenAI Whisper transcription and clip selection
- ElevenLabs and fal keys are optional, for narration and asset generation

Local transcription additionally requires a `whisper-cli`/whisper.cpp installation. See [AI provider setup](docs/AI_PROVIDERS.md) for keys, review gates, and what counts as live-provider evidence.

### 4. Render the example video

```bash
npm run clipkit -- video run \
  --brief-file examples/brief.example.txt \
  --run-id first-video
```

When installed from the v0.1.0 release tarball, the equivalent clean first-run command is:

```bash
clipcaptionai video run --example --run-id first-video
```

Verify the result:

```bash
npm run clipkit -- video qa \
  --run outputs/video-runs/first-video
```

If QA passes, open this file:

```text
outputs/video-runs/first-video/final/first-video.mp4
```

The same run also records its inputs, plan, hashes, output metadata, and QA result in `outputs/video-runs/first-video/run.json`.

What this first run does: it renders a local, deterministic video from the brief. It does not call a paid AI provider.

### 5. Happy path on your own footage

The three building blocks — transcription, AI clip selection, and caption rendering — each have a one-command entry point:

```bash
# 1. Transcribe a video to a captions JSON file
npm run transcribe -- \
  --video ~/Desktop/my-video.mp4 \
  --out outputs/my-video.captions.json

# 2. Ask AI to select the strongest clips (transcribes internally, renders captioned shorts)
npm run smart:clips -- \
  --video ~/Desktop/my-video.mp4 \
  --out-dir outputs/smart-clips \
  --max-clips 6

# 3. Render one captioned clip from an existing captions file
npm run render:clip -- \
  --video ~/Desktop/my-video.mp4 \
  --captions outputs/my-video.captions.json \
  --out outputs/my-video.captioned.mp4
```

For the full download → transcribe → clip → caption → render pipeline from a list of YouTube URLs, see [Process Pipeline](docs/WORKFLOWS.md#process-pipeline) and the [interactive menu](#command-reference). Every workflow walkthrough lives in [docs/WORKFLOWS.md](docs/WORKFLOWS.md).

### Quickstart troubleshooting

**`npm run doctor` says `ffmpeg` or `ffprobe` is missing** — Install FFmpeg, restart the terminal, and run `npm run doctor` again. Both commands must be available on your `PATH`.

**The command says `clipcaptionai: command not found`** — When running from a cloned checkout, use the repo-local form:

```bash
npm run clipkit -- --help
```

The README uses this form intentionally. `npx clipcaptionai` is for an installed/published package and may resolve a registry version instead of the checkout you are editing.

**I want to use my own brief or assets** — Copy `examples/brief.example.txt`, edit the text, and pass your file:

```bash
npm run clipkit -- video run \
  --brief-file /absolute/path/to/brief.txt \
  --assets-dir /absolute/path/to/approved-assets \
  --run-id my-video
```

The assets directory may contain images or videos. Keep source media you have permission to use in that directory. Add a local music or narration track with `--audio`:

```bash
npm run clipkit -- video run \
  --brief-file /absolute/path/to/brief.txt \
  --assets-dir /absolute/path/to/approved-assets \
  --audio /absolute/path/to/music-or-narration.mp3 \
  --run-id my-video
```

### Optional: use the interactive menu

Once the first command works, you can use the guided menu instead — double-click `RUN.command`, or run:

```bash
npm run menu
```

The menu is convenient for interactive editing. The direct `npm run clipkit -- ...` commands are the recommended path for scripts and AI agents because they are easier to reproduce.

### Optional desktop app

`npm run desktop` starts an Electron shell that runs the same `clipcaptionai` commands through IPC. It keeps the CLI as the source of truth while offering a cleaner user surface and a raw-command input for automation workflows. Production checks run before booting:

- Required: Node.js + `ffmpeg` + `ffprobe` + project CLI/runtime files
- Optional: `yt-dlp`, `remotion`; AI provider: DeepSeek or OpenAI (auto-detected from `.env`)

```bash
npm run desktop:env-check:json   # machine-readable checks
npm run desktop:package          # build a local desktop artifact (Electron Builder)
npm run desktop:package:mac      # platform-specific builds: :win, :linux, :all
```

## Command Reference

Detailed walkthroughs for every workflow live in [docs/WORKFLOWS.md](docs/WORKFLOWS.md). The tables below map menu options and npm scripts to their walkthrough sections.

### Interactive menu

`RUN.command`, `npm run menu`, and `npx clipcaptionai menu` all open the same workflow menu:

| Menu option | Direct command | What it does | Walkthrough |
| --- | --- | --- | --- |
| Download | `npm run download:youtube -- --links links.txt` | Download YouTube videos and stop | [docs/WORKFLOWS.md](docs/WORKFLOWS.md#download-youtube-videos-and-stop) |
| Frame | `npm run frame:links -- --links links.txt` | Download YouTube videos into a frame image | — |
| eBay cinematic listing ads | `npm run ebay:cinematic-ads -- <subcommand>` | eBay ad lane (roi-plan, prepare, seed-local-broll, find-broll, assemble, upload) | [Competitive eBay Creative Blueprints](docs/WORKFLOWS.md#competitive-ebay-creative-blueprints) |
| eBay competitor creative blueprints | `npm run ebay:creative-intel -- plan` | Competitor creative blueprints | [Competitive eBay Creative Blueprints](docs/WORKFLOWS.md#competitive-ebay-creative-blueprints) |
| Fixed clips | `npm run clips:fixed -- --links links.txt` | Download full videos and chop them into fixed clips | [Download Full Videos And Chop Them Into Fixed Clips](docs/WORKFLOWS.md#download-full-videos-and-chop-them-into-fixed-clips) |
| Split video | `npm run video:split -- --video FILE` | Cut one local video into fixed clips | [Cut One Local Video Into Fixed Clips](docs/WORKFLOWS.md#cut-one-local-video-into-fixed-clips) |
| Moments | `npm run moments:auto -- --links links.txt` | Find important moments only | [Find Important Moments Only](docs/WORKFLOWS.md#find-important-moments-only) |
| Auto clips | `npm run clip:auto -- --links links.txt` | Auto AI clip YouTube videos | [Auto AI Clip YouTube Videos](docs/WORKFLOWS.md#auto-ai-clip-youtube-videos) |
| B-roll captions | `npm run broll:captions -- --links links.txt` | B-roll-heavy caption generator | [B-Roll-Heavy Caption Generator](docs/WORKFLOWS.md#b-roll-heavy-caption-generator) |
| Caption | `npm run caption:auto -- --video FILE` | Auto caption any video | [Auto Caption Any Video](docs/WORKFLOWS.md#auto-caption-any-video) |
| Chapter | `npm run chapter:auto -- --video FILE` | Auto-chapter a conversation video | [Auto-Chapter a Conversation Video](docs/WORKFLOWS.md#auto-chapter-a-conversation-video) |
| Tighten | `npm run tighten:auto -- --video FILE` | Tighten a conversation — remove filler and repetition | [Tighten a Conversation Video](docs/WORKFLOWS.md#tighten-a-conversation-video) |
| Compress | `npm run compress:video -- --video FILE` | Compress a video — reduce file size with minimal quality loss | — |
| Enhance | `npm run video:enhance -- --video FILE` | Add B-roll + captions to an existing edit | [Enhance An Existing Edit](docs/WORKFLOWS.md#enhance-an-existing-edit) |
| B-roll | `npm run broll:find -- --prompts FILE` | Find standalone B-roll | [Find Standalone B-Roll](docs/WORKFLOWS.md#find-standalone-b-roll) |
| Rerender | `npm run rerender:clip -- --clip N` | Rerender a generated clip after fixes | [Rerender](docs/WORKFLOWS.md#rerender) |
| Cleanup | `npm run cleanup` | Clean temp files / old outputs | [Clean Up Generated Files](docs/WORKFLOWS.md#clean-up-generated-files) |
| Studio | `npm run studio` | Open Remotion Studio | [Preview In Remotion Studio](docs/WORKFLOWS.md#preview-in-remotion-studio) |
| Open latest | `npm run output:open` | Open newest output folder | [Other Useful Everyday Commands](docs/WORKFLOWS.md#other-useful-everyday-commands) |
| Doctor | `npm run doctor` | Dependency/env health check | [Diagnostics](docs/WORKFLOWS.md#diagnostics) |

### Shortcut aliases

| Command | What it does | Walkthrough |
| --- | --- | --- |
| `npm run process` | Original full pipeline: download `links.txt` → transcribe → AI clip selection → captioned renders (B-roll/SFX optional) | [Process Pipeline](docs/WORKFLOWS.md#process-pipeline) |
| `npm run transcribe` | Captions JSON only (provider auto: whisper.cpp → OpenAI → YouTube CC) | [Transcription Notes](docs/WORKFLOWS.md#transcription-notes) |
| `npm run transcribe:benchmark` | Compare local vs reference transcription providers | [Transcription Notes](docs/WORKFLOWS.md#transcription-notes) |
| `npm run smart:clips` | AI clip selection on one local video | [AI Clip Selection](docs/WORKFLOWS.md#ai-clip-selection) |
| `npm run render:clip` | Render one clip from captions JSON | [Single Clip Commands](docs/WORKFLOWS.md#single-clip-commands) |
| `npm run render:batch` | Batch render clips from a captions folder | — |
| `npm run rerender:clip` | Rerender after caption/fix edits | [Rerender](docs/WORKFLOWS.md#rerender) |
| `npm run moments:review` | Viral scorecard report for a moments run | [Find Important Moments Only](docs/WORKFLOWS.md#find-important-moments-only) |
| `npm run scene:mix` | One-off context-matched scene mix | [Context-Matched Scene Inserts](docs/WORKFLOWS.md#context-matched-scene-inserts) |
| `npm run scene:index` | Build `index.json` for a raw scene library | [Scene Library Options](docs/WORKFLOWS.md#scene-library-options) |
| `npm run scene:ingest:youtube-cc` | One-off YouTube scene ingest | [Context-Matched Scene Inserts](docs/WORKFLOWS.md#context-matched-scene-inserts) |
| `npm run scene:research-pop-culture` | Pop-culture query research for a scene plan | [Pop Culture Query Enrichment](docs/WORKFLOWS.md#pop-culture-query-enrichment) |
| `npm run scene:blacklist` | Blacklist bad scene clips | — |
| `npm run sfx:standardize` | Standardize and index `sfx-library/` | [Automatic Sound Effects](docs/WORKFLOWS.md#automatic-sound-effects) |
| `npm run sfx:mix` | One-off SFX mix | [Automatic Sound Effects](docs/WORKFLOWS.md#automatic-sound-effects) |
| `npm run video` | Model-directed runs: `video plan\|inspect\|render\|qa\|run` | [Model-directed video runs](docs/WORKFLOWS.md#model-directed-video-runs) |
| `npm run ebay:cinematic-ads` | eBay ad lane; subcommands `roi-plan`, `prepare`, `seed-local-broll`, `find-broll`, `assemble`, `upload` | [Competitive eBay Creative Blueprints](docs/WORKFLOWS.md#competitive-ebay-creative-blueprints) |
| `npm run ebay:creative-intel` | Competitor creative blueprints; subcommands `plan`, plus `discover-youtube` / `analyze-reference-video` flags | [Competitive eBay Creative Blueprints](docs/WORKFLOWS.md#competitive-ebay-creative-blueprints) |
| `npm run ebay:render-blueprint-ad` / `ebay:render-blueprint-batch` | Product-safe preview ads from blueprints | [Competitive eBay Creative Blueprints](docs/WORKFLOWS.md#competitive-ebay-creative-blueprints) |
| `npm run ebay:competitive-*` | Post-blueprint pipeline: `competitive-loop`, `competitive-qa`, `prep-premium-renders`, `competitive-handoff`, `competitive-higgsfield-render`, `competitive-packets`, `competitive-research-queue/import/loop/process/rerun`, `collect-premium-renders`, `finalize-premium-ads`, `competitive-status`, `competitive-review` | [Competitive eBay Creative Blueprints](docs/WORKFLOWS.md#competitive-ebay-creative-blueprints) |
| `npm run voiceover:elevenlabs` | ElevenLabs narration file | [Demo Capture And Reviewed AI Assets](docs/WORKFLOWS.md#demo-capture-and-reviewed-ai-assets) |
| `npm run fal:image-edit` / `fal:reference-video` | fal.ai asset generation (opt-in, human-reviewed) | [Demo Capture And Reviewed AI Assets](docs/WORKFLOWS.md#demo-capture-and-reviewed-ai-assets) |
| `npm run sample:props` | Write Remotion Studio sample props | [Preview In Remotion Studio](docs/WORKFLOWS.md#preview-in-remotion-studio) |
| `npm run cleanup` | Clean temp files / old outputs | [Clean Up Generated Files](docs/WORKFLOWS.md#clean-up-generated-files) |
| `npm run doctor` | Dependency/env health check | [Diagnostics](docs/WORKFLOWS.md#diagnostics) |
| `npm run check` | `typecheck` + full test suite | [Testing](#testing) |

See `package.json` scripts for the full list (including `rotato`, `interview:qa`, `logo:*`, and desktop packaging scripts).

### Also see

- [docs/WORKFLOWS.md](docs/WORKFLOWS.md) — every workflow walkthrough, in depth
- [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md) — provider keys, review gates, live-provider evidence
- [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md) — automation guide for coding agents
- [docs/PRODUCTION_SUPPORT.md](docs/PRODUCTION_SUPPORT.md) — production support matrix
- [docs/GITHUB.md](docs/GITHUB.md) — GitHub-specific setup

## Architecture

```
scripts/            # ESM CLI scripts (.mjs)
├── lib.mjs         # parseArgs, loadEnv, outputsRoot, run, probeVideo, extractAudio, slugify helpers
├── clipkit-lib.mjs # thought units, viral scorecards, selection snapping
├── ai-provider.mjs # provider registry (DeepSeek + OpenAI), resolveModel, chatCompletion
├── command-utils.mjs # commandExists / commandPath
├── clipkit.mjs     # Commander CLI hub — the menu and the clipkit command surface
└── *.mjs           # one workflow per script (transcribe, smart-clips, caption, chapter, enhance, ebay/, ...)

src/                # Remotion compositions (TypeScript/TSX), rendered by Remotion — not importable from scripts/
desktop/            # Electron shell that drives the same CLI through IPC
outputs/            # every run gets its own dated folder + JSON manifests (hashes, provider, timestamps)
```

Design rules:

- Shared modules import nothing from each other except `clipkit-lib → lib`; zero circular dependencies. Workflow scripts import from shared modules only — never from other workflow scripts.
- ESM only; `import.meta.url`-based paths so scripts work from any cwd.
- Spawn, don't import — heavy work shells out via `lib.run('npm', ['run', ...])`.
- Every AI call goes through `ai-provider.mjs` (`resolveProvider` → `createClient` → `resolveModel` → `chatCompletion`). The only direct `openai` SDK import is `transcribe-openai.mjs`, for Whisper audio transcription.
- Every pipeline stage writes a JSON manifest with hashes, provider/model info, and timestamps.

## Configuration Sources

1. `.env` — API keys, transcription provider preference, model overrides
2. `caption-style.json` — default caption rendering (fonts, position, colors, motion)
3. `styles/*.json` — caption style presets, selected via `--style-config`
4. CLI flags — per-run overrides
5. `caption-style.json` `contextScenes` / `soundEffects` blocks — feature toggles per style
6. `.env.example` — documents the most common env vars; see `scripts/ai-provider.mjs` for the full model override list

The complete field reference for `caption-style.json` (layout, fonts, motion, colors, context scenes, sound effects, scene library) lives in the [Caption Style Configuration appendix](docs/WORKFLOWS.md#appendix-caption-style-configuration).

## Testing

```bash
npm test              # 104 tests across 3 suites, all pass required
node --test tests/cli-smoke.test.mjs        # 74 CLI smoke/integration tests
node --test tests/ai-provider.test.mjs      # 22 provider abstraction tests
node --test tests/clipkit-lib.test.mjs      # 8 unit tests
```

Tests use Node's built-in test runner. Integration tests create temp dirs, run the actual CLI, generate real MP4s, and clean up. They skip gracefully when ffmpeg/ImageMagick are absent. `npm run check` runs typechecking plus the full test suite.

## Related Projects

- **[YouTubeResearchAI](https://github.com/jongan69/YouTubeResearchAI)** — Turn any video URL into a PhD-grade cited research report. Academic pipeline: download → transcribe → literature search → claim verification → cited report.
- **[PrepAI](https://github.com/jongan69/PrepAI)** — Local-first fitness AI for iPhone. On-device ML, zero cloud storage.
- **[ListingOS](https://github.com/jongan69/ListingOS-AI)** — Camera-first AI listing workflow for eBay sellers.

---

*More projects at [github.com/jongan69](https://github.com/jongan69)*

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Jonathan Gan.
