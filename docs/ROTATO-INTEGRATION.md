# Rotato integration

Rotato is optional. ClipCaptionAI discovers the installed CLI, hashes its current help contract, and routes work through the shared job broker:

```sh
clipcaptionai rotato doctor
clipcaptionai rotato inspect /path/to/scene.rotato --json --wait
clipcaptionai rotato render /path/to/scene.rotato --screen-media /path/to/capture.mp4 --output outputs/mockups/demo.mp4 --wait
```

Rendering always runs `inspect --json` first. Template folders contain a real `scene.rotato` and `template.json`; semantic slots compile to inspected device indexes and overlay IDs. A changed inspect fingerprint or missing mapped ID fails with `TEMPLATE_INSPECT_MISMATCH`. `--screen-media` and `--screen-media-for` are mutually exclusive.

Use `clipcaptionai rotato templates --json` to discover the active local template library and its semantic screen slots. Set `CCA_ROTATO_TEMPLATES_ROOT` when the library lives outside the repository.

The wrapper uses safe argv execution and preserves Rotato app handoff, timeout, codec, size, quality, and wait flags. It never persists overlay mutations. Completed files are hashed and probed. `rotato raw` remains available for advanced debugging through the same safe argv path.

Rotato rendering success is not visual approval or publication readiness; marketing QA records those as separate states.
