# Custom Scenes Library

This folder is for your local personal B-roll library.

Keep your raw clips here when you want the `broll-captions`, `enhance`, or `scene:index` workflows to use your own footage instead of downloading new sources.

Recommended local contents:

- `library.config.json` for clip/profile tagging rules
- raw personal footage like `Mani-Clip-1.MP4`
- generated `index.json` after running `npm run scene:index`

This directory is intentionally gitignored for GitHub so personal client footage and local media do not get committed accidentally.

Use the example config here as a starting point:

```bash
cp examples/custom-scenes.library.config.example.json custom-scenes-library/library.config.json
```
