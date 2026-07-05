# ClipCaptionAI Workflows

## One-Click Menu

Double-click `RUN.command`, or run:

```bash
npm run menu
```

The menu is the safest front door for everyday editing. It can download YouTube videos, run YouTube clipping, caption an existing edit, enhance a video with B-roll, find standalone B-roll, rerender a generated clip, open Studio, open the latest output, and run diagnostics.

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

## Auto AI Clip YouTube Videos

Use this when you have long YouTube videos and want the system to download them, transcribe them, select the most interesting clips, add padding, mix B-roll/SFX when enabled, and render captioned shorts.

```bash
npm run clipkit -- auto-clips --links links.txt --max-clips 6 --padding-seconds 2
```

Shortcut alias:

```bash
npm run clip:auto -- --links links.txt --max-clips 6 --padding-seconds 2
```

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

## Diagnostics

```bash
npm run doctor
```

This checks Node, npm, ffmpeg, ffprobe, yt-dlp, `.env`, and API key presence.
