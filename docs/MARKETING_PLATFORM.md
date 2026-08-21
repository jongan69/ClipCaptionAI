# Marketing platform

Campaign commands use the shared adapter catalog and filesystem job broker. The examples assume an installed package; from a repository checkout replace `clipcaptionai` with `bun run clipkit --`.

```sh
clipcaptionai marketing plan --campaign examples/marketing/campaign.example.yaml --wait
clipcaptionai marketing estimate --run <run-id> --wait
clipcaptionai marketing approve --run <run-id> --budget-credits 12
clipcaptionai marketing execute --run <run-id> --wait
clipcaptionai marketing inspect --run <run-id>
clipcaptionai marketing qa --run <run-id> --wait
clipcaptionai marketing export --run <run-id> --wait
```

`plan`, `estimate`, `execute`, `qa`, and `export` detach unless `--wait` is supplied. Runs are stored under `campaigns/<run-id>/`; set `CCA_CAMPAIGNS_ROOT` to move them. Assets are content-hashed and events are append-only. Campaign records contain the shared broker job IDs rather than a second queue.

Approval binds the plan hash, installed-tool capability fingerprint, CLI-derived estimate hash, and total credit budget. Any plan, estimate, adapter, CLI-help, or model change invalidates it. Live generation intents provide current installed-CLI cost argv and submission argv; paid submission additionally requires `--live-execution`. `--dry-run` never submits. Technical QA reports decoding, format, timing, stream, black-frame, silence, caption-zone, CTA, capture-freshness, and Rotato-template checks separately from claims, human visual review, and publication approval.

`execute` resolves the campaign timeline, renders the `MarketingTimeline` Remotion composition, normalizes audio to -16 LUFS by default, and registers a content-hashed final MP4. Timeline videos can be trimmed, muted, volume-adjusted, and fit for the placement; campaigns can add a `voice` narration track, a separate `music` bed, and brand colors. Set `audioTargetLufs` per variant when a delivery profile needs another target. `qa` requires that final artifact and never substitutes a source, generated, capture, or Rotato intermediate.

Product capture is command-only: manifests own argv arrays, cwd, outputs, seed, repository commit, and device profile. No shell interpolation or GUI automation is used.

## Native value-first slideshows

Slideshow campaigns use the same plan, budget, job, render, QA, and export flow as video campaigns. A variant declares `slides` instead of a raw `timeline`. Set `format: carousel` to render one finished PNG per slide, or retain the default `format: video` to expand the slides into an animated video with a CTA end card.

```yaml
variants:
  - id: health-week-saveable
    format: carousel
    cta: Review your day with PrepAI
    slides:
      - src: /absolute/path/from/stock-manifest.json
        eyebrow: SAVE THIS
        headline: 5 realistic ways to support your health this week
        body: Pick one that fits your needs and routine.
        durationSeconds: 2.2
        motion: push-in
        sourceType: stock
        attribution:
          provider: pexels
          creator: Photographer name
          creatorUrl: https://www.pexels.com/@photographer
          sourceUrl: https://www.pexels.com/photo/123
          licenseUrl: https://www.pexels.com/license/
```

`motion` supports `push-in`, `pan-left`, and `pan-right` for video output; `textPosition` supports `top`, `center`, and `bottom`. Carousel output preserves the declared slide count exactly. Stock slides must include creator, source, provider, and license metadata. `execute` registers those source assets and `qa` fails the `stock-provenance` check when the record is incomplete.

Acquire images through the shared adapter before authoring the campaign:

```sh
clipcaptionai stock doctor
clipcaptionai stock download --query "healthy morning walk sunlight" --count 8 --out outputs/stock/health-week --wait --json
```

The adapter requests portrait Pexels originals using the API's `orientation=portrait` and `size=large` filters, then rejects images below 1080×1920. The manifest is the source of truth when an agent fills slide paths and attribution. Reuse the downloaded library across hook, ordering, wording, pacing, and CTA variants instead of downloading duplicate images.

Value slides must remain truthful and legible. Health campaigns require content/claims review; do not invent supplement, treatment, skin, weight-loss, or outcome claims. Stock subjects cannot be presented as customers or as endorsing the product. Promotion may be low-pressure, but it must remain identifiable rather than disguised as independent advice. Pexels downloads are per-campaign creative inputs, not a bulk collection or AI-training dataset; preserve the manifest's Pexels and photographer links.

Rotato templates live at `templates/rotato/<id>/template.json` beside their real `scene.rotato`. Generate `inspectFingerprint` from the current `rotato inspect <scene> --json` result. Semantic slots compile to inspected device indexes and overlay IDs; drift fails with `TEMPLATE_INSPECT_MISMATCH`.
