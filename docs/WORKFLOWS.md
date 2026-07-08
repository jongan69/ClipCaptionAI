# ClipCaptionAI Workflows

## One-Click Menu

Double-click `RUN.command`, or run:

```bash
npm run menu
npx clipcaptionai menu
```

The menu is the safest front door for everyday editing. It can download YouTube videos, slice whole videos into fixed clips, cut one local video into fixed clips, find important moments for manual editing, run YouTube clipping, caption an existing edit, enhance a video with B-roll, find standalone B-roll, rerender a generated clip, open Studio, open the latest output, and run diagnostics.

For workflows that render video, the menu can also open an optional advanced settings prompt before the run. That prompt can override the most common live decisions without making you hand-edit `caption-style.json` first:

- style preset or custom style-config path
- captions on or off
- caption placement
- caption opacity
- vertical crop vs vertical contain
- context-scenes / B-roll on or off for supported workflows
- sound effects on or off for supported workflows

### Menu Options

| Menu | What it does | Direct command | Main output |
| --- | --- | --- | --- |
| `1` | Download links from `links.txt` and stop. | `npm run clipkit -- download --links links.txt` | `outputs/download-run-*/downloads/` |
| `2` | Download whole videos and chop them into fixed clips. | `npm run clipkit -- fixed-clips --links links.txt --segment-seconds 15` | `outputs/fixed-clips-run-*/fixed-clips/` |
| `3` | Cut one local video into fixed clips. | `npm run clipkit -- split-video --video "/path/to/video.mp4" --segment-seconds 15` | `outputs/local-fixed-clips-run-*/fixed-clips/` |
| `4` | Find important moments for manual editing only. | `npm run clipkit -- moments --links links.txt --max-clips 6 --padding-seconds 2` | `outputs/run-*/captioned-clips/*.moment.mp4` |
| `5` | Full YouTube auto-clipping workflow. | `npm run clipkit -- auto-clips --links links.txt --max-clips 6 --padding-seconds 2` | `outputs/run-*/captioned-clips/*.captioned.mp4` |
| `6` | B-roll-heavy workflow using labeled `links.txt`. | `npm run clipkit -- broll-captions --links links.txt --max-clips 3` | `outputs/run-*/captioned-clips/*.captioned.mp4` |
| `7` | Caption one existing video. | `npm run clipkit -- caption --video "/path/to/video.mp4"` | `outputs/caption-run-*/final/` |
| `8` | Enhance an existing edit with B-roll and captions. | `npm run clipkit -- enhance --video "/path/to/edit.mp4"` | `outputs/enhance-run-*/final/` |
| `9` | Find standalone B-roll from a prompt file. | `npm run clipkit -- broll --prompts broll-prompts.txt --max-downloads 8` | `outputs/broll-run-*/` |
| `10` | List or rerender a generated clip. | `npm run clipkit -- rerender --clip <id>` | `*.corrected.mp4` or replaced `*.captioned.mp4` |
| `11` | Clean temp files / old outputs. | `npm run clipkit -- cleanup` | Deletes generated files after confirmation |
| `12` | Open Remotion Studio. | `npm run studio` | Preview UI |
| `13` | Open the newest output folder. | `npm run output:open` | Latest `outputs/run-*` folder |
| `14` | Run diagnostics. | `npm run doctor` | Terminal health report |

Menu option `10` supports both cases: leave the clip blank to list editable clips, or enter a clip number, slug, title fragment, or full `.captions.json` path to rerender immediately.

For one-off exports where you want the B-roll/video only, you can rerender without captions:

```bash
npm run clipkit -- rerender --run outputs/run-YYYY-MM-DD-HHMMSS --clip 03-your-website-is-leaking-money --no-captions
```

## Clean Up Generated Files

Use this when the project folder is getting too heavy.

```bash
npm run cleanup
```

Cleanup can remove temporary render staging from `work/` and `public/media/`, or prune old folders in `outputs/` while keeping the newest 5. It asks for confirmation before deleting.

Useful direct commands:

```bash
npm run cleanup -- --temp --yes
npm run cleanup -- --outputs --keep-latest 5 --yes
npm run cleanup -- --outputs --keep-latest 5 --dry-run
```

## Download YouTube Videos And Stop

Use this when you only want the source videos downloaded from a text file.

1. Put one YouTube URL per line in `links.txt`.
2. Run:

```bash
npm run download:youtube -- --links links.txt
```

Output:

```text
outputs/download-run-YYYY-MM-DD-HHMMSS/downloads/
```

This does not transcribe, clip, caption, add B-roll, or render.

Shortcut alias:

```bash
npm run clipkit -- download --links links.txt
```

## Download Full Videos And Chop Them Into Fixed Clips

