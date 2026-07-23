# ClipCaptionAI

A CLI-first local AI video editor and model harness. An agent can turn a brief and approved assets into a versioned video run, render deterministic Remotion compositions, call optional AI providers, and validate final media without relying on the Electron UI.

Useful search terms this project is built around: AI video editor, YouTube shorts generator, TikTok captions, Reels captions, Remotion captions, automatic B-roll, viral clip finder, faceless video generator, AI shorts automation, podcast clipper, transcript-based video editing, and contextual movie-scene B-roll.

## Start here: first video in five minutes

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

### 2. Install ClipCaptionAI

```bash
git clone https://github.com/jongan69/ClipCaptionAI.git
cd ClipCaptionAI
npm install
npm run doctor
```

The doctor command tells you exactly which required dependency is missing. Do not create `.env` yet; it is only needed for optional provider workflows.

### 3. Render the example video

```bash
npm run clipkit -- video run \
  --brief-file examples/brief.example.txt \
  --run-id first-video
```

### 4. Verify the result

```bash
npm run clipkit -- video qa \
  --run outputs/video-runs/first-video
```

If QA passes, open this file:

```text
outputs/video-runs/first-video/final/first-video.mp4
```

The same run also records its inputs, plan, hashes, output metadata, and QA result in:

```text
outputs/video-runs/first-video/run.json
```

