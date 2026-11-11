# OpenNolan ideas for ClipCaptionAI

Research date: 2026-08-24  
OpenNolan snapshot: [`main` at `4457349c386ea1a89c01547f9a76fa650970c131`](https://github.com/het8802/OpenNolan/commit/4457349c386ea1a89c01547f9a76fa650970c131) (`v1.0.2`, 2026-08-19)  
ClipCaptionAI snapshot: `dev` at `e096c2605636bdb6ecc6200e92e651e771686d3d` plus pre-existing user changes

## Verdict

OpenNolan has six useful principles for ClipCaptionAI. The best next move is not to port OpenNolan: it is to promote capabilities that already exist in ClipCaptionAI's specialized eBay and caption/B-roll lanes into the generic video workflow.

The highest-value sequence is:

1. measured render QA;
2. a locked delivery promise;
3. generic reference/source analysis;
4. a cold-viewer standalone clip test;
5. coherent end-to-end style presets.

OpenNolan's README claims a broad end-to-end system, but this review inspected source and contracts rather than running its application or judging its rendered output. Treat feature claims as source intent, not verified output quality.

## Ranked recommendations

### P0 — Measure whether the rendered video is good enough for its format

**OpenNolan evidence.** Its final-review contract separates technical probe, frame review, audio, caption coverage, delivery-promise preservation, and measured motion ([`schemas/artifacts/final_review.schema.json:19-200`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/schemas/artifacts/final_review.schema.json#L19-L200)). Its norms layer turns cut count, static time, dead tails, hook motion, and detail dropouts into format-specific verdicts, while explicitly admitting that the initial thresholds are hand-picked and should eventually be calibrated from liked references ([`lib/qa_norms.py:1-16`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/lib/qa_norms.py#L1-L16), [`lib/qa_norms.py:23-55`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/lib/qa_norms.py#L23-L55)).

**Local gap.** Generic [`scripts/video.mjs:214-245`](../../scripts/video.mjs#L214-L245) only checks existence, a video stream, positive duration, H.264, and basic mean volume. That proves the MP4 is valid, not that it is watchable. Yet [`scripts/ebay/qa-competitive-videos.mjs:113-209`](../../scripts/ebay/qa-competitive-videos.mjs#L113-L209) already measures black frames, frozen spans, scene changes, volume, and silence, then applies usable vertical-video thresholds at [`scripts/ebay/qa-competitive-videos.mjs:253-313`](../../scripts/ebay/qa-competitive-videos.mjs#L253-L313).

**Recommendation.** Extract the existing FFmpeg measurements into one shared helper used by both `video qa` and the eBay lane. Add only two named profiles initially: `short-form` and `long-form`. Record measured values, thresholds, timestamps/windows, and `pass | warn | fail` in the existing `run.json`; a format-quality failure must prevent `qa.status = passed`.

**Why first.** It improves every renderer and gives later pacing, beat-sync, and style work an objective regression check. No new dependency is needed.

### P0 — Lock the delivery promise before spending or rendering

**OpenNolan evidence.** Its delivery-promise contract exists to prevent the damaging silent downgrade from motion-led output to still-led output; if compose cannot honor the locked promise, it must stop instead of substituting ([`lib/delivery_promise.py:1-9`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/lib/delivery_promise.py#L1-L9)). The contract includes the medium, quality floor, and approved fallback ([`lib/delivery_promise.py:82-107`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/lib/delivery_promise.py#L82-L107)).

**Local gap.** ClipCaptionAI's generic manifest records resolution, preset, provider intent, and assets ([`scripts/video.mjs:95-125`](../../scripts/video.mjs#L95-L125)), but it does not say whether the requested result depends on real motion, whether an animatic is acceptable, or what quality level the caller approved. Provider completion can therefore satisfy the manifest while missing the creative promise.

**Recommendation.** Add three fields to the existing plan rather than a new subsystem: `requiredMedium`, `qualityFloor`, and `approvedFallback`. Check them after asset collection and again in QA. Reuse current provider/approval evidence; do not create OpenNolan's promise-type class hierarchy.

### P1 — Generalize the reference-analysis lane already in the repo

**OpenNolan evidence.** It treats “make something like this” differently from “edit this footage,” analyzes motion and visual structure, and requires original differentiation ([`skills/meta/video-reference-analyst.md:3-24`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/skills/meta/video-reference-analyst.md#L3-L24), [`skills/meta/video-reference-analyst.md:40-79`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/skills/meta/video-reference-analyst.md#L40-L79)). This is a useful product boundary: reference media is evidence about pacing, framing, motion, and structure, not final-source media.

**Local reuse opportunity.** ClipCaptionAI already has a bounded reference analyzer inside [`scripts/ebay/competitive-listing-video-architect.mjs:1270-1351`](../../scripts/ebay/competitive-listing-video-architect.mjs#L1270-L1351). It detects cuts, extracts frames/contact sheets, reads captions when available, and writes an analysis-only shot map. Its output explicitly preserves strategy while forbidding competitor media reuse ([`scripts/ebay/competitive-listing-video-architect.mjs:1194-1227`](../../scripts/ebay/competitive-listing-video-architect.mjs#L1194-L1227)).

**Recommendation.** Move the format-neutral parts behind a generic `video analyze-reference` command and artifact. Keep the eBay mapping as a consumer. The generic brief should contain duration, cut/shot density, representative frames, transcript excerpts, motion/still classification, framing/camera notes, and “keep/change” fields. Feed that brief into existing plan prompts; do not introduce a second pipeline engine.

### P1 — Make clip selection pass a cold-viewer standalone test

**OpenNolan evidence.** Its clip-factory rubric scores hook, coherence, value, energy, and platform fit, then rejects or widens clips with unresolved pronouns, earlier-context dependencies, long lead-ins, or endings before the payoff ([`skills/pipelines/clip-factory/script-director.md:23-45`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/skills/pipelines/clip-factory/script-director.md#L23-L45)). It records selection and rejection reasons rather than presenting a mysterious score ([`skills/pipelines/clip-factory/script-director.md:57-83`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/skills/pipelines/clip-factory/script-director.md#L57-L83)).

**Local gap.** ClipCaptionAI already snaps selections to thought boundaries, but its “viral” scorecard includes niche literal keywords such as `walmart`, `homeless`, `rolex`, and `corvette` ([`scripts/clipkit-lib.mjs:318-496`](../../scripts/clipkit-lib.mjs#L318-L496)). Those are not portable evidence of standalone usefulness.

**Recommendation.** Keep the existing scorecard and thought-unit path, but replace niche keyword boosts with the five transparent dimensions plus four binary standalone checks: self-contained subject, no unresolved context, point arrives quickly, payoff included. Persist reasons. Keep the total score advisory until correlated with actual retention/conversion data.

### P2 — Make one preset control the whole edit's creative grammar

**OpenNolan evidence.** Its playbooks bind visual language, typography, motion timing, audio direction, asset consistency, and explicit phone-size quality rules in one preset ([`styles/kinetic-whiteboard-captions.yaml:1-71`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/styles/kinetic-whiteboard-captions.yaml#L1-L71), [`styles/kinetic-whiteboard-captions.yaml:92-110`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/styles/kinetic-whiteboard-captions.yaml#L92-L110)). The principle is consistency across captions, cuts, visuals, and sound—not YAML or its large schema.

**Local reuse opportunity.** [`caption-style.json:1-100`](../../caption-style.json#L1-L100) already controls caption layout/motion/look, while [`caption-style.json:101-295`](../../caption-style.json#L101-L295) also controls contextual scenes and SFX. The code already consumes this shape in `enhance-video-with-broll.mjs`, `assemble-context-scenes.mjs`, and `mix-sfx.mjs`.

**Recommendation.** Ship one opinionated end-to-end preset using the existing JSON shape, with captions, B-roll cadence, SFX density, and a short documented creative intent. Validate it on real renders before adding more. Do not port OpenNolan's separate playbook schema/registry.

### P2 — Add speech-safe beat alignment only after QA is shared

OpenNolan's useful rule is narrow: for music-led edits, snap cuts to detected beats; when speech is present, protect narration ranges so a beat never chops a word, and reveal overlays on the spoken trigger rather than before it ([`skills/pipelines/instagram-reels-studio/edit-director.md:13-21`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/skills/pipelines/instagram-reels-studio/edit-director.md#L13-L21)). ClipCaptionAI already has word timestamps and keyword-timed SFX, so the inputs exist. Defer implementation until measured QA can show that the extra timing work improves visible pacing; do not add a general timeline engine for this.

## Ideas to reject or defer

1. **Do not port the agent-as-orchestrator architecture.** OpenNolan describes manifests plus many Markdown stage directors rather than a rigid orchestrator ([`README.md:188-209`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/README.md#L188-L209)). Its [snapshot tree](https://github.com/het8802/OpenNolan/tree/4457349c386ea1a89c01547f9a76fa650970c131) contains 20 pipeline manifests, 143 pipeline-director Markdown files, and 134 Python tool files. ClipCaptionAI's focused ESM workflows, shared helpers, and durable run manifests are a better fit; another registration layer would amplify the command/desktop drift already documented in this repo.

2. **Do not add a third render runtime.** FFmpeg plus Remotion already cover ClipCaptionAI's footage and motion-graphics needs. HyperFrames is complexity without a demonstrated output gap.

3. **Do not build a browser timeline editor from this comparison.** OpenNolan advertises keyframes, inspector, scrub, and preview in its web app ([`README.md:74-95`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/README.md#L74-L95)); that is a separate product. Improve the existing Electron/CLI workflows first and wait for evidence that users need frame-level manual editing.

4. **Do not use a paid “virality” model as a quality gate.** OpenNolan itself marks its content signal experimental, advisory-only, new/unvalidated, paid, and CC-BY-NC ([`tools/analysis/content_signal.py:1-15`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/tools/analysis/content_signal.py#L1-L15)). Actual post retention, completion, and conversion are better truth.

5. **Do not copy implementation code or schemas.** OpenNolan is AGPL-3.0 ([`LICENSE:1-16`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/LICENSE#L1-L16)), while ClipCaptionAI is MIT ([`LICENSE:1-13`](../../LICENSE#L1-L13)). Use these principles as a clean-room design input unless the licensing consequence is deliberately accepted. OpenNolan also vendors some non-commercial components under separate terms ([`NOTICE:42-64`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/NOTICE#L42-L64)).

6. **Do not inherit “pass with warnings” for unresolved critical defects.** OpenNolan's reviewer eventually proceeds after two failed revision rounds ([`skills/meta/reviewer.md:68-76`](https://github.com/het8802/OpenNolan/blob/4457349c386ea1a89c01547f9a76fa650970c131/skills/meta/reviewer.md#L68-L76)). ClipCaptionAI should remain failed until a human explicitly accepts the named defect.

## Smallest useful implementation slices

1. Extract the existing eBay FFmpeg QA measurements and wire them into generic `video qa`; add one small regression test over a synthetic short clip.
2. Add the three delivery-promise fields to the existing run manifest and reject a known silent downgrade in one test.
3. Extract the existing eBay reference analysis into a generic command without changing its eBay consumer.
4. Replace niche viral keywords with the standalone-test rubric in the existing scorecard and update its current unit test.
5. Create one full-edit style preset; render and visually review one representative clip before making more.

Everything else should wait for evidence from those slices.
