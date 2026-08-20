# GitHub Setup Notes

This project can be published as code, but generated media should stay local.

## Commit

Recommended commit scope:

```bash
git add README.md package.json package-lock.json .gitignore RUN.command BROLL.command bin .github scripts docs examples styles tests projects/.gitkeep outputs/.gitkeep .env.example CLAUDE.md
git commit -m "Organize ClipCaptionAI workflow toolkit"
```

Do not commit:

- `.env`
- `outputs/`
- downloaded `scene-library` videos
- personal `custom-scenes-library` footage
- raw client/source videos
- generated audio/video from `sfx-library`

## README Surface

The public command surface is:

```bash
bun run menu
bun run doctor
bun run clipkit -- auto-clips
bun run clipkit -- caption
bun run clipkit -- enhance
bun run clipkit -- broll
bun run clipkit -- rerender
```

Keep deeper scripts available for power use, but route everyday editing through `clipkit` so the project stays understandable.
