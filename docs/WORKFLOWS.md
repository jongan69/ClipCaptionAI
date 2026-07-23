# ClipCaptionAI Workflows

## One-Click Menu

Double-click `RUN.command`, or run:

```bash
npm run menu
npx clipcaptionai menu
```

The menu is the safest front door for everyday editing. It can download YouTube videos, slice whole videos into fixed clips, cut one local video into fixed clips, find important moments for manual editing, run YouTube clipping, caption an existing edit, enhance a video with B-roll, find standalone B-roll, rerender a generated clip, open Studio, open the latest output, and run diagnostics.

## Model-directed video runs

Use the generic `video` namespace when an AI model is directing a production from a brief and approved local assets:

```bash
clipcaptionai video plan --brief-file brief.txt --assets-dir ./approved-assets --json
clipcaptionai video inspect --run outputs/video-runs/brief --json
clipcaptionai video render --run outputs/video-runs/brief --json
clipcaptionai video qa --run outputs/video-runs/brief --json
```

`video run` combines planning and rendering, while `--dry-run` creates the plan and planned output without rendering. The resulting `run.json` is the durable contract. The generic renderer is deterministic and local; use the specialized provider commands below when the model explicitly needs narration or generated marketing assets.

For workflows that render video, the menu can also open an optional advanced settings prompt before the run. That prompt can override the most common live decisions without making you hand-edit `caption-style.json` first:

- style preset or custom style-config path
- captions on or off
- caption placement
- caption opacity
- vertical crop vs vertical contain
- context-scenes / B-roll on or off for supported workflows
- sound effects on or off for supported workflows

### Menu Options

| Menu | What it does | Direct command | Main output |
| --- | --- | --- | --- |
| `1` | Download links from `links.txt` and stop. | `npm run clipkit -- download --links links.txt` | `outputs/download-run-*/downloads/` |
| `2` | Download whole videos and chop them into fixed clips. | `npm run clipkit -- fixed-clips --links links.txt --segment-seconds 15` | `outputs/fixed-clips-run-*/fixed-clips/` |
| `3` | Cut one local video into fixed clips. | `npm run clipkit -- split-video --video "/path/to/video.mp4" --segment-seconds 15` | `outputs/local-fixed-clips-run-*/fixed-clips/` |
| `4` | Find important moments for manual editing only. | `npm run clipkit -- moments --links links.txt --max-clips 6 --padding-seconds 2` | `outputs/run-*/captioned-clips/*.moment.mp4` |
| `5` | Full YouTube auto-clipping workflow. | `npm run clipkit -- auto-clips --links links.txt --max-clips 6 --padding-seconds 2` | `outputs/run-*/captioned-clips/*.captioned.mp4` |
| `6` | B-roll-heavy workflow using labeled `links.txt`. | `npm run clipkit -- broll-captions --links links.txt --max-clips 3` | `outputs/run-*/captioned-clips/*.captioned.mp4` |
| `7` | Caption one existing video. | `npm run clipkit -- caption --video "/path/to/video.mp4"` | `outputs/caption-run-*/final/` |
| `8` | Enhance an existing edit with B-roll and captions. | `npm run clipkit -- enhance --video "/path/to/edit.mp4"` | `outputs/enhance-run-*/final/` |
| `9` | Find standalone B-roll from a prompt file. | `npm run clipkit -- broll --prompts broll-prompts.txt --max-downloads 8` | `outputs/broll-run-*/` |
| `10` | List or rerender a generated clip. | `npm run clipkit -- rerender --clip <id>` | `*.corrected.mp4` or replaced `*.captioned.mp4` |
| `11` | Clean temp files / old outputs. | `npm run clipkit -- cleanup` | Deletes generated files after confirmation |
| `12` | Open Remotion Studio. | `npm run studio` | Preview UI |
| `13` | Open the newest output folder. | `npm run output:open` | Latest `outputs/run-*` folder |
| `14` | Run diagnostics. | `npm run doctor` | Terminal health report |

Menu option `10` supports both cases: leave the clip blank to list editable clips, or enter a clip number, slug, title fragment, or full `.captions.json` path to rerender immediately.

For one-off exports where you want the B-roll/video only, you can rerender without captions:

