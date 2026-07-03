# Caption Style Presets

These are starting points for `--style-config`. The root `caption-style.json` remains the default and the most complete config.

```bash
npm run caption:auto -- --video "/path/to/video.mp4" --style-config styles/invert-mask-soft.json
npm run rerender:clip -- --clip 1 --style-config styles/invert-mask-bold.json
```

Use `invert-mask-soft.json` when the speaker should stay dominant and captions should feel reactive to the footage. Use `invert-mask-bold.json` when the text needs to hit harder. Use `clean-editorial.json` for readable non-inverted captions.
