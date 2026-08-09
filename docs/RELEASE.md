# ClipCaptionAI v0.1.0 Beta

ClipCaptionAI v0.1.0 is a CLI-first public beta. The supported first-run path is local and deterministic: it does not require a paid AI provider or an API key.

## Install from the release tarball

Prerequisites are Node.js 20 or newer plus `ffmpeg` and `ffprobe` on `PATH`.

```bash
npm install --global ./clipcaptionai-0.1.0.tgz
clipcaptionai doctor
clipcaptionai video run --example --run-id first-video
clipcaptionai video qa --run outputs/video-runs/first-video
```

The finished MP4 and its versioned QA manifest are written below the current directory in `outputs/video-runs/first-video/`.

## Supported platforms

| Platform | CLI beta | Desktop beta |
| --- | --- | --- |
| macOS 13+ on Apple silicon | Supported and release-smoked | Best effort; attached only when signed installation passes |
| macOS 13+ on Intel | Expected with Node.js and FFmpeg; not release-smoked | Not included in v0.1.0 |
| Windows 10/11 x64 | Expected with Node.js and FFmpeg; not release-smoked | Not included in v0.1.0 |
| Current x64 Linux | Expected with Node.js and FFmpeg; not release-smoked | Not included in v0.1.0 |

## Optional providers

OpenAI, DeepSeek, ElevenLabs, fal, YouTube Data API, whisper.cpp, yt-dlp, Rotato, and Higgsfield are optional integrations. The five-minute first-run workflow does not contact them. Provider-backed commands may incur third-party cost and require their own credentials, rights review, and output review. Copy `.env.example` to a local `.env` only when opting into those workflows; never commit the resulting file.

## Verify downloads

```bash
shasum -a 256 -c SHA256SUMS.txt
```

The curated source archive and npm-compatible tarball deliberately omit local outputs, environment files, secrets, dependencies, desktop build products, and unrelated ListingOS assets.