```bash
npm run clipkit -- rerender --run outputs/run-YYYY-MM-DD-HHMMSS --clip 03-your-website-is-leaking-money --no-captions
```

## Clean Up Generated Files

Use this when the project folder is getting too heavy.

```bash
npm run cleanup
```

Cleanup can remove temporary render staging from `outputs/work/` and `public/media/`, or prune old folders in `outputs/` while keeping the newest 5. It asks for confirmation before deleting.

Useful direct commands:

```bash
npm run cleanup -- --temp --yes
npm run cleanup -- --outputs --keep-latest 5 --yes
npm run cleanup -- --outputs --keep-latest 5 --dry-run
```

## Download YouTube Videos And Stop

Use this when you only want the source videos downloaded from a text file.

1. Put one YouTube URL per line in `links.txt`.
2. Run:

```bash
npm run download:youtube -- --links links.txt
```

Output:

```text
outputs/download-run-YYYY-MM-DD-HHMMSS/downloads/
```

This does not transcribe, clip, caption, add B-roll, or render.

Shortcut alias:

```bash
npm run clipkit -- download --links links.txt
```

## Download Full Videos And Chop Them Into Fixed Clips

Use this when you want the original full-video chopping workflow: download every source in `links.txt`, then split each whole video into back-to-back 15-second clips.

```bash
npm run clipkit -- fixed-clips --links links.txt --segment-seconds 15
```

Shortcut alias:

```bash
npm run clips:fixed -- --links links.txt --segment-seconds 15
```

Output:

```text
outputs/fixed-clips-run-YYYY-MM-DD-HHMMSS/
  links.txt
  manifest.json
  downloads/
  fixed-clips/
    <video-slug>/
      000.mp4
      001.mp4
      002.mp4
      segments.json
```

This does not transcribe, pick moments, caption, add B-roll, or render.

## Cut One Local Video Into Fixed Clips

Use this when the source file is already on your machine and you just want the whole thing chopped into back-to-back 15-second sections.

```bash
npm run clipkit -- split-video --video "/path/to/video.mp4" --segment-seconds 15
```

Shortcut alias:

```bash
npm run video:split -- --video "/path/to/video.mp4" --segment-seconds 15
```

Output:

```text
outputs/local-fixed-clips-run-YYYY-MM-DD-HH-MM-SS/
  manifest.json
  fixed-clips/
    <video-slug>/
      000.mp4
      001.mp4
      002.mp4
      segments.json
```

This does not transcribe, pick moments, caption, add B-roll, or render.

## Find Important Moments Only

Use this when you want the system to act like an assistant editor: download the videos, find the strongest or most viral-worthy moments, and export clean source clips for your own timeline.

```bash
npm run clipkit -- moments --links links.txt --max-clips 6 --padding-seconds 2
```

Shortcut alias:

```bash
npm run moments:auto -- --links links.txt --max-clips 6 --padding-seconds 2
```

Output clips land inside the run folder as `*.moment.mp4`, alongside a `selection.json` file with the chosen timestamps, hooks, and reasons.

By default, those boundaries are snapped to nearby transcript thought boundaries so the clip lands more cleanly at the start and end of a complete line. Use `--boundary-lookaround-seconds 8` to let it search a bit farther, or `--disable-thought-snapping` to keep the raw AI timestamps.

This workflow does not add captions, B-roll, SFX, or final overlay renders.

### Review Viral Scorecards For A Moments Run

Use this when you want a clearer answer to "why did the bot pick this?" before you drag clips into a manual timeline.

```bash
npm run moments:review -- --write --format markdown
```

That reads the latest `outputs/run-*` folder and creates a report with:

- overall score
- strongest signals
- hook strength
- emotional intensity
- practical value
- identity resonance
- visual payoff
- thought completeness

To save the scorecards back into each `selection.json`:

```bash
npm run moments:review -- --persist --write --format json
```

## Auto AI Clip YouTube Videos

Use this when you have long YouTube videos and want the system to download them, transcribe them, select the most interesting clips, add padding, mix B-roll/SFX when enabled, and render captioned shorts.

```bash
npm run clipkit -- auto-clips --links links.txt --max-clips 6 --padding-seconds 2
```

Shortcut alias:

```bash
npm run clip:auto -- --links links.txt --max-clips 6 --padding-seconds 2
```

## B-Roll-Heavy Caption Generator

