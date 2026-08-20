# Changelog

All notable changes to ClipCaptionAI are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-08-20 — production-readiness pass

### Added
- `CHANGELOG.md` (this file)
- ESLint (flat config) + Prettier across `scripts/`, `desktop/`, and `tests/` — `npm run lint`, `npm run format`
- `desktop/tsconfig.json` with `strict: true` — `npm run typecheck:desktop` (surfaced and fixed 7 silent type errors in the renderer)
- macOS notarization hook (`desktop/scripts/notarize.cjs`) that runs when Apple credentials are present
- Strict CSP injected into the built renderer (`desktop/lib/fix-crossorigin.mjs`)
- `cca:probe-video` IPC (read-only ffprobe) — fixes Interview Q&A probing, which previously called a nonexistent bridge method
- `emitJsonResult` helper in `scripts/lib.mjs` (canonical `--json` stdout helper)
- Caption font contract + render-time warning (`src/fonts.ts`, called from `Root` `calculateMetadata`)
- Zod validation of `CaptionedClip` props at the composition boundary (`src/root.tsx`) — malformed captions now fail loudly instead of producing NaN frames
- `EBAY_MCP_TOKEN` auth for the eBay MCP worker (required, sent as `Authorization: Bearer`)

### Changed
- `scripts/ebay/` and `scripts/logo/` (plus their `src/`/`assets/` dependencies) are now included in the published npm tarball — every advertised CLI command works after `npm install`
- README restructured to a quickstart + command reference (~300 lines); all workflow walkthroughs consolidated in `docs/WORKFLOWS.md` (no cross-file duplication)
- `slugify`/`timestampSlug`/`tokenize` deduplicated: single implementations in `lib.mjs`/`clipkit-lib.mjs`, all 19 local copies now delegate
- `ai-provider.mjs` hardened: 180s default client timeout, `structuredChatCompletion` retries once on invalid JSON with a repair prompt, `resolveModel` returns `null` (provider-agnostic) instead of a hardcoded OpenAI fallback; dead exports removed
- `smart-clips.mjs` validates selection plans (loaded from disk or from the model) against a zod schema and regenerates invalid ones instead of crashing
- `transcribe-openai.mjs` no longer leaks temp audio: removed `process.exit(0)` that skipped the cleanup `finally`; added a `catch` with clean non-zero exit
- `resolveModel` call sites and transcription enhancement now use the shared `structuredChatCompletion` path
- Removed the hardcoded `/Users/jonathangan/...` paths from `process-links.mjs` (env `CCA_LINKS_PATH`) and `clipkit.mjs` (env `CCA_FRAME_PATH`)
- `lib.run()` errors now report exit code/signal, and missing binaries produce a distinct message
- Remotion: page segmentation memoized separately from the per-frame lookup; `containerPositionStyle` memoized; hardcoded shot count (6) replaced with `shots.length`; `08-glitch-resolve` uses the `fps` prop; linger windows named (`PAGE_OVERLAP_MS`, `TOKEN_OVERLAP_MS`); type-unsafe casts removed from `showcase-root.tsx`
- Tests: silent skips replaced with loud `t.skip()`; ai-provider suite rewritten (26 tests) with mocked network-layer coverage for `chatCompletion`/`structuredChatCompletion`; env restore hardened with `finally`

### Fixed (desktop — shipping blockers)
- Added the missing `main` entry point — packaged builds previously crashed at launch
- `asarUnpack` now covers `bin/`, `scripts/`, `src/`, and friends, and packaged runtime paths point at `app.asar.unpacked` — spawned CLI workflows now work in the shipped app
- Preload converted to CommonJS (`preload.cjs`) so it loads under `sandbox: true` — the renderer bridge previously never initialized when packaged
- Renderer navigation lockdown (`will-navigate` deny + `setWindowOpenHandler` deny) — any navigation previously attached the privileged IPC bridge to attacker-controlled content
- Every `ipcMain` handler now validates its sender (`assertTrustedSender`), raw commands are restricted to the CLI catalog allowlist, and `cca:set-secret` enforces the secret-key allowlist (previously arbitrary env keys could be injected into every child process)
- Secrets saved in the UI now reach CLI children immediately (merged into each spawn env) instead of after an app restart
- `window-all-closed` respects macOS convention; second-instance guard no longer creates a window while quitting; main-process `uncaughtException`/`unhandledRejection` handlers added
- `preferences.json` written `0600`; log redaction extended to named API keys and `--api-key` values
- Removed the unwired worker layer (`desktop/worker/`, `desktop/workers/`) and dead IPC channels; `shared/protocol.mjs` is now the single wired source of truth
- `desktop/dist-renderer/` untracked and gitignored
- macOS entitlements: added `network.client` + user-selected/downloads file access (required for the sandboxed app and its spawned ffmpeg/node children)

### Security
- eBay pipeline (23 scripts): top-level error containment everywhere; MCP endpoint now requires a token
- `npm audit` clean (nanoid transitively bumped via postcss)

## [0.1.0] — 2026-08-09

### Added
- CLI beta release: AI video editor with transcription (whisper.cpp → OpenAI Whisper → YouTube CC), smart clip selection, chapter detection, tightening, captioning, B-roll/SFX enhancement, and Remotion rendering
- Electron desktop app with glassmorphic React UI and interview Q&A pipeline
- Video compression with CRF encoding and quality presets
- eBay competitive ad pipeline and logo animation pipeline
- AI provider abstraction over DeepSeek/OpenAI
