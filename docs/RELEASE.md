# ClipCaptionAI v0.2.1 release candidate

ClipCaptionAI v0.2.1 is a CLI-first video-production toolkit with an optional Electron desktop observer. Its supported first-run path is local and deterministic; provider-backed workflows are opt-in.

## Install from the release tarball

Prerequisites are Bun 1.4.4 or newer plus `ffmpeg` and `ffprobe` on `PATH`.

```bash
mkdir clipcaptionai-0.2.1
tar -xzf clipcaptionai-0.2.1.tgz -C clipcaptionai-0.2.1 --strip-components=1
cp bun.lock clipcaptionai-0.2.1/bun.lock
cd clipcaptionai-0.2.1
bun install --production --frozen-lockfile --ignore-scripts
bun bin/clipcaptionai.js doctor
bun bin/clipcaptionai.js video run --example --run-id first-video --wait
bun bin/clipcaptionai.js video qa --run outputs/video-runs/first-video --wait
```

Download the companion `bun.lock` and checksum file alongside the tarball. Bun omits lockfiles from npm-compatible tarballs. Install in the extracted package directory so its root-level security overrides apply. Installing it as a dependency of another project or globally does not apply those overrides; that installation mode is not validated for this candidate.

The finished MP4 and its versioned QA manifest are written below the current directory in `outputs/video-runs/first-video/`.

## Supported platforms

| Platform | CLI beta | Desktop beta |
| --- | --- | --- |
| macOS 13+ on Apple silicon | Supported and release-smoked | Attached when signing and packaging pass |
| macOS 13+ on Intel | Expected with Bun and FFmpeg; not release-smoked | Not included in v0.2.1 |
| Windows 10/11 x64 | Expected with Bun and FFmpeg; not release-smoked | Not included in v0.2.1 |
| Current x64 Linux | Not verified for this candidate | Not verified for this candidate |

## Optional providers

OpenAI, DeepSeek, ElevenLabs, fal, YouTube Data API, whisper.cpp, yt-dlp, Rotato, and Higgsfield are optional integrations. The five-minute first-run workflow does not contact them. Provider-backed commands may incur third-party cost and require their own credentials, rights review, and output review. Copy `.env.example` to a local `.env` only when opting into those workflows; never commit the resulting file.

## Verify downloads

```bash
shasum -a 256 -c SHA256SUMS.txt
```

The curated source archive and npm-compatible tarball deliberately omit local outputs, environment files, secrets, dependencies, desktop build products, and unrelated ListingOS assets.

This candidate is not a published release. Local validation and remaining evidence are recorded in `docs/COMPLETION_STATUS.md`. Desktop packaging excludes local media and downloaded model libraries; install optional models separately. Unsigned local desktop bundles do not establish notarized macOS distribution readiness.