Use this when `links.txt` is labeled by creator/profile and you want the final edits to lean heavily on your local custom scenes library instead of mostly the original talking-head footage.

```bash
npm run clipkit -- broll-captions --links links.txt --max-clips 3
```

Shortcut alias:

```bash
npm run broll:captions -- --links links.txt --max-clips 3
```

Defaults for this workflow:

- uses `custom-scenes-library/`
- uses `custom-scenes-library/library.config.json`
- uses `styles/broll-heavy-custom-scenes.json`
- forces `--context-scenes`
- forces `--local-scenes-only`
- forces `--disable-sound-effects`
- forces `--vertical-contain`

This is the best fit for the labeled creator workflow where `# Mani Videos` and `# Josep Videos` in `links.txt` should route to matching scene profiles.

## Auto Caption Any Video

Use this when the edit already exists and you only want the invert/masked caption style rendered on top.

```bash
npm run clipkit -- caption --video "/path/to/video.mp4"
```

With manual transcript corrections:

```bash
npm run clipkit -- caption \
  --video "/path/to/video.mp4" \
  --captions "/path/to/fixed.captions.json"
```

## Enhance An Existing Edit

Use this when you have a mostly edited base video and want timed B-roll cutaways plus captions.

```bash
npm run clipkit -- enhance --video "/path/to/edit.mp4" --run-name edit-v1
```

The final video will be in `outputs/<run-name>/final/`.

## Find Standalone B-Roll

Use this when you are editing manually and only want matching B-roll assets from a text file.

```bash
npm run clipkit -- broll --prompts broll-prompts.txt --max-downloads 8
```

Put one phrase, sentence, or transcript beat per line in the prompt file. This uses `yt-dlp` in high-quality mode by default, searching more cinematic variants and preferring 1080p-or-better source formats when available.

```bash
npm run broll:find -- \
  --prompts broll-prompts.txt \
  --quality high \
  --max-results 12 \
  --max-duration-seconds 20
```

## Competitive eBay Creative Blueprints

Use this before spending Higgsfield credits when you want to learn from competitors or TikTok Shop trend data without copying their protected media.

The workflow copies only the ad structure: hook type, beat order, pacing, proof density, CTA role, SFX style, and B-roll intent. The final ad must use your own listing photos, owned/generated product-preserving video, licensed music, licensed SFX, and cleared B-roll.

Prepare a listing project first:

```bash
npm run ebay:cinematic-ads -- prepare --item-ids 398160795273
```

For the full batch pipeline, let the eBay ad planner rank live listings, prepare the real listing photos, discover competitor references, and write structure maps in one pass:

```bash
npm run ebay:cinematic-ads -- competitive-plan \
  --max-listings 3 \
  --credit-budget 60 \
  --max-higgs-shots 1 \
  --ad-strategy high-energy \
  --run-control-loop \
  --run-higgsfield-renders \
  --higgs-render-model seedance_2_0_mini \
  --higgs-render-dry-run \
  --higgs-render-skip-cost
```

Useful options:

- `--competitors "/path/to/kalodata-export.csv"` blends Kalodata, Automatio, TikTok, YouTube, or hand-curated rows into the reference pool.
- `--max-discover-results 5` controls public YouTube metadata discovery per listing.
- `--analysis-max-seconds 20` bounds the research-only reference clip analysis.
- `--no-analyze-reference-video` creates blueprints without downloading/analyzing the selected reference clip.
- `--run-control-loop` continues from blueprints into preview rendering, technical QA, premium render packet prep, and the Higgsfield handoff queue/review board.
- `--run-higgsfield-renders` continues through the Higgsfield CLI runner before collect/finalize. Pair it with `--higgs-render-dry-run --higgs-render-skip-cost` first so the queue, resume behavior, and credit budget are proven without spending credits.
- `--dashboard-file exports/ebay-listing-performance-dashboard.json` and `--workbench-file exports/ebay-listing-asset-workbench.json` replay the pipeline from saved eBay/MCP truth snapshots when live seller APIs are rate-limited.

Snapshot replay example:

