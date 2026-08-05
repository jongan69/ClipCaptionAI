# AI Providers

ClipCaptionAI uses a shared provider abstraction (`scripts/ai-provider.mjs`) so any script that calls an LLM works with DeepSeek or OpenAI automatically.

## Provider selection

Set one or both in `.env`:

```
DEEPSEEK_API_KEY=sk-your-deepseek-key
OPENAI_API_KEY=sk-your-openai-key
```

If both keys are present, **DeepSeek is preferred** for chat/analysis. Override per-run with `--provider openai` or `--provider deepseek`.

## What each provider supports

| Capability | DeepSeek | OpenAI |
|---|---|---|
| Chat completions (text generation) | ✅ `deepseek-v4-pro` / `deepseek-v4-flash` | ✅ `gpt-4.1-mini` |
| JSON mode (`response_format: json_object`) | ✅ | ✅ |
| Strict JSON schema | ❌ | ✅ |
| Streaming | ✅ | ✅ |
| Whisper transcription | ❌ | ✅ `whisper-1` |
| Responses API | ❌ | ✅ |

## Transcription

Transcription is **independent of the chat provider**. It uses its own provider chain:

1. **local whisper.cpp** (`whisper-cli` binary, models in `models/whisper.cpp/`) — default
2. **OpenAI Whisper** (`whisper-1`) — requires `OPENAI_API_KEY`
3. **YouTube subtitles** — fallback for YouTube-sourced files

Set `TRANSCRIBE_PROVIDER` in `.env` to override: `local-whispercpp`, `openai`, or `youtube`.

## Default models

| Provider | Model | Env override |
|---|---|---|
| DeepSeek | `deepseek-v4-pro` | — |
| DeepSeek (fast) | `deepseek-v4-flash` | — |
| OpenAI | `gpt-4.1-mini` | `OPENAI_TEXT_ANALYSIS_MODEL` |
| OpenAI (selection) | `gpt-4.1` | `OPENAI_SELECTION_MODEL` |
| OpenAI (Whisper) | `whisper-1` | `--model` flag |

Pass `--chapter-model`, `--selection-model`, or `--model` to override per-script.

## Other providers

| Provider | Env var | Scripts |
|---|---|---|
| ElevenLabs (voiceover) | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | `generate-elevenlabs-voiceover.mjs` |
| fal.ai (image/video gen) | `FAL_KEY` | `fal-image-edit.mjs`, `fal-reference-video.mjs` |
| Higgsfield (product video gen) | External CLI via MCP | eBay competitive pipeline |

### ElevenLabs narration

```bash
npm run voiceover:elevenlabs -- \
  --script narration.txt \
  --voice-id YOUR_VOICE_ID \
  --output outputs/demo/narration.mp3
```

Writes MP3 audio and a generation manifest with voice/model IDs, text hash, and request ID. Never writes the key or narration text into the manifest.

### fal reviewed marketing assets

```bash
npm run fal:image-edit -- \
  --image approved-source.jpg \
  --prompt "Replace only the background with a clean studio sweep" \
  --approved-for-generated-marketing

npm run fal:reference-video -- \
  --image approved-product.jpg \
  --prompt "Slow orbit around the exact supplied item" \
  --duration 5 \
  --resolution 1080p \
  --approved-for-generated-marketing
```

Each command stores a manifest with input file hashes, request ID, output hash, prompt, and `pending_human_review` status. Review every output before adding it to a video.

## External operator tools

- **Cursorful:** record the real app flow at 1080p with readable UI; feed the recording into the caption/render workflow.
- **Shotcut:** optional manual trim/audio-repair fallback. Not a ClipCaptionAI runtime dependency.
- **HyperFrames:** intentionally not integrated; Remotion remains the deterministic programmatic-rendering source of truth.
