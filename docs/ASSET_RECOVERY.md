# Asset Recovery Bundle

The `asset-recovery-2026-07-23` GitHub Release preserves the verified self-created ClipCaptionAI B-roll cards:

- `plan.svg`
- `render.svg`
- `qa.svg`

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

The existing `sfx-library/` is not included because its files do not have per-file license or source metadata. The `music-library/` manifest explicitly marks its tracks `review_before_commercial_use`, so those tracks are not represented as cleared assets either. The downloaded YouTube/movie `scene-library/` is intentionally excluded for the same reason. Add source URLs, license terms, and provenance before promoting any of those files into a public recovery bundle.
