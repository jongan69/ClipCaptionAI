# Local AI Provider Workflows

ClipCaptionAI keeps paid-provider calls in local Node scripts. They are not part of the Electron renderer, and their secrets stay in `.env`. Configuration and dry-run support do not prove a live provider transaction; retain the request ID and downloaded artifact in the run evidence when a live call is made.

Provider status and evidence boundaries are summarized in [the production support matrix](PRODUCTION_SUPPORT.md).

## ElevenLabs narration

Set `ELEVENLABS_API_KEY` and optionally `ELEVENLABS_VOICE_ID` in `.env`, then generate a narration file from reviewed copy:

```bash
npm run voiceover:elevenlabs -- \
  --script narration.txt \
  --voice-id YOUR_VOICE_ID \
  --output outputs/demo/narration.mp3
```

The command writes MP3 audio and a sibling generation manifest containing the voice/model IDs, text hash, response request ID, and audio hash. It never writes the key or narration text into that manifest.

To spend a bounded character budget building reusable local assets across the configured cloned voice and available premade voices:

```bash
npm run voiceover:library -- --budget 36000 --resume
```

This writes `outputs/voiceover/elevenlabs-library/library.json`, one MP3 plus one non-secret manifest per phrase, and retries only safe provider failures. Use `--dry-run` before a large batch; the command checks the live subscription balance and leaves a safety reserve. The checked-in phrase catalog covers hooks, workflow, features, captions, B-roll, quality, and calls to action. Generated audio remains subject to human review for pronunciation, tone, and licensing suitability.

For the demo, review the exact narration before generation and make sure it clearly explains how Codex and GPT-5.6 were used.

## fal reviewed marketing assets

Set `FAL_KEY` in `.env`. Both fal commands require an explicit acknowledgement because their outputs are generated marketing/B-roll assets, never eBay source-of-truth/main listing photos or evidence of product condition.

Create a GPT Image 2 edit:

```bash
npm run fal:image-edit -- \
  --image approved-source.jpg \
  --prompt "Replace only the background with a clean studio sweep" \
  --approved-for-generated-marketing
```

Create a muted five-second Veo 3.1 proof from up to three approved reference images:

```bash
npm run fal:reference-video -- \
  --image approved-product.jpg \
  --prompt "Slow orbit around the exact supplied item; preserve labels, finish, and included accessories" \
  --duration 5 \
  --resolution 1080p \
  --approved-for-generated-marketing
```

Each command stores a manifest with the input file hashes, request ID, output hash, prompt, and `pending_human_review` status. Review every output for product truth before adding it to a video. Do not run a fal hero shot and a Higgsfield hero shot for the same planned beat.

Veo 3.1 output carries Google's invisible SynthID watermark; it is intentionally a generated marketing asset, not source evidence.

## External operator tools

- **Cursorful:** record the real app flow at 1080p with readable UI and cursor-follow zooms; then feed the recording into the existing caption/render workflow.
- **Shotcut:** optional manual trim/audio-repair fallback only. It is not a ClipCaptionAI runtime dependency.
- **HyperFrames:** intentionally not integrated; Remotion remains the deterministic programmatic-rendering source of truth.
