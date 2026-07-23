# ElevenLabs Voice Library

The repository contains the generator and manifests for the local ElevenLabs phrase library. The generated MP3 files are distributed as a GitHub Release asset so normal clones stay small.

## Restore the generated library

From a fresh checkout:

```bash
mkdir -p /tmp/clipcaptionai-voice-library
gh release download voice-library-2026-07-23 \
  --repo jongan69/ClipCaptionAI \
  --pattern 'clipcaptionai-elevenlabs-library.tar.gz' \
  --dir /tmp/clipcaptionai-voice-library
tar -xzf /tmp/clipcaptionai-voice-library/clipcaptionai-elevenlabs-library.tar.gz \
  -C outputs/voiceover
```

The archive restores `outputs/voiceover/elevenlabs-library/`, including 672 MP3 clips, per-clip generation manifests, and `library.json`. Verify the download before extracting it:

```text
SHA-256: 3fb5e58e7a6acde17ac81c4c78ddb5e7294dd5a80fc89d4a80b142adc81f3d29
```

The generated audio is reusable production material, but still requires human review for pronunciation, tone, and suitability. The source generator is resumable and checks the live ElevenLabs balance:

```bash
npm run voiceover:library -- --resume --budget 36000
```
