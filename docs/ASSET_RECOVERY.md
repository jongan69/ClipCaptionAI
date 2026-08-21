# Asset Recovery Bundle

The `asset-recovery-2026-07-23` GitHub Release preserves the verified self-created ClipCaptionAI B-roll cards and the local public-source SFX library.

The B-roll bundle contains:

- `plan.svg`
- `render.svg`
- `qa.svg`

The separate `clipcaptionai-sfx-library.tar.gz` release asset contains all 256 local SFX files plus `sfx-library/index.json`.

Restore them from a fresh checkout with:

```bash
mkdir -p /tmp/clipcaptionai-asset-recovery
gh release download asset-recovery-2026-07-23 \
  --repo jongan69/ClipCaptionAI \
  --pattern 'clipcaptionai-cleared-assets.tar.gz' \
  --dir /tmp/clipcaptionai-asset-recovery
tar -xzf /tmp/clipcaptionai-asset-recovery/clipcaptionai-cleared-assets.tar.gz \
  -C .
```

To restore the SFX library as well:

```bash
gh release download asset-recovery-2026-07-23 \
  --repo jongan69/ClipCaptionAI \
  --pattern 'clipcaptionai-sfx-library.tar.gz' \
  --dir /tmp/clipcaptionai-asset-recovery
tar -xzf /tmp/clipcaptionai-asset-recovery/clipcaptionai-sfx-library.tar.gz \
  -C .
```

The SFX files are preserved because they are publicly available local assets, but public availability is not the same as verified commercial-use clearance. Review source terms before publishing a video commercially. The `music-library/` manifest explicitly marks its tracks `review_before_commercial_use`, so music remains excluded. The downloaded YouTube/movie `scene-library/` is intentionally excluded until its rights are reviewed.