```bash
npm run ebay:cinematic-ads -- competitive-plan \
  --dashboard-file exports/ebay-listing-performance-dashboard.json \
  --workbench-file exports/ebay-listing-asset-workbench.json \
  --competitors exports/automatio-kalodata.csv \
  --no-download \
  --run-control-loop \
  --control-loop-dry-run \
  --run-higgsfield-renders \
  --higgs-render-dry-run \
  --higgs-render-skip-cost
```

Batch outputs:

- `competitive-pipeline-manifest.json`
- `higgsfield-roi-plan.json`
- `projects/<item-id>/listing.json`
- `competitive-creative/<item-id>/creative-blueprint.md`
- `competitive-creative/<item-id>/competitor-trend-report.md`
- `competitive-creative/<item-id>/reference-video-analysis/shot-replica-map.md`
- `competitive-creative/<item-id>/reference-video-analysis/reference-contact-sheet.jpg`

Then run the creative intelligence pass with a Kalodata, Automatio, TikTok, or hand-curated CSV/JSON export:

```bash
npm run ebay:creative-intel -- plan \
  --project-dir "outputs/ebay-cinematic-ads/.../398160795273" \
  --competitors "/path/to/kalodata-export.csv"
```

The import layer preserves trend fields from Kalodata/Automatio-style exports when present: `Video Views`, `Product Units Sold`, `Product GMV`, `GMV Growth Rate`, `Video Likes`, `Video Comments`, `Video Shares`, `Engagement Rate`, and `Posting Date`. Every listing gets `competitor-trend-report.json` plus `competitor-trend-report.md`, which rank references by product fit first and trend evidence second. Use that report to reject high-view mismatches before the selected reference becomes a shot-replica plan.

When `Shot Breakdown` is present, the architect maps those ordered beats directly into the blueprint's `beats[].competitor_pattern` fields for structure-only copying. `Audio Notes` are preserved as analysis-only beat guidance so the final ad can recreate the sound design with licensed/local music and SFX instead of competitor audio.

Treat Kalodata as a structured export source rather than an internal unattended scraper. It is JavaScript-rendered, login-gated, paginated, and anti-bot protected, so the intended path is: use Automatio or another logged-in browser workflow, export CSV/JSON rows, import them with `--competitors`, and let the research-quality gate decide whether the selected reference is strong enough for premium render credits.

If you do not have an export yet, run it without `--competitors`. It will still write a `kalodata-automatio-prompt.md` for that listing so you can paste the exact extraction request into Automatio or another scraper:

```bash
npm run ebay:creative-intel -- plan \
  --project-dir "outputs/ebay-cinematic-ads/.../398160795273"
```

You can also seed public YouTube metadata links for manual creative review:

```bash
npm run ebay:creative-intel -- plan \
  --project-dir "outputs/ebay-cinematic-ads/.../398160795273" \
  --discover-youtube
```

For a shot-for-shot structure map, add bounded reference analysis:

```bash
npm run ebay:creative-intel -- plan \
  --project-dir "outputs/ebay-cinematic-ads/.../398160795273" \
  --discover-youtube \
  --analyze-reference-video \
  --analysis-max-seconds 30
```

This writes `reference-video-analysis/reference-video-analysis.json`, `reference-video-analysis/shot-replica-map.md`, extracted proof frames, and a contact sheet. These are research artifacts only. They should guide timing, pacing, and beat order; they should not become final ad media.

To make the structure tangible before spending generation credits, render an original preview ad from the blueprint:

```bash
npm run ebay:render-blueprint-ad -- \
  --blueprint "outputs/competitive-plan-proof/.../competitive-creative/<item-id>/creative-blueprint.json"
```

That writes:

- `final/<item-id>-competitive-preview-ad.mp4`
- `final/<item-id>-competitive-preview-proof-frame.jpg`
- `final/<item-id>-competitive-preview-manifest.json`
- `final/<item-id>-competitive-preview-ad.audio-plan.json`

The preview renderer uses actual listing images, local/cleared B-roll if present, local music, and local SFX. It exists for QA and iteration; keep using Higgsfield or other product-preserving generated clips for the final premium shots when the preview direction is approved.

For batch QA across a full competitive-plan run:

```bash
npm run ebay:render-blueprint-batch -- \
  --blueprints-dir "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative" \
  --duration 12 \
  --limit 5
```