Use this when you want the original full-video chopping workflow: download every source in `links.txt`, then split each whole video into back-to-back 15-second clips.

```bash
npm run clipkit -- fixed-clips --links links.txt --segment-seconds 15
```

Shortcut alias:

```bash
npm run clips:fixed -- --links links.txt --segment-seconds 15
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
npm run clipkit -- split-video --video "/path/to/video.mp4" --segment-seconds 15
```

Shortcut alias:

```bash
npm run video:split -- --video "/path/to/video.mp4" --segment-seconds 15
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
npm run clipkit -- moments --links links.txt --max-clips 6 --padding-seconds 2
```

Shortcut alias:

```bash
npm run moments:auto -- --links links.txt --max-clips 6 --padding-seconds 2
```

Output clips land inside the run folder as `*.moment.mp4`, alongside a `selection.json` file with the chosen timestamps, hooks, and reasons.

By default, those boundaries are snapped to nearby transcript thought boundaries so the clip lands more cleanly at the start and end of a complete line. Use `--boundary-lookaround-seconds 8` to let it search a bit farther, or `--disable-thought-snapping` to keep the raw AI timestamps.

This workflow does not add captions, B-roll, SFX, or final overlay renders.

### Review Viral Scorecards For A Moments Run

Use this when you want a clearer answer to "why did the bot pick this?" before you drag clips into a manual timeline.

```bash
npm run moments:review -- --write --format markdown
```

That reads the latest `outputs/run-*` folder and creates a report with:

- overall score
- strongest signals
- hook strength
- emotional intensity
- practical value
- identity resonance
- visual payoff
- thought completeness

To save the scorecards back into each `selection.json`:

```bash
npm run moments:review -- --persist --write --format json
```

## Auto AI Clip YouTube Videos

Use this when you have long YouTube videos and want the system to download them, transcribe them, select the most interesting clips, add padding, mix B-roll/SFX when enabled, and render captioned shorts.

```bash
npm run clipkit -- auto-clips --links links.txt --max-clips 6 --padding-seconds 2
```

Shortcut alias:

```bash
npm run clip:auto -- --links links.txt --max-clips 6 --padding-seconds 2
```

## B-Roll-Heavy Caption Generator

Use this when `links.txt` is labeled by creator/profile and you want the final edits to lean heavily on your local custom scenes library instead of mostly the original talking-head footage.

```bash
npm run clipkit -- broll-captions --links links.txt --max-clips 3
```

Shortcut alias:

```bash
npm run broll:captions -- --links links.txt --max-clips 3
```

Defaults for this workflow:

- uses `custom-scenes-library/`
- uses `custom-scenes-library/library.config.json`
- uses `styles/broll-heavy-custom-scenes.json`
- forces `--context-scenes`
- forces `--local-scenes-only`
- forces `--disable-sound-effects`
- forces `--vertical-contain`

This is the best fit for the labeled creator workflow where `# Mani Videos` and `# Josep Videos` in `links.txt` should route to matching scene profiles.

## Auto Caption Any Video

Use this when the edit already exists and you only want the invert/masked caption style rendered on top.

```bash
npm run clipkit -- caption --video "/path/to/video.mp4"
```

With manual transcript corrections:

```bash
npm run clipkit -- caption \
  --video "/path/to/video.mp4" \
  --captions "/path/to/fixed.captions.json"
```

## Enhance An Existing Edit

Use this when you have a mostly edited base video and want timed B-roll cutaways plus captions.

```bash
npm run clipkit -- enhance --video "/path/to/edit.mp4" --run-name edit-v1
```

The final video will be in `outputs/<run-name>/final/`.

## Find Standalone B-Roll

Use this when you are editing manually and only want matching B-roll assets from a text file.

```bash
npm run clipkit -- broll --prompts broll-prompts.txt --max-downloads 8
```

Put one phrase, sentence, or transcript beat per line in the prompt file.

## Rerender

List generated clips:

```bash
npm run clipkit -- rerender --list
```

Rerender a specific clip:

```bash
npm run clipkit -- rerender --clip 03-your-website-is-leaking-money
```

Rerender a specific clip with captions disabled for that export only:

```bash
npm run clipkit -- rerender --clip 03-your-website-is-leaking-money --no-captions
```

## Diagnostics

```bash
npm run doctor
```

This checks Node, npm, ffmpeg, ffprobe, yt-dlp, `.env`, and API key presence.

## Other Useful Everyday Commands

Open the newest output folder:

```bash
npm run output:open
```

Open Remotion Studio:

```bash
npm run studio
```

Create one captions JSON without rendering:

```bash
npm run transcribe -- --video "/path/to/video.mp4" --out work/clip.captions.json
```

Benchmark local transcription against OpenAI on the same video:

```bash
npm run transcribe:benchmark -- --video "/path/to/video.mp4"
```
