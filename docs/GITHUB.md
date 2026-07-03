# GitHub Setup Notes

This project can be published as code, but generated media should stay local.

## Commit

Recommended commit scope:

```bash
git add README.md package.json package-lock.json .gitignore RUN.command scripts docs examples styles projects/.gitkeep outputs/.gitkeep .env.example
git commit -m "Organize ClipCaptionAI workflow toolkit"
```

Do not commit:

- `.env`
- `outputs/`
- downloaded `scene-library` videos
- raw client/source videos
- generated audio/video from `sfx-library`

## README Surface

The public command surface is:

```bash
npm run menu
npm run doctor
npm run clipkit -- auto-clips
npm run clipkit -- caption
npm run clipkit -- enhance
npm run clipkit -- broll
npm run clipkit -- rerender
```

Keep deeper scripts available for power use, but route everyday editing through `clipkit` so the project stays understandable.
