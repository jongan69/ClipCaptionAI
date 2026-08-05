# Agent Guide

ClipCaptionAI is a video-focused command-line harness. Read `CLAUDE.md` at the repo root for the architecture overview, module map, and current conventions. This doc covers the contract rules for model-directed operation.

## Recommended sequence

From a cloned checkout:

```bash
npm run clipkit -- doctor
npm run clipkit -- video plan --brief-file brief.txt --assets-dir ./approved-assets --json
npm run clipkit -- video inspect --run outputs/video-runs/brief --json
npm run clipkit -- video render --run outputs/video-runs/brief --json
npm run clipkit -- video qa --run outputs/video-runs/brief --json
```

Use `--dry-run` before any paid provider call or expensive render. Use `--run-id` for stable names. A run may be resumed by invoking `render` again; existing artifacts are reused unless `--force` is supplied.

## Contract rules

- Treat `run.json` as the source of truth for that run.
- Treat `qa.status=passed` as the minimum technical completion gate.
- Do not infer provider success from configuration, a request ID, or a dry-run manifest.
- Do not put secrets in prompts, arguments, manifests, or generated logs.
- The AI provider (`scripts/ai-provider.mjs`) abstracts DeepSeek and OpenAI — use `--provider` to override auto-detection. Chat/analysis works with either; transcription requires OpenAI or local whisper.cpp.
- Use existing specialized commands when they provide the right behavior: `caption`, `enhance`, `auto-clips`, `chapter`, `broll`, `voiceover`, `fal-image-edit`, `fal-reference-video`, and `rotato`.
- Generated marketing/B-roll assets require human review and are not product-condition evidence.

## JSON output

Commands that support `--json` emit one JSON result on stdout. Human logs and failures go to stderr. Persisted manifests contain hashes and metadata, not provider secrets.

## What completion means

Report the absolute artifact path, run manifest path, output dimensions/duration, and QA status. Clearly separate local render proof from live provider proof, visual review, external-tool completion, and publication.
