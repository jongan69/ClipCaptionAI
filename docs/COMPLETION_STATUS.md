# Release candidate status — 2026-11-11

Version 0.2.1 is a locally validated CLI and desktop release candidate. It has not been published. Paid-provider transactions and signed/notarized desktop distribution are not established by these checks.

## Acceptance and implementation

- Dry runs do not capture, render, copy assets, submit paid jobs, or alter campaign records.
- Cost estimation accepts cost queries only. Campaign mutations take an exclusive lock before loading state.
- Shared broker locks retain initializing/live ownership, release partial acquisitions, and atomically retire abandoned locks after verifying both worker and child have exited.
- Paid attempts are persisted before submission; uncertain responses are never automatically resubmitted.
- Generation output paths must be new and bound to a timeline or slide. Missing outputs remain awaiting-assets.
- Rendering uses hash-verified snapshots, including generated carousels. Replaced originals cannot replace those snapshots, and corrupted snapshots fail closed.
- Rerenders invalidate final registrations, QA, and review approvals while preserving existing media files.
- A supported review command records reviewer, time, decisions, and current evidence. Export readiness requires unchanged artifacts, current technical QA, and all approvals.
- Shared Higgsfield production prompts validate CLI input and enforce consistent shot planning.
- Desktop cancellation reaches trusted IPC and the broker, with errors surfaced. Production HTML defers renderer startup until the DOM exists and loads CSP first.
- Packages include the full Remotion import graph. Desktop packages exclude local media and downloaded model libraries.

## Verification

- Full `bun run check`: both TypeScript checks, repository ESLint, and 166 tests pass.
- Dependency audit: zero reported vulnerabilities across 574 packages after compatible updates and scoped security overrides. Bun 1.4.4+ is required; older Bun versions ignore scoped overrides.
- Full formatting check and `git diff --check` pass.
- Focused marketing complexity limit of 21 passes; extracted marketing modules are below 500 lines.
- An independently extracted tarball installed its production dependencies and rendered a real 16-second MP4 at 320×568, 12 fps, with one render worker. Artifact QA passed. Frame inspection found a header overflow, fixed with responsive typography and checked again in the final candidate.
- Production Electron renderer and unsigned Apple-silicon `.app` launched, showed the real dashboard, loaded 71 workflows, and submitted/cancelled a job through the real bridge/broker. Status read back as cancelled. This does not establish every desktop workflow or the status-bar button journey.
- Two independent code reviews found and rechecked the package, locking, generated-media, and approval issues. A follow-up review accepted the desktop startup/package fixes.

Campaign integration tests use provider/render fixtures. They prove orchestration, integrity, and recovery behavior, not paid-provider output quality. The deterministic first-run MP4 is silent and does not establish spoken-audio/caption quality. Heavy checks were serialized due to high host swap; GitHub Actions status was not used as a blocker.

## Rollout and remaining evidence

No persisted-data migration is required. Old QA without evidence cannot establish readiness. Re-plan, estimate, and approve existing marketing campaigns because adapter capabilities changed. Use execute for local renders and execute --dry-run for validation. Follow the documented abandoned-lock and uncertain-submission recovery steps.

Remaining release lanes:

- Apple signing/notarization and distribution verification; the local `.app` is unsigned.
- Live provider estimation, budget-approved submission, collection, and human inspection of actual paid output.
- Other operating systems and representative real production footage/audio workflows.
- Repository-wide quality metrics: 100% coverage, mutation, cognitive complexity, Halstead, and CRAP targets are not established. Existing large files and legacy weak types remain outside these focused fixes.
- The separate ClipCaptionAI-Cloud repository/deployment is not part of this checkout's release candidate.

Existing research documents and the prior ListingOS HTML deletion were preserved. No provider credits were spent and no public release was published.

Security overrides keep vulnerable transitive packages patched without replacing legacy major-version APIs. The scoped minimatch update affects modern consumers only; brace-expansion has separate patched pins for legacy and modern consumers. Revisit these pins when upstream packages adopt the fixes. The dependency audit is a point-in-time advisory check, not proof of absence of vulnerabilities.

If a shared broker resource lock has unreadable ownership, the worker reports `RESOURCE_LOCK_RECOVERY_REQUIRED`; inspect the lock and verify owner/child exit before removing it. Readable abandoned locks are retired atomically. See [Bun override documentation](https://bun.sh/docs/pm/overrides) for the scoped resolution and lockfile-version requirement.
