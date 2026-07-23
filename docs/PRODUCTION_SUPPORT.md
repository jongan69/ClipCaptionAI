# Production Support Matrix

This table describes what the repository can currently prove locally. “Supported” means the command is implemented, tested, and has a documented local contract. It does not mean every external service call has been run in this environment.

| Area | Status | Evidence / boundary |
| --- | --- | --- |
| Generic `video plan/render/inspect/qa` | Supported | Versioned run manifest, Remotion render, ffprobe QA |
| Existing-video captions and rerenders | Supported | `caption`, `rerender`, `render:clip` |
| YouTube download and clipping | Supported with local prerequisites | Requires `yt-dlp`, network, and rights to use source media |
| Local transcription | Supported when whisper.cpp is installed | Provider selected by environment/configuration |
| OpenAI analysis/transcription | Supported integration | Requires `OPENAI_API_KEY`; live request proof is separate |
| ElevenLabs narration | Supported guarded integration | Requires key; output manifest is non-secret and reviewable |
| fal GPT Image 2 / Veo reference video | Supported guarded integration | Requires explicit marketing approval and human review |
| Remotion logo/deck compositions | Supported local rendering | Visual QA remains separate from source checks |
| Rotato | Optional external local integration | Requires the Rotato app/CLI and a real `.rotato` scene |
| Higgsfield | External handoff/import workflow | The CLI must not claim completion until a real MP4 is imported and QA passes |
| Electron desktop | Optional thin shell | CLI remains the source of truth |
| eBay live upload/publication | Not implied by local render success | Requires separate authenticated API and publication evidence |

## Release evidence

Production reporting must distinguish source changes, local checks, rendered artifacts, provider transactions, visual review, external-tool output, hosted deployment, and publication. A passing `npm test` or `ffprobe` check cannot substitute for those other claims.