That finds each `creative-blueprint.json`, renders a product-safe preview for each listing, and writes `competitive-preview-render-manifest.json` with the video path, proof frame, selected reference, duration, and render status. This is the cheap screening pass before choosing the few products that deserve Higgsfield credits.

For the full post-blueprint control loop in one command:

```bash
npm run ebay:competitive-loop -- \
  --blueprints-dir "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative" \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

That runs preview rendering, technical QA, premium render packet prep, a batch Higgsfield handoff export, Higgsfield output collection, finalizer readiness, pipeline status, per-listing creative packet export, and the HTML review board. If previews already exist, pass `--preview-manifest` instead of `--blueprints-dir`. Use `--skip-handoff` only when the current run already has a fresh render queue and runbook.

Before spending paid-generation credits, run the quality gate:

```bash
npm run ebay:competitive-qa -- \
  --preview-manifest "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-preview-render-manifest.json"
```

That writes `competitive-video-qa-report.json` and `competitive-video-qa-report.md`. It checks vertical resolution, duration, audio stream, audio loudness, black frames, frozen/slideshow risk, and cut/scene density. A `fail` means do not upload or spend more credits until the video is regenerated or repaired; a `warn` means inspect the preview carefully before approving premium renders.

After reviewing the proof frames/previews, create the credit-aware premium render packet:

```bash
npm run ebay:prep-premium-renders -- \
  --preview-manifest "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-preview-render-manifest.json" \
  --roi-plan "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/higgsfield-roi-plan.json" \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

That writes:

- `competitive-premium-render-plan/competitive-premium-render-plan.json`
- `competitive-premium-render-plan/competitive-premium-render-plan.md`
- `projects/<item-id>/higgsfield/competitive-premium-render-jobs.json`
- `projects/<item-id>/higgsfield/estimate-competitive-premium-costs.sh`
- `projects/<item-id>/higgsfield/render-competitive-premium-shots.sh`
- `projects/<item-id>/higgsfield/competitive-premium-qa.md`

The prep command does not spend credits. It makes the paid step explicit and reviewable: actual listing image references, product-preserving prompts, expected output paths in `higgsfield-renders/`, QA rejection rules, and the final `assemble` command. If the selected Kalodata/Automatio row includes a strong `Shot Breakdown`, the paid render queue is beat-driven: each selected job carries the imported competitor pattern, our original execution, caption intent, SFX/audio feel, timing, and product-truth constraints. That lets the operator copy the winning structure 1:1 while still generating original, listing-accurate footage.

By default, premium prep holds listings whose selected structure is only a fallback template or has weak competitor-fit evidence. Those items appear as `research_review_required` in the status board. Add a real Kalodata/Automatio/TikTok/YouTube competitor export and rerun, or pass `--allow-weak-research` only when you intentionally want to make a direct product ad without competitor trend evidence.

To hand off all paid render jobs in one batch:

```bash
npm run ebay:competitive-handoff -- \
  --premium-plan "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json"
```

That writes `competitive-render-handoff/` with a flat render queue, JSONL rows, URL-map template, Higgsfield runbook, and a review-before-run CLI shell script. Beat-driven jobs carry the imported competitor pattern, our original execution, caption intent, SFX intent, and audio feel through the queue, JSONL, runbook, audit status, and review board. The output contract is simple: every accepted generated clip must land at the listed `higgsfield-renders/<job-id>.mp4` path, or the URL must be placed in `render-url-map.template.json` for `ebay:collect-premium-renders`.

To render the handoff queue through the Higgsfield CLI instead of running shell commands manually:

```bash
npm run ebay:competitive-higgsfield-render -- \
  --premium-plan "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json" \
  --model seedance_2_0_mini \
  --credit-budget 40
```

Use `--dry-run --skip-cost` first for a no-network plan, then remove those flags to create jobs. The runner is resumable: completed `projects/<item-id>/higgsfield/<job-id>.competitive-job.json` files are reused, a URL map is written for the collector, and Starter-compatible Mini jobs omit unsupported params such as `--mode`.

To package each listing into a portable creative packet for a generator/operator:

```bash
npm run ebay:competitive-packets -- \
  --status "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-video-pipeline-status.json"
```

