Put your cutaway clips in this folder.

The context scene mixer can read:

1. Plain video files anywhere under this folder.
2. Per-file sidecars like `clip.mp4.scene.json`.
3. A top-level `index.json` with a `scenes` array.

Recommended workflow:

- Keep clips short and emotionally specific.
- Tag them with simple concepts like `money`, `power`, `fear`, `status`, `discipline`, `luxury`, `winning`, `chaos`, `betrayal`, `success`.
- If a file contains a longer scene, use `startSeconds` and `endSeconds` in the sidecar or index entry so the mixer pulls the right subsection.
- You can also auto-fill this folder from YouTube videos:

```bash
npm run scene:ingest:youtube -- \
  --query "discipline movie scene" \
  --max-downloads 2 \
  --max-duration-seconds 60
```

That ingest path writes the downloaded MP4, a matching `*.scene.json` sidecar, and a merged `index.json` entry with tags and attribution.

If you manually review the library and delete bad MP4s, keep the matching
`*.scene.json` files and run:

```bash
npm run scene:blacklist
```

That writes `blacklist.json` from the orphaned sidecars and prunes `index.json`
so the same YouTube clips are not used or downloaded again.

Example sidecar:

```json
{
  "title": "Trading floor celebration",
  "source": "The Wolf of Wall Street",
  "description": "High-energy money, winning, status, excess",
  "tags": ["money", "wealth", "winning", "power", "celebration"],
  "startSeconds": 0,
  "endSeconds": 2.8
}
```
