# Custom Scenes Library

Drop your own B-roll clips here for the broll-captions workflow.

## What goes here

- MP4 clips you've filmed or licensed
- Downloaded footage you have rights to use
- Any video you want the editor to cut away to during caption-rendered clips

## How it's used

The `broll-captions` workflow (and any workflow with `--context-scenes`) searches this directory for clips that match the emotional/metaphorical context of each transcript beat. Clips are indexed by running:

```bash
npm run scene:index -- --scene-library custom-scenes-library
```

This creates `custom-scenes-library/index.json` which the editor reads at render time.

## Organization

You can organize clips however you want — the indexer scans all subdirectories. A common pattern:

```
custom-scenes-library/
├── cinematic/
├── nature/
├── urban/
├── abstract/
└── my-raw-footage/
```

## library.config.json (optional)

Create `custom-scenes-library/library.config.json` to configure indexing behavior:

```json
{
  "index": {
    "tagPatterns": {
      "cinematic": ["cinematic", "movie", "film"],
      "nature": ["nature", "outdoor", "landscape"]
    }
  }
}
```

This file is gitignored; create your own per-project.
