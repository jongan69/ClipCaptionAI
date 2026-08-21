# AI Providers

ClipCaptionAI uses a shared provider abstraction (`scripts/ai-provider.mjs`) so chat workflows can use local Ollama, DeepSeek, or OpenAI.

## Provider selection

Set one or both in `.env`:

```
DEEPSEEK_API_KEY=sk-your-deepseek-key
OPENAI_API_KEY=sk-your-openai-key
```

Auto mode prefers an installed local Ollama and starts its service when needed. It pulls `qwen3:4b` once when missing. Readiness or setup failure falls back to DeepSeek, then OpenAI, when configured. Explicit `--provider ollama` and inference failures fail closed. Use `CCA_DISABLE_OLLAMA=1` for cloud-only automation.

## What each provider supports

| Capability | Ollama | DeepSeek | OpenAI |
|---|---|---|---|
| Chat completions | ✅ `qwen3:4b` | ✅ `deepseek-v4-pro` / `deepseek-v4-flash` | ✅ `gpt-4.1-mini` |
| JSON mode | ✅ | ✅ | ✅ |
| Strict JSON schema | ❌ | ❌ | ✅ |
| Whisper transcription | ❌ | ❌ | ✅ `whisper-1` |

## Transcription

Transcription is **independent of the chat provider**. It uses its own provider chain:

1. **local whisper.cpp** (`whisper-cli` binary, models in `models/whisper.cpp/`) — default
2. **OpenAI Whisper** (`whisper-1`) — requires `OPENAI_API_KEY`
3. **YouTube subtitles** — fallback for YouTube-sourced files

Set `TRANSCRIBE_PROVIDER` in `.env` to override: `local-whispercpp`, `openai`, or `youtube`.

## Default models

| Provider | Model | Env override |
|---|---|---|
| Ollama | `qwen3:4b` | explicit model flag |
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
bun run voiceover:elevenlabs -- \
  --script narration.txt \
  --voice-id YOUR_VOICE_ID \
  --output outputs/demo/narration.mp3
```

Writes MP3 audio and a generation manifest with voice/model IDs, text hash, and request ID. Never writes the key or narration text into the manifest.

Build or resume the reusable phrase library within an explicit character budget:

```bash
bun run voiceover:library -- --budget 36000 --resume
```

The command writes one MP3 and non-secret manifest per phrase, does not retry ambiguous paid generation requests, checks the live subscription balance, and preserves a safety reserve. Use `--dry-run` before spending credits. Generated audio still requires human review for pronunciation, tone, and licensing suitability; see [the voice library guide](VOICE_LIBRARY.md).

### fal reviewed marketing assets

```bash
bun run fal:image-edit -- \
  --image approved-source.jpg \
  --prompt "Replace only the background with a clean studio sweep" \
  --approved-for-generated-marketing

bun run fal:reference-video -- \
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
