# ClipCaptionAI Workflows

This file is the walkthrough home for every ClipCaptionAI workflow. The [README](../README.md) covers quickstart, the command reference, architecture, configuration sources, and testing; this file covers each workflow in depth.

## One-Click Menu

Double-click `RUN.command`, or run:

```bash
bun run menu
bunx clipcaptionai menu
```

The menu is the safest front door for everyday editing. It can download YouTube videos, download YouTube videos into a frame image, run the eBay cinematic listing ads and competitor creative blueprint lanes, slice whole videos into fixed clips, cut one local video into fixed clips, find important moments for manual editing, run YouTube clipping, auto-chapter a conversation, tighten a conversation, compress a video, caption an existing edit, enhance a video with B-roll, find standalone B-roll, rerender a generated clip, open Studio, open the latest output, and run diagnostics.

`RUN.command` and `bun run menu` open the same workflow menu. The full menu-to-command mapping lives in the [README command reference](../README.md#command-reference).

For render-producing workflows, the menu can also open an optional advanced settings prompt before the run. That prompt can override the most common live decisions without making you hand-edit `caption-style.json` first:

- style preset or custom style-config path
- captions on or off
- caption placement
- caption opacity
- vertical crop vs vertical contain
- context-scenes / B-roll on or off for supported workflows
- sound effects on or off for supported workflows

## Model-directed video runs

Use the generic `video` namespace when an AI model is directing a production from a brief and approved local assets:

```bash
clipcaptionai video plan --brief-file brief.txt --assets-dir ./approved-assets --json
clipcaptionai video inspect --run outputs/video-runs/brief --json
clipcaptionai video render --run outputs/video-runs/brief --json
clipcaptionai video qa --run outputs/video-runs/brief --json
```

For a single non-interactive pass:

```bash
bun run clipkit -- video run --brief-file brief.txt --assets-dir ./assets --dry-run --json
```

`video run` combines planning and rendering, while `--dry-run` creates the plan and planned output without rendering. The resulting `run.json` is the durable contract: it records the brief hash, approved asset hashes, shot plan, provider intent, output metadata, and QA status. A successful render is not considered complete until `video qa` passes. The generic renderer is deterministic and local; it currently creates image/video shot cards with Remotion. Use the specialized provider commands below when the model explicitly needs narration or generated marketing assets — existing caption, B-roll, YouTube, eBay, ElevenLabs, fal, and Rotato commands remain available as specialized workflows.

Read [the agent guide](AGENT_GUIDE.md) before automating the CLI and [the production support matrix](PRODUCTION_SUPPORT.md) before describing a provider or external integration as production-ready.

## Auto-Chapter a Conversation Video

Use this when you have a long conversation (podcast, interview, coaching call) and want to automatically detect topic changes, split it into chapters with titles and descriptions.

```bash
bun run chapter:auto -- --video "/path/to/conversation.mp4"
```

With video splitting:

```bash
bun run chapter:auto -- --video "/path/to/conversation.mp4" --split
```

Options:

- `--split` — export each chapter as a standalone `.mp4` file
- `--out FILE` — output chapters JSON (default: `outputs/chapters/<slug>.chapters.json`)
- `--split-dir DIR` — directory for split chapter videos
- `--provider deepseek|openai` — override auto-detected AI provider
- `--chapter-model ID` — override the default model
- `--min-chapter-seconds N` — minimum chapter length (default: 45)
- `--max-chapters N` — maximum number of chapters (default: 20)
- `--language LANG` — spoken language (default: `en`)
- `--context TEXT` — extra hint like "podcast interview about startups"

Output: `outputs/chapters/<name>.chapters.json` with title, start/end timestamps, and description per chapter. With `--split`, individual `01-title.mp4` files.

## Tighten a Conversation Video

Use this when you have a long conversation and want AI to find filler words, repetitive sections, and tangents that can be cut to produce a tighter edit.

```bash
bun run tighten:auto -- --video "/path/to/conversation.mp4"
```

With video generation:

```bash
bun run tighten:auto -- --video "/path/to/conversation.mp4" --tighten
```

Options:

- `--tighten` — generate a tightened video with cuts removed
- `--out FILE` — output cuts JSON (default: `outputs/tighten/<slug>.cuts.json`)
- `--tighten-out FILE` — path for the tightened video
- `--aggressiveness light|medium|heavy` — how aggressively to cut (default: medium)
  - `light`: only clear filler words and dead air
  - `medium`: filler, repetition, and obvious tangents
  - `heavy`: any non-essential content, tight edit for short-form
- `--min-gap-seconds N` — minimum silence/filler gap to flag (default: 2.0)
- `--provider deepseek|openai` — override auto-detected AI provider
- `--language LANG` — spoken language (default: `en`)

Output: `outputs/tighten/<name>.cuts.json` with per-cut timestamps, reasons (filler/repetition/tangent/wordiness), and descriptions. With `--tighten`, produces `<name>.tightened.mp4`.

## Clean Up Generated Files

Use this when the project folder is getting too heavy.

```bash
bun run cleanup
```

Cleanup can remove temporary render staging from `outputs/work/` and `outputs/.public/media/`, or prune old folders in `outputs/` while keeping the newest 5. It asks for confirmation before deleting.

Useful direct commands:

```bash
bun run cleanup -- --temp --yes
bun run cleanup -- --outputs --keep-latest 5 --yes
bun run cleanup -- --outputs --keep-latest 5 --dry-run
```

## Download YouTube Videos And Stop

Use this when you only want the source videos downloaded from a text file.

1. Put one YouTube URL per line in `links.txt`.
2. Run:

```bash
bun run download:youtube -- --links links.txt
```

Output:

```text
outputs/download-run-YYYY-MM-DD-HHMMSS/downloads/
```

This does not transcribe, clip, caption, add B-roll, or render.

Shortcut alias:

```bash
bun run clipkit -- download --links links.txt
```

## Download Full Videos And Chop Them Into Fixed Clips

Use this when you want the original full-video chopping workflow: download every source in `links.txt`, then split each whole video into back-to-back 15-second clips.

```bash
bun run clipkit -- fixed-clips --links links.txt --segment-seconds 15
```

Shortcut alias:

```bash
bun run clips:fixed -- --links links.txt --segment-seconds 15
```

Direct low-level command:

```bash
bun run download:split -- --links links.txt --segment-seconds 15
```

Output:

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

This does not transcribe, pick moments, caption, add B-roll, or render.

## Cut One Local Video Into Fixed Clips

Use this when the source file is already on your machine and you just want the whole thing chopped into back-to-back 15-second sections.

```bash
bun run clipkit -- split-video --video "/path/to/video.mp4" --segment-seconds 15
```

Shortcut alias:

```bash
bun run video:split -- --video "/path/to/video.mp4" --segment-seconds 15
```

Output:

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

This does not transcribe, pick moments, caption, add B-roll, or render.

## Find Important Moments Only

Use this when you want the system to act like an assistant editor: download the videos, find the strongest or most viral-worthy moments, and export clean source clips for your own timeline.

```bash
bun run clipkit -- moments --links links.txt --max-clips 6 --padding-seconds 2
```

Shortcut alias:

```bash
bun run moments:auto -- --links links.txt --max-clips 6 --padding-seconds 2
```

Output clips land inside the run folder as `*.moment.mp4`, alongside a `selection.json` file with the chosen timestamps, hooks, and reasons.

By default, those boundaries are snapped to nearby transcript thought boundaries so the clip lands more cleanly at the start and end of a complete line. Use `--boundary-lookaround-seconds 8` to let it search a bit farther, or `--disable-thought-snapping` to keep the raw AI timestamps.

This workflow does not add captions, B-roll, SFX, or final overlay renders.

### Review Viral Scorecards For A Moments Run

Use this when you want a clearer answer to "why did the bot pick this?" before you drag clips into a manual timeline.

Run against the latest batch:

```bash
bun run moments:review -- --write --format markdown
```

That reads the newest `outputs/run-*` folder, scores every chosen moment, explains the strongest signals, and writes `viral-scorecards.md` into the run folder. The report includes:

- overall score
- strongest signals
- hook strength
- emotional intensity
- practical value
- identity resonance
- visual payoff
- thought completeness

Run against an older batch:

```bash
bun run clipkit -- review-moments \
  --run outputs/run-YYYY-MM-DD-HHMMSS \
  --top 10 \
  --format text
```

To save the scorecards back into each `selection.json` (latest run, or a specific run):

```bash
bun run moments:review -- --persist --write --format json
bun run moments:review -- --run outputs/run-YYYY-MM-DD-HHMMSS --persist --write --format json
```

Persisted scorecards become optional `viralScorecard` blocks inside each `selection.json`, with an overall 0-100 score and readable reasons like hook strength, emotional intensity, practical value, and thought completeness.

## Auto AI Clip YouTube Videos

Use this when you have long YouTube videos and want the system to download them, transcribe them, select the most interesting clips, add padding, mix B-roll/SFX when enabled, and render captioned shorts.

```bash
bun run clipkit -- auto-clips --links links.txt --max-clips 6 --padding-seconds 2
```

Shortcut alias:

```bash
bun run clip:auto -- --links links.txt --max-clips 6 --padding-seconds 2
```

## B-Roll-Heavy Caption Generator

Use this when `links.txt` is labeled by creator/profile and you want the final edits to lean heavily on your local custom scenes library instead of mostly the original talking-head footage.

```bash
bun run clipkit -- broll-captions --links links.txt --max-clips 3
```

Shortcut alias:

```bash
bun run broll:captions -- --links links.txt --max-clips 3
```

Defaults for this workflow:

- uses `custom-scenes-library/`
- points `--library-config` at `custom-scenes-library/library.config.json` (create it per-project; see [Scene Library Options](#scene-library-options))
- uses `styles/broll-heavy-custom-scenes.json`
- forces `--context-scenes`
- forces `--local-scenes-only`
- forces `--disable-sound-effects`
- forces `--vertical-contain`

This is the best fit for the labeled creator workflow where `# Mani Videos` and `# Josep Videos` in `links.txt` should route to matching scene profiles.

## Auto Caption Any Video

Use this when the edit already exists and you only want the invert/masked caption style rendered on top.

```bash
bun run clipkit -- caption --video "/path/to/video.mp4"
```

Shortcut alias:

```bash
bun run caption:auto -- --video "/path/to/video.mp4"
```

That transcribes the video, renders captions, and saves the result here:

```text
outputs/caption-run-YYYY-MM-DD-HHMMSS/final/
```

With manual transcript corrections:

```bash
bun run clipkit -- caption \
  --video "/path/to/video.mp4" \
  --captions "/path/to/fixed.captions.json"
```

## Enhance An Existing Edit

Use this when you already have a mostly edited video and want ClipCaptionAI to add timed B-roll cutaways plus captions on top. It does not select/cut a new short from a long source. It keeps the full base video timeline and audio, then adds visual inserts where the transcript context benefits from motion or movie/TV-style references.

```bash
bun run clipkit -- enhance --video "/path/to/edit.mp4" --run-name edit-v1
```

Shortcut aliases:

```bash
bun run video:enhance -- --video "/path/to/already-edited.mp4"
bun run broll:enhance -- --video "/path/to/already-edited.mp4"
```

The final video will be in `outputs/<run-name>/final/`. Every run creates:

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
| `--out-dir DIR` | Output root. Default `outputs`. |
| `--run-name NAME` | Custom output folder name. |
| `--style-config FILE` | Caption style JSON. Default `caption-style.json`. |
| `--max-insertions N` | Override how many B-roll cutaways can be planned. |
| `--fps N` | Final render FPS. Default `24`. |
| `--fit cover\|contain` | Normalize source into 9:16 frame. Default `contain`. |
| `--vertical` | Render final output as 1080x1920 cropped fill. |
| `--vertical-contain` | Render final output as 1080x1920 with full video visible and black bars. |
| `--transcription-prompt TEXT` | Helpful words/names for transcription accuracy. |
| `--disable-context-scenes` | Skip B-roll mixing; render captions only. |
| `--youtube-ingest` | Force-enable YouTube B-roll ingest during scene planning. |
| `--disable-youtube-ingest` | Use only clips already in `scene-library`. |
| `--local-scenes-only` | Use only clips already in the local scene library. |
| `--movie-scenes` | Prefer movie/TV scene B-roll. This is the default for `broll:enhance`. |
| `--stock-broll` | Use the older literal/stock-style B-roll search for this run. |
| `--pop-culture-research` | Force movie/TV reference query enrichment. |
| `--disable-pop-culture-research` | Skip movie/TV scene query enrichment. |
| `--no-render` | Stop after transcription and B-roll mix. |

Example:

```bash
bun run broll:enhance -- \
  --video "/path/to/already-edited.mp4" \
  --run-name my-existing-edit \
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
bun run scene:research-pop-culture -- \
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

## Find Standalone B-Roll

Use this when you are editing manually and only want matching B-roll assets from a text file, without running transcription, AI clip selection, captions, or rendering.

1. Put one B-roll idea per line in `broll-prompts.txt`.
2. Double-click `BROLL.command`, or run:

```bash
bun run broll:find
```

Or through the command hub:

```bash
bun run clipkit -- broll --prompts broll-prompts.txt --max-downloads 8
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
bun run broll:find -- --prompts "/path/to/ideas.txt" --max-downloads 5
```

```bash
bun run broll:find -- \
  --prompts broll-prompts.txt \
  --run-name broll-money-scenes \
  --quality high \
  --max-results 12 \
  --max-downloads 4 \
  --max-duration-seconds 20
```

Movie/TV scene style:

```bash
bun run broll:find -- \
  --prompts broll-prompts-budapest-movie-scenes.txt \
  --run-name broll-budapest-movie-scenes \
  --movie-scenes \
  --max-results 8 \
  --max-downloads 2 \
  --max-duration-seconds 240
```

Movie-scene results are candidate references, not rights-cleared assets. Review source, quality, and permissions before using them in a public post.

## Process Pipeline

The `bun run process` alias is the original full YouTube auto-clipping pipeline. It downloads every source in `links.txt`, transcribes each video, picks the strongest clips, and renders captioned shorts — with extra knobs for B-roll, SFX, vertical framing, and scene libraries.

```bash
bun run process
```

Force AI to pick new clips instead of reusing an existing `selection.json`:

```bash
bun run process -- --reselect
```

Limit the number of clips per source video:

```bash
bun run process -- --max-clips 6
```

The double-click `RUN.command` uses `MAX_CLIPS=6` by default. To temporarily change the one-click cap from Terminal:

```bash
MAX_CLIPS=10 /path/to/RUN.command
```

Add more lead-in and tail padding around each AI-selected clip:

```bash
bun run process -- --padding-seconds 3
```

Render all selected clips as 9:16 while keeping the full horizontal video visible with black bars:

```bash
bun run process -- --vertical-contain
```

Use a different links file:

```bash
bun run process -- --links "/path/to/links.txt"
```

Useful `process` options:

| Option | Meaning |
| --- | --- |
| `--links FILE` | Links file. Defaults to `./links.txt`, then the desktop `links.txt` used by `RUN.command`. |
| `--out-dir DIR` | Output root. Defaults to `outputs`. |
| `--run-name NAME` | Custom run folder name instead of `run-YYYY-MM-DD-HHMMSS`. |
| `--download-dir DIR` | Download folder. Defaults to the run folder's `downloads/`. |
| `--max-clips N` | Clips to select per video. Default `3`. |
| `--min-seconds N` | Minimum AI-selected core clip length. |
| `--max-seconds N` | Maximum AI-selected core clip length. |
| `--padding-seconds N` | Extra seconds before and after the selected moment. Default `2`. |
| `--boundary-lookaround-seconds N` | Max extra seconds used to snap a chosen clip to nearby thought boundaries. Default `6`. |
| `--disable-thought-snapping` | Keep raw AI-selected timestamps without boundary snapping. |
| `--review-width N` | Width used when cutting intermediate clips. Defaults to the smart selector default. |
| `--review-fps N` | Render FPS for review clips. Defaults to the smart selector default. |
| `--raw-clips-only` | Export only AI-selected source moments for manual editing. |
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
| `--sfx-library DIR` | Folder of indexed sound effects. |
| `--sound-effects` | Force-enable automatic SFX for this run. |
| `--disable-sound-effects` | Skip SFX mixing for this run. |
| `--reselect` | Ignore existing AI selections and choose again. |
| `--vertical` | Render as 1080x1920 with video cropped to fill. |
| `--vertical-contain` | Render as 1080x1920 with full video contained and black bars. |

Local custom-scenes example:

```bash
bun run process -- \
  --links links.txt \
  --scene-library ./custom-scenes-library \
  --library-config ./custom-scenes-library/library.config.json \
  --local-scenes-only \
  --disable-sound-effects \
  --style-config styles/custom-scenes-reference.json
```

## Context-Matched Scene Inserts

You can optionally mix in tagged cutaway footage so the clip bounces between the original speaker footage and context-matched cinematic scenes. By default, the same scene clip is used at most once inside a generated short.

This works with a local curated scene library, and it can also auto-build that library from YouTube videos.

One-off mix command:

```bash
bun run scene:mix -- \
  --video "/path/to/raw-clip.mp4" \
  --captions "/path/to/raw-clip.captions.json" \
  --out "/path/to/raw-clip.scene-mix.mp4"
```

Enable it for the full pipeline:

```bash
bun run process -- --context-scenes
```

The same mixed source is reused automatically by `rerender:clip` when a `*.scene-mix.mp4` exists next to the raw clip.

One-off YouTube ingest:

```bash
bun run scene:ingest:youtube-cc -- \
  --query "money motivation movie scene" \
  --max-downloads 2 \
  --max-duration-seconds 60
```

If `caption-style.json` has `contextScenes.youtubeIngest.enabled: true`, the mixer can also auto-ingest matching clips while it plans cutaways from the transcript.

## Automatic Sound Effects

Drop sound files into `sfx-library/`, then standardize and index them:

```bash
bun run sfx:standardize
```

Full pipeline runs automatically add low-volume contextual SFX when `caption-style.json` has `soundEffects.enabled: true`. The final render uses `*.sfx-mix.mp4` as its source, and each mix writes a `*.sfx-plan.json` next to it so you can inspect exactly which sounds were chosen. By default, the same SFX file is used at most once inside a generated short.

One-off SFX mix:

```bash
bun run sfx:mix -- \
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
bun run transcribe -- \
  --video "/path/to/clip.mp4" \
  --out "outputs/clip.captions.json"
```

Render one clip with an existing captions file:

```bash
bun run render:clip -- \
  --video "/path/to/clip.mp4" \
  --captions "outputs/clip.captions.json" \
  --out "outputs/clip.captioned.mp4"
```

Render only a small frame range for a fast proof:

```bash
bun run render:clip -- \
  --video "/path/to/clip.mp4" \
  --captions "outputs/clip.captions.json" \
  --out "outputs/proof.mp4" \
  --frames 140-180
```

Render one clip as 9:16 contain:

```bash
bun run render:clip -- \
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
| `--style-config FILE` | Caption style JSON. Default `caption-style.json` if present. |
| `--combine-ms N` | Caption grouping window. |
| `--highlight-words CSV` | Words to render in the alternate font. |
| `--no-captions` | Disable both the visible caption layer and the inverted caption effect layer. |
| `--text-opacity N` | Caption fill opacity from `0` to `1`. |
| `--uppercase` | Force caption text uppercase. |
| `--frames START-END` | Render only a frame range for proofing. |

## AI Clip Selection

Run AI selection on a local video:

```bash
bun run smart:clips -- \
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
| `--review-width N` | Downscale selected clips before captioning. Default `1280`. |
| `--review-fps N` | Render review clips at this FPS. Default `15`. |
| `--raw-clips-only` | Stop after exporting the selected source clips for manual editing. |
| `--reselect` | Ask AI to choose clips again. |
| `--vertical` | 1080x1920 cropped fill. |
| `--vertical-contain` | 1080x1920 contained with black bars. |
| `--style-config FILE` | Caption style JSON. Default `caption-style.json` if present. |
| `--selection-model ID` | OpenAI model for selection. |

## Transcription Notes

`bun run transcribe` extracts mono 16kHz audio, transcribes it, and writes both caption tokens and the full transcription response.

Provider order in `auto` mode:

1. `local-whispercpp` if `whisper-cli` is installed
2. `openai` if `OPENAI_API_KEY` is available
3. `youtube` subtitle fallback for YouTube-derived files

The default `.env.example` now pins `TRANSCRIBE_PROVIDER=local-whispercpp`, so the pipeline stays local-first unless you override it.

If an AI provider key (DeepSeek or OpenAI) is present and the audio transcription did not come from OpenAI, the script also does a cheap text-only cleanup pass over the transcript. That cleanup is used for better clip selection and planning, while the rendered captions keep their original timings.

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
| `--language LANG` | Spoken language. Default `en`. |
| `--retries N` | Retry count for transient failures. Default `5`. |
| `--audio-bitrate RATE` | Temporary audio bitrate. Default `48k`. |
| `--chunk-seconds N` | Chunk length for longer audio. Default `180`. |

Examples:

```bash
bun run transcribe -- --video "/path/to/video.mp4" --out /tmp/captions.json
bun run transcribe -- --video "/path/to/video.mp4" --out /tmp/captions.json --provider local-whispercpp --local-model small.en
bun run transcribe -- --video "/path/to/video.mp4" --out /tmp/captions.json --provider local-whispercpp --disable-text-enhance
bun run transcribe -- --video "/path/to/video.mp4" --out /tmp/captions.json --provider openai
```

Benchmark local vs reference:

```bash
bun run transcribe:benchmark -- \
  --video "/path/to/video.mp4" \
  --sample-start 30 \
  --sample-seconds 25 \
  --candidate-provider local-whispercpp \
  --local-model small.en
```

## Foreground Subject Layer

The renderer supports an optional foreground/alpha video above captions:

```bash
bun run rerender:clip -- \
  --clip "/path/to/clip.captions.json" \
  --foreground-video "/path/to/transparent-subject-layer.webm"
```

This makes the layer order: background video, captions, foreground subject. If the foreground video has transparency, captions appear to pass behind the subject. The pipeline does not automatically generate subject masks yet; that requires a segmentation step that outputs a transparent foreground video for each clip.

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

## Demo Capture And Reviewed AI Assets

- Record the real workflow in Cursorful at 1080p, then caption/render it here. Cursorful remains an operator tool, not a project dependency.
- Generate a local ElevenLabs narration file with `bun run voiceover:elevenlabs -- --script narration.txt --voice-id VOICE_ID`.
- Create opt-in, human-reviewed fal assets with `bun run fal:image-edit -- ... --approved-for-generated-marketing` or `bun run fal:reference-video -- ... --approved-for-generated-marketing`.
- Generated images/video are never eBay source-of-truth/main listing photos or evidence of condition. Full setup and QA details: [AI provider workflows](AI_PROVIDERS.md).

## Competitive eBay Creative Blueprints

Use this before spending Higgsfield credits when you want to learn from competitors or TikTok Shop trend data without copying their protected media.

The workflow copies only the ad structure: hook type, beat order, pacing, proof density, CTA role, SFX style, and B-roll intent. The final ad must use your own listing photos, owned/generated product-preserving video, licensed music, licensed SFX, and cleared B-roll.

### Start With A Credit ROI Plan

Use this lane when the goal is a real product ad, not an automatic photo slideshow. The default workflow is lean: one listing at a time, one paid Higgs hero/product-proof shot, owned/local B-roll first, then final assembly/upload through the shopping MCP.

Start with a credit ROI plan before rendering. Use `--skip-item-ids` when a listing should be excluded from paid generation:

```bash
bun run ebay:cinematic-ads -- roi-plan \
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

The default strategy is intentionally conservative: one paid Higgs shot per ad kit. The perceived production value should come from B-roll, pacing, captions, SFX, and clean assembly. The default `--credits-per-shot` is `22.5`, matching a verified Seedance 2.0 5-second 720p reference-video estimate on July 12, 2026. Re-run the per-listing `projects/<item-id>/higgsfield/estimate-costs.sh` before rendering if model pricing changes.

For higher-energy sales creatives, use `--ad-strategy high-energy` during planning and `--energy max` while finding B-roll or assembling. Max energy mode uses more kinetic yt-dlp B-roll prompts, shorter B-roll source sections, interleaved 1-2 second cutaways, faster product cuts, and automatic transition/impact/money/camera SFX from `sfx-library/index.json`.

### Prepare A Listing Project

Prepare one or more listing projects:

```bash
bun run ebay:cinematic-ads -- prepare --item-ids 398160795273
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

When the Higgsfield MCP tools are available in your agent environment, import the image URLs with Higgsfield's media import tool, then call its video generation tool with the prompts in `higgsfield-brief.json`. If the MCP tools list shows `higgsfield` enabled but the tools are not exposed in the current task, restart/re-auth the MCP session before trying to automate render creation.

### One-Command Competitive Plan

For the full batch pipeline, let the eBay ad planner rank live listings, prepare the real listing photos, discover competitor references, and write structure maps in one pass:

```bash
bun run ebay:cinematic-ads -- competitive-plan \
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

That ranks the live eBay listings by ROI/creative need, downloads the actual listing photos into `projects/`, seeds competitor references with public YouTube metadata by default, analyzes the selected reference video as a bounded research clip, and writes `competitive-pipeline-manifest.json` plus one `creative-blueprint.md` and `reference-video-analysis/shot-replica-map.md` per listing. With `--run-control-loop`, the same command continues into preview rendering, technical QA, premium render packet prep, and the Higgsfield handoff queue/review board. Add `--run-higgsfield-renders` to let the top-level command create/resume Higgsfield jobs from the premium plan before collection and finalization; use `--higgs-render-dry-run --higgs-render-skip-cost` first to prove the queue and budget without spending credits.

Useful options:

- `--competitors "/path/to/kalodata-export.csv"` blends Kalodata, Automatio, TikTok, YouTube, or hand-curated rows into the reference pool.
- `--max-discover-results 5` controls public YouTube metadata discovery per listing.
- `--analysis-max-seconds 20` bounds the research-only reference clip analysis.
- `--no-analyze-reference-video` creates blueprints without downloading/analyzing the selected reference clip.
- `--run-control-loop` continues from blueprints into preview rendering, technical QA, premium render packet prep, and the Higgsfield handoff queue/review board.
- `--run-higgsfield-renders` continues through the Higgsfield CLI runner before collect/finalize. Pair it with `--higgs-render-dry-run --higgs-render-skip-cost` first so the queue, resume behavior, and credit budget are proven without spending credits.
- `--dashboard-file exports/ebay-listing-performance-dashboard.json` and `--workbench-file exports/ebay-listing-asset-workbench.json` replay the pipeline from saved eBay/MCP truth snapshots when live seller APIs are rate-limited.

### Snapshot Replay When Seller APIs Are Rate-Limited

If eBay/MCP traffic is rate-limited, rerun the same planner from saved truth snapshots instead of waiting on the live API:

```bash
bun run ebay:cinematic-ads -- competitive-plan \
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

Batch outputs:

- `competitive-pipeline-manifest.json`
- `higgsfield-roi-plan.json`
- `projects/<item-id>/listing.json`
- `competitive-creative/<item-id>/creative-blueprint.md`
- `competitive-creative/<item-id>/competitor-trend-report.md`
- `competitive-creative/<item-id>/reference-video-analysis/shot-replica-map.md`
- `competitive-creative/<item-id>/reference-video-analysis/reference-contact-sheet.jpg`

### Single Prepared-Listing Creative Intel

Then run the creative intelligence pass with a Kalodata, Automatio, TikTok, or hand-curated CSV/JSON export:

```bash
bun run ebay:creative-intel -- plan \
  --project-dir "outputs/ebay-cinematic-ads/.../398160795273" \
  --competitors "/path/to/kalodata-export.csv"
```

This ranks similar product videos, extracts the winning structure, and writes `competitive-creative/creative-blueprint.md`. It does not use competitor footage in the final ad. The blueprint copies only the strategy: hook pattern, beat order, pacing, proof density, B-roll intent, SFX style, and CTA role. Final assets still come from our own listing photos, owned/generated product-preserving video, licensed music, licensed SFX, and cleared B-roll.

The import layer preserves trend fields from Kalodata/Automatio-style exports when present: `Video Views`, `Product Units Sold`, `Product GMV`, `GMV Growth Rate`, `Video Likes`, `Video Comments`, `Video Shares`, `Engagement Rate`, and `Posting Date`. Useful structure columns include `Product Title`, `Video URL`, `Hook`, `Caption`, `Duration Seconds`, `Shot Breakdown`, and `Audio Notes`. Every listing gets `competitor-trend-report.json` plus `competitor-trend-report.md`, which rank references by product fit first and trend evidence second. Use that report to reject high-view mismatches before the selected reference becomes a shot-replica plan.

When `Shot Breakdown` is present, the architect maps those ordered beats directly into the blueprint's `beats[].competitor_pattern` fields for structure-only copying. `Audio Notes` are preserved as analysis-only beat guidance so the final ad can recreate the sound design with licensed/local music and SFX instead of competitor audio.

Treat Kalodata as a structured export source rather than an internal unattended scraper. It is JavaScript-rendered, login-gated, paginated, and anti-bot protected, so the intended path is: use Automatio or another logged-in browser workflow, export CSV/JSON rows, import them with `--competitors`, and let the research-quality gate decide whether the selected reference is strong enough for premium render credits.

If you do not have an export yet, run it without `--competitors`. It will still write a `kalodata-automatio-prompt.md` for that listing so you can paste the exact extraction request into Automatio or another scraper:

```bash
bun run ebay:creative-intel -- plan \
  --project-dir "outputs/ebay-cinematic-ads/.../398160795273"
```

You can also seed public YouTube metadata links for manual creative review:

```bash
bun run ebay:creative-intel -- plan \
  --project-dir "outputs/ebay-cinematic-ads/.../398160795273" \
  --discover-youtube
```

### Reference Video Analysis

For a shot-for-shot structure map, add bounded reference analysis:

```bash
bun run ebay:creative-intel -- plan \
  --project-dir "outputs/ebay-cinematic-ads/.../398160795273" \
  --discover-youtube \
  --analyze-reference-video \
  --analysis-max-seconds 30
```

This downloads only a bounded research clip from the selected reference, detects scene cuts, extracts a contact sheet, and writes `reference-video-analysis/reference-video-analysis.json`, `reference-video-analysis/shot-replica-map.md`, extracted proof frames, and a contact sheet. These are research artifacts only. They should guide timing, pacing, and beat order; they should not become final ad media.

### Render A Product-Safe Preview

To make the structure tangible before spending generation credits, render an original preview ad from the blueprint:

```bash
bun run ebay:render-blueprint-ad -- \
  --blueprint "outputs/competitive-plan-proof/.../competitive-creative/<item-id>/creative-blueprint.json"
```

That writes:

- `final/<item-id>-competitive-preview-ad.mp4`
- `final/<item-id>-competitive-preview-proof-frame.jpg`
- `final/<item-id>-competitive-preview-manifest.json`
- `final/<item-id>-competitive-preview-ad.audio-plan.json`

The preview renderer uses actual listing images, local/cleared B-roll if present, local music, and local SFX. It exists for QA and iteration; keep using Higgsfield or other product-preserving generated clips for the final premium shots when the preview direction is approved.

For batch QA across a full competitive-plan run:

```bash
bun run ebay:render-blueprint-batch -- \
  --blueprints-dir "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative" \
  --duration 12 \
  --limit 5
```

That finds each `creative-blueprint.json`, renders a product-safe preview for each listing, and writes `competitive-preview-render-manifest.json` with the video path, proof frame, selected reference, duration, and render status. This is the cheap screening pass before choosing the few products that deserve Higgsfield credits.

### The Post-Blueprint Control Loop

For the full post-blueprint control loop in one command:

```bash
bun run ebay:competitive-loop -- \
  --blueprints-dir "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative" \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

That runs preview rendering, technical QA, premium render packet prep, a batch Higgsfield handoff export, Higgsfield output collection, finalizer readiness, pipeline status, per-listing creative packet export, and the HTML review board. If previews already exist, pass `--preview-manifest` instead of `--blueprints-dir`. Use `--skip-handoff` only when the current run already has a fresh render queue and runbook.

### Preview Quality Gate

Before spending paid-generation credits, run the quality gate:

```bash
bun run ebay:competitive-qa -- \
  --preview-manifest "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-preview-render-manifest.json"
```

That writes `competitive-video-qa-report.json` and `competitive-video-qa-report.md`. It checks vertical resolution, duration, audio stream, audio loudness, black frames, frozen/slideshow risk, and cut/scene density. A `fail` means do not upload or spend more credits until the video is regenerated or repaired; a `warn` means inspect the preview carefully before approving premium renders.

### Premium Render Packet

After reviewing the proof frames/previews, create the credit-aware premium render packet:

```bash
bun run ebay:prep-premium-renders -- \
  --preview-manifest "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-preview-render-manifest.json" \
  --roi-plan "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/higgsfield-roi-plan.json" \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

That writes:

- `competitive-premium-render-plan/competitive-premium-render-plan.json`
- `competitive-premium-render-plan/competitive-premium-render-plan.md`
- `projects/<item-id>/higgsfield/competitive-premium-render-jobs.json`
- `projects/<item-id>/higgsfield/estimate-competitive-premium-costs.sh`
- `projects/<item-id>/higgsfield/render-competitive-premium-shots.sh`
- `projects/<item-id>/higgsfield/competitive-premium-qa.md`

The prep command does not spend credits. It makes the paid step explicit and reviewable: actual listing image references, product-preserving prompts, expected output paths in `higgsfield-renders/`, QA rejection rules, and the final `assemble` command. If the selected Kalodata/Automatio row includes a strong `Shot Breakdown`, the paid render queue is beat-driven: each selected job carries the imported competitor pattern, our original execution, caption intent, SFX/audio feel, timing, and product-truth constraints. That lets the operator copy the winning structure 1:1 while still generating original, listing-accurate footage.

By default, premium prep holds listings whose selected structure is only a fallback template or has weak competitor-fit evidence. Those items appear as `research_review_required` in the status board. Add a real Kalodata/Automatio/TikTok/YouTube competitor export and rerun, or pass `--allow-weak-research` only when you intentionally want to make a direct product ad without competitor trend evidence.

### Handoff To Higgsfield / Another Agent

To hand off all paid render jobs in one batch:

```bash
bun run ebay:competitive-handoff -- \
  --premium-plan "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json"
```

That writes `competitive-render-handoff/` with `render-queue.json`, `render-queue.jsonl`, `render-url-map.template.json`, `higgsfield-render-runbook.md`, and `run-higgsfield-cli-jobs.sh`. Beat-driven jobs carry the imported competitor pattern, our original execution, caption intent, SFX intent, and audio feel through the queue, JSONL, runbook, audit status, and review board. The output contract is simple: every accepted generated clip must land at the listed `higgsfield-renders/<job-id>.mp4` path, or the URL must be placed in `render-url-map.template.json` for `ebay:collect-premium-renders`.

To render the handoff queue through the Higgsfield CLI instead of running shell commands manually:

```bash
bun run ebay:competitive-higgsfield-render -- \
  --premium-plan "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json" \
  --model seedance_2_0_mini \
  --credit-budget 40
```

That writes `competitive-higgsfield-render-run/competitive-higgsfield-render-manifest.json` plus `higgsfield-render-url-map.json`. Use `--dry-run --skip-cost` first for a no-network plan, then remove those flags to create jobs. The runner is resumable: completed `projects/<item-id>/higgsfield/<job-id>.competitive-job.json` files are reused unless `--overwrite` is set, Starter-compatible Mini jobs omit unsupported params such as `--mode`, and a URL map is written for the collector. Feed its URL map into `ebay:collect-premium-renders`.

### Creative Packets And Research Queues

To package each listing into a portable creative packet for a generator/operator:

```bash
bun run ebay:competitive-packets -- \
  --status "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-video-pipeline-status.json"
```

That writes `competitive-creative-packets/<item-id>-*/` folders containing `creative-packet.md/json`, copied product reference images, preview proof assets, a per-listing render queue, URL-map template, competitor-inspired beat map, QA evidence, and a product-truth rejection checklist. If a listing is held as `research_review_required`, the packet also gets `research/research-brief.md`, `research/research-brief.json`, and `research/competitor-import-template.csv` with exact Kalodata/Automatio columns, search queries, and the rerun command.

For a batch of held listings, export one consolidated Automatio/Kalodata research queue:

```bash
bun run ebay:competitive-research-queue -- \
  --status "outputs/ebay-cinematic-ads/.../competitive-premium-render-plan/competitive-video-pipeline-status.json"
```

That writes `competitive-research-queue/automatio-search-queue.csv`, `competitive-research-queue.json`, and `competitive-research-queue.md`. The CSV has one row per search query with the item, issue summary, required export columns, packet folder, competitor-import path, and rerun command.

If Automatio/Kalodata gives you one consolidated export for several listings, route it back into the packet templates instead of copying rows by hand. The export should include `Item ID`, `Competitor Import Template`, `Packet Dir`, or the exact queued `Search Query` plus the competitor columns:

```bash
bun run ebay:competitive-research-import -- \
  --queue "outputs/ebay-cinematic-ads/.../competitive-research-queue/competitive-research-queue.json" \
  --results "/path/to/automatio-results.csv"
```

That writes `competitive-research-import/competitive-research-import-manifest.json`, dedupes repeated competitor rows, and fans each matched result into the correct `research/competitor-import-template.csv`. Add `--dry-run` to preview routing without editing templates, or `--replace` when the export should become the whole template content.

For the normal operator loop, import the consolidated export and immediately validate which listings are ready to rerun:

```bash
bun run ebay:competitive-research-loop -- \
  --queue "outputs/ebay-cinematic-ads/.../competitive-research-queue/competitive-research-queue.json" \
  --results "/path/to/automatio-results.csv" \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

By default this writes the matched rows into the local packet templates, then runs the processor in dry-run mode so you can inspect planned reruns before spending credits. It also writes `competitive-research-import-loop/competitive-research-import-review.html`, an operator board showing imported competitor rows, trend evidence, product-match score/shared terms, skipped rows, and planned rerun commands. Treat low product-match warnings as a manual review stop even when trend metrics are strong. Add `--dry-run` to preview import routing without modifying templates. Add `--run-reruns` only after the review board and dry-run manifest show the right selected listings.

After multiple packet templates have been filled, process every ready one in a batch:

```bash
bun run ebay:competitive-research-process -- \
  --queue "outputs/ebay-cinematic-ads/.../competitive-research-queue/competitive-research-queue.json" \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

The processor skips empty templates, requires at least one row with product title and video URL, requires trend evidence, requires copyable structure evidence, and requires at least one competitor row to meet the product-match threshold before a held listing can move toward premium render spend. Accepted structure fields include `Hook`, `Shot Breakdown`, `Caption`, `Video Title`, `Duration Seconds`, `Audio Notes`, and `Hashtags`. Accepted trend fields include `Video Views`, `Items Sold`, `Total Revenue`, `Revenue Growth Rate`, `Product GMV`, `GMV Growth Rate`, `Product Units Sold`, `Video Likes`, `Video Comments`, `Video Shares`, `Engagement Rate`, and `Posting Date`. The default product-match threshold is `0.2`; tune with `--min-product-match-score`. Use `--dry-run` first to see which listings will move. Use `--allow-no-trend-metrics` only when you intentionally want to proceed from product-fit evidence without measured trend data, `--allow-low-product-match` only after manually approving a weak title-match import, and `--allow-weak-structure` only when you accept that the architect will infer structure from sparse reference data.

### Rerun A Held Listing With Real Competitor Evidence

After filling a held packet's `research/competitor-import-template.csv` with real Automatio/Kalodata rows, rerun that listing with:

```bash
bun run ebay:competitive-research-rerun -- \
  --packet-dir "outputs/ebay-cinematic-ads/.../competitive-premium-render-plan/competitive-creative-packets/<item-id>-slug" \
  --competitors "outputs/ebay-cinematic-ads/.../competitive-premium-render-plan/competitive-creative-packets/<item-id>-slug/research/competitor-import-template.csv" \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

The helper infers the original listing project from the packet/status/preview breadcrumbs, reruns `ebay:creative-intel`, then launches the control loop from the refreshed blueprint. This is the intended path from `research_review_required` to premium render readiness after you import real competitor evidence.

### Collect, Finalize, Status, Review

After approved generated clips are saved into each listing's `higgsfield-renders/`, run the batch finalizer. If the Higgsfield output is a direct URL or a local downloaded file, import it to the exact expected path first:

```bash
bun run ebay:collect-premium-renders -- \
  --premium-plan "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json" \
  --url-map "render-urls.json"
```

The URL map can be an object like `{ "<item-id>": { "<job-id>": "/path/or/url/to/video.mp4" } }` or an array of `{ "item_id", "job_id", "url" }` rows. The collector also scans each listing's `higgsfield/*.competitive-job.json` files for result URLs, imports clips into `higgsfield-renders/<job-id>.mp4`, and verifies a video stream with `ffprobe`.

```bash
bun run ebay:finalize-premium-ads -- \
  --premium-plan "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json"
```

That writes `competitive-premium-finalize-manifest.json`, assembles only ready listings, probes the final MP4s, and reports listings with missing generated clips as `not_ready`. It intentionally refuses to invent a slideshow fallback, so missing `higgsfield-renders/<job-id>.mp4` files remain visible blockers.

To see the current state of every listing in the run, audit the manifests:

```bash
bun run ebay:competitive-status -- \
  --premium-plan "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json"
```

That writes `competitive-video-pipeline-status.json` and `competitive-video-pipeline-status.md` next to the premium plan. It merges preview renders, premium render jobs, collected Higgsfield clips, final assembly output, file existence checks, and `ffprobe` results into per-listing statuses like `preview_ready`, `waiting_for_generated_clips`, `ready_to_finalize`, and `final_ready`. If a listing says `waiting_for_generated_clips`, the next move is to run the generated Higgsfield job or import the resulting MP4 with `ebay:collect-premium-renders`; if it says `ready_to_finalize`, run `ebay:finalize-premium-ads`. Use it as the operator dashboard before spending more credits or uploading a listing video.

To review the run visually before spending credits or uploading:

```bash
bun run ebay:competitive-review -- \
  --status "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-video-pipeline-status.json"
```

That writes `competitive-review-board.html` next to the status file. The board shows each listing's preview video/proof frame, selected competitor structure, trend evidence, premium render job readiness, beat-level render intent, handoff runbook/queue links, creative packet folders, blockers, and source artifact links. Open it before running paid renders or uploads.

Outputs land in `competitive-creative/` inside the listing project:

- `creative-blueprint.json`
- `creative-blueprint.md`
- `competitor-references.normalized.json`
- `competitor-trend-report.json`
- `competitor-trend-report.md`
- `reference-video-analysis/shot-replica-map.md` when `--analyze-reference-video` is used
- `story-broll-prompts.competitive.txt`
- `higgsfield-competitive-render-jobs.json`
- `kalodata-automatio-prompt.md`

### Story-Building Finish: Local B-Roll, Assembly, Upload

For a story-building finish, use the generated `story-broll-prompts.txt`.

Start with owned/local footage:

```bash
bun run ebay:cinematic-ads -- seed-local-broll \
  --project-dir outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273
```

Then search for extra clips only if the local footage does not carry the story:

```bash
bun run ebay:cinematic-ads -- find-broll \
  --project-dir "outputs/ebay-cinematic-ads/.../398160795273" \
  --energy max
```

This uses the existing ClipCaptionAI B-roll finder and copies selected clips into `story-broll/`. Search/download runs through `yt-dlp`, so no YouTube API key is required. For live eBay ads, use only footage you have rights to use commercially; movie/TV scene search is useful for creative reference, not for publishing unless rights are cleared.

Assemble the finished Higgsfield clips:

```bash
bun run ebay:cinematic-ads -- assemble \
  --project-dir "outputs/ebay-cinematic-ads/.../398160795273" \
  --energy max \
  --include-broll \
  --broll-position interleave
```

The assembler refuses to make a slideshow fallback. If there are no rendered clips in `higgsfield-renders/`, it stops so the listing does not get a low-effort placeholder by accident. With `--energy max`, it also writes `final/<item-id>-cinematic-ad.sfx-plan.json` so every sound effect and timing choice is auditable.

After reviewing the final video and proof frame, upload and stage an eBay attachment:

```bash
bun run ebay:cinematic-ads -- upload \
  --item-id 398160795273 \
  --video outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/398160795273/final/398160795273-cinematic-ad.mp4 \
  --attach \
  --poll
```

Add `--apply-immediately` only when the video is approved for the live listing. Without it, the script writes the eBay revise response beside the final video for review.

Hard stop: do not download competitor footage into the final commercial asset unless you have rights. Use competitor videos as research references only.

## Run Folder Layout

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

## Rerender

List generated clips:

```bash
bun run clipkit -- rerender --list
```

List clips in the latest run:

```bash
bun run rerender:clip -- --list
```

List clips in an older run:

```bash
bun run rerender:clip -- --run "/path/to/outputs/run-YYYY-MM-DD-HHMMSS" --list
```

Open the listed `.captions.json` file, edit only the `"text"` values, then rerender:

```bash
bun run rerender:clip -- --clip 1
```

Rerender a named clip from an older run:

```bash
bun run rerender:clip -- \
  --run "/path/to/outputs/run-YYYY-MM-DD-HHMMSS" \
  --clip "03-your-website-is-leaking-money"
```

Rerender that older clip as 9:16 contain with black bars:

```bash
bun run rerender:clip -- \
  --run "/path/to/outputs/run-YYYY-MM-DD-HHMMSS" \
  --clip "03-your-website-is-leaking-money" \
  --vertical-contain
```

Rerender a specific clip:

```bash
bun run clipkit -- rerender --clip 03-your-website-is-leaking-money
```

Rerender a specific clip with captions disabled for that export only:

```bash
bun run clipkit -- rerender --clip 03-your-website-is-leaking-money --no-captions
```

The rerender option supports both cases: leave the clip blank to list editable clips, or enter a clip number, slug, title fragment, or full `.captions.json` path to rerender immediately. Optionally point it at an older run folder instead of the latest run, and add `--no-captions` if you want a B-roll-only rerender for one specific export. `--no-captions` disables both the visible text layer and the inverted/masked caption effect layer.

By default, rerenders write `*.corrected.mp4` next to the original. To overwrite the original captioned clip:

```bash
bun run rerender:clip -- --clip 1 --replace
```

Useful `rerender:clip` options:

| Option | Meaning |
| --- | --- |
| `--run DIR` | Run folder to use. Defaults to latest `outputs/run-*`. |
| `--clip ID` | Clip number, title fragment, slug, or full `.captions.json` path. |
| `--list` | Print editable clips for a run. |
| `--replace` | Overwrite `*.captioned.mp4` instead of creating `*.corrected.mp4`. |
| `--out FILE` | Write to a custom output path. |
| `--fps N` | Override FPS. Defaults to the existing rendered clip FPS, then `15`. |
| `--vertical` | Rerender as 1080x1920 cropped fill. |
| `--vertical-contain` | Rerender as 1080x1920 contained with black bars. |
| `--foreground-video FILE` | Optional transparent foreground/subject layer rendered above captions. |
| `--position NAME` | Override caption position for this render. |
| `--style-config FILE` | Use a different style JSON. |
| `--highlight-words CSV` | Override highlighted words for this render. |
| `--no-captions` | Disable captions for this rerender only. |

## Diagnostics

```bash
bun run doctor
```

This checks Bun, ffmpeg, ffprobe, yt-dlp, `.env`, and optional OpenAI key presence.

## Other Useful Everyday Commands

Open the newest output folder:

```bash
bun run output:open
```

Open Remotion Studio:

```bash
bun run studio
```

## Preview In Remotion Studio

```bash
bun run sample:props
bun run studio
```

Then open the `CaptionedClip` composition in Remotion Studio and load `outputs/studio/sample-props/sample-props.json` as props.

## Appendix: Caption Style Configuration

Edit `caption-style.json` at the project root. The one-click runner, `bun run process`, `bun run smart:clips`, `bun run render:clip`, and `bun run rerender:clip` all read this file automatically unless you pass `--style-config`.

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

### Scene Library Options

1. Drop short scene clips anywhere inside `scene-library/`.
2. Add a sidecar file next to a clip like `my-scene.mp4.scene.json`.
3. Or create a top-level `scene-library/index.json`.

When `youtubeIngest.enabled` is on, the pipeline can add new YouTube clips into this library automatically from transcript-matched search queries through `yt-dlp`; no YouTube API key is required.

If your library is a folder of raw personal clips, build metadata first:

```bash
bun run scene:index -- \
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

For the "letters react to the footage underneath" look, use blend modes:

```json
{
  "textColor": "#f5f1ea",
  "textOpacity": 0.62,
  "textBlendMode": "difference",
  "normalTextFilterCss": "contrast(1.08) saturate(0.92)",
  "highlightTextFilterCss": "contrast(1.12) saturate(0.96)"
}
```

## Subject-aware portrait framing

Create a reviewable framing plan before rendering landscape footage into 9:16:

```bash
clipcaptionai workflow run portrait-analyze --wait -- \
  --video /absolute/path/input.mp4 \
  --out outputs/input.framing.json \
  --center-x 0.32

clipcaptionai workflow run render-clip --wait -- \
  --video /absolute/path/input.mp4 \
  --captions outputs/input.captions.json \
  --out outputs/input.vertical.mp4 \
  --vertical \
  --framing outputs/input.framing.json
```

Omit `--center-x` for centered framing. Framing plans are non-destructive JSON inputs.
