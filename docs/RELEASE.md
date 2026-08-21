# ClipCaptionAI v0.2.0

ClipCaptionAI v0.2.0 is a CLI-first video-production toolkit with an optional Electron desktop observer. Its supported first-run path is local and deterministic; provider-backed workflows are opt-in.

## Install from the release tarball

Prerequisites are Bun 1.3 or newer plus `ffmpeg` and `ffprobe` on `PATH`.

```bash
bun install --global ./clipcaptionai-0.2.0.tgz
clipcaptionai doctor
clipcaptionai video run --example --run-id first-video
clipcaptionai video qa --run outputs/video-runs/first-video
```

The finished MP4 and its versioned QA manifest are written below the current directory in `outputs/video-runs/first-video/`.

## Supported platforms

| Platform | CLI beta | Desktop beta |
| --- | --- | --- |
| macOS 13+ on Apple silicon | Supported and release-smoked | Attached when signing and packaging pass |
| macOS 13+ on Intel | Expected with Bun and FFmpeg; not release-smoked | Not included in v0.2.0 |
| Windows 10/11 x64 | Expected with Bun and FFmpeg; not release-smoked | Not included in v0.2.0 |
| Current x64 Linux | CI verified with Bun and FFmpeg | Build verified; installer not included in v0.2.0 |

## Optional providers

OpenAI, DeepSeek, ElevenLabs, fal, YouTube Data API, whisper.cpp, yt-dlp, Rotato, and Higgsfield are optional integrations. The five-minute first-run workflow does not contact them. Provider-backed commands may incur third-party cost and require their own credentials, rights review, and output review. Copy `.env.example` to a local `.env` only when opting into those workflows; never commit the resulting file.

## Verify downloads

```bash
shasum -a 256 -c SHA256SUMS.txt
```

The curated source archive and npm-compatible tarball deliberately omit local outputs, environment files, secrets, dependencies, desktop build products, and unrelated ListingOS assets.