That writes `competitive-creative-packets/<item-id>-*/` folders containing `creative-packet.md/json`, copied product reference images, preview proof assets, a per-listing render queue, URL-map template, competitor-inspired beat map, QA evidence, and a product-truth rejection checklist. If a listing is held as `research_review_required`, the packet also gets `research/research-brief.md`, `research/research-brief.json`, and `research/competitor-import-template.csv` with exact Kalodata/Automatio columns, search queries, and the rerun command.

For a batch of held listings, export one consolidated Automatio/Kalodata research queue:

```bash
npm run ebay:competitive-research-queue -- \
  --status "outputs/ebay-cinematic-ads/.../competitive-premium-render-plan/competitive-video-pipeline-status.json"
```

That writes `competitive-research-queue/automatio-search-queue.csv`, `competitive-research-queue.json`, and `competitive-research-queue.md`. The CSV has one row per search query with the item, issue summary, required export columns, packet folder, competitor-import path, and rerun command.

If Automatio/Kalodata gives you one consolidated export for several listings, route it back into the packet templates instead of copying rows by hand. The export should include `Item ID`, `Competitor Import Template`, `Packet Dir`, or the exact queued `Search Query` plus the competitor columns:

```bash
npm run ebay:competitive-research-import -- \
  --queue "outputs/ebay-cinematic-ads/.../competitive-research-queue/competitive-research-queue.json" \
  --results "/path/to/automatio-results.csv"
```

That writes `competitive-research-import/competitive-research-import-manifest.json`, dedupes repeated competitor rows, and fans each matched result into the correct `research/competitor-import-template.csv`. Add `--dry-run` to preview routing without editing templates, or `--replace` when the export should become the whole template content.

For the normal operator loop, import the consolidated export and immediately validate which listings are ready to rerun:

```bash
npm run ebay:competitive-research-loop -- \
  --queue "outputs/ebay-cinematic-ads/.../competitive-research-queue/competitive-research-queue.json" \
  --results "/path/to/automatio-results.csv" \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

By default this writes the matched rows into the local packet templates, then runs the processor in dry-run mode so you can inspect planned reruns before spending credits. It also writes `competitive-research-import-loop/competitive-research-import-review.html`, an operator board showing imported competitor rows, trend evidence, product-match score/shared terms, skipped rows, and planned rerun commands. Treat low product-match warnings as a manual review stop even when trend metrics are strong. Add `--dry-run` to preview import routing without modifying templates. Add `--run-reruns` only after the review board and dry-run manifest show the right selected listings.

After multiple packet templates have been filled, process every ready one in a batch:

```bash
npm run ebay:competitive-research-process -- \
  --queue "outputs/ebay-cinematic-ads/.../competitive-research-queue/competitive-research-queue.json" \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

The processor skips empty templates, requires at least one row with product title and video URL, requires trend evidence, requires copyable structure evidence, and requires at least one competitor row to meet the product-match threshold before a held listing can move toward premium render spend. Accepted structure fields include `Hook`, `Shot Breakdown`, `Caption`, `Video Title`, `Duration Seconds`, `Audio Notes`, and `Hashtags`. Accepted trend fields include `Video Views`, `Items Sold`, `Total Revenue`, `Revenue Growth Rate`, `Product GMV`, `GMV Growth Rate`, `Product Units Sold`, `Video Likes`, `Video Comments`, `Video Shares`, `Engagement Rate`, and `Posting Date`. The default product-match threshold is `0.2`; tune with `--min-product-match-score`. Use `--dry-run` first to see which listings will move. Use `--allow-no-trend-metrics` only when you intentionally want to proceed from product-fit evidence without measured trend data, `--allow-low-product-match` only after manually approving a weak title-match import, and `--allow-weak-structure` only when you accept that the architect will infer structure from sparse reference data.

After filling a held packet's `research/competitor-import-template.csv` with real Automatio/Kalodata rows, rerun that listing with:

```bash
npm run ebay:competitive-research-rerun -- \
  --packet-dir "outputs/ebay-cinematic-ads/.../competitive-premium-render-plan/competitive-creative-packets/<item-id>-slug" \
  --competitors "outputs/ebay-cinematic-ads/.../competitive-premium-render-plan/competitive-creative-packets/<item-id>-slug/research/competitor-import-template.csv" \
  --credit-budget 45 \
  --max-jobs-per-listing 1
```

