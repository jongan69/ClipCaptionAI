# Rotato Integration Notes

Optional local integration (the CLI remains usable without Rotato):

- Rotato desktop app exists at `/Applications/Rotato.app`.
- Rotato CLI exists at `/usr/local/bin/rotato`.
- `VideoAssets` currently exists at `/Users/jonathangan/LocalCode/VideoAssets`, but the folder is empty right now.

## What We Added

ClipCaption now has a thin Rotato bridge so mockup rendering can live beside the rest of the video tooling:

```bash
clipcaptionai rotato doctor
clipcaptionai rotato inspect /path/to/project.rotato --json
clipcaptionai rotato render /path/to/project.rotato --screen-media /path/to/app-capture.mp4 --output outputs/mockups/demo.mp4
```

This is intentionally small. It does not generate `.rotato` projects from AI prompts yet. It just makes Rotato reachable from the same CLI surface as captions, B-roll, and renders.

## Why This Is The Right First Step

- It keeps Rotato useful without turning ClipCaption into a full mockup editor yet.
- It gives us one CLI entry point for future demo-video workflows.
- It lets future automation swap app recordings, screenshots, and overlay text into existing Rotato scenes.

## Best Candidates To Absorb Before Deleting Any Old Video-Assets Workspace

- Reusable `.rotato` scene templates for phones, laptops, browser windows, and side-by-side product demos.
- Naming conventions for screen recordings, overlay copy, and export targets.
- Prebuilt animation recipes such as app reveal, feature tour, testimonial montage, and CTA end cards.
- Any shell scripts or JSON manifests that already map source media into repeatable demo exports.

## Good Next Step Later

If we want phase two, the smart move is probably a ClipCaption command that:

1. takes a rendered app clip or screenshots,
2. selects a Rotato template,
3. swaps media and overlay text,
4. exports a polished mockup video into `outputs/mockups/`.

That would give you AI-assisted demo generation without keeping a separate orphaned video-assets repo around. Until then, a Rotato scene must exist locally and a successful bridge command is not proof that a final product video has passed visual QA.
