# Agent Guide

ClipCaptionAI is a video-focused command-line harness. The calling model should inspect the available inputs, write a short brief, invoke the CLI, then read the run manifest and QA results before presenting a video as complete.

## Recommended sequence

From a cloned checkout, use the repo-local command form:

```bash
npm run clipkit -- doctor
npm run clipkit -- video plan --brief-file brief.txt --assets-dir ./approved-assets --json
npm run clipkit -- video inspect --run outputs/video-runs/brief --json
npm run clipkit -- video render --run outputs/video-runs/brief --json
npm run clipkit -- video qa --run outputs/video-runs/brief --json
```

If ClipCaptionAI is installed as a package, the equivalent `clipcaptionai ...` form is also supported.

Use `--dry-run` before any paid provider call or expensive render. Use `--run-id` when a stable name is needed. A run may be resumed by invoking `render` again; an existing artifact is reused unless `--force` is supplied.

## Contract rules

- Treat `run.json` as the source of truth for that run.
- Treat `qa.status=passed` as the minimum technical completion gate.
- Do not infer provider success from configuration, a request ID, or a dry-run manifest.
- Do not put secrets in prompts, arguments, manifests, or generated logs.
- Use existing specialized commands when they provide the right behavior: `caption`, `enhance`, `auto-clips`, `broll`, `voiceover`, `fal-image-edit`, `fal-reference-video`, and `rotato`.
- Generated marketing/B-roll assets require human review and are not product-condition evidence.

## JSON output

Commands that support `--json` emit one JSON result on stdout. Human logs and failures are emitted on stderr. Persisted manifests contain hashes and metadata, not provider secrets.

## What completion means

Report the absolute artifact path, run manifest path, output dimensions/duration, and QA status. Clearly separate local render proof from live provider proof, visual review, external-tool completion, and publication.