What this first run does: it renders a local, deterministic video from the brief. It does not call a paid AI provider. To use existing footage, captions, B-roll, narration, or generated assets, continue to [the command reference](#basic-commands) and [AI provider setup](docs/AI_PROVIDERS.md).

### Optional: use the interactive menu

Once the first command works, you can use the guided menu instead:

```bash
npm run menu
```

The menu is convenient for interactive editing. The direct `npm run clipkit -- ...` commands above are the recommended path for scripts and AI agents because they are easier to reproduce.

## Optional setup: AI providers and transcription

Copy the example environment file only when you need provider-backed workflows:

```bash
cp .env.example .env
```

Then add only the keys for the providers you intend to use. OpenAI, ElevenLabs, and fal are optional. Local transcription additionally requires a `whisper-cli`/whisper.cpp installation; run `npm run doctor` to see which capabilities are available.

See [AI provider setup](docs/AI_PROVIDERS.md) for keys, review gates, and what counts as live-provider evidence.

## Quick Start troubleshooting

### `npm run doctor` says `ffmpeg` or `ffprobe` is missing

Install FFmpeg, restart the terminal, and run `npm run doctor` again. Both commands must be available on your `PATH`.

### The command says `clipcaptionai: command not found`

When running from a cloned checkout, use the repo-local form:

```bash
npm run clipkit -- --help
```

The README uses this form intentionally. `npx clipcaptionai` is for an installed/published package and may resolve a registry version instead of the checkout you are editing.

### I want to use my own brief or assets

Copy `examples/brief.example.txt`, edit the text, and pass your file:

```bash
npm run clipkit -- video run \
  --brief-file /absolute/path/to/brief.txt \
  --assets-dir /absolute/path/to/approved-assets \
  --run-id my-video
```

The assets directory may contain images or videos. Keep source media you have permission to use in that directory.

## Optional desktop app

From Desktop:

```bash
npm run desktop
```

Production checks run before booting the desktop shell:

- Required: Node.js + `ffmpeg` + `ffprobe` + project CLI/runtime files
- Optional: `yt-dlp`, `remotion`, `openai`

```bash
npm run desktop:env-check:json
```

For machine-readable checks (CI/automation), use `--json`.

`npm run desktop` starts an Electron shell that runs the same `clipcaptionai` commands through IPC. It keeps the CLI as the source of truth while offering a cleaner user surface and a raw-command input for automation workflows. The workflow list is synchronized from `clipcaptionai --help` at startup, and any missing CLI commands are surfaced automatically as CLI-discovered entries so the app tracks tool growth.
From the UI, use **Open session log** to inspect desktop process logs while jobs are running.

Build a local desktop artifact with Electron Builder:

```bash
npm run desktop:package
npm run desktop:package:mac
npm run desktop:package:win
npm run desktop:package:linux
npm run desktop:package:all
```

Run a quick local health check:

```bash
npm run doctor
```

Run the repo verification suite:

```bash
npm run check
```

## Production model-facing workflow

The generic video workflow is designed for Claude, Codex, GPT, and other coding agents. The agent owns the creative brief; ClipCaptionAI owns reproducible planning, rendering, manifests, and media QA.

```bash
npm run clipkit -- video plan --brief-file brief.txt --assets-dir ./assets --json
npm run clipkit -- video render --run outputs/video-runs/brief
npm run clipkit -- video qa --run outputs/video-runs/brief --json
npm run clipkit -- video inspect --run outputs/video-runs/brief --json
```

For a single non-interactive pass:

```bash
npm run clipkit -- video run --brief-file brief.txt --assets-dir ./assets --dry-run --json
```

Each run writes `outputs/video-runs/<run-id>/run.json`. The manifest records the brief hash, approved asset hashes, shot plan, provider intent, output metadata, and QA status. A successful render is not considered complete until `video qa` passes.

The generic local renderer currently creates deterministic image/video shot cards with Remotion. Existing caption, B-roll, YouTube, eBay, ElevenLabs, fal, and Rotato commands remain available as specialized workflows.

Read [the agent guide](docs/AGENT_GUIDE.md) before automating the CLI and [the production support matrix](docs/PRODUCTION_SUPPORT.md) before describing a provider or external integration as production-ready.

## Demo capture and reviewed AI assets

- Record the real workflow in Cursorful at 1080p, then caption/render it here. Cursorful remains an operator tool, not a project dependency.
- Generate a local ElevenLabs narration file with `npm run voiceover:elevenlabs -- --script narration.txt --voice-id VOICE_ID`.
- Create opt-in, human-reviewed fal assets with `npm run fal:image-edit -- ... --approved-for-generated-marketing` or `npm run fal:reference-video -- ... --approved-for-generated-marketing`.
- Generated images/video are never eBay source-of-truth/main listing photos or evidence of condition. Full setup and QA details: [AI provider workflows](docs/AI_PROVIDERS.md).

Open the interactive front door:

```bash
npm run menu
```

## Menu Reference

`RUN.command` and `npm run menu` open the same workflow menu.

For render-producing workflows, the menu can now optionally open an advanced settings prompt before the run starts. That lets you override common choices on the fly without editing JSON first:

- caption on or off
- caption placement
- caption opacity
- style preset or custom style-config path
- vertical crop vs vertical contain framing
- B-roll/context-scenes on or off where that workflow supports it
- sound effects on or off where that workflow supports it

| Menu | What it does | Direct command | Main output |
| --- | --- | --- | --- |
| `0` | Plan, render, inspect, or QA a model-directed video run. | `clipcaptionai video run --brief-file brief.txt --assets-dir assets` | `outputs/video-runs/<run-id>/` |
| `1` | Download links from `links.txt` and stop. | `npm run clipkit -- download --links links.txt` | `outputs/download-run-*/downloads/` |
| `2` | Download YouTube videos into a local frame image. | `npm run clipkit -- frame --links links.txt --frame /Users/jonathangan/Desktop/Frame.png` | `outputs/frame-run-*/` |
| `3` | Build one lean cinematic eBay ad kit. | `npm run clipkit -- ebay-ads roi-plan --credit-budget 45 --max-listings 1 --max-higgs-shots 1 --prepare-selected` | `outputs/ebay-cinematic-ads/roi-plan-*/` |
| `4` | Download full videos and chop each whole source into fixed clips. | `npm run clipkit -- fixed-clips --links links.txt --segment-seconds 15` | `outputs/fixed-clips-run-*/fixed-clips/` |
| `5` | Cut one local video into fixed clips. | `npm run clipkit -- split-video --video "/path/to/video.mp4" --segment-seconds 15` | `outputs/local-fixed-clips-run-*/fixed-clips/` |
| `6` | Find the strongest moments for manual editing only. | `npm run clipkit -- moments --links links.txt --max-clips 6 --padding-seconds 2` | `outputs/run-*/captioned-clips/*.moment.mp4` |
| `7` | Full auto-clips pipeline. | `npm run clipkit -- auto-clips --links links.txt --max-clips 6 --padding-seconds 2` | `outputs/run-*/captioned-clips/*.captioned.mp4` |
| `8` | B-roll-heavy generator using labeled `links.txt`. | `npm run clipkit -- broll-captions --links links.txt --max-clips 3` | `outputs/run-*/captioned-clips/*.captioned.mp4` |
| `9` | Caption one existing video. | `npm run clipkit -- caption --video "/path/to/video.mp4"` | `outputs/caption-run-*/final/` |
| `10` | Enhance an existing edit with B-roll plus captions. | `npm run clipkit -- enhance --video "/path/to/edit.mp4"` | `outputs/enhance-run-*/final/` |
| `11` | Find standalone B-roll from prompt lines. | `npm run clipkit -- broll --prompts broll-prompts.txt --max-downloads 8` | `outputs/broll-run-*/` |
| `12` | List or rerender a generated clip after transcript/style fixes. | `npm run clipkit -- rerender --clip <id>` | `*.corrected.mp4` or replaced `*.captioned.mp4` |
| `13` | Clean temp files or old output folders. | `npm run clipkit -- cleanup` | Deletes generated files after confirmation |
| `14` | Open Remotion Studio. | `npm run studio` | Remotion preview UI |
| `15` | Open the newest output folder in Finder. | `npm run output:open` | Latest `outputs/run-*` folder |
| `16` | Check local dependencies and config. | `npm run doctor` | Terminal health report |

Menu option `12` now supports both cases:

- press Enter on clip input to list editable clips
- enter a clip number, slug, title fragment, or full `.captions.json` path to rerender
- optionally point it at an older run folder instead of the latest run
- add `--no-captions` if you want a B-roll-only rerender for one specific export

If you prefer the terminal directly, `npm run clipkit -- help` prints the same command hub summary. When using an installed package, the equivalent `clipcaptionai --help` command is available.

## Basic Commands

### 1. Download YouTube Videos And Stop

Create a `links.txt` file with one YouTube URL per line:

```text
https://www.youtube.com/watch?v=FIRST_VIDEO_ID
https://www.youtube.com/watch?v=SECOND_VIDEO_ID
```

Run:

```bash
npm run download:youtube -- --links links.txt
```

That only downloads the videos. It does not transcribe, clip, caption, add B-roll, or render anything.

The files go here:

```text
outputs/download-run-YYYY-MM-DD-HHMMSS/downloads/
```

### 2. Find The Best Moments And Export Clean Source Clips

Use this when you want the AI to download the source videos, find the most promising moments, and export those clips for your own manual edit. No captions, no B-roll, no final social render.

Run:

```bash
npm run moments:auto -- --links links.txt --max-clips 6 --padding-seconds 2
```

That downloads each source video, transcribes it, picks the strongest moments, and exports clean source clips here:

```text
outputs/run-YYYY-MM-DD-HHMMSS/captioned-clips/<video-slug>/*.moment.mp4
```

You also get `selection.json` in the same folder so you can review the chosen hooks, timestamps, and reasoning.

By default, the finder now snaps those chosen moments to nearby transcript thought boundaries so clips are less likely to cut off mid-sentence. Tune that with `--boundary-lookaround-seconds 8` or turn it off with `--disable-thought-snapping`.

If you want a fast trust-but-verify pass after the export, generate a viral scorecard report:

```bash
npm run moments:review -- --write --format markdown
```

That reads the newest `outputs/run-*` folder, scores every chosen moment, explains the strongest signals, and writes `viral-scorecards.md` into the run folder. You can also persist the scorecards directly into each `selection.json`:

```bash
npm run moments:review -- --persist --write --format json
```

### 2A. Download Full Videos And Chop Everything Into Fixed 15-Second Clips

Use this when you want the original full-video clipping workflow: download each source and split the whole thing into back-to-back 15-second chunks for manual review.

Run:

```bash
npm run clips:fixed -- --links links.txt --segment-seconds 15
```

This does not transcribe, pick moments, caption, add B-roll, or render anything.

The files go here:

```text
outputs/fixed-clips-run-YYYY-MM-DD-HHMMSS/
  links.txt
  manifest.json
  downloads/
  fixed-clips/
    <video-slug>/
      000.mp4
      001.mp4
      002.mp4
      segments.json
```

Direct low-level command:

```bash
npm run download:split -- --links links.txt --segment-seconds 15
```

### 2B. Cut One Local Video Into Fixed 15-Second Clips

Use this when the source video is already on your machine and you just want it chopped into back-to-back 15-second sections.

Run:

```bash
npm run video:split -- --video "/path/to/video.mp4" --segment-seconds 15
```

Or through the command hub:

```bash
npm run clipkit -- split-video --video "/path/to/video.mp4" --segment-seconds 15
```

The files go here:

```text
outputs/local-fixed-clips-run-YYYY-MM-DD-HH-MM-SS/
  manifest.json
  fixed-clips/
    <video-slug>/
      000.mp4
      001.mp4
      002.mp4
      segments.json
```

### 3. Caption One Video

Run:

```bash
npm run caption:auto -- --video "/path/to/video.mp4"
```

That transcribes the video, renders captions, and saves the result here:

```text
outputs/caption-run-YYYY-MM-DD-HHMMSS/final/
```

### 4. Caption One Video With A Fixed Transcript

Use this after manually fixing a `.captions.json` file:

```bash
npm run caption:auto -- \
  --video "/path/to/video.mp4" \
  --captions "/path/to/fixed.captions.json"
```

### 5. Auto-Clip YouTube Videos Into Captioned Shorts

Use this when you want the full AI pipeline:

```bash
npm run clip:auto -- --links links.txt --max-clips 6 --padding-seconds 2
```

That downloads each YouTube video, transcribes it, picks interesting clips, adds captions, and renders shorts.

### 6. Add B-Roll And Captions To An Existing Edit

Run:

```bash
npm run video:enhance -- --video "/path/to/already-edited-video.mp4"
```

Use this when the video is already mostly edited and you want extra B-roll plus captions on top.

### 7. Use The Menu Instead

Run:

```bash
npm run menu
```

Then pick the workflow you want.

### 8. Clean Up Generated Files

Run:

```bash
npm run cleanup
```

## Review Why A Clip Was Picked

Use this when you want an editor-facing explanation layer for the moments finder instead of just raw timestamps.

Run against the latest batch:

```bash
npm run moments:review -- --write --format markdown
```

Run against an older batch:

```bash
npm run clipkit -- review-moments \
  --run outputs/run-YYYY-MM-DD-HHMMSS \
  --top 10 \
  --format text
```

Persist scorecards back into the selection files:

```bash
npm run moments:review -- \
  --run outputs/run-YYYY-MM-DD-HHMMSS \
  --persist \
  --write \
  --format json
```

What you get:

- an overall 0-100 score for each picked clip
- readable reasons like hook strength, emotional intensity, practical value, and thought completeness
- optional `viralScorecard` blocks saved into each `selection.json`

The cleanup menu can:

- delete temporary render files from `outputs/work/` and `public/media/`
- delete old output folders while keeping the newest 5
- delete all generated output folders
- run a dry run so you can see what would be deleted first

Nothing is deleted unless you confirm it.

### 9. Rerender One Clip Without Captions

Use this when you like the B-roll-heavy cut, but want one export with no caption layer at all:

```bash
npm run clipkit -- rerender --run outputs/run-YYYY-MM-DD-HHMMSS --clip 03-your-website-is-leaking-money --no-captions
```

That disables both caption layers for that one rerender only:

- the visible text layer
- the inverted/masked caption effect layer

## Toolkit Workflows

The everyday command surface is `clipkit`:

```bash
npm run clipkit -- download --links links.txt
npm run clipkit -- frame --links links.txt --frame /Users/jonathangan/Desktop/Frame.png
npm run clipkit -- ebay-ads roi-plan --credit-budget 45 --max-listings 1 --max-higgs-shots 1 --skip-item-ids 398166069187 --prepare-selected
npm run clipkit -- ebay-ads prepare --item-ids 398160795273
npm run clipkit -- ebay-ads seed-local-broll --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273
npm run clipkit -- ebay-ads find-broll --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273
npm run clipkit -- ebay-ads assemble --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273
npm run clipkit -- fixed-clips --links links.txt --segment-seconds 15
npm run clipkit -- split-video --video "/path/to/video.mp4" --segment-seconds 15
npm run clipkit -- moments --links links.txt --max-clips 6 --padding-seconds 2
npm run clipkit -- auto-clips --links links.txt --max-clips 6 --padding-seconds 2
npm run clipkit -- caption --video "/path/to/video.mp4"
npm run clipkit -- enhance --video "/path/to/already-edited.mp4"
npm run clipkit -- broll --prompts broll-prompts.txt --max-downloads 8
npm run clipkit -- rerender --clip 03-your-website-is-leaking-money
npm run clipkit -- cleanup
```

Shortcut aliases:

| Command | Use |
| --- | --- |
| `npm run menu` | Open the interactive workflow menu. |
| `npm run doctor` | Check Node, npm, ffmpeg, ffprobe, yt-dlp, `.env`, and keys. |
| `npm run download:youtube` | Download YouTube videos from a links file and stop. |
| `npm run frame:links` | Download YouTube videos and render them into a supplied frame image. |
| `npm run ebay:cinematic-ads` | Plan Higgsfield credit spend, prepare listing briefs, assemble rendered clips, and upload final eBay videos. |
| `npm run download:split` | Download YouTube videos, then slice each full source into fixed clips. |
| `npm run video:split` | Slice one local video into fixed clips without using YouTube. |
| `npm run clips:fixed` | Run the full-video fixed-clip workflow from `links.txt`. |
| `npm run moments:auto` | Download YouTube videos, pick the strongest moments, and export clean source clips for manual editing. |
| `npm run clip:auto` | Auto-clip YouTube videos from a links file. |
| `npm run broll:captions` | Run the B-roll-heavy labeled-links workflow from `links.txt`. |
| `npm run caption:auto` | Caption any existing video without picking new clips. |
| `npm run video:enhance` | Add contextual B-roll and captions to an existing edit. |
| `npm run broll:find` | Find standalone B-roll from text prompts. |
| `npm run rerender:clip` | Rerender a generated clip after text/style fixes. |
| `npm run cleanup` | Clean temporary files or old output folders. |
| `npm run output:open` | Open the newest output folder in Finder. |
| `npm run studio` | Open Remotion Studio for preview/debug work. |
| `npm run transcribe` | Create one `.captions.json` from a local video without rendering. |
| `npm run transcribe:benchmark` | Compare local vs OpenAI transcription quality on the same video. |
| `npm run scene:blacklist` | Blacklist scene-library clips after you delete bad MP4s, then remove orphaned sidecars. |
| `npm run scene:index` | Build or refresh `index.json` metadata for a raw local scene library. |

More detailed walkthroughs live in [docs/WORKFLOWS.md](docs/WORKFLOWS.md). GitHub-safe publishing notes live in [docs/GITHUB.md](docs/GITHUB.md).

## Workflow Chooser

If you are not sure which command to run, use this:

| Goal | Best command |
| --- | --- |
| Just download source videos | `npm run download:youtube -- --links links.txt` |
| Decide which one listing gets the next Higgs credit spend | `npm run ebay:cinematic-ads -- roi-plan --credit-budget 45 --max-listings 1 --max-higgs-shots 1 --skip-item-ids 398166069187 --prepare-selected` |
| Create a cinematic ad kit for live eBay listings | `npm run ebay:cinematic-ads -- prepare --item-ids 398160795273` |
| Seed owned local footage into an eBay ad kit | `npm run ebay:cinematic-ads -- seed-local-broll --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273` |
| Find story-building B-roll for an eBay ad kit | `npm run ebay:cinematic-ads -- find-broll --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273` |
| Assemble Higgsfield renders into an eBay MP4 | `npm run ebay:cinematic-ads -- assemble --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273` |
| Assemble a max-energy B-roll/SFX eBay MP4 | `npm run ebay:cinematic-ads -- assemble --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273 --energy max` |
| Download full source videos and chop the entire thing into fixed 15-second clips | `npm run clips:fixed -- --links links.txt --segment-seconds 15` |
| Chop one local source video into fixed 15-second clips | `npm run video:split -- --video "/path/to/video.mp4" --segment-seconds 15` |
| Let AI find strong moments, but edit manually yourself | `npm run moments:auto -- --links links.txt --max-clips 6 --padding-seconds 2` |
| Run the full shorts pipeline | `npm run clip:auto -- --links links.txt --max-clips 6 --padding-seconds 2` |
| Use labeled creator videos plus lots of local B-roll | `npm run broll:captions -- --links links.txt --max-clips 3` |
| Caption one existing edit only | `npm run caption:auto -- --video "/path/to/video.mp4"` |
| Add B-roll plus captions onto an existing edit | `npm run video:enhance -- --video "/path/to/edit.mp4"` |
| Build a reusable B-roll pack from text prompts | `npm run broll:find -- --prompts broll-prompts.txt --max-downloads 8` |
| Fix one wrong caption word and rerender | `npm run rerender:clip -- --clip <id>` |
| Open the newest run in Finder | `npm run output:open` |
| Sanity-check the machine before a long run | `npm run doctor` |

## eBay Cinematic Listing Ads

Use this lane when the goal is a real product ad, not an automatic photo slideshow. The default workflow is lean: one listing at a time, one paid Higgs hero/product-proof shot, owned/local B-roll first, then final assembly/upload through the shopping MCP.

Start with a credit ROI plan before rendering. Use `--skip-item-ids` when a listing should be excluded from paid generation:

```bash
npm run ebay:cinematic-ads -- roi-plan \
  --credit-budget 45 \
  --max-listings 1 \
  --max-higgs-shots 1 \
  --skip-item-ids 398166069187 \
  --prepare-selected
```

The planner pulls the live eBay listing dashboard, ranks listings by likely conversion upside, assigns a render tier, and writes:

```text
outputs/ebay-cinematic-ads/roi-plan-YYYY-MM-DD-HHMMSS/
  higgsfield-roi-plan.md
  higgsfield-roi-plan.json
  projects/
```

The default strategy is intentionally conservative: one paid Higgs shot per ad kit. The perceived production value should come from B-roll, pacing, captions, SFX, and clean assembly. The default `--credits-per-shot` is `22.5`, matching a verified Seedance 2.0 5-second 720p reference-video estimate on July 12, 2026. Re-run `higgsfield/estimate-costs.sh` before rendering if model pricing changes.

For higher-energy sales creatives, use `--ad-strategy high-energy` during planning and `--energy max` while finding B-roll or assembling. Max energy mode uses more kinetic yt-dlp B-roll prompts, shorter B-roll source sections, interleaved 1-2 second cutaways, faster product cuts, and automatic transition/impact/money/camera SFX from `sfx-library/index.json`.

Prepare one or more listing projects:

```bash
npm run ebay:cinematic-ads -- prepare --item-ids 398160795273,398166069187
```

That creates:

```text
outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/
  workbench.json
  <item-id>/
    listing.json
    higgsfield-brief.md
    higgsfield-brief.json
    story-broll-plan.md
    story-broll-prompts.txt
    01-actual-listing-photo.jpg
    ...
    higgsfield-renders/
    story-broll/
```

The brief is strict on purpose: the actual listing photos are the source of truth, and every generated shot should preserve the exact item, condition, labels, and included accessories. Import the downloaded photos or source image URLs into Higgsfield, render the short cinematic clips from the shot prompts, then place the finished MP4/MOV/WebM clips in `higgsfield-renders/`.

When the Higgsfield MCP tools are visible in Codex, import the image URLs with Higgsfield's media import tool, then call its video generation tool with the prompts in `higgsfield-brief.json`. If `codex mcp list` shows `higgsfield` enabled but the tools are not exposed in the current task, restart/re-auth the MCP session before trying to automate render creation.

Before spending credits, you can build a competitive creative blueprint from Kalodata, Automatio, TikTok, YouTube, or hand-curated competitor rows:

One-command live-listing workflow:

```bash
npm run ebay:cinematic-ads -- competitive-plan \
  --max-listings 3 \
  --credit-budget 60 \
  --max-higgs-shots 1 \
  --ad-strategy high-energy \
  --run-control-loop \
  --run-higgsfield-renders \
  --higgs-render-model seedance_2_0_mini \
  --higgs-render-dry-run \
  --higgs-render-skip-cost
```

That ranks the live eBay listings by ROI/creative need, downloads the actual listing photos into `projects/`, seeds competitor references with public YouTube metadata by default, analyzes the selected reference video as a bounded research clip, and writes `competitive-pipeline-manifest.json` plus one `creative-blueprint.md` and `reference-video-analysis/shot-replica-map.md` per listing. With `--run-control-loop`, the same command continues into preview rendering, technical QA, premium render packet prep, and the Higgsfield handoff queue/review board. Add `--run-higgsfield-renders` to let the top-level command create/resume Higgsfield jobs from the premium plan before collection and finalization; use `--higgs-render-dry-run --higgs-render-skip-cost` first to prove the queue and budget without spending credits. Use `--competitors /path/to/kalodata-export.csv` to blend Kalodata, Automatio, TikTok, or hand-curated competitor rows into the same ranking pass. Use `--no-analyze-reference-video` for a faster metadata-only run.

If eBay/MCP traffic is rate-limited, rerun the same planner from saved truth snapshots instead of waiting on the live API:

```bash
npm run ebay:cinematic-ads -- competitive-plan \
  --dashboard-file exports/ebay-listing-performance-dashboard.json \
  --workbench-file exports/ebay-listing-asset-workbench.json \
  --competitors exports/automatio-kalodata.csv \
  --no-download \
  --run-control-loop \
  --control-loop-dry-run \
  --run-higgsfield-renders \
  --higgs-render-dry-run \
  --higgs-render-skip-cost
```

`--dashboard-file` replaces the live `ebay_get_listing_performance_dashboard` call, and `--workbench-file` replaces the live `ebay_get_listing_asset_workbench` call. The workbench snapshot should include the same `manifest.listings[]` shape that the MCP returns, with each listing's local `directory`, `images[].path`, and source metadata. This makes the competitor-video pipeline reproducible from a frozen eBay/export state.

Single prepared-listing workflow:

```bash
npm run ebay:creative-intel -- plan \
  --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273 \
  --competitors /path/to/kalodata-export.csv
```

This ranks similar product videos, extracts the winning structure, and writes `competitive-creative/creative-blueprint.md`. It does not use competitor footage in the final ad. The blueprint copies only the strategy: hook pattern, beat order, pacing, proof density, B-roll intent, SFX style, and CTA role. Final assets still come from our own listing photos, owned/generated product-preserving video, licensed music, licensed SFX, and cleared B-roll.

The import keeps trend evidence from Kalodata/Automatio-style exports. Useful columns include `Product Title`, `Video URL`, `Hook`, `Caption`, `Duration Seconds`, `Video Views`, `Product Units Sold`, `Product GMV`, `GMV Growth Rate`, `Video Likes`, `Video Comments`, `Video Shares`, `Engagement Rate`, `Posting Date`, `Shot Breakdown`, and `Audio Notes`. Each run writes `competitor-trend-report.json` and `competitor-trend-report.md` so the selected structure can be inspected by product fit and trend evidence before any paid render.

When `Shot Breakdown` is present, the architect maps those ordered beats directly into the blueprint's `beats[].competitor_pattern` fields for structure-only copying. `Audio Notes` are preserved as analysis-only beat guidance so we can recreate the sound design with licensed/local music and SFX instead of competitor audio.

Kalodata should be treated as an export source, not a hidden brittle scraper inside ClipCaptionAI. It is JavaScript-rendered, login-gated, paginated, and anti-bot protected, so use Automatio or another logged-in browser workflow to export CSV/JSON rows, then feed those rows to `--competitors`. Held listings also get `research/research-brief.md` with exact search queries, required columns, and the rerun command.

If you do not have a Kalodata export yet, run the same command without `--competitors`; it writes `competitive-creative/kalodata-automatio-prompt.md` with the exact extraction prompt and fields to collect. Add `--discover-youtube` to seed public YouTube metadata links for manual review:

```bash
npm run ebay:creative-intel -- plan \
  --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273 \
  --discover-youtube
```

For the closest "1:1 structure copy" workflow, add `--analyze-reference-video`. This downloads only a bounded research clip from the selected reference, detects scene cuts, extracts a contact sheet, and writes a shot-by-shot replica map. The final commercial asset still cannot use competitor footage or audio:

```bash
npm run ebay:creative-intel -- plan \
  --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273 \
  --discover-youtube \
  --analyze-reference-video \
  --analysis-max-seconds 30
```

Render a product-safe preview MP4 from the blueprint and shot map before spending paid generation credits:

```bash
npm run ebay:render-blueprint-ad -- \
  --blueprint outputs/competitive-plan-proof/.../competitive-creative/<item-id>/creative-blueprint.json
```

This creates `final/<item-id>-competitive-preview-ad.mp4`, a proof frame, and an audit manifest. It uses actual listing photos, local/cleared B-roll when available, local music, and local SFX. It is meant for creative QA and iteration; use Higgsfield renders for the final premium product-preserving hero shots when the preview direction is approved.

For a batch QA pass across every listing blueprint from a competitive-plan run:

```bash
npm run ebay:render-blueprint-batch -- \
  --blueprints-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative \
  --duration 12 \
  --limit 5
```

That recursively finds each `creative-blueprint.json`, renders the same product-safe preview MP4 for each listing, and writes `competitive-preview-render-manifest.json` with the final video, proof frame, selected reference, and render status per item. Use this to choose which listings deserve Higgsfield credits before making premium product-preserving shots.

For the full post-blueprint control loop in one command:

```bash
npm run ebay:competitive-loop -- \
  --blueprints-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

That runs preview rendering, technical QA, premium render packet prep, a batch Higgsfield handoff export, Higgsfield output collection, finalizer readiness, pipeline status, per-listing creative packet export, and the HTML review board. If you already have a preview manifest, use `--preview-manifest` instead of `--blueprints-dir`. Use `--skip-handoff` only when you already have a current render queue and runbook.

Run a quality gate on the preview videos before approving paid generation:

```bash
npm run ebay:competitive-qa -- \
  --preview-manifest outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-preview-render-manifest.json
```

That writes `competitive-video-qa-report.json` and `competitive-video-qa-report.md`. It checks vertical resolution, duration, audio stream, audio loudness, black frames, frozen/slideshow risk, and scene-change density. Treat `fail` as a hard stop and `warn` as a review requirement before upload.

After preview QA, prepare the paid-generation packet:

```bash
npm run ebay:prep-premium-renders -- \
  --preview-manifest outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-preview-render-manifest.json \
  --roi-plan outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/higgsfield-roi-plan.json \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

That writes `competitive-premium-render-plan/competitive-premium-render-plan.json` and per-listing Higgsfield packets in `projects/<item-id>/higgsfield/`. Each packet includes actual listing image references, cost/render shell scripts, strict product-truth QA, output filenames for `higgsfield-renders/`, and the final assemble command. When the selected competitor export includes a usable `Shot Breakdown`, the premium render jobs are generated from the blueprint beat map itself, so the first paid clips follow the imported hook/proof/b-roll/CTA timing instead of falling back to generic hero shots. The command does not spend credits by itself; run the generated `render-competitive-premium-shots.sh` only for approved listings.

By default, premium prep holds listings whose selected structure is only a fallback template or has weak competitor-fit evidence. Those items appear as `research_review_required` in the status board. Add a real Kalodata/Automatio/TikTok/YouTube competitor export and rerun, or pass `--allow-weak-research` only when you intentionally want to make a direct product ad without competitor trend evidence.

To hand the whole premium plan to Higgsfield/another agent without opening each listing folder:

```bash
npm run ebay:competitive-handoff -- \
  --premium-plan outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json
```

That writes `competitive-render-handoff/` with `render-queue.json`, `render-queue.jsonl`, `render-url-map.template.json`, `higgsfield-render-runbook.md`, and `run-higgsfield-cli-jobs.sh`. Beat-driven jobs keep the competitor pattern, our original execution, caption intent, SFX intent, and audio feel in both the machine queue and human runbook. Use it to render/save the missing product-preserving MP4s to the exact `higgsfield-renders/<job-id>.mp4` paths, then run the collector/finalizer loop.

To render the queue directly through the Higgsfield CLI with budget and resume controls:

```bash
npm run ebay:competitive-higgsfield-render -- \
  --premium-plan outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json \
  --model seedance_2_0_mini \
  --credit-budget 40
```

That writes `competitive-higgsfield-render-run/competitive-higgsfield-render-manifest.json` plus `higgsfield-render-url-map.json`. It skips completed `*.competitive-job.json` files unless `--overwrite` is set, omits unsupported Mini-only flags like `--mode`, and can run safely as `--dry-run --skip-cost` before spending credits. Feed its URL map into `ebay:collect-premium-renders`.

To package each listing into a portable creative packet for a generator/operator:

```bash
npm run ebay:competitive-packets -- \
  --status outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-video-pipeline-status.json
```

That writes `competitive-creative-packets/<item-id>-*/` folders containing `creative-packet.md/json`, copied product reference images, preview proof assets, a per-listing render queue, URL-map template, competitor-inspired beat map, QA evidence, and a product-truth rejection checklist. If a listing is held as `research_review_required`, the packet also gets `research/research-brief.md`, `research/research-brief.json`, and `research/competitor-import-template.csv` with exact Kalodata/Automatio columns, search queries, and the rerun command.

For a batch of held listings, export one consolidated Automatio/Kalodata research queue:

```bash
npm run ebay:competitive-research-queue -- \
  --status outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-video-pipeline-status.json
```

That writes `competitive-research-queue/automatio-search-queue.csv`, `competitive-research-queue.json`, and `competitive-research-queue.md`. The CSV has one row per search query with the item, issue summary, required export columns, packet folder, competitor-import path, and rerun command.

If Automatio/Kalodata gives you one consolidated export for several listings, route it back into the packet templates instead of copying rows by hand. The export should include `Item ID`, `Competitor Import Template`, `Packet Dir`, or the exact queued `Search Query` plus the competitor columns:

```bash
npm run ebay:competitive-research-import -- \
  --queue outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-research-queue/competitive-research-queue.json \
  --results /path/to/automatio-results.csv
```

That writes `competitive-research-import/competitive-research-import-manifest.json`, dedupes repeated competitor rows, and fans each matched result into the correct `research/competitor-import-template.csv`. Add `--dry-run` to preview routing without editing templates, or `--replace` when the export should become the whole template content.

For the normal operator loop, import the consolidated export and immediately validate which listings are ready to rerun:

```bash
npm run ebay:competitive-research-loop -- \
  --queue outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-research-queue/competitive-research-queue.json \
  --results /path/to/automatio-results.csv \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

By default this writes the matched rows into the local packet templates, then runs the processor in dry-run mode so you can inspect planned reruns before spending credits. It also writes `competitive-research-import-loop/competitive-research-import-review.html`, an operator board showing imported competitor rows, trend evidence, product-match score/shared terms, skipped rows, and planned rerun commands. Treat low product-match warnings as a manual review stop even when trend metrics are strong. Add `--dry-run` to preview import routing without modifying templates. Add `--run-reruns` only after the review board and dry-run manifest show the right selected listings.

After multiple packet templates have been filled, process every ready one in a batch:

```bash
npm run ebay:competitive-research-process -- \
  --queue outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-research-queue/competitive-research-queue.json \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

The processor skips empty templates, requires at least one row with product title and video URL, requires trend evidence, requires copyable structure evidence, and requires at least one competitor row to meet the product-match threshold before a held listing can move toward premium render spend. Accepted structure fields include `Hook`, `Shot Breakdown`, `Caption`, `Video Title`, `Duration Seconds`, `Audio Notes`, and `Hashtags`. Accepted trend fields include `Video Views`, `Items Sold`, `Total Revenue`, `Revenue Growth Rate`, `Product GMV`, `GMV Growth Rate`, `Product Units Sold`, `Video Likes`, `Video Comments`, `Video Shares`, `Engagement Rate`, and `Posting Date`. The default product-match threshold is `0.2`; tune with `--min-product-match-score`. Use `--dry-run` first to see which listings will move. Use `--allow-no-trend-metrics` only when you intentionally want to proceed from product-fit evidence without measured trend data, `--allow-low-product-match` only after manually approving a weak title-match import, and `--allow-weak-structure` only when you accept that the architect will infer structure from sparse reference data.

After filling a held packet's `research/competitor-import-template.csv` with real Automatio/Kalodata rows, rerun that listing with one command:

```bash
npm run ebay:competitive-research-rerun -- \
  --packet-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-creative-packets/<item-id>-slug \
  --competitors outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-creative-packets/<item-id>-slug/research/competitor-import-template.csv \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

The rerun helper infers the original listing project from the packet/status/preview breadcrumbs, rebuilds the competitive blueprint with the new competitor export, renders a fresh product-safe preview, runs QA, prepares premium Higgsfield packets, exports the handoff queue, rebuilds status, and refreshes the review board. If the imported competitor rows have a real video URL, product fit, and trend evidence, the listing should move from `research_review_required` to the premium render queue.

Once approved Higgsfield clips have been saved to the expected `higgsfield-renders/` paths, finalize all ready listings in one pass:

If Higgsfield gives you direct video URLs or downloaded files, import them into the expected paths first:

```bash
npm run ebay:collect-premium-renders -- \
  --premium-plan outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json \
  --url-map render-urls.json
```

`render-urls.json` can be either `{ "<item-id>": { "<job-id>": "/path/or/url/to/video.mp4" } }` or an array of `{ "item_id", "job_id", "url" }` rows. The collector also scans generated `*.competitive-job.json` files for result URLs, imports the clip into `higgsfield-renders/<job-id>.mp4`, and verifies the file has a video stream.

```bash
npm run ebay:finalize-premium-ads -- \
  --premium-plan outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json
```

That writes `competitive-premium-finalize-manifest.json`, assembles only listings whose expected generated clips exist, probes the final MP4s, and reports missing clips as `not_ready`. It intentionally does not create slideshow fallbacks.

At any point, audit the whole competitive-video run and get the next action per listing:

```bash
npm run ebay:competitive-status -- \
  --premium-plan outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json
```

That writes `competitive-video-pipeline-status.json` and `competitive-video-pipeline-status.md` next to the premium plan. It merges the preview manifest, premium render packet, collector manifest, finalizer manifest, file existence checks, and `ffprobe` results into statuses like `preview_ready`, `waiting_for_generated_clips`, `ready_to_finalize`, and `final_ready`. Use it as the operator dashboard before spending more credits or uploading a listing video.

For a visual operator board with the preview video, selected reference, trend evidence, blockers, and next action per listing:

```bash
npm run ebay:competitive-review -- \
  --status outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-video-pipeline-status.json
```

That writes `competitive-review-board.html` next to the status file. Open it before running paid renders or uploads; it lets you review the actual preview MP4, product-fit/trend rationale, missing Higgsfield outputs, handoff runbook/queue links, creative packet folders, and source manifests in one place.

For a story-building finish, use the generated `story-broll-prompts.txt`:

Start with owned/local footage:

```bash
npm run ebay:cinematic-ads -- seed-local-broll \
  --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273
```

Then search for extra clips only if the local footage does not carry the story:

```bash
npm run ebay:cinematic-ads -- find-broll \
  --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273 \
  --energy max
```

This uses the existing ClipCaptionAI B-roll finder and copies selected clips into `story-broll/`. Search/download runs through `yt-dlp`, so no YouTube API key is required. For live eBay ads, use only footage you have rights to use commercially; movie/TV scene search is useful for creative reference, not for publishing unless rights are cleared.

Assemble the finished Higgsfield clips:

```bash
npm run ebay:cinematic-ads -- assemble \
  --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273 \
  --energy max
```

The assembler refuses to make a slideshow fallback. If there are no rendered clips in `higgsfield-renders/`, it stops so the listing does not get a low-effort placeholder by accident. With `--energy max`, it also writes `final/<item-id>-cinematic-ad.sfx-plan.json` so every sound effect and timing choice is auditable.

After reviewing the final video and proof frame, upload and stage an eBay attachment:

```bash
npm run ebay:cinematic-ads -- upload \
  --item-id 398160795273 \
  --video outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273/final/398160795273-cinematic-ad.mp4 \
  --attach \
  --poll
```

Add `--apply-immediately` only when the video is approved for the live listing. Without it, the script writes the eBay revise response beside the final video for review.

Each run creates a fresh folder:

```text
outputs/run-YYYY-MM-DD-HHMMSS/
  links.txt
  manifest.json
  caption-style.json
  downloads/
  generated-assets/
  captioned-clips/
```

The current `outputs` folder is kept clean by separating every run into its own dated folder. Temporary Remotion media staging is cleaned after each full run finishes.

## Main Commands

These are the stable, everyday operator commands. Lower-level helper scripts exist too, but if you are using the toolkit normally, stay on this surface:

Clean temporary files or old output folders:

```bash
npm run cleanup
```

Download YouTube videos from `links.txt` and stop:

```bash
npm run download:youtube -- --links links.txt
```

Download YouTube videos from `links.txt`, then chop each whole source into fixed 15-second clips:

```bash
npm run clips:fixed -- --links links.txt --segment-seconds 15
```

Download YouTube videos from `links.txt`, pick the strongest moments, and export source clips only:

```bash
npm run moments:auto -- --links links.txt --max-clips 6 --padding-seconds 2
```

Run the complete YouTube auto-clipping workflow from `links.txt`:

```bash
npm run process
```

Force AI to pick new clips instead of reusing an existing `selection.json`:

```bash
npm run process -- --reselect
```

Limit the number of clips per source video:

```bash
npm run process -- --max-clips 6
```

The double-click `RUN.command` uses `MAX_CLIPS=6` by default. To temporarily change the one-click cap from Terminal:

```bash
MAX_CLIPS=10 /Users/jonathangan/Desktop/ClipCaptionAI/RUN.command
```

Add more lead-in and tail padding around each AI-selected clip:

```bash
npm run process -- --padding-seconds 3
```

Render all selected clips as 9:16 while keeping the full horizontal video visible with black bars:

```bash
npm run process -- --vertical-contain
```

Use a different links file:

```bash
npm run process -- --links "/path/to/links.txt"
```

Useful `process` options:

| Option | Meaning |
| --- | --- |
| `--links FILE` | Links file. Defaults to local `links.txt`, then `/Users/jonathangan/Desktop/Full-Vids/links.txt`. |
| `--out-dir DIR` | Output root. Defaults to `outputs`. |
| `--run-name NAME` | Custom run folder name instead of `run-YYYY-MM-DD-HHMMSS`. |
| `--max-clips N` | Clips to select per video. Default `3`. |
| `--min-seconds N` | Minimum AI-selected core clip length. |
| `--max-seconds N` | Maximum AI-selected core clip length. |
| `--padding-seconds N` | Extra seconds before and after the selected moment. Default `2`. |
| `--boundary-lookaround-seconds N` | Max extra seconds used to snap a chosen clip to nearby thought boundaries. Default `6`. |
| `--disable-thought-snapping` | Keep raw AI-selected timestamps without boundary snapping. |
| `--review-width N` | Width used when cutting intermediate clips. Default `1280`. |
| `--review-fps N` | Render FPS for review clips. Default `15`. |
| `--selection-model ID` | OpenAI model used for selecting clips. |
| `--style-config FILE` | Caption style JSON. Defaults to `caption-style.json`. |
| `--scene-library DIR` | Folder of tagged scene clips used for context-matched cutaways. |
| `--library-config FILE` | Optional `library.config.json` used when indexing a raw local scene library. |
| `--context-scenes` | Force-enable transcript-matched scene inserts for this run. |
| `--disable-context-scenes` | Force-disable scene inserts for this run. |
| `--youtube-ingest` | Force-enable YouTube B-roll ingest while planning cutaways. |
| `--disable-youtube-ingest` | Force-disable YouTube B-roll ingest for this run. |
| `--local-scenes-only` | Use only clips already inside your local scene library. |
| `--reindex-scene-library` | Rebuild `scene-library/index.json` before processing. |
| `--reselect` | Ignore existing AI selections and choose again. |
| `--vertical` | Render as 1080x1920 with video cropped to fill. |
| `--vertical-contain` | Render as 1080x1920 with full video contained and black bars. |

Local custom-scenes example:

```bash
npm run process -- \
  --links links.txt \
  --scene-library ./custom-scenes-library \
  --library-config ./custom-scenes-library/library.config.json \
  --local-scenes-only \
  --disable-sound-effects \
  --style-config styles/custom-scenes-reference.json
```

## Manual Caption Fixes

List clips in the latest run:

```bash
npm run rerender:clip -- --list
```

List clips in an older run:

```bash
npm run rerender:clip -- --run "/Users/jonathangan/Desktop/ClipCaptionAI/outputs/run-2026-06-20-182812" --list
```

Open the listed `.captions.json` file, edit only the `"text"` values, then rerender:

```bash
npm run rerender:clip -- --clip 1
```

Rerender a named clip from an older run:

```bash
npm run rerender:clip -- \
  --run "/Users/jonathangan/Desktop/ClipCaptionAI/outputs/run-2026-06-20-182812" \
  --clip "03-your-website-is-leaking-money"
```

Rerender that older clip as 9:16 contain with black bars:

```bash
npm run rerender:clip -- \
  --run "/Users/jonathangan/Desktop/ClipCaptionAI/outputs/run-2026-06-20-182812" \
  --clip "03-your-website-is-leaking-money" \
  --vertical-contain
```

By default, rerenders write `*.corrected.mp4` next to the original. To overwrite the original captioned clip:

```bash
npm run rerender:clip -- --clip 1 --replace
```

Useful `rerender:clip` options:

| Option | Meaning |
| --- | --- |
| `--run DIR` | Run folder to use. Defaults to latest `outputs/run-*`. |
| `--clip ID` | Clip number, title fragment, slug, or full `.captions.json` path. |
| `--list` | Print editable clips for a run. |
| `--replace` | Overwrite `*.captioned.mp4` instead of creating `*.corrected.mp4`. |
| `--out FILE` | Write to a custom output path. |
| `--vertical` | Rerender as 1080x1920 cropped fill. |
| `--vertical-contain` | Rerender as 1080x1920 contained with black bars. |
| `--foreground-video FILE` | Optional transparent foreground/subject layer rendered above captions. |
| `--position NAME` | Override caption position for this render. |
| `--style-config FILE` | Use a different style JSON. |
| `--highlight-words CSV` | Override highlighted words for this render. |

## Context-Matched Scene Inserts

You can optionally mix in tagged cutaway footage so the clip bounces between the original speaker footage and context-matched cinematic scenes. By default, the same scene clip is used at most once inside a generated short.

This works with a local curated scene library, and it can also auto-build that library from YouTube videos.

One-off mix command:

```bash
npm run scene:mix -- \
  --video "/path/to/raw-clip.mp4" \
  --captions "/path/to/raw-clip.captions.json" \
  --out "/path/to/raw-clip.scene-mix.mp4"
```

Enable it for the full pipeline:

```bash
npm run process -- --context-scenes
```

The same mixed source is reused automatically by `rerender:clip` when a `*.scene-mix.mp4` exists next to the raw clip.

One-off YouTube ingest:

```bash
npm run scene:ingest:youtube-cc -- \
  --query "money motivation movie scene" \
  --max-downloads 2 \
  --max-duration-seconds 60
```

If `caption-style.json` has `contextScenes.youtubeIngest.enabled: true`, the mixer can also auto-ingest matching clips while it plans cutaways from the transcript.

## Manual B-Roll Finder

Use this when you are editing manually and only want related B-roll clips, without running transcription, AI clip selection, captions, or rendering.

1. Put one B-roll idea per line in `broll-prompts.txt`.
2. Double-click `BROLL.command`, or run:

```bash
cd /Users/jonathangan/Desktop/ClipCaptionAI
npm run broll:find
```

Every run creates a separate folder:

```text
outputs/broll-run-YYYY-MM-DD-HHMMSS/
  prompts.txt
  manifest.json
  01-first-prompt/
    clips/
      01-01-example.mp4
      01-01-example.mp4.scene.json
  02-second-prompt/
    clips/
```

The clips are also cached in `scene-library/`, so repeated prompts do not redownload the same YouTube video when it already exists locally. By default, `broll:find` uses `yt-dlp` in high-quality mode: it searches more cinematic variants, prefers 1080p-or-better sources when YouTube exposes them, and downloads a short usable section from the selected source.

Useful `broll:find` options:

| Option | Meaning |
| --- | --- |
| `--prompts FILE` | Prompt text file. Defaults to `broll-prompts.txt`. |
| `--out-dir DIR` | Output root. Defaults to `outputs`. |
| `--run-name NAME` | Custom output folder name. |
| `--scene-library DIR` | Reusable clip cache. Defaults to `scene-library`. |
| `--quality fast\|standard\|high` | `yt-dlp` search/download quality mode. Defaults to `high`. |
| `--max-results N` | YouTube results searched per prompt. |
| `--max-downloads N` | Clips selected/copied per prompt. |
| `--max-duration-seconds N` | Seconds downloaded from each selected source. Defaults to `20` in high-quality mode. |
| `--min-candidate-score N` | Search score cutoff. Defaults to `6` in high-quality mode. |
| `--max-expanded-queries N` | Search variants per prompt. Defaults to `7` in high-quality mode. |
| `--movie-scenes` | Search movie/TV/pop-culture scene queries instead of stock B-roll queries. |
| `--channel-id ID` | Restrict YouTube search to one channel. |
| `--no-copy` | Fill/update `scene-library` only, without creating prompt clip copies. |

Examples:

```bash
npm run broll:find -- --prompts "/path/to/ideas.txt" --max-downloads 5
```

```bash
npm run broll:find -- \
  --prompts broll-prompts.txt \
  --run-name broll-money-scenes \
  --quality high \
  --max-results 12 \
  --max-downloads 4 \
  --max-duration-seconds 20
```

Movie/TV scene style:

```bash
npm run broll:find -- \
  --prompts broll-prompts-budapest-movie-scenes.txt \
  --run-name broll-budapest-movie-scenes \
  --movie-scenes \
  --max-results 8 \
  --max-downloads 2 \
  --max-duration-seconds 240
```

Movie-scene results are candidate references, not rights-cleared assets. Review source, quality, and permissions before using them in a public post.

## Enhance An Existing Edit

Use this when you already have a mostly edited video and want ClipCaptionAI to add timed B-roll cutaways plus captions on top. It does not select/cut a new short from a long source. It keeps the full base video timeline and audio, then adds visual inserts where the transcript context benefits from motion or movie/TV-style references.

```bash
cd /Users/jonathangan/Desktop/ClipCaptionAI
npm run broll:enhance -- --video "/path/to/already-edited.mp4"
```

Every run creates:

```text
outputs/enhance-run-YYYY-MM-DD-HHMMSS/
  manifest.json
  assets/
    original-name.base-1080x1920.mp4
    original-name.captions.json
    original-name.broll-mix.mp4
    original-name.broll-mix.scene-plan.json
    original-name.broll-mix.pop-culture-scenes.json
  final/
    original-name.broll-captioned.mp4
```

Useful `broll:enhance` options:

| Option | Meaning |
| --- | --- |
| `--video FILE` | Already-edited base video to enhance. |
| `--captions FILE` | Use an existing captions JSON instead of transcribing. |
| `--run-name NAME` | Custom output folder name. |
| `--max-insertions N` | Override how many B-roll cutaways can be planned. |
| `--fps N` | Final render FPS. Default `24`. |
| `--fit cover\|contain` | Normalize source into 9:16 frame. Default `contain`. |
| `--transcription-prompt TEXT` | Helpful words/names for transcription accuracy. |
| `--disable-youtube-ingest` | Use only clips already in `scene-library`. |
| `--movie-scenes` | Prefer movie/TV scene B-roll. This is now the default for `broll:enhance`. |
| `--stock-broll` | Use the older literal/stock-style B-roll search for this run. |
| `--pop-culture-research` | Force movie/TV reference query enrichment. |
| `--no-render` | Stop after transcription and B-roll mix. |

Example:

```bash
npm run broll:enhance -- \
  --video "/Users/jonathangan/Desktop/0702.MP4" \
  --run-name budapest-existing-edit \
  --max-insertions 12 \
  --pop-culture-research
```

### Pop Culture Query Enrichment

The scene planner can use iconic movie/TV/cartoon/anime/reality/sports-doc references to improve the actual B-roll YouTube searches. For each planned insertion it infers the emotional meaning, finds recognizable scene concepts, then injects those scene searches into the same query list used by YouTube ingest and scene scoring.

The JSON trace files, and optional Markdown trace files, show why certain movie/TV search queries were added.

It runs automatically when `caption-style.json` has:

```json
"contextScenes": {
  "popCultureResearch": {
    "enabled": true,
    "model": "gpt-4.1",
    "candidatesPerSegment": 8,
    "useForYoutubeQueries": true,
    "maxQueriesPerInsertion": 4,
    "minQueryConfidence": 9,
    "writeMarkdown": false
  }
}
```

Each planned scene mix writes trace files like:

```text
01-example.scene-mix.pop-culture-scenes.json
01-example.scene-mix.pop-culture-scenes.md
```

Run the pop-culture query pass manually for an existing scene plan:

```bash
npm run scene:research-pop-culture -- \
  --scene-plan "/path/to/clip.scene-mix.scene-plan.json"
```

Useful options:

| Option | Meaning |
| --- | --- |
| `--pop-culture-research` | Force-enable movie/TV candidate research for a scene mix. |
| `--disable-pop-culture-research` | Skip movie/TV candidate research for a scene mix. |
| `--model ID` | Model for the manual research command. |
| `--candidates N` | Candidate scenes per segment, from 5 to 10. |
| `--json-only` | Skip the companion Markdown report. |

Rights note: public YouTube availability is not treated as clearance. The query system prefers official clip/trailer/promo searches when possible, but you should still use official/licensed/owned/public-domain/stock/AI-generated footage, or manually review rights before using any movie or TV clip.

## Automatic Sound Effects

Drop sound files into `sfx-library/`, then standardize and index them:

```bash
npm run sfx:standardize
```

Full pipeline runs automatically add low-volume contextual SFX when `caption-style.json` has `soundEffects.enabled: true`. The final render uses `*.sfx-mix.mp4` as its source, and each mix writes a `*.sfx-plan.json` next to it so you can inspect exactly which sounds were chosen. By default, the same SFX file is used at most once inside a generated short.

One-off SFX mix:

```bash
npm run sfx:mix -- \
  --video "/path/to/clip-or-scene-mix.mp4" \
  --captions "/path/to/clip.captions.json" \
  --out "/path/to/clip.sfx-mix.mp4"
```

Useful full-run options:

| Option | Meaning |
| --- | --- |
| `--sound-effects` | Force-enable automatic SFX for this run. |
| `--disable-sound-effects` | Skip SFX mixing for this run. |
| `--sfx-library DIR` | Use a different indexed SFX library folder. |

## Single Clip Commands

Transcribe one video or clip:

```bash
npm run transcribe -- \
  --video "/path/to/clip.mp4" \
  --out "outputs/clip.captions.json"
```

Render one clip with an existing captions file:

```bash
npm run render:clip -- \
  --video "/path/to/clip.mp4" \
  --captions "outputs/clip.captions.json" \
  --out "outputs/clip.captioned.mp4"
```

Render only a small frame range for a fast proof:

```bash
npm run render:clip -- \
  --video "/path/to/clip.mp4" \
  --captions "outputs/clip.captions.json" \
  --out "outputs/proof.mp4" \
  --frames 140-180
```

Render one clip as 9:16 contain:

```bash
npm run render:clip -- \
  --video "/path/to/clip.mp4" \
  --captions "outputs/clip.captions.json" \
  --out "outputs/clip.vertical-contain.mp4" \
  --vertical-contain
```

Useful `render:clip` options:

| Option | Meaning |
| --- | --- |
| `--video FILE` | Required source video. |
| `--captions FILE` | Required caption JSON. |
| `--out FILE` | Required rendered mp4 path. |
| `--width N` / `--height N` | Force output dimensions. |
| `--fps N` | Force output FPS. |
| `--vertical` | 1080x1920 cropped fill. |
| `--vertical-contain` | 1080x1920 contained with black bars. |
| `--foreground-video FILE` | Optional transparent foreground/subject layer rendered above captions. |
| `--fit cover\|contain` | CSS video fit. Normally controlled by `caption-style.json`. |
| `--position NAME` | `left-hook`, `right-hook`, `lower-left`, `center-bottom`, or `center-impact`. |
| `--combine-ms N` | Caption grouping window. |
| `--highlight-words CSV` | Words to render in the alternate font. |
| `--text-opacity N` | Caption fill opacity from `0` to `1`. |
| `--uppercase` | Force caption text uppercase. |
| `--frames START-END` | Render only a frame range for proofing. |

## Caption Style Config

Edit:

```text
caption-style.json
```

The one-click runner, `npm run process`, `npm run smart:clips`, `npm run render:clip`, and `npm run rerender:clip` all read this file automatically unless you pass `--style-config`.

### Layout And Export Fields

| Field | Example | What it controls |
| --- | --- | --- |
| `position` | `"center-impact"` | Caption preset. Supported: `left-hook`, `right-hook`, `lower-left`, `center-bottom`, `center-impact`. |
| `customPosition` | `{ "right": "9%", "top": "48%" }` | Overrides preset CSS positioning. Use percentages or CSS lengths. |
| `verticalContain` | `true` | Exports 1080x1920 and keeps the full source visible with black bars. |
| `outputAspect` | `"9:16"` | Makes render commands treat the output as vertical. Use `"source"` for source aspect. |
| `fit` | `"contain"` | Video object fit. `contain` shows the full video; `cover` fills/crops. |
| `videoFilter` | `"contrast(1.08) saturate(1.14)"` | CSS filter applied to the video before captions. Use `null` for none. |
| `videoBorderRadius` | `"38px"` | Rounds the video corners, useful for a repost/screen-recording feel. |
| `backgroundOverlay` | CSS gradient or `null` | Optional readability overlay above video and behind captions. |

For full horizontal video inside 9:16:

```json
{
  "verticalContain": true,
  "outputAspect": "9:16",
  "fit": "contain"
}
```

For normal source-aspect exports:

```json
{
  "verticalContain": false,
  "outputAspect": "source",
  "fit": "cover"
}
```

### Context Scene Fields

`caption-style.json` can also drive transcript-matched scene inserts:

| Field | Example | What it controls |
| --- | --- | --- |
| `contextScenes.enabled` | `true` | Turns scene mixing on for `process` / `smart:clips`. |
| `contextScenes.libraryDir` | `"./scene-library"` | Folder containing your scene clips or an `index.json` manifest. |
| `contextScenes.planningModel` | `"gpt-4.1-mini"` | OpenAI model used to choose cutaway timing/query ideas. |
| `contextScenes.maxInsertionsPerClip` | `10` | Maximum scene inserts in one short clip. Higher values create faster visual pacing. |
| `contextScenes.minInsertionSeconds` | `0.7` | Minimum cutaway duration. |
| `contextScenes.maxInsertionSeconds` | `2.6` | Maximum cutaway duration. |
| `contextScenes.minGapSeconds` | `0.2` | Minimum gap between cutaways. |
| `contextScenes.edgeBufferSeconds` | `0.6` | Keeps cutaways away from the first/last part of the clip. |
| `contextScenes.targetCoverageRatio` | `0.5` | Planner target for how much of the finished short should be cutaway/B-roll footage. |
| `contextScenes.maxCoverageRatio` | `0.55` | Hard cap for how much of the clip can be replaced by scene inserts. |
| `contextScenes.transcriptChunkWords` | `8` | Transcript chunk size sent to the planner. |
| `contextScenes.allowSceneReuseWithinClip` | `false` | When `false`, each scene clip can be used only once inside a generated short. If no unused match is strong enough, that insert is skipped. |
| `contextScenes.popCultureResearch.enabled` | `true` | Adds iconic movie/TV/cartoon/anime/reality/sports-doc scene concepts to each cutaway's YouTube searches. |
| `contextScenes.popCultureResearch.maxQueriesPerInsertion` | `4` | Maximum pop-culture scene searches injected into each cutaway query set. |
| `contextScenes.popCultureResearch.minQueryConfidence` | `9` | Minimum confidence for a pop-culture scene query to be used automatically. |
| `contextScenes.queryStyle.queriesPerInsertion` | `3` | Number of distinct AI-generated YouTube search phrases requested for each planned cutaway. |
| `contextScenes.queryStyle.maxExpandedQueriesPerBase` | `1` | Number of search variants to run for each AI query after style expansion. Keep low to avoid too much generic stock footage. |
| `contextScenes.queryStyle.minCandidateScore` | `20` | Minimum metadata score before a searched video can be downloaded. Raise this to be pickier. |
| `contextScenes.queryStyle.movieSceneMinCandidateScore` | `20` | Optional stricter score floor used when `--movie-scenes` is active. |
| `contextScenes.queryStyle.minCoreQueryMatches` | `2` | Required number of non-style query ideas, such as `homeless` or `car`, that should match candidate metadata before download. |
| `contextScenes.queryStyle.preferMotion` | `true` | Tells the planner/search expander to favor moving shots and visible action. |
| `contextScenes.queryStyle.preferCinematic` | `true` | Tells the planner/search expander to favor cinematic/commercial-looking clips. |
| `contextScenes.queryStyle.preferMovieScenes` | `true` | Biases search expansion and scoring toward official movie/TV scene clips instead of generic stock footage. |
| `contextScenes.queryStyle.avoidTalkingHeads` | `true` | Downranks podcasts, interviews, reactions, lectures, and similar low-cutaway-value results. |
| `contextScenes.queryStyle.officialClipBoost` | `12` | Ranking boost for results that look like official clips or known scene channels. |
| `contextScenes.queryStyle.movieSceneBoost` | `14` | Ranking boost for titles/descriptions that explicitly look like movie, film, TV, or iconic scene clips. |
| `contextScenes.queryStyle.stockFootagePenalty` | `18` | Penalty applied to stock, royalty-free, no-copyright, generic B-roll, and ad-like results when movie-scene mode is on. |
| `contextScenes.queryStyle.watermarkPenalty` | `55` | Strong penalty for metadata suggesting watermarks, preview-only footage, or stock-library previews. |
| `contextScenes.queryStyle.trailerPenalty` | `14` | Penalty for trailers/teasers/promos when you want actual scene inserts. |
| `contextScenes.queryStyle.lowQualityPenalty` | `16` | Penalty for top-10 lists, recaps, essays, reactions, fan edits, and Shorts-style reposts. |
| `contextScenes.queryStyle.nonScenePenalty` | `22` | Penalty when movie-scene mode is active but a result does not look like an actual movie/TV scene result. |
| `contextScenes.queryStyle.styleModifiers` | `["cinematic", "4k"]` | Search words added to query variants and boosted during candidate ranking. |
| `contextScenes.queryStyle.themeBoosts` | `["money", "discipline"]` | Theme words that get a small ranking boost when found in candidate metadata. |
| `contextScenes.queryStyle.avoidTerms` | `["podcast", "slideshow"]` | Words/phrases that downrank candidate videos before download. |
| `contextScenes.youtubeIngest.enabled` | `true` | Lets the mixer auto-ingest YouTube clips into `scene-library`. |
| `contextScenes.youtubeIngest.maxResultsPerQuery` | `4` | YouTube search results fetched for each planner query. |
| `contextScenes.youtubeIngest.maxDownloadsPerQuery` | `1` | Maximum new scene clip downloaded for each planner query. Keeping this low spreads downloads across more distinct queries. |
| `contextScenes.youtubeIngest.maxDurationSeconds` | `60` | Skips videos longer than this. |
| `contextScenes.youtubeIngest.channelId` | `null` | Optional channel restriction for scene ingest. |

Example:

```json
{
  "contextScenes": {
    "enabled": true,
    "libraryDir": "./scene-library",
    "planningModel": "gpt-4.1-mini",
    "maxInsertionsPerClip": 10,
    "minInsertionSeconds": 0.7,
    "maxInsertionSeconds": 2.6,
    "minGapSeconds": 0.2,
    "edgeBufferSeconds": 0.6,
    "targetCoverageRatio": 0.5,
    "maxCoverageRatio": 0.55,
    "transcriptChunkWords": 8,
    "allowSceneReuseWithinClip": false,
    "popCultureResearch": {
      "enabled": true,
      "model": "gpt-4.1",
      "candidatesPerSegment": 8,
      "useForYoutubeQueries": true,
      "maxQueriesPerInsertion": 4,
      "minQueryConfidence": 9,
      "writeMarkdown": false
    },
    "queryStyle": {
      "queriesPerInsertion": 3,
      "maxExpandedQueriesPerBase": 1,
      "minCandidateScore": 12,
      "minCoreQueryMatches": 2,
      "preferMotion": true,
      "preferCinematic": true,
      "avoidTalkingHeads": true,
      "styleModifiers": ["cinematic", "4k", "close up", "dramatic", "slow motion", "commercial", "b roll"],
      "themeBoosts": ["money", "discipline", "faith", "urgency", "luxury", "transformation", "motivation"],
      "avoidTerms": ["podcast", "interview", "reaction", "slideshow", "lyrics", "compilation", "news", "talk show", "meme", "anime", "cartoon", "gameplay", "music video", "trailer", "funny", "recreates", "ishowspeed", "streamer", "vlog", "prank", "challenge", "shorts", "instruction", "instructions", "tutorial", "review", "unboxing", "toy", "charging", "how to", "product", "killed", "kills", "stabbed", "stabbing", "shooting", "shot", "carjacking", "sheriff", "deputies", "deputy", "county", "hcso", "says", "police", "crime", "suspect", "arrested", "dead", "death", "homicide", "subscribe", "report", "reporter", "breaking", "cbs", "fox", "abc", "nbc", "ktla", "couple", "romantic", "romance", "kissing", "kiss", "sound", "effect", "effects", "sfx"]
    },
    "youtubeIngest": {
      "enabled": true,
      "maxResultsPerQuery": 4,
      "maxDownloadsPerQuery": 1,
      "maxDurationSeconds": 60,
      "channelId": null
    }
  }
}
```

### Sound Effect Fields

| Field | Example | What it controls |
| --- | --- | --- |
| `soundEffects.enabled` | `true` | Turns automatic SFX mixing on for `process` / `smart:clips`. |
| `soundEffects.libraryDir` | `"./sfx-library"` | Folder containing standardized SFX files and `index.json`. |
| `soundEffects.volume` | `0.065` | Base SFX volume. Keep this low so the speaker stays dominant. |
| `soundEffects.originalAudioVolume` | `1` | Original clip audio volume before SFX are mixed in. |
| `soundEffects.maxEffectsPerClip` | `8` | Maximum SFX events in one generated short. |
| `soundEffects.minGapSeconds` | `2.2` | Minimum spacing between SFX events. |
| `soundEffects.edgeBufferSeconds` | `0.45` | Avoids SFX right at the first/last frame. |
| `soundEffects.maxSfxDurationSeconds` | `1.2` | Trims long sounds so effects stay punchy. |
| `soundEffects.sceneTransitionSfxEnabled` | `true` | Adds transition-style SFX at context-scene cutaway starts. |
| `soundEffects.captionKeywordSfxEnabled` | `true` | Adds SFX on caption words that match configured context keywords. |
| `soundEffects.allowReuseWithinClip` | `false` | When `false`, each SFX file can be used only once inside a generated short. If no unused sound is available, the event is skipped. |
| `soundEffects.transitionVolumeMultiplier` | `0.78` | Makes cutaway transition sounds quieter/louder than base volume. |
| `soundEffects.keywordVolumeMultiplier` | `1` | Makes caption keyword sounds quieter/louder than base volume. |
| `soundEffects.contextKeywords` | `{ "money": ["cash"] }` | Category-to-keyword map used to pick matching SFX. Add terms here to steer context matching. |

Scene library options:

1. Drop short scene clips anywhere inside `scene-library/`.
2. Add a sidecar file next to a clip like `my-scene.mp4.scene.json`.
3. Or create a top-level `scene-library/index.json`.

When `youtubeIngest.enabled` is on, the pipeline can add new YouTube clips into this library automatically from transcript-matched search queries through `yt-dlp`; no YouTube API key is required.

If your library is a folder of raw personal clips, build metadata first:

```bash
npm run scene:index -- \
  --scene-library ./custom-scenes-library \
  --library-config ./custom-scenes-library/library.config.json
```

That writes `index.json` by scanning filenames and merging any reusable profile rules or clip overrides from `library.config.json`. A starter file lives at `examples/custom-scenes.library.config.example.json`.

Sidecar example:

```json
{
  "title": "Trading floor celebration",
  "source": "The Wolf of Wall Street",
  "description": "High-energy money, winning, status, excess",
  "tags": ["money", "wealth", "winning", "power", "celebration"],
  "startSeconds": 0,
  "endSeconds": 2.8
}
```

Index example:

```json
{
  "scenes": [
    {
      "id": "wolf-office-01",
      "file": "wolf/trading-floor-01.mp4",
      "title": "Trading floor celebration",
      "source": "The Wolf of Wall Street",
      "description": "Money, winning, power, ambition",
      "tags": ["money", "winning", "power", "ambition"],
      "startSeconds": 0,
      "endSeconds": 2.8
    }
  ]
}
```

### Font Fields

| Field | Example | What it controls |
| --- | --- | --- |
| `normalFontFamily` | `"\"Arial Rounded MT Bold\", \"Avenir Next\", sans-serif"` | Font stack for normal words. |
| `highlightFontFamily` | `"\"SignPainter\", \"Snell Roundhand\", cursive"` | Font stack for highlighted keywords. |
| `normalFontWeight` | `950` | Weight for normal words. |
| `highlightFontWeight` | `400` | Weight for highlighted words. |
| `normalFontStyle` | `"normal"` | Style for normal words. |
| `highlightFontStyle` | `"normal"` or `"italic"` | Style for highlighted words. |
| `uppercase` | `false` | Converts displayed caption text to uppercase. |

Highlighted words are chosen in this order:

1. `--highlight-words` if passed to a render command.
2. AI-selected `highlightWords` from `selection.json`.
3. `highlightedWords` from `caption-style.json`.
4. Automatic strongest-word highlighting for the visible caption tokens.

You can force certain words globally:

```json
{
  "highlightedWords": ["worth", "money", "discipline", "purpose"]
}
```

### Size, Motion, And Grouping Fields

| Field | Example | What it controls |
| --- | --- | --- |
| `combineTokensWithinMilliseconds` | `620` | Groups nearby words into the same caption moment. Higher values keep more words together. |
| `captionLayout` | `"inline-wrap"` | Caption token layout. Supported: `stacked`, `inline`, `inline-wrap`. |
| `visibleTokensBefore` | `1` | Number of previous words to keep visible beside the active word. |
| `visibleTokensAfter` | `1` | Number of upcoming words to preview beside the active word. |
| `motionPreset` | `"center-pop"` | Built-in movement. Supported: `static`, `center-pop`, `center-to-left`, `center-to-right`, `float`. |
| `motionKeyframes` | See below | Custom movement over each caption beat. Overrides `motionPreset` when present. |
| `baseFontSizeRatio` | `0.086` | Caption size as a ratio of the smaller output dimension. |
| `minFontSize` | `42` | Minimum caption font size in pixels. |
| `lineHeight` | `0.82` | Vertical rhythm when words stack. |
| `gapRatio` | `0.05` | Gap between stacked words as a ratio of font size. |
| `letterSpacing` | `"0.01em"` | CSS letter spacing for caption text. |
| `maxCaptionWidth` | `"92%"` | Maximum caption block width. Useful for huge centered captions. |
| `activeScale` | `1` | Scale for the currently spoken token. |
| `inactiveScale` | `0.62` | Scale for the previous token still visible. |
| `highlightScale` | `1.62` | Extra scale for highlighted keywords. |
| `activePopStartScale` | `0.72` | Start scale for the pop-in animation. Lower means more pop. |

`motionKeyframes` run from `at: 0` to `at: 1` during each caption beat. `xPercent` and `yPercent` are viewport percentages, so `-24` moves the caption left by about 24vw. If you want the invert-mask look to hit immediately, keep the first keyframe opacity at the same level as the rest of the beat instead of fading from `0`.

```json
{
  "position": "center-impact",
  "captionLayout": "inline-wrap",
  "motionKeyframes": [
    { "at": 0, "xPercent": 0, "yPercent": 0, "scale": 0.78, "opacity": 1 },
    { "at": 0.16, "xPercent": 0, "yPercent": 0, "scale": 1.16, "opacity": 1 },
    { "at": 0.58, "xPercent": -24, "yPercent": 0, "scale": 0.92, "opacity": 1 },
    { "at": 1, "xPercent": -24, "yPercent": 0, "scale": 0.9, "opacity": 0.98 }
  ]
}
```

### Color, Opacity, Stroke, And Shadow Fields

| Field | Example | What it controls |
| --- | --- | --- |
| `textColor` | `"#ffffff"` | Caption fill color. Hex colors respect `textOpacity`. |
| `textOpacity` | `0.92` | Caption fill opacity. Keep around `0.88`-`0.95` for translucent but readable text. |
| `normalTextColor` | `"#f5f1ea"` | Optional color override for non-highlighted words. |
| `highlightTextColor` | `"#f8f4ed"` | Optional color override for highlighted words. |
| `normalTextOpacityMultiplier` | `1` | Multiplies `textOpacity` for normal words. |
| `highlightTextOpacityMultiplier` | `1.04` | Multiplies `textOpacity` for highlighted words. |
| `textBlendMode` | `"difference"` | Global CSS `mix-blend-mode` for all caption text. |
| `normalTextBlendMode` | `"difference"` | Blend mode override for normal words. |
| `highlightTextBlendMode` | `"difference"` | Blend mode override for highlighted words. |
| `normalTextFilterCss` | `"contrast(1.08) saturate(0.92)"` | Extra CSS filter for normal words. |
| `highlightTextFilterCss` | `"contrast(1.12) saturate(0.96)"` | Extra CSS filter for highlighted words. |
| `shadowColor` | `"rgba(0, 0, 0, 0.55)"` | Main stroke/shadow color. |
| `normalStrokeRatio` | `0.045` | Stroke width for normal words relative to font size. |
| `highlightStrokeRatio` | `0.012` | Stroke width for highlighted words. |
| `minStrokePx` | `1` | Minimum text stroke width in pixels. |
| `normalTextShadow` | `null` or CSS | Custom `text-shadow` for normal words. |
| `highlightTextShadow` | `null` or CSS | Custom `text-shadow` for highlighted words. |
| `dropShadow` | `null` or CSS filter | Custom CSS `filter`, usually `drop-shadow(...)`. |

Shadow fields can use `{fontSize}` as a template value:

```json
{
  "normalTextShadow": "0 8px 12px rgba(0,0,0,0.75)",
  "highlightTextShadow": "0 6px 10px rgba(0,0,0,0.55), 0 0 18px rgba(255,255,255,0.18)",
  "dropShadow": "drop-shadow(0 5px 3px rgba(0,0,0,0.35))"
}
```

Use `null` to let the renderer use its defaults:

```json
{
  "normalTextShadow": null,
  "highlightTextShadow": null,
  "dropShadow": null
}
```

For the “letters react to the footage underneath” look, use blend modes:

```json
{
  "textColor": "#f5f1ea",
  "textOpacity": 0.62,
  "textBlendMode": "difference",
  "normalTextFilterCss": "contrast(1.08) saturate(0.92)",
  "highlightTextFilterCss": "contrast(1.12) saturate(0.96)"
}
```

## Foreground Subject Layer

The renderer supports an optional foreground/alpha video above captions:

```bash
npm run rerender:clip -- \
  --clip "/path/to/clip.captions.json" \
  --foreground-video "/path/to/transparent-subject-layer.webm"
```

This makes the layer order: background video, captions, foreground subject. If the foreground video has transparency, captions appear to pass behind the subject. The pipeline does not automatically generate subject masks yet; that requires a segmentation step that outputs a transparent foreground video for each clip.

## AI Clip Selection

Run AI selection on a local video:

```bash
npm run smart:clips -- \
  --video "/path/to/original.mp4" \
  --out-dir "outputs/smart-clips" \
  --max-clips 6
```

The selector looks for clips that are viral-worthy, motivational, inspirational, spiritually interesting, concrete, emotionally resonant, or high-retention. It avoids bland intros and tries to choose complete thought arcs.

Useful `smart:clips` options:

| Option | Meaning |
| --- | --- |
| `--video FILE` | Required source video. |
| `--out-dir DIR` | Final captioned clip folder. |
| `--work-dir DIR` | Intermediate clips/transcripts folder. |
| `--max-clips N` | Number of clips to create. |
| `--min-seconds N` | Minimum selected core length. Default `18`. |
| `--max-seconds N` | Maximum selected core length. Default `55`. |
| `--padding-seconds N` | Extra seconds before/after. Default `2`. |
| `--boundary-lookaround-seconds N` | Max extra seconds used to snap to thought boundaries. Default `6`. |
| `--disable-thought-snapping` | Keep raw AI timestamps. |
| `--reselect` | Ask AI to choose clips again. |
| `--vertical` | 1080x1920 cropped fill. |
| `--vertical-contain` | 1080x1920 contained with black bars. |
| `--selection-model ID` | OpenAI model for selection. |

## Transcription Notes

`npm run transcribe` extracts mono 16kHz audio, transcribes it, and writes both caption tokens and the full transcription response.

Provider order in `auto` mode:

1. `local-whispercpp` if `whisper-cli` is installed
2. `openai` if `OPENAI_API_KEY` is available
3. `youtube` subtitle fallback for YouTube-derived files

The default `.env.example` now pins `TRANSCRIBE_PROVIDER=local-whispercpp`, so the pipeline stays local-first unless you override it.

If an OpenAI key is present and the audio transcription did not come from OpenAI, the script also does a cheap text-only cleanup pass over the transcript. That cleanup is used for better clip selection and planning, while the rendered captions keep their original timings.

The first local whisper.cpp run auto-downloads the configured model into `models/whisper.cpp/`.

Useful options:

| Option | Meaning |
| --- | --- |
| `--provider ID` | `auto`, `local-whispercpp`, `openai`, or `youtube`. |
| `--model ID` | Transcription model. Default `whisper-1`. |
| `--local-model ID` | whisper.cpp model alias or direct path. Default `small.en`. |
| `--text-analysis-model ID` | Cheap OpenAI text model used only for transcript cleanup. Default `gpt-4.1-mini`. |
| `--disable-text-enhance` | Skip the OpenAI text cleanup layer and keep only the raw transcript. |
| `--force-text-enhance` | Require the OpenAI text cleanup layer for this run. |
| `--prompt TEXT` | Context words to improve transcription. |
| `--retries N` | Retry count for transient failures. Default `5`. |
| `--audio-bitrate RATE` | Temporary audio bitrate. Default `48k`. |
| `--chunk-seconds N` | Chunk length for longer audio. Default `180`. |

Examples:

```bash
npm run transcribe -- --video "/path/to/video.mp4" --out /tmp/captions.json
npm run transcribe -- --video "/path/to/video.mp4" --out /tmp/captions.json --provider local-whispercpp --local-model small.en
npm run transcribe -- --video "/path/to/video.mp4" --out /tmp/captions.json --provider local-whispercpp --disable-text-enhance
npm run transcribe -- --video "/path/to/video.mp4" --out /tmp/captions.json --provider openai
```

Benchmark local vs reference:

```bash
npm run transcribe:benchmark -- \
  --video "/path/to/video.mp4" \
  --sample-start 30 \
  --sample-seconds 25 \
  --candidate-provider local-whispercpp \
  --local-model small.en
```

## Caption JSON Shape

Caption files can be either a raw array or an object with a `captions` array:

```json
{
  "captions": [
    {
      "text": " worth",
      "startMs": 4900,
      "endMs": 5400,
      "timestampMs": 5150,
      "confidence": null
    }
  ]
}
```

When fixing transcription manually, edit the `"text"` values. Keep `startMs`, `endMs`, and `timestampMs` unchanged unless you intentionally want to retime the captions.

## Preview In Remotion Studio

```bash
npm run sample:props
npm run studio
```

Then open the `CaptionedClip` composition in Remotion Studio and load `outputs/studio/sample-props/sample-props.json` as props.