The helper infers the original listing project from the packet/status/preview breadcrumbs, reruns `ebay:creative-intel`, then launches the control loop from the refreshed blueprint. This is the intended path from `research_review_required` to premium render readiness after you import real competitor evidence.

After approved generated clips are saved into each listing's `higgsfield-renders/`, run the batch finalizer:

If the Higgsfield output is a direct URL or a local downloaded file, import it to the exact expected path first:

```bash
npm run ebay:collect-premium-renders -- \
  --premium-plan "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json" \
  --url-map "render-urls.json"
```

The URL map can be an object like `{ "<item-id>": { "<job-id>": "/path/or/url/to/video.mp4" } }` or an array of `{ "item_id", "job_id", "url" }` rows. The collector also scans each listing's `higgsfield/*.competitive-job.json` files for result URLs, imports clips into `higgsfield-renders/<job-id>.mp4`, and verifies a video stream with `ffprobe`.

```bash
npm run ebay:finalize-premium-ads -- \
  --premium-plan "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json"
```

That writes `competitive-premium-finalize-manifest.json`, assembles only ready listings, probes the final MP4s, and reports listings with missing generated clips as `not_ready`. It intentionally refuses to invent a slideshow fallback, so missing `higgsfield-renders/<job-id>.mp4` files remain visible blockers.

To see the current state of every listing in the run, audit the manifests:

```bash
npm run ebay:competitive-status -- \
  --premium-plan "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-premium-render-plan.json"
```

That writes `competitive-video-pipeline-status.json` and `competitive-video-pipeline-status.md` next to the premium plan. It merges preview renders, premium render jobs, collected Higgsfield clips, final assembly output, file existence checks, and `ffprobe` results into a per-listing worklist. If a listing says `waiting_for_generated_clips`, the next move is to run the generated Higgsfield job or import the resulting MP4 with `ebay:collect-premium-renders`; if it says `ready_to_finalize`, run `ebay:finalize-premium-ads`.

To review the run visually before spending credits or uploading:

```bash
npm run ebay:competitive-review -- \
  --status "outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS/competitive-creative/competitive-premium-render-plan/competitive-video-pipeline-status.json"
```

That writes `competitive-review-board.html` next to the status file. The board shows each listing's preview video/proof frame, selected competitor structure, trend evidence, premium render job readiness, beat-level render intent, handoff runbook/queue links, creative packet folders, blockers, and source artifact links.

Outputs land in `competitive-creative/` inside the listing project:

- `creative-blueprint.json`
- `creative-blueprint.md`
- `competitor-references.normalized.json`
- `competitor-trend-report.json`
- `competitor-trend-report.md`
- `reference-video-analysis/shot-replica-map.md` when `--analyze-reference-video` is used
- `story-broll-prompts.competitive.txt`
- `higgsfield-competitive-render-jobs.json`
- `kalodata-automatio-prompt.md`

Use the generated blueprint to render one high-quality ad at a time:

```bash
npm run ebay:cinematic-ads -- find-broll \
  --project-dir "outputs/ebay-cinematic-ads/.../398160795273" \
  --energy max

npm run ebay:cinematic-ads -- assemble \
  --project-dir "outputs/ebay-cinematic-ads/.../398160795273" \
  --energy max \
  --include-broll \
  --broll-position interleave
```

Hard stop: do not download competitor footage into the final commercial asset unless you have rights. Use competitor videos as research references only.

## Rerender

List generated clips:

```bash
npm run clipkit -- rerender --list
```

Rerender a specific clip:

```bash
npm run clipkit -- rerender --clip 03-your-website-is-leaking-money
```

Rerender a specific clip with captions disabled for that export only:

```bash
npm run clipkit -- rerender --clip 03-your-website-is-leaking-money --no-captions
```

## Diagnostics

```bash
npm run doctor
```

This checks Node, npm, ffmpeg, ffprobe, yt-dlp, `.env`, and optional OpenAI key presence.

## Other Useful Everyday Commands

Open the newest output folder:

```bash
npm run output:open
```

Open Remotion Studio:

```bash
npm run studio
```

Create one captions JSON without rendering:

```bash
npm run transcribe -- --video "/path/to/video.mp4" --out outputs/clip.captions.json
```

Benchmark local transcription against OpenAI on the same video:

```bash
npm run transcribe:benchmark -- --video "/path/to/video.mp4"
```
