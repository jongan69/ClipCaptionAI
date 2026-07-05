# ClipCaptionAI

A local AI video-editing automation toolkit for viral short-form clips, YouTube clipping, masked/inverted captions, transcript-aware B-roll, standalone B-roll discovery, rerenders, and Remotion-based review renders.

Useful search terms this project is built around: AI video editor, YouTube shorts generator, TikTok captions, Reels captions, Remotion captions, automatic B-roll, viral clip finder, faceless video generator, AI shorts automation, podcast clipper, transcript-based video editing, and contextual movie-scene B-roll.

Clone it anywhere:

```bash
git clone https://github.com/jongan69/ClipCaptionAI.git
cd ClipCaptionAI
npm install
cp .env.example .env
```

## Quick Start

1. Run `npm install`.
2. Make sure `.env` contains `OPENAI_API_KEY=...` for anything that transcribes or uses AI.
3. Double-click `RUN.command`, or use the commands below.

From Terminal:

```bash
npm run menu
```

Run a quick local health check:

```bash
npm run doctor
```

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

### 2. Caption One Video

Run:

```bash
npm run caption:auto -- --video "/path/to/video.mp4"
```

That transcribes the video, renders captions, and saves the result here:

```text
outputs/caption-run-YYYY-MM-DD-HHMMSS/final/
```

### 3. Caption One Video With A Fixed Transcript

Use this after manually fixing a `.captions.json` file:

```bash
npm run caption:auto -- \
  --video "/path/to/video.mp4" \
  --captions "/path/to/fixed.captions.json"
```

### 4. Auto-Clip YouTube Videos Into Captioned Shorts

Use this when you want the full AI pipeline:

```bash
npm run clip:auto -- --links links.txt --max-clips 6 --padding-seconds 2
```

That downloads each YouTube video, transcribes it, picks interesting clips, adds captions, and renders shorts.

### 5. Add B-Roll And Captions To An Existing Edit

Run:

```bash
npm run video:enhance -- --video "/path/to/already-edited-video.mp4"
```

Use this when the video is already mostly edited and you want extra B-roll plus captions on top.

### 6. Use The Menu Instead

Run:

```bash
npm run menu
```

Then pick the workflow you want.

## Toolkit Workflows

The everyday command surface is `clipkit`:

```bash
npm run clipkit -- download --links links.txt
npm run clipkit -- auto-clips --links links.txt --max-clips 6 --padding-seconds 2
npm run clipkit -- caption --video "/path/to/video.mp4"
npm run clipkit -- enhance --video "/path/to/already-edited.mp4"
npm run clipkit -- broll --prompts broll-prompts.txt --max-downloads 8
npm run clipkit -- rerender --clip 03-your-website-is-leaking-money
```

Shortcut aliases:

| Command | Use |
| --- | --- |
| `npm run menu` | Open the interactive workflow menu. |
| `npm run doctor` | Check Node, npm, ffmpeg, ffprobe, yt-dlp, `.env`, and keys. |
| `npm run download:youtube` | Download YouTube videos from a links file and stop. |
| `npm run clip:auto` | Auto-clip YouTube videos from a links file. |
| `npm run caption:auto` | Caption any existing video without picking new clips. |
| `npm run video:enhance` | Add contextual B-roll and captions to an existing edit. |
| `npm run broll:find` | Find standalone B-roll from text prompts. |
| `npm run rerender:clip` | Rerender a generated clip after text/style fixes. |

More detailed walkthroughs live in [docs/WORKFLOWS.md](docs/WORKFLOWS.md). GitHub-safe publishing notes live in [docs/GITHUB.md](docs/GITHUB.md).

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

Download YouTube videos from `links.txt` and stop:

```bash
npm run download:youtube -- --links links.txt
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
| `--review-width N` | Width used when cutting intermediate clips. Default `1280`. |
| `--review-fps N` | Render FPS for review clips. Default `15`. |
| `--selection-model ID` | OpenAI model used for selecting clips. |
| `--style-config FILE` | Caption style JSON. Defaults to `caption-style.json`. |
| `--scene-library DIR` | Folder of tagged scene clips used for context-matched cutaways. |
| `--context-scenes` | Force-enable transcript-matched scene inserts for this run. |
| `--disable-context-scenes` | Force-disable scene inserts for this run. |
| `--reselect` | Ignore existing AI selections and choose again. |
| `--vertical` | Render as 1080x1920 with video cropped to fill. |
| `--vertical-contain` | Render as 1080x1920 with full video contained and black bars. |

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

The clips are also cached in `scene-library/`, so repeated prompts do not redownload the same YouTube video when it already exists locally.

Useful `broll:find` options:

| Option | Meaning |
| --- | --- |
| `--prompts FILE` | Prompt text file. Defaults to `broll-prompts.txt`. |
| `--out-dir DIR` | Output root. Defaults to `outputs`. |
| `--run-name NAME` | Custom output folder name. |
| `--scene-library DIR` | Reusable clip cache. Defaults to `scene-library`. |
| `--max-results N` | YouTube results searched per prompt. |
| `--max-downloads N` | Clips selected/copied per prompt. |
| `--max-duration-seconds N` | Reject source videos longer than this. Default `60`. |
| `--min-candidate-score N` | Search score cutoff. Defaults to `5` for manual B-roll finding. |
| `--max-expanded-queries N` | Search variants per prompt. Defaults to `5`. |
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
  --max-results 12 \
  --max-downloads 4 \
  --max-duration-seconds 45
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
  --out "work/clip.captions.json"
```

Render one clip with an existing captions file:

```bash
npm run render:clip -- \
  --video "/path/to/clip.mp4" \
  --captions "work/clip.captions.json" \
  --out "outputs/clip.captioned.mp4"
```

Render only a small frame range for a fast proof:

```bash
npm run render:clip -- \
  --video "/path/to/clip.mp4" \
  --captions "work/clip.captions.json" \
  --out "outputs/proof.mp4" \
  --frames 140-180
```

Render one clip as 9:16 contain:

```bash
npm run render:clip -- \
  --video "/path/to/clip.mp4" \
  --captions "work/clip.captions.json" \
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

When `youtubeIngest.enabled` is on and `YOUTUBE_API_KEY` is present, the pipeline can also add new YouTube clips into this library automatically from transcript-matched search queries.

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

`motionKeyframes` run from `at: 0` to `at: 1` during each caption beat. `xPercent` and `yPercent` are viewport percentages, so `-24` moves the caption left by about 24vw.

```json
{
  "position": "center-impact",
  "captionLayout": "inline-wrap",
  "motionKeyframes": [
    { "at": 0, "xPercent": 0, "yPercent": 0, "scale": 0.78, "opacity": 0 },
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
| `--reselect` | Ask AI to choose clips again. |
| `--vertical` | 1080x1920 cropped fill. |
| `--vertical-contain` | 1080x1920 contained with black bars. |
| `--selection-model ID` | OpenAI model for selection. |

## Transcription Notes

`npm run transcribe` extracts mono 16kHz MP3 audio, splits long audio into chunks, retries transient OpenAI errors, and writes both caption tokens and the full transcription response.

Useful options:

| Option | Meaning |
| --- | --- |
| `--model ID` | Transcription model. Default `whisper-1`. |
| `--prompt TEXT` | Context words to improve transcription. |
| `--retries N` | Retry count for transient failures. Default `5`. |
| `--audio-bitrate RATE` | Temporary audio bitrate. Default `48k`. |
| `--chunk-seconds N` | Chunk length for longer audio. Default `180`. |

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

Then open the `CaptionedClip` composition in Remotion Studio and load `work/sample-props.json` as props.
