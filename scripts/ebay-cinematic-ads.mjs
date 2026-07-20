#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';
import {ebayCinematicAdsOutputRoot} from './lib.mjs';
import {slugify, timestampSlug} from './clipkit-lib.mjs';

const defaultMcpUrl = 'https://shopping-deals-mcp.jonathang132298.workers.dev/mcp';
const scriptName = path.basename(fileURLToPath(import.meta.url));

const usage = `
Usage:
  npm run ebay:cinematic-ads -- prepare --item-ids 398160795273
  npm run ebay:cinematic-ads -- roi-plan --credit-budget 45 --prepare-selected
  npm run ebay:cinematic-ads -- competitive-plan --max-listings 3
  npm run ebay:cinematic-ads -- find-broll --project-dir outputs/ebay-cinematic-ads/.../398160795273
  npm run ebay:cinematic-ads -- assemble --project-dir outputs/ebay-cinematic-ads/.../398160795273
  npm run ebay:cinematic-ads -- upload --item-id 398160795273 --video /path/to/final.mp4 --attach --apply-immediately

Commands:
  roi-plan    Rank live listings and create a credit-spend plan before rendering.
  competitive-plan
              Rank listings, prepare real listing assets, discover competitor references, and write shot-replica blueprints.
  prepare     Pull listing assets and write Higgsfield-ready cinematic briefs.
  find-broll  Find story-building B-roll clips for a listing project.
  seed-local-broll  Copy owned/local B-roll candidates into a listing project.
  assemble    Assemble finished Higgsfield clips into an eBay-ready MP4.
  upload      Host the final MP4, create an eBay video, and optionally attach it.
  status      Check eBay video processing status.

Options:
  --item-ids IDS             Comma-separated listing IDs for prepare.
  --item-id ID               Single listing ID for upload/status.
  --credit-budget N          Higgsfield credit budget for roi-plan. Default: 45
  --credits-per-shot N       Estimated credits per generated shot. Default: 22.5 for Seedance 2.0 5s 720p
  --max-listings N           Maximum listings in roi-plan output. Default: 1
  --max-higgs-shots N        Maximum paid Higgs shots per listing. Default: 1
  --ad-strategy lean|standard|high-energy  Credit strategy. Default: lean
  --energy standard|max       Assembly energy profile. max = faster cuts, interleaved B-roll, SFX mix.
  --min-price N              Minimum listing price for roi-plan. Default: 40
  --include-bids             Include listings that already have bids.
  --skip-item-ids IDS        Comma-separated item IDs to exclude from roi-plan or prepare.
  --only-item-ids IDS        Comma-separated item IDs to force-include during roi-plan ranking.
  --prepare-selected         Create ad project folders for selected roi-plan listings.
  --dashboard-file FILE      Use a saved eBay listing performance dashboard JSON instead of the live MCP dashboard.
  --workbench-file FILE      Use a saved listing asset workbench JSON instead of the live MCP workbench.
  --competitors FILE         Optional Kalodata/Automatio/TikTok/YouTube CSV/JSON export for competitive-plan.
  --discover-youtube         Force public YouTube metadata discovery during competitive-plan.
  --no-discover-youtube      Disable public YouTube discovery during competitive-plan.
  --analyze-reference-video  Force bounded selected-reference video analysis during competitive-plan.
  --no-analyze-reference-video
                            Disable bounded selected-reference video analysis during competitive-plan.
  --analysis-max-seconds N   Max seconds to analyze from selected reference. Default: 20 in competitive-plan
  --analysis-scene-threshold N
                            ffmpeg scene-change threshold for reference analysis. Default: 0.25
  --max-discover-results N   Max public reference metadata rows per listing. Default: 5 in competitive-plan
  --run-control-loop         After competitive-plan blueprints, render previews, QA them, prep premium packets, and export the render handoff.
  --run-higgsfield-renders   During --run-control-loop, create/resume Higgsfield jobs from the premium plan before collect/finalize.
  --higgs-render-model MODEL Model override for the Higgsfield render runner, e.g. seedance_2_0_mini.
  --higgs-render-credit-budget N
                            Credit budget for the render runner. Default: --credit-budget value.
  --higgs-render-max-jobs N  Max Higgsfield jobs to create in this run.
  --higgs-render-skip-cost   Use plan estimates instead of live Higgsfield cost calls.
  --higgs-render-dry-run     Plan/resume render jobs without creating new Higgsfield jobs.
  --control-loop-dry-run     Write the control-loop plan without running child commands.
  --preview-duration N       Preview ad duration passed to the control loop preview renderer.
  --voiceover FILE           Seller voiceover MP3/WAV/M4A for competitive preview/control-loop renders.
  --voiceover-volume N       Voiceover mix volume for competitive previews. Default: 1.0
  --allow-weak-research      Permit fallback/no-trend references to receive premium render jobs.
  --min-fit-score N          Minimum competitor/product fit score for premium prep. Default: 1
  --min-trend-score N        Minimum trend score for premium prep. Default: 0
  --project-dir DIR          Listing project folder for assemble.
  --clips-dir DIR            Folder containing Higgsfield rendered clips. Default: project-dir/higgsfield-renders
  --broll-dir DIR            Folder containing story B-roll clips. Default: project-dir/story-broll
  --include-broll            Include story B-roll clips when assembling the final ad.
  --broll-position end|interleave  Where to place B-roll in the final ad. Default: end
  --max-broll-clips N        Maximum story B-roll clips to include. Default: 2
  --max-broll-seconds N      Trim each B-roll clip during assembly. Default: 3
  --find-broll-kind stock|movie  B-roll search mode. Default: stock
  --broll-quality fast|standard|high
                            yt-dlp B-roll quality mode. Default: high
  --max-broll-source-seconds N
                            Download this many seconds from each selected source. Default: 20
  --local-broll-dir DIR      Owned/local B-roll library. Default: ./custom-scenes-library
  --higgs-model MODEL        Higgs video model for generated scripts. Default: seedance_2_0
  --higgs-resolution VALUE   Higgs video resolution for generated scripts. Default: 720p
  --higgs-mode VALUE         Higgs video mode for generated scripts. Default: std
  --video FILE               Final MP4 for upload.
  --video-id ID              eBay Media API video ID for status checks.
  --out-dir DIR              Output root. Default: ./outputs/ebay-cinematic-ads/run-YYYY-MM-DD-HHMMSS
  --mcp-url URL              Shopping MCP endpoint. Default: ${defaultMcpUrl}
  --max-clip-seconds N       Trim each generated clip during assembly. Default: 6
  --sfx-library DIR          Indexed SFX library. Default: ./sfx-library
  --sfx-volume N             SFX mix volume. Default: 0.11 in max energy, 0.075 otherwise
  --no-sfx                   Disable automatic SFX mix during assembly.
  --music-library DIR        Background music library. Default: ./music-library/lofi-house
  --music-track FILE         Specific background music file.
  --music-volume N           Background music volume. Default: 0.035 in max energy
  --no-music                 Disable background music during max-energy assembly.
  --width N                  Output width. Default: 1080
  --height N                 Output height. Default: 1920
  --fps N                    Output FPS. Default: 30
  --attach                   Attach uploaded video ID to the listing.
  --apply-immediately        Apply media revision live instead of staging only.
  --poll                     Poll video status after upload.
  --no-download              Prepare briefs without downloading reference images.
`;

const rawArgs = process.argv.slice(2);
const args = parseArgs(rawArgs);
const knownCommands = new Set(['roi-plan', 'competitive-plan', 'prepare', 'find-broll', 'seed-local-broll', 'assemble', 'upload', 'status', 'help']);
const command = knownCommands.has(rawArgs[0]) ? rawArgs[0] : 'prepare';

if (args.help || args.h || command === 'help') {
  console.log(usage);
  process.exit(0);
}

const mcpUrl = String(args['mcp-url'] ?? defaultMcpUrl);

const requireValue = (key) => {
  if (!args[key]) {
    throw new Error(`Missing --${key}.\n${usage}`);
  }
  return String(args[key]);
};

const parseIdList = (value) =>
  String(value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

const idSet = (value) => new Set(parseIdList(value));

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const safeJsonWrite = (file, value) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

const isInsideProject = (targetPath) => {
  const relative = path.relative(projectRoot, targetPath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const resolveProjectPath = (value) => {
  if (!value) {
    return null;
  }
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
};

const mcpTool = async (name, toolArgs = {}) => {
  const response = await fetch(mcpUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${scriptName}-${Date.now()}`,
      method: 'tools/call',
      params: {name, arguments: toolArgs},
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`${name} failed with HTTP ${response.status}: ${bodyText.slice(0, 1000)}`);
  }

  const payload = JSON.parse(bodyText);
  if (payload.error) {
    throw new Error(`${name} failed: ${JSON.stringify(payload.error)}`);
  }

  const text = payload.result?.content?.find((part) => part.type === 'text')?.text;
  if (!text) {
    return payload.result;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const downloadFile = async ({url, outPath}) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed ${response.status}: ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, bytes);
  return {path: outPath, bytes: bytes.length};
};

const numberValue = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const getPrice = (listing) => numberValue(listing.price?.value ?? listing.current_price ?? listing.price, 0);

const listingRoiScore = (listing) => {
  const price = getPrice(listing);
  const assetScore = numberValue(listing.asset_score, 50);
  const pictureCount = numberValue(listing.picture_count, 0);
  const videoCount = numberValue(listing.video_count, 0);
  const bidCount = numberValue(listing.bid_count, 0);
  const watchCount = numberValue(listing.watch_count, 0);
  const valueScore = Math.min(45, Math.log10(price + 1) * 18);
  const assetGapScore = Math.max(0, 70 - assetScore) * 0.75;
  const noVideoScore = videoCount === 0 ? 28 : -12;
  const photoGapScore = Math.max(0, 6 - pictureCount) * 3.5;
  const noBidScore = bidCount === 0 ? 12 : -28;
  const watchScore = Math.min(12, watchCount * 3);
  const bargainFloorPenalty = price < 40 ? -25 : 0;

  return Math.round(
    valueScore +
      assetGapScore +
      noVideoScore +
      photoGapScore +
      noBidScore +
      watchScore +
      bargainFloorPenalty,
  );
};

const renderTierForListing = (listing, {strategy = 'lean', maxHiggsShots = 1} = {}) => {
  const price = getPrice(listing);
  const assetScore = numberValue(listing.asset_score, 50);
  const videoCount = numberValue(listing.video_count, 0);
  const capShots = (shots) => Math.max(1, Math.min(Math.floor(maxHiggsShots), shots));

  if (strategy === 'lean' || strategy === 'high-energy') {
    return {
      tier: strategy === 'high-energy' ? 'high-energy-hero' : price >= 500 ? 'lean-hero' : 'lean-test',
      shots: capShots(1),
      strategy: strategy === 'high-energy'
        ? 'One paid product-proof shot. Make the finished ad feel expensive with high-quality yt-dlp B-roll, hard pacing, camera/money/impact SFX, and fast interleaved cuts.'
        : 'One paid Higgs hero/product-proof shot only. Build perceived production value with strong B-roll, pacing, captions, and final assembly.',
    };
  }

  if (price >= 500 && (videoCount === 0 || assetScore < 70)) {
    return {
      tier: 'hero',
      shots: capShots(4),
      strategy: 'Full 18-24s cinematic product ad: hero reveal, condition macro, bundle/accessory pass, buyer-confidence close.',
    };
  }

  if (price >= 125 || videoCount === 0 || assetScore < 55) {
    return {
      tier: 'focused',
      shots: capShots(2),
      strategy: 'One hero reveal plus one condition/included-items macro. Use this when upside is real but not worth a full four-shot spend.',
    };
  }

  return {
    tier: 'micro',
    shots: capShots(1),
    strategy: 'Single hero shot only. Use as a test render or skip if credits are tight.',
  };
};

const reasonsForListing = (listing) => {
  const reasons = [];
  const price = getPrice(listing);
  const assetScore = numberValue(listing.asset_score, 0);
  const videoCount = numberValue(listing.video_count, 0);
  const pictureCount = numberValue(listing.picture_count, 0);
  const bidCount = numberValue(listing.bid_count, 0);
  const watchCount = numberValue(listing.watch_count, 0);

  if (price >= 500) reasons.push('high-value listing where one sale can justify multiple renders');
  if (videoCount === 0) reasons.push('no listing video yet');
  if (assetScore < 60) reasons.push(`weak asset score ${assetScore}`);
  if (pictureCount < 6) reasons.push(`only ${pictureCount} photos`);
  if (bidCount === 0) reasons.push('no bids yet');
  if (watchCount > 0) reasons.push(`${watchCount} watcher(s) already`);
  if (reasons.length === 0) reasons.push('lower-priority maintenance candidate');

  return reasons;
};

const writeRoiPlan = ({dashboard, ranked, selected, outRoot, creditBudget, creditsPerShot, adStrategy, maxHiggsShots}) => {
  const plan = {
    created_at: new Date().toISOString(),
    mcp_url: mcpUrl,
    credit_budget: creditBudget,
    credits_per_shot_estimate: creditsPerShot,
    selected_credit_estimate: selected.reduce((sum, item) => sum + item.estimated_credits, 0),
    dashboard_summary: dashboard.summary ?? null,
    selected,
    ranked,
    ad_strategy: adStrategy,
    max_higgs_shots_per_listing: maxHiggsShots,
    rules: {
      first_pass: [
        'Focus on one listing at a time.',
        'Spend on one reference-based Higgs hero/product-proof shot first.',
        'Use story B-roll, pacing, captions, SFX, and assembly to make the ad feel bigger than the paid render.',
        'Only buy more Higgs shots after the first assembled ad is strong enough to justify it.',
        'Do not spend Higgs credits to hide condition issues or invent missing accessories.',
        'Stage eBay media revisions first; apply live only after reviewing final proof frames.',
      ],
      tier_meaning: {
        'lean-hero': '1 paid shot for a high-value listing, with B-roll carrying the rest of the ad.',
        'lean-test': '1 paid shot for a lower-value listing; skip extra Higgs unless the first ad proves useful.',
        'high-energy-hero': '1 paid product-proof shot plus aggressive yt-dlp B-roll, faster cuts, and SFX-driven motion.',
        hero: '4 shots, best for $500+ camera/drone gear and other high-value listings.',
        focused: '2 shots, best for mid-value items or listings missing video.',
        micro: '1 shot only, best for tests or cheap items with obvious visual upside.',
      },
    },
  };

  safeJsonWrite(path.join(outRoot, 'higgsfield-roi-plan.json'), plan);

  const rows = selected.map(
    (item, index) =>
      `| ${index + 1} | ${item.item_id} | ${item.tier} | $${item.price.toFixed(2)} | ${item.asset_score} | ${item.video_count} | ${item.shots} | ${item.estimated_credits} | ${item.reasons.join('; ')} |`,
  );
  const markdown = [
    '# Higgsfield Credit ROI Plan',
    '',
    `Created: ${plan.created_at}`,
    `Credit budget: ${creditBudget}`,
    `Estimated credits per shot: ${creditsPerShot}`,
    `Selected spend estimate: ${plan.selected_credit_estimate}`,
    `Ad strategy: ${adStrategy}`,
    `Max paid Higgs shots per listing: ${maxHiggsShots}`,
    '',
    '## Render Queue',
    '',
    '| Rank | Item ID | Tier | Price | Asset Score | Videos | Shots | Est. Credits | Why |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows,
    '',
    '## Operating Rules',
    '',
    '- Work one listing at a time.',
    '- Generate one paid Higgs hero/product-proof shot first.',
    '- Fill the ad with high-quality B-roll, SFX, and editing before buying additional Higgs shots.',
    '- Review the generated clip against the source photos before spending follow-up credits.',
    '- Assemble only real Higgsfield clips; the assembler intentionally refuses slideshow fallback.',
    '- Upload with `--attach` first, then add `--apply-immediately` only after approval.',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(outRoot, 'higgsfield-roi-plan.md'), markdown);
};

const conversionBriefForListing = (listing, listingPlan = null) => {
  const title = listing.title ?? `eBay item ${listing.item_id}`;
  const category = storyCategoryForListing(listing);
  const price = numberValue(listingPlan?.price, getPrice(listing));
  const base = {
    camera: {
      buyer: 'creator, hybrid shooter, or travel filmmaker who wants a compact serious camera kit',
      emotional_hook: 'ready-to-shoot creator kit without hunting for the lens and cage separately',
      proof_points: ['Sony a6700 body', 'wide E 11mm f/1.8 lens', 'cage included', 'actual item photos'],
      visual_tone: 'premium creator desk, Miami street/photo energy, compact professional kit',
      objection_to_answer: 'buyer needs confidence that the exact camera, lens, cage, and condition are real',
    },
    gimbal: {
      buyer: 'solo creator or camera operator who wants smoother handheld footage fast',
      emotional_hook: 'turn shaky handheld footage into clean cinematic movement',
      proof_points: ['DJI RS 4 Mini', 'SmallRig handle', 'tracker module', 'actual item photos'],
      visual_tone: 'behind-the-scenes creator setup, smooth motion, compact travel rig',
      objection_to_answer: 'buyer needs to see what is included and that the kit is not missing key pieces',
    },
    collectible: {
      buyer: 'sports card collector looking for graded Kobe Bryant inventory',
      emotional_hook: 'a clean graded Kobe card that feels display-worthy and collectible',
      proof_points: ['PSA slab', 'Kobe Bryant card', 'front and back actual photos', 'grade visible'],
      visual_tone: 'collector desk, soft premium light, careful handling, no hype clutter',
      objection_to_answer: 'buyer needs a clear view of grade, slab, corners, and authenticity cues',
    },
    projector: {
      buyer: 'budget home-theater buyer who wants a simple movie-night projector',
      emotional_hook: 'turn a room into a quick movie-night setup without spending big',
      proof_points: ['projector shown', 'remote shown', 'actual item photos', 'compact setup'],
      visual_tone: 'cozy home cinema, warm room light, simple setup, practical value',
      objection_to_answer: 'buyer needs clarity on included remote, visible condition, and realistic expectations',
    },
    product: {
      buyer: 'marketplace buyer comparing used items and looking for confidence',
      emotional_hook: 'the exact item, presented clearly, ready to ship',
      proof_points: ['actual item photos', 'visible condition', 'included items only'],
      visual_tone: 'clean resale studio, honest premium lighting, straightforward detail',
      objection_to_answer: 'buyer needs confidence that the ad matches the real listing',
    },
  };
  const selected = base[category] ?? base.product;
  const plannedShots = listingPlan?.shots ?? null;

  return {
    item_id: String(listing.item_id),
    title,
    category,
    price,
    tier: listingPlan?.tier ?? null,
    planned_higgs_shots: plannedShots,
    buyer: selected.buyer,
    emotional_hook: selected.emotional_hook,
    proof_points: selected.proof_points,
    visual_tone: selected.visual_tone,
    objection_to_answer: selected.objection_to_answer,
    offer_angle:
      price >= 500
        ? 'premium gear deserves trust, detail, and a cinematic proof pass'
        : 'value item needs a fast clarity boost without overspending credits',
    hard_rules: [
      'Actual listing photos are truth. Do not create a prettier version of a different item.',
      'No fake accessories, fake screens, fake labels, fake packaging, or hidden condition changes.',
      'If generated output changes product geometry, labels, colors, included items, or condition, reject it.',
      'The ad should make the buyer feel confident, not tricked.',
    ],
  };
};

const plannedShotsForListing = (listing, listingPlan = null) => {
  const allShots = shotPromptsForListing(listing);
  const shotLimit = listingPlan?.shots ? Math.min(allShots.length, Number(listingPlan.shots)) : allShots.length;
  return allShots.slice(0, shotLimit).map((shot, index) => ({
    ...shot,
    rank: index + 1,
    render: true,
  }));
};

const imagePathsForListing = (listing, listingDir) =>
  (listing.images ?? [])
    .map((image) => {
      const candidate = resolveProjectPath(image.path) ?? path.join(listingDir, image.filename);
      return fs.existsSync(candidate) ? candidate : null;
    })
    .filter(Boolean);

const referenceArgsForShot = ({shot, imagePaths}) => {
  if (imagePaths.length === 0) {
    return [];
  }

  const indexes = new Set();
  for (const ref of shot.reference_images ?? []) {
    if (ref === 'all') {
      imagePaths.slice(0, 6).forEach((_, index) => indexes.add(index));
    } else if (ref === 'last') {
      indexes.add(imagePaths.length - 1);
    } else {
      const parsed = Number(ref);
      if (Number.isFinite(parsed) && parsed >= 1) {
        indexes.add(parsed - 1);
      }
    }
  }

  const selected = [...indexes]
    .sort((a, b) => a - b)
    .map((index) => imagePaths[index])
    .filter(Boolean)
    .slice(0, 6);

  if (selected.length === 0) {
    selected.push(imagePaths[0]);
  }

  return selected.flatMap((imagePath) => ['--image-references', imagePath]);
};

const writeHiggsProductionKit = ({listing, listingDir, listingPlan = null}) => {
  const conversion = conversionBriefForListing(listing, listingPlan);
  const shots = plannedShotsForListing(listing, listingPlan);
  const imagePaths = imagePathsForListing(listing, listingDir);
  const higgsDir = path.join(listingDir, 'higgsfield');
  ensureDir(higgsDir);

  const model = String(args['higgs-model'] ?? 'seedance_2_0');
  const resolution = String(args['higgs-resolution'] ?? '720p');
  const aspectRatio = String(args['higgs-aspect-ratio'] ?? '9:16');
  const mode = String(args['higgs-mode'] ?? 'std');

  const renderJobs = shots.map((shot) => {
    const prompt = [
      shot.prompt,
      '',
      `Buyer emotion: ${conversion.emotional_hook}.`,
      `Visual tone: ${conversion.visual_tone}.`,
      `Objection to answer: ${conversion.objection_to_answer}.`,
      'Make it feel like a premium marketplace ad, not a slideshow.',
      'Preserve the exact item from references. No added accessories. No fake labels. No changed condition.',
    ].join(' ');
    const refs = referenceArgsForShot({shot, imagePaths});
    return {
      id: shot.id,
      model,
      prompt,
      duration: shot.duration_seconds,
      aspect_ratio: aspectRatio,
      resolution,
      mode,
      reference_args: refs,
      reference_images: refs.filter((_, index) => index % 2 === 1),
      output_hint: path.join(listingDir, 'higgsfield-renders', `${shot.id}.mp4`),
    };
  });

  safeJsonWrite(path.join(listingDir, 'conversion-brief.json'), conversion);
  safeJsonWrite(path.join(higgsDir, 'render-jobs.json'), {
    item_id: String(listing.item_id),
    title: listing.title,
    created_at: new Date().toISOString(),
    model_defaults: {model, resolution, aspect_ratio: aspectRatio, mode},
    conversion,
    render_jobs: renderJobs,
  });

  const conversionMarkdown = [
    `# Conversion Brief: ${listing.title}`,
    '',
    `Buyer: ${conversion.buyer}`,
    `Hook: ${conversion.emotional_hook}`,
    `Offer angle: ${conversion.offer_angle}`,
    `Visual tone: ${conversion.visual_tone}`,
    `Objection to answer: ${conversion.objection_to_answer}`,
    '',
    '## Proof Points',
    '',
    ...conversion.proof_points.map((point) => `- ${point}`),
    '',
    '## Hard Rules',
    '',
    ...conversion.hard_rules.map((rule) => `- ${rule}`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(listingDir, 'conversion-brief.md'), conversionMarkdown);

  const preflightScript = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'npm exec --package=@higgsfield/cli -- higgs version',
    'npm exec --package=@higgsfield/cli -- higgs workspace status || true',
    'npm exec --package=@higgsfield/cli -- higgs account status',
    'npm exec --package=@higgsfield/cli -- higgs model get seedance_2_0 >/dev/null',
    '',
  ].join('\n');

  const costLines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `cd ${shellQuote(projectRoot)}`,
    `echo ${shellQuote(`Estimating Higgs costs for ${listing.item_id} - ${listing.title}`)}`,
    ...renderJobs.flatMap((job) => [
      `echo ${shellQuote(`--- ${job.id}`)}`,
      [
        'npm exec --package=@higgsfield/cli -- higgs generate cost',
        shellQuote(job.model),
        '--prompt',
        shellQuote(job.prompt),
        '--duration',
        shellQuote(String(job.duration)),
        '--aspect_ratio',
        shellQuote(job.aspect_ratio),
        '--resolution',
        shellQuote(job.resolution),
        '--mode',
        shellQuote(job.mode),
        '--generate_audio',
        'false',
        ...job.reference_args.map(shellQuote),
      ].join(' '),
    ]),
    '',
  ];

  const renderLines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `cd ${shellQuote(projectRoot)}`,
    `mkdir -p ${shellQuote(path.join(listingDir, 'higgsfield-renders'))}`,
    `echo ${shellQuote(`Rendering Higgs product shots for ${listing.item_id} - ${listing.title}`)}`,
    ...renderJobs.flatMap((job) => [
      `echo ${shellQuote(`--- ${job.id}`)}`,
      [
        'npm exec --package=@higgsfield/cli -- higgs generate create',
        shellQuote(job.model),
        '--prompt',
        shellQuote(job.prompt),
        '--duration',
        shellQuote(String(job.duration)),
        '--aspect_ratio',
        shellQuote(job.aspect_ratio),
        '--resolution',
        shellQuote(job.resolution),
        '--mode',
        shellQuote(job.mode),
        '--generate_audio',
        'false',
        '--wait',
        '--wait-timeout',
        '20m',
        '--wait-interval',
        '5s',
        '--json',
        ...job.reference_args.map(shellQuote),
        `| tee ${shellQuote(path.join(higgsDir, `${job.id}.job.json`))}`,
      ].join(' '),
      `echo ${shellQuote(`Save/download the resulting video URL as: ${job.output_hint}`)}`,
    ]),
    '',
  ];

  const qaMarkdown = [
    `# Publish QA: ${listing.title}`,
    '',
    'Reject the render if any answer is "no":',
    '',
    '- Does the generated product still match the real listing photos?',
    '- Are all visible accessories actually included in the listing?',
    '- Are labels, screens, ports, card grade, and condition cues unchanged?',
    '- Does the first second clearly communicate what is for sale?',
    '- Does the ad answer the buyer objection from `conversion-brief.md`?',
    '- Is B-roll supportive rather than misleading?',
    '- Is the final video under eBay limits and free of obvious AI artifacts?',
    '- Did we stage the eBay media revision before applying live?',
    '',
    'If a render fails product truth, do not fix it in post. Regenerate with stricter references or skip the shot.',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(higgsDir, 'preflight.sh'), preflightScript);
  fs.writeFileSync(path.join(higgsDir, 'estimate-costs.sh'), costLines.join('\n'));
  fs.writeFileSync(path.join(higgsDir, 'render-product-shots.sh'), renderLines.join('\n'));
  fs.writeFileSync(path.join(higgsDir, 'publish-qa.md'), qaMarkdown);
  fs.chmodSync(path.join(higgsDir, 'preflight.sh'), 0o755);
  fs.chmodSync(path.join(higgsDir, 'estimate-costs.sh'), 0o755);
  fs.chmodSync(path.join(higgsDir, 'render-product-shots.sh'), 0o755);
};

const shotPromptsForListing = (listing) => {
  const title = listing.title ?? `eBay item ${listing.item_id}`;
  return [
    {
      id: '01-hero-reveal',
      duration_seconds: 5,
      reference_images: ['01'],
      prompt:
        `Cinematic vertical product ad hero reveal for the exact item shown: ${title}. Slow controlled push-in, clean studio surface, premium natural reflections, realistic lens depth, high-end resale marketplace feel. Preserve the real product appearance from the reference image.`,
    },
    {
      id: '02-condition-macro',
      duration_seconds: 5,
      reference_images: ['02', '03'],
      prompt:
        `Macro detail pass across the exact listed item, emphasizing real surfaces, edges, labels, accessories, and condition cues visible in the reference photos. Smooth handheld micro movement, soft directional light, no invented damage or hidden flaws.`,
    },
    {
      id: '03-included-bundle',
      duration_seconds: 5,
      reference_images: ['all'],
      prompt:
        `Cinematic arrangement of only the items visibly included in the listing photos for ${title}. Editorial product-table composition, gentle parallax, crisp focus pulls, no extra accessories, no fake packaging, no altered model labels.`,
    },
    {
      id: '04-buyer-confidence',
      duration_seconds: 5,
      reference_images: ['01', 'last'],
      prompt:
        `Trust-building closing shot for an eBay listing video: the exact product from the references, clean and honest lighting, subtle camera move, premium but realistic resale presentation, no text overlays, no logos added, no functionality claims.`,
    },
  ];
};

const storyCategoryForListing = (listing) => {
  const text = `${listing.title ?? ''}`.toLowerCase();
  if (/\b(camera|sony|alpha|lens|mirrorless|a6700|a7|photography)\b/.test(text)) return 'camera';
  if (/\b(gimbal|stabilizer|dji rs|smallrig|tracker)\b/.test(text)) return 'gimbal';
  if (/\b(kobe|basketball|card|psa|lakers)\b/.test(text)) return 'collectible';
  if (/\b(projector|movie|home theater|cinema)\b/.test(text)) return 'projector';
  if (/\b(shoe|sneaker|yeezy|adidas|boots)\b/.test(text)) return 'fashion';
  return 'product';
};

const storyBrollPromptsForListing = (listing, {energy = 'standard'} = {}) => {
  const title = listing.title ?? `eBay item ${listing.item_id}`;
  const category = storyCategoryForListing(listing);
  const standard = {
    camera: [
      'cinematic creator filming handheld mirrorless camera close up',
      'content creator packing compact camera gear into small everyday bag',
      'Miami street photography golden hour camera b roll',
    ],
    gimbal: [
      'cinematic camera operator using handheld gimbal smooth movement',
      'behind the scenes creator filming travel video with compact stabilizer',
      'smooth product video setup desk camera accessories b roll',
    ],
    collectible: [
      'sports card collector inspecting graded card close up',
      'premium trading card collection display cinematic b roll',
      'basketball memorabilia desk showcase soft light',
    ],
    projector: [
      'cozy home movie night projector setup cinematic b roll',
      'small projector casting movie light in dark room',
      'portable home theater setup living room b roll',
    ],
    fashion: [
      'clean outfit detail close up shoes lifestyle b roll',
      'streetwear accessories flat lay cinematic b roll',
      'packing fashion item for resale shipping b roll',
    ],
    product: [
      'premium resale product packing clean desk b roll',
      'online marketplace seller photographing item cinematic b roll',
      'clean shipping station packing product for buyer b roll',
    ],
  };
  const maxEnergy = {
    camera: [
      'fast paced cinematic camera gear b roll whip pan close up 4k',
      'creator filming handheld mirrorless camera quick cuts commercial b roll',
      'camera lens macro focus pull high energy product commercial b roll',
      'packing camera gear fast desk montage shipping label b roll',
      'Miami street photography quick cuts mirrorless camera golden hour b roll',
    ],
    gimbal: [
      'fast paced gimbal operator smooth motion whip pan commercial b roll',
      'behind the scenes creator filming travel video quick cuts stabilizer b roll',
      'camera rig accessory desk montage high energy product b roll',
      'smooth handheld gimbal movement transition shot 4k b roll',
      'creator packing compact filmmaking gear fast montage b roll',
    ],
    collectible: [
      'sports card collector quick reveal graded card close up b roll',
      'premium trading card slab macro focus pull high energy b roll',
      'collector desk fast montage card display cinematic b roll',
      'shipping collectible card protective packaging quick cuts b roll',
      'basketball card showcase dramatic light macro b roll',
    ],
    projector: [
      'home theater projector quick setup cinematic b roll',
      'portable projector movie night fast montage commercial b roll',
      'projector beam room reveal dramatic quick cuts b roll',
      'tech product unboxing desk close up high energy b roll',
      'small projector lifestyle commercial b roll quick cuts',
    ],
    fashion: [
      'streetwear shoes quick cuts close up lifestyle b roll',
      'fashion resale packing shipping fast montage b roll',
      'sneaker detail macro high energy commercial b roll',
      'clean outfit detail whip pan product b roll',
      'streetwear flat lay quick cuts cinematic b roll',
    ],
    product: [
      'online marketplace product photography quick cuts b roll',
      'resale shipping station fast packing montage b roll',
      'premium product close up macro focus pull commercial b roll',
      'seller desk product prep high energy b roll',
      'ecommerce product ad quick cuts cinematic b roll',
    ],
  };
  const shared = energy === 'max' ? maxEnergy : standard;

  return (shared[category] ?? shared.product).map((prompt, index) => ({
    id: `story-${String(index + 1).padStart(2, '0')}`,
    prompt,
    use: index === 0
      ? `Open or finish with a context shot that tells buyers what ${title} helps them do.`
      : 'Optional supporting cutaway for pacing and story texture.',
  }));
};

const writeStoryBrollPlan = ({listing, listingDir}) => {
  const energy = String(args.energy ?? args['creative-energy'] ?? 'standard');
  const prompts = storyBrollPromptsForListing(listing, {energy});
  const plan = {
    item_id: listing.item_id,
    title: listing.title,
    energy,
    purpose:
      energy === 'max'
        ? 'Add high-energy commercial pacing around product-proof shots with quick contextual B-roll. Use only cleared/licensed footage for live eBay ads.'
        : 'Add a short story-building finish around the product shots. Use only cleared/licensed footage for live eBay ads.',
    guardrails: [
      'B-roll should support the buyer story; it must not imply unshown accessories or functionality.',
      'Do not use copyrighted movie/TV clips in live commercial listings unless rights are cleared.',
      energy === 'max'
        ? 'Keep final B-roll fast: usually 3-5 clips at 1.0-1.6 seconds each.'
        : 'Keep final B-roll short: usually 1-2 clips at 2-3 seconds each.',
      'Product truth still comes from the real listing photos and Higgsfield product-reference clips.',
    ],
    prompts,
  };
  safeJsonWrite(path.join(listingDir, 'story-broll-plan.json'), plan);
  fs.writeFileSync(
    path.join(listingDir, 'story-broll-prompts.txt'),
    `${prompts.map((item) => item.prompt).join('\n')}\n`,
  );
  ensureDir(path.join(listingDir, 'story-broll'));
  fs.writeFileSync(path.join(listingDir, 'story-broll', '.gitkeep'), '');

  const markdown = [
    `# Story B-Roll Finish: ${listing.title}`,
    '',
    'Use this for pacing and buyer imagination after the real product-reference shots. Keep it short and only use footage you can legally use in a commercial eBay listing.',
    '',
    '## Prompts',
    '',
    ...prompts.flatMap((item) => [
      `### ${item.id}`,
      '',
      item.prompt,
      '',
      item.use,
      '',
    ]),
    '## Commands',
    '',
    'Find B-roll candidates:',
    '',
    '```bash',
    `npm run ebay:cinematic-ads -- find-broll --project-dir "${listingDir}"`,
    '```',
    '',
    'Assemble with B-roll finish:',
    '',
    '```bash',
    energy === 'max'
      ? `npm run ebay:cinematic-ads -- assemble --project-dir "${listingDir}" --energy max`
      : `npm run ebay:cinematic-ads -- assemble --project-dir "${listingDir}" --include-broll --broll-position end`,
    '```',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(listingDir, 'story-broll-plan.md'), markdown);
};

const writeBriefs = ({listing, listingDir, listingPlan = null}) => {
  const prompts = plannedShotsForListing(listing, listingPlan);
  const brief = {
    item_id: listing.item_id,
    title: listing.title,
    listing_url: listing.url,
    aspect_ratio: '9:16',
    target_length_seconds: 20,
    required_guardrails: [
      'Use the downloaded listing photos as required references.',
      'Preserve the exact product, condition, labels, included accessories, and visible flaws.',
      'Do not invent packaging, accessories, serial labels, screen content, reflections, or functionality.',
      'Do not make the product look newer than the source photos support.',
      'Avoid slideshow motion; generate real camera movement, macro passes, focus pulls, and product staging.',
    ],
    higgsfield_workflow: [
      'Import each reference image URL or upload each downloaded image into Higgsfield.',
      'Generate one short clip per shot prompt.',
      'Put finished clips into higgsfield-renders/ with filenames starting 01-, 02-, 03-, 04-.',
      'Run the assemble command to make the final eBay MP4.',
      'Run the upload command to create and attach the eBay video.',
    ],
    prompts,
    reference_images: listing.images ?? [],
    conversion_brief: 'conversion-brief.md',
    higgsfield_scripts: 'higgsfield/',
  };

  safeJsonWrite(path.join(listingDir, 'higgsfield-brief.json'), brief);

  const markdown = [
    `# ${listing.title}`,
    '',
    `eBay item: ${listing.item_id}`,
    listing.url ? `Listing: ${listing.url}` : null,
    '',
    '## Reference Rule',
    '',
    'The real listing photos are the source of truth. Every generated video shot must preserve the exact product and visible condition from those references.',
    '',
    '## Higgsfield Shot Prompts',
    '',
    ...prompts.flatMap((shot) => [
      `### ${shot.id}`,
      '',
      `Duration: ${shot.duration_seconds}s`,
      `References: ${shot.reference_images.join(', ')}`,
      '',
      shot.prompt,
      '',
    ]),
    '## Commands',
    '',
    'After Higgsfield renders are in `higgsfield-renders/`:',
    '',
    '```bash',
    `npm run ebay:cinematic-ads -- assemble --project-dir "${listingDir}"`,
    '```',
    '',
    'Then upload/attach after review:',
    '',
    '```bash',
    `npm run ebay:cinematic-ads -- upload --item-id ${listing.item_id} --video "${path.join(listingDir, 'final', `${listing.item_id}-cinematic-ad.mp4`)}" --attach`,
    '```',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');

  fs.writeFileSync(path.join(listingDir, 'higgsfield-brief.md'), markdown);
  ensureDir(path.join(listingDir, 'higgsfield-renders'));
  fs.writeFileSync(
    path.join(listingDir, 'higgsfield-renders', '.gitkeep'),
    '',
  );
  writeStoryBrollPlan({listing, listingDir});
  writeHiggsProductionKit({listing, listingDir, listingPlan});
};

const prepareListingProjects = async ({itemIds, outRoot, noDownload, listingPlanById = new Map(), workbenchFile = null}) => {
  ensureDir(outRoot);

  const outputDirectory = isInsideProject(outRoot) ? path.relative(projectRoot, outRoot) : outRoot;
  const workbench = workbenchFile
    ? readJson(path.resolve(workbenchFile))
    : await mcpTool('ebay_get_listing_asset_workbench', {
      item_ids: itemIds,
      output_directory: outputDirectory,
      include_download_commands: true,
      include_ai_edit_briefs: true,
    });

  safeJsonWrite(path.join(outRoot, 'workbench.json'), workbench);

  const selectedItemIds = new Set(itemIds.map((itemId) => String(itemId)));
  const listings = (workbench.manifest?.listings ?? [])
    .filter((listing) => selectedItemIds.size === 0 || selectedItemIds.has(String(listing.item_id)));
  if (listings.length === 0 && itemIds.length > 0) {
    throw new Error(`Workbench did not contain selected item IDs: ${itemIds.join(', ')}`);
  }

  for (const listing of listings) {
    const listingDir = resolveProjectPath(listing.directory) ?? path.join(outRoot, String(listing.item_id));
    ensureDir(listingDir);
    safeJsonWrite(path.join(listingDir, 'listing.json'), listing);

    if (!noDownload) {
      for (const image of listing.images ?? []) {
        const imagePath = resolveProjectPath(image.path) ?? path.join(listingDir, image.filename);
        const result = await downloadFile({url: image.source_url, outPath: imagePath});
        console.log(`Downloaded ${result.bytes} bytes -> ${result.path}`);
      }
    }

    writeBriefs({
      listing,
      listingDir,
      listingPlan: listingPlanById.get(String(listing.item_id)) ?? null,
    });
  }

  console.log(`Prepared ${itemIds.length} listing project(s): ${outRoot}`);
};

const prepare = async () => {
  const itemIds = parseIdList(args['item-ids'] ?? args['item-id']);
  if (itemIds.length === 0) {
    throw new Error(`Missing --item-ids.\n${usage}`);
  }

  const outRoot = path.resolve(
    String(args['out-dir'] ?? path.join(ebayCinematicAdsOutputRoot, `run-${timestampSlug()}`)),
  );

    await prepareListingProjects({
      itemIds,
      outRoot,
      noDownload: Boolean(args['no-download']),
      listingPlanById: new Map(),
      workbenchFile: args['workbench-file'] ? String(args['workbench-file']) : null,
    });
};

const buildRoiQueue = async ({outRoot}) => {
  const creditBudget = numberValue(args['credit-budget'], 45);
  const creditsPerShot = Math.max(1, numberValue(args['credits-per-shot'], 22.5));
  const maxListings = Math.max(1, Math.floor(numberValue(args['max-listings'], 1)));
  const maxHiggsShots = Math.max(1, Math.floor(numberValue(args['max-higgs-shots'], 1)));
  const adStrategy = String(args['ad-strategy'] ?? 'lean');
  const minPrice = numberValue(args['min-price'], 40);
  const includeBids = Boolean(args['include-bids']);
  const skipItemIds = idSet(args['skip-item-ids']);
  const onlyItemIds = idSet(args['only-item-ids']);
  ensureDir(outRoot);

  const dashboard = args['dashboard-file']
    ? readJson(path.resolve(String(args['dashboard-file'])))
    : await mcpTool('ebay_get_listing_performance_dashboard', {
      include_traffic: false,
      last_days: 7,
    });

  const ranked = (dashboard.listings ?? [])
    .filter((listing) => listing.ok !== false)
    .filter((listing) => skipItemIds.size === 0 || !skipItemIds.has(String(listing.item_id)))
    .filter((listing) => onlyItemIds.size === 0 || onlyItemIds.has(String(listing.item_id)))
    .filter((listing) => getPrice(listing) >= minPrice)
    .filter((listing) => includeBids || numberValue(listing.bid_count, 0) === 0)
    .map((listing) => {
      const tier = renderTierForListing(listing, {
        strategy: adStrategy,
        maxHiggsShots,
      });
      const estimatedCredits = tier.shots * creditsPerShot;
      return {
        item_id: String(listing.item_id),
        title: listing.title,
        url: listing.url,
        price: getPrice(listing),
        asset_score: numberValue(listing.asset_score, 0),
        picture_count: numberValue(listing.picture_count, 0),
        video_count: numberValue(listing.video_count, 0),
        bid_count: numberValue(listing.bid_count, 0),
        watch_count: numberValue(listing.watch_count, 0),
        roi_score: listingRoiScore(listing),
        tier: tier.tier,
        shots: tier.shots,
        estimated_credits: estimatedCredits,
        strategy: tier.strategy,
        reasons: reasonsForListing(listing),
      };
    })
    .sort((a, b) => b.roi_score - a.roi_score || b.price - a.price);

  const selected = [];
  let spent = 0;
  for (const candidate of ranked) {
    if (selected.length >= maxListings) break;
    if (spent + candidate.estimated_credits > creditBudget) continue;
    selected.push(candidate);
    spent += candidate.estimated_credits;
  }

  writeRoiPlan({
    dashboard,
    ranked,
    selected,
    outRoot,
    creditBudget,
    creditsPerShot,
    adStrategy,
    maxHiggsShots,
  });

  return {
    dashboard,
    ranked,
    selected,
    spent,
    outRoot,
    creditBudget,
    creditsPerShot,
    adStrategy,
    maxHiggsShots,
  };
};

const roiPlan = async () => {
  const outRoot = path.resolve(
    String(args['out-dir'] ?? path.join(ebayCinematicAdsOutputRoot, `roi-plan-${timestampSlug()}`)),
  );
  const plan = await buildRoiQueue({outRoot});

  if (args['prepare-selected'] && plan.selected.length > 0) {
    const listingPlanById = new Map(plan.selected.map((listing) => [String(listing.item_id), listing]));
    await prepareListingProjects({
      itemIds: plan.selected.map((listing) => listing.item_id),
      outRoot: path.join(outRoot, 'projects'),
      noDownload: Boolean(args['no-download']),
      listingPlanById,
      workbenchFile: args['workbench-file'] ? String(args['workbench-file']) : null,
    });
  }

  console.log(`ROI plan: ${path.join(outRoot, 'higgsfield-roi-plan.md')}`);
  console.log(`Selected ${plan.selected.length} listing(s), estimated ${plan.spent}/${plan.creditBudget} credits.`);
};

const competitivePlan = async () => {
  const outRoot = path.resolve(
    String(args['out-dir'] ?? path.join(ebayCinematicAdsOutputRoot, `competitive-plan-${timestampSlug()}`)),
  );
  const plan = await buildRoiQueue({outRoot});
  const projectsDir = path.join(outRoot, 'projects');

  if (plan.selected.length > 0) {
    const listingPlanById = new Map(plan.selected.map((listing) => [String(listing.item_id), listing]));
    await prepareListingProjects({
      itemIds: plan.selected.map((listing) => listing.item_id),
      outRoot: projectsDir,
      noDownload: Boolean(args['no-download']),
      listingPlanById,
      workbenchFile: args['workbench-file'] ? String(args['workbench-file']) : null,
    });
  }

  const creativeOutDir = path.join(outRoot, 'competitive-creative');
  const discoverYoutube = args['no-discover-youtube'] ? false : true;
  const analyzeReferenceVideo = args['no-analyze-reference-video'] ? false : true;
  const intelArgs = [
    'run',
    'ebay:creative-intel',
    '--',
    'plan',
    '--projects-dir',
    projectsDir,
    '--out-dir',
    creativeOutDir,
    '--max-references',
    String(args['max-references'] ?? 5),
    '--max-discover-results',
    String(args['max-discover-results'] ?? 5),
    '--analysis-max-seconds',
    String(args['analysis-max-seconds'] ?? 20),
    '--analysis-scene-threshold',
    String(args['analysis-scene-threshold'] ?? 0.25),
  ];
  if (args.competitors) {
    intelArgs.push('--competitors', String(args.competitors));
  }
  if (discoverYoutube || args['discover-youtube']) {
    intelArgs.push('--discover-youtube');
  }
  if (analyzeReferenceVideo || args['analyze-reference-video']) {
    intelArgs.push('--analyze-reference-video');
  }

  if (plan.selected.length > 0) {
    execFileSync('npm', intelArgs, {cwd: projectRoot, stdio: 'inherit'});
  }

  let controlLoop = null;
  if (args['run-control-loop'] && plan.selected.length > 0) {
    const controlLoopArgs = [
      'run',
      'ebay:competitive-loop',
      '--',
      '--blueprints-dir',
      creativeOutDir,
      '--roi-plan',
      path.join(outRoot, 'higgsfield-roi-plan.json'),
      '--credit-budget',
      String(args['credit-budget'] ?? 45),
      '--credits-per-shot',
      String(args['credits-per-shot'] ?? 22.5),
      '--max-jobs-per-listing',
      String(args['max-higgs-shots'] ?? 1),
    ];
    for (const key of ['width', 'height', 'fps', 'music-track', 'music-volume', 'voiceover', 'voiceover-volume', 'sfx-library', 'sfx-volume', 'min-fit-score', 'min-trend-score']) {
      if (args[key] !== undefined && args[key] !== false) controlLoopArgs.push(`--${key}`, String(args[key]));
    }
    if (args['allow-weak-research'] === true) controlLoopArgs.push('--allow-weak-research');
    if (args['run-higgsfield-renders'] === true) controlLoopArgs.push('--run-higgsfield-renders');
    if (args['higgs-render-model']) controlLoopArgs.push('--higgs-render-model', String(args['higgs-render-model']));
    if (args['higgs-render-credit-budget']) controlLoopArgs.push('--higgs-render-credit-budget', String(args['higgs-render-credit-budget']));
    if (args['higgs-render-max-jobs']) controlLoopArgs.push('--higgs-render-max-jobs', String(args['higgs-render-max-jobs']));
    if (args['higgs-render-skip-cost'] === true) controlLoopArgs.push('--higgs-render-skip-cost');
    if (args['higgs-render-dry-run'] === true) controlLoopArgs.push('--higgs-render-dry-run');
    if (args['preview-duration'] !== undefined && args['preview-duration'] !== false) {
      controlLoopArgs.push('--duration', String(args['preview-duration']));
    }
    if (args['control-loop-dry-run']) {
      controlLoopArgs.push('--dry-run');
    }
    execFileSync('npm', controlLoopArgs, {cwd: projectRoot, stdio: 'inherit'});
    const premiumPlanDir = path.join(creativeOutDir, 'competitive-premium-render-plan');
    controlLoop = {
      control_loop_manifest: path.join(creativeOutDir, 'competitive-control-loop', 'competitive-control-loop-manifest.json'),
      preview_manifest: path.join(creativeOutDir, 'competitive-preview-render-manifest.json'),
      qa_report: path.join(creativeOutDir, 'competitive-video-qa-report.json'),
      premium_plan: path.join(premiumPlanDir, 'competitive-premium-render-plan.json'),
      handoff_manifest: path.join(premiumPlanDir, 'competitive-render-handoff', 'competitive-render-handoff-manifest.json'),
      higgsfield_render_manifest: path.join(premiumPlanDir, 'competitive-higgsfield-render-run', 'competitive-higgsfield-render-manifest.json'),
      higgsfield_render_url_map: path.join(premiumPlanDir, 'competitive-higgsfield-render-run', 'higgsfield-render-url-map.json'),
      status_report: path.join(premiumPlanDir, 'competitive-video-pipeline-status.json'),
      review_board: path.join(premiumPlanDir, 'competitive-review-board.html'),
      dry_run: Boolean(args['control-loop-dry-run']),
      run_higgsfield_renders: Boolean(args['run-higgsfield-renders']),
      higgsfield_render_dry_run: Boolean(args['higgs-render-dry-run']),
    };
  }

  const pipelineManifest = {
    created_at: new Date().toISOString(),
    command: 'competitive-plan',
    out_root: outRoot,
    roi_plan: path.join(outRoot, 'higgsfield-roi-plan.json'),
    projects_dir: projectsDir,
    competitive_creative_dir: creativeOutDir,
    control_loop: controlLoop,
    selected_count: plan.selected.length,
    selected: plan.selected,
    defaults: {
      discover_youtube: discoverYoutube,
      analyze_reference_video: analyzeReferenceVideo,
      analysis_max_seconds: numberValue(args['analysis-max-seconds'], 20),
      max_discover_results: numberValue(args['max-discover-results'], 5),
    },
    next_steps: [
      controlLoop
        ? args['run-higgsfield-renders']
          ? 'Open the control-loop review board and Higgsfield render manifest; confirm final_ready items before upload.'
          : 'Open the control-loop review board and inspect preview QA plus handoff blockers.'
        : 'Run competitive-plan again with --run-control-loop to render preview ads, QA them, prep premium packets, and export the render handoff.',
      'Review each competitive-creative/<item-id>/creative-blueprint.md and selected reference structure.',
      'Review each reference-video-analysis/contact sheet and shot-replica-map.md when available.',
      args['run-higgsfield-renders']
        ? 'If --higgs-render-dry-run was used, rerun without it only for approved listings within the credit budget.'
        : 'Render product-preserving Higgsfield shots from the handoff queue for the strongest listing first.',
      'Collect generated MP4s, finalize, then upload only after product-truth QA passes.',
    ],
  };
  safeJsonWrite(path.join(outRoot, 'competitive-pipeline-manifest.json'), pipelineManifest);

  console.log(`Competitive pipeline manifest: ${path.join(outRoot, 'competitive-pipeline-manifest.json')}`);
  console.log(`Selected ${plan.selected.length} listing(s), estimated ${plan.spent}/${plan.creditBudget} credits if rendered.`);
};

const listVideoFiles = (dir) =>
  fs
    .readdirSync(dir)
    .filter((name) => /\.(mp4|mov|m4v|webm)$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(dir, name));

const listNestedVideoFiles = (dir) => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(mp4|mov|m4v|webm)$/i.test(entry.name)) {
        found.push(fullPath);
      }
    }
  };
  walk(dir);
  return found.sort((a, b) => a.localeCompare(b));
};

const ffprobeDuration = (file) => {
  const output = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
    {encoding: 'utf8'},
  );
  return Number(output.trim());
};

const findBroll = () => {
  const projectDir = path.resolve(requireValue('project-dir'));
  const energy = String(args.energy ?? args['creative-energy'] ?? 'standard');
  const maxEnergy = energy === 'max';
  const promptsPath = path.join(projectDir, 'story-broll-prompts.txt');
  if (!fs.existsSync(promptsPath)) {
    throw new Error(`Story B-roll prompt file not found: ${promptsPath}`);
  }

  const runName = `story-broll-${path.basename(projectDir)}-${timestampSlug()}`;
  const runRoot = path.join(projectDir, 'outputs', 'story-broll');
  const findArgs = [
    'run',
    'broll:find',
    '--',
    '--prompts',
    promptsPath,
    '--out-dir',
    runRoot,
    '--run-name',
    runName,
    '--max-downloads',
    String(args['max-broll-clips'] ?? (maxEnergy ? 5 : 3)),
    '--max-results',
    String(args['max-results'] ?? (maxEnergy ? 16 : 12)),
    '--max-duration-seconds',
    String(args['max-broll-source-seconds'] ?? (maxEnergy ? 12 : 20)),
    '--min-candidate-score',
    String(args['min-candidate-score'] ?? (maxEnergy ? 3 : 4)),
    '--quality',
    String(args['broll-quality'] ?? 'high'),
    '--max-expanded-queries',
    String(args['max-expanded-queries'] ?? (maxEnergy ? 10 : 7)),
  ];

  if (String(args['find-broll-kind'] ?? 'stock') === 'movie') {
    findArgs.push('--movie-scenes');
  }

  execFileSync('npm', findArgs, {cwd: projectRoot, stdio: 'inherit'});

  const runDir = path.join(runRoot, runName);
  const storyBrollDir = path.join(projectDir, 'story-broll');
  ensureDir(storyBrollDir);

  const clips = listNestedVideoFiles(runDir);
  for (const [index, clip] of clips.entries()) {
    const ext = path.extname(clip) || '.mp4';
    const outPath = path.join(storyBrollDir, `${String(index + 1).padStart(2, '0')}-${slugify(path.basename(clip, ext))}${ext}`);
    fs.copyFileSync(clip, outPath);
  }

  safeJsonWrite(path.join(storyBrollDir, 'manifest.json'), {
    created_at: new Date().toISOString(),
    source_run_dir: runDir,
    prompt_file: promptsPath,
    clips_copied: clips.length,
    clips: listVideoFiles(storyBrollDir),
  });

  console.log(`Story B-roll copied to: ${storyBrollDir}`);
  console.log(`Clip count: ${clips.length}`);
};

const localBrollKeywordsForCategory = (category) => {
  const shared = {
    camera: ['Miami', 'LA', 'Josep', 'Montage'],
    gimbal: ['Miami', 'LA', 'Montage', 'Clip'],
    collectible: ['Rolex', 'Montage', 'Clip'],
    projector: ['LA', 'Miami', 'Montage', 'Clip'],
    fashion: ['Miami', 'LA', 'Vegas', 'Clip'],
    product: ['Miami', 'LA', 'Montage', 'Clip'],
  };
  return shared[category] ?? shared.product;
};

const seedLocalBroll = () => {
  const projectDir = path.resolve(requireValue('project-dir'));
  const listingPath = path.join(projectDir, 'listing.json');
  const listing = fs.existsSync(listingPath)
    ? JSON.parse(fs.readFileSync(listingPath, 'utf8'))
    : {item_id: path.basename(projectDir), title: path.basename(projectDir)};
  const category = storyCategoryForListing(listing);
  const localBrollDir = path.resolve(
    String(args['local-broll-dir'] ?? path.join(projectRoot, 'custom-scenes-library')),
  );
  const storyBrollDir = path.join(projectDir, 'story-broll');
  const maxClips = Math.max(1, Number(args['max-broll-clips'] ?? 3));
  ensureDir(storyBrollDir);

  if (!fs.existsSync(localBrollDir)) {
    throw new Error(`Local B-roll directory not found: ${localBrollDir}`);
  }

  const keywords = localBrollKeywordsForCategory(category).map((keyword) => keyword.toLowerCase());
  const clips = listNestedVideoFiles(localBrollDir)
    .map((clip) => {
      const name = path.basename(clip).toLowerCase();
      const score = keywords.reduce(
        (sum, keyword) => sum + (name.includes(keyword.toLowerCase()) ? 1 : 0),
        0,
      );
      return {clip, score};
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.clip.localeCompare(b.clip))
    .slice(0, maxClips);

  for (const [index, item] of clips.entries()) {
    const ext = path.extname(item.clip) || '.mp4';
    const outPath = path.join(
      storyBrollDir,
      `${String(index + 1).padStart(2, '0')}-local-${slugify(path.basename(item.clip, ext))}${ext}`,
    );
    fs.copyFileSync(item.clip, outPath);
  }

  safeJsonWrite(path.join(storyBrollDir, 'local-broll-manifest.json'), {
    created_at: new Date().toISOString(),
    project_dir: projectDir,
    local_broll_dir: localBrollDir,
    category,
    keywords,
    copied: clips.map((item) => item.clip),
    story_broll_dir: storyBrollDir,
  });

  console.log(`Seeded ${clips.length} local B-roll clip(s) into: ${storyBrollDir}`);
};

const orderAssemblyClips = ({productClips, brollClips, position}) => {
  if (brollClips.length === 0 || position === 'none') {
    return productClips.map((clip) => ({clip, kind: 'product'}));
  }

  if (position === 'interleave') {
    const ordered = [];
    const max = Math.max(productClips.length, brollClips.length);
    for (let index = 0; index < max; index += 1) {
      if (productClips[index]) ordered.push({clip: productClips[index], kind: 'product'});
      if (brollClips[index]) ordered.push({clip: brollClips[index], kind: 'broll'});
    }
    return ordered;
  }

  return [
    ...productClips.map((clip) => ({clip, kind: 'product'})),
    ...brollClips.map((clip) => ({clip, kind: 'broll'})),
  ];
};

const readSfxLibrary = (libraryDir) => {
  const indexPath = path.join(libraryDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  return (index.sounds ?? [])
    .filter((sound) => sound?.hasAudio !== false && sound.file)
    .map((sound) => ({
      ...sound,
      filePath: path.join(libraryDir, sound.file),
    }))
    .filter((sound) => fs.existsSync(sound.filePath));
};

const readMusicLibrary = (libraryDir) => {
  if (!fs.existsSync(libraryDir)) {
    return [];
  }
  const manifestPath = path.join(libraryDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : {tracks: []};
  const files = listNestedVideoFiles(libraryDir)
    .concat(
      fs.readdirSync(libraryDir, {withFileTypes: true})
        .filter((entry) => entry.isFile() && /\.(mp3|m4a|aac|wav|flac|opus)$/i.test(entry.name))
        .map((entry) => path.join(libraryDir, entry.name)),
    );
  const byFile = new Map((manifest.tracks ?? []).map((track) => [path.basename(track.file ?? ''), track]));
  return [...new Set(files)]
    .map((file) => ({
      ...(byFile.get(path.basename(file)) ?? {}),
      file,
      title: byFile.get(path.basename(file))?.title ?? path.basename(file),
    }))
    .filter((track) => fs.existsSync(track.file));
};

const pickMusicTrack = ({musicTrack, musicLibraryDir}) => {
  if (musicTrack) {
    const file = path.resolve(String(musicTrack));
    if (!fs.existsSync(file)) {
      throw new Error(`Music track not found: ${file}`);
    }
    return {file, title: path.basename(file), source: 'manual'};
  }

  const tracks = readMusicLibrary(musicLibraryDir);
  if (tracks.length === 0) {
    return null;
  }
  return tracks[0];
};

const pickSfx = (library, categories, seed) => {
  const wanted = new Set(categories);
  const candidates = library.filter((sound) => wanted.has(sound.category));
  const pool = candidates.length > 0 ? candidates : library;
  if (pool.length === 0) return null;
  return pool[Math.abs(seed) % pool.length];
};

const buildEnergySfxEvents = ({clipInfos, library, durationSeconds, volume, energy}) => {
  if (energy !== 'max' || library.length === 0) {
    return [];
  }

  const events = [];
  let cursor = 0;
  clipInfos.forEach((info, index) => {
    const boundary = cursor;
    const categories =
      index === 0
        ? ['impact', 'pop', 'whoosh']
        : info.kind === 'broll'
          ? ['whoosh', 'camera', 'glitch', 'pop']
          : ['camera', 'pop', 'money', 'impact'];
    const sound = pickSfx(library, categories, index * 13 + info.kind.length);
    if (sound) {
      events.push({
        startSeconds: Math.min(Math.max(0.04, boundary + (index === 0 ? 0.04 : 0.02)), Math.max(0, durationSeconds - 0.2)),
        sound,
        durationSeconds: Math.min(0.72, Number(sound.durationSeconds ?? 0.72)),
        volume: Number((volume * (info.kind === 'broll' ? 1.08 : 0.95)).toFixed(4)),
        reason: index === 0 ? 'opening hit' : `${info.kind} transition`,
      });
    }
    cursor += Number(info.durationSeconds ?? 0);
  });

  const closeSound = pickSfx(library, ['money', 'impact', 'alert'], 999);
  if (closeSound && durationSeconds > 1.2) {
    events.push({
      startSeconds: Math.max(0.1, durationSeconds - 0.9),
      sound: closeSound,
      durationSeconds: Math.min(0.8, Number(closeSound.durationSeconds ?? 0.8)),
      volume: Number((volume * 1.15).toFixed(4)),
      reason: 'closing CTA accent',
    });
  }

  return events
    .filter((event) => event.startSeconds < durationSeconds)
    .slice(0, 12);
};

const mixEnergySfx = ({
  inputPath,
  outPath,
  libraryDir,
  clipInfos,
  energy,
  volume,
  musicEnabled,
  musicLibraryDir,
  musicTrack,
  musicVolume,
}) => {
  const library = readSfxLibrary(libraryDir);
  const durationSeconds = ffprobeDuration(inputPath);
  const selectedMusic = musicEnabled
    ? pickMusicTrack({musicTrack, musicLibraryDir})
    : null;
  const events = buildEnergySfxEvents({
    clipInfos,
    library,
    durationSeconds,
    volume,
    energy,
  });
  const planPath = `${outPath.replace(/\.[^.]+$/, '')}.sfx-plan.json`;

  if (events.length === 0 && !selectedMusic) {
    fs.copyFileSync(inputPath, outPath);
    safeJsonWrite(planPath, {
      created_at: new Date().toISOString(),
      input_video: inputPath,
      output_video: outPath,
      library_dir: libraryDir,
      music_library_dir: musicLibraryDir,
      energy,
      events: [],
      note: library.length === 0 ? 'No indexed SFX library found.' : 'No SFX events selected.',
    });
    return {events: [], planPath};
  }

  const filters = [
    `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${durationSeconds.toFixed(3)}[base]`,
  ];
  const inputArgs = [];
  const mixLabels = ['[base]'];
  let nextInputIndex = 1;

  if (selectedMusic) {
    inputArgs.push('-stream_loop', '-1', '-i', selectedMusic.file);
    filters.push(
      `[${nextInputIndex}:a]aformat=channel_layouts=stereo,atrim=0:${durationSeconds.toFixed(3)},asetpts=PTS-STARTPTS,volume=${musicVolume}[music]`,
    );
    mixLabels.push('[music]');
    nextInputIndex += 1;
  }

  inputArgs.push(...events.flatMap((event) => ['-i', event.sound.filePath]));

  events.forEach((event, index) => {
    const delayMs = Math.max(0, Math.round(event.startSeconds * 1000));
    const inputIndex = nextInputIndex + index;
    filters.push(
      `[${inputIndex}:a]aformat=channel_layouts=stereo,atrim=0:${event.durationSeconds.toFixed(3)},asetpts=PTS-STARTPTS,volume=${event.volume},adelay=${delayMs}|${delayMs}[sfx${index}]`,
    );
    mixLabels.push(`[sfx${index}]`);
  });

  const mixInputs = mixLabels.join('');
  filters.push(
    `${mixInputs}amix=inputs=${mixLabels.length}:duration=first:normalize=0:dropout_transition=0,alimiter=limit=0.96[aout]`,
  );

  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      inputPath,
      ...inputArgs,
      '-filter_complex',
      filters.join(';'),
      '-dn',
      '-map_metadata',
      '-1',
      '-map',
      '0:v:0',
      '-map',
      '[aout]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      outPath,
    ],
    {stdio: 'inherit'},
  );

  safeJsonWrite(planPath, {
    created_at: new Date().toISOString(),
    input_video: inputPath,
    output_video: outPath,
    library_dir: libraryDir,
    music_library_dir: musicLibraryDir,
    energy,
    volume,
    music: selectedMusic
      ? {
        file: selectedMusic.file,
        title: selectedMusic.title,
        source_url: selectedMusic.source_url ?? selectedMusic.url ?? null,
        volume: musicVolume,
        license_status: selectedMusic.license_status ?? 'review_before_commercial_use',
      }
      : null,
    events: events.map((event) => ({
      start_seconds: event.startSeconds,
      duration_seconds: event.durationSeconds,
      volume: event.volume,
      reason: event.reason,
      sound_id: event.sound.id,
      sound_file: event.sound.file,
      category: event.sound.category,
    })),
  });

  return {events, planPath};
};

const assemble = () => {
  const projectDir = path.resolve(requireValue('project-dir'));
  const clipsDir = path.resolve(String(args['clips-dir'] ?? path.join(projectDir, 'higgsfield-renders')));
  const sourceClips = fs.existsSync(clipsDir) ? listVideoFiles(clipsDir) : [];
  if (sourceClips.length === 0) {
    throw new Error(
      `No Higgsfield render clips found in ${clipsDir}. Generate cinematic clips first, then rerun assemble.`,
    );
  }

  const width = Number(args.width ?? 1080);
  const height = Number(args.height ?? 1920);
  const fps = Number(args.fps ?? 30);
  const energy = String(args.energy ?? args['creative-energy'] ?? 'standard');
  const maxEnergy = energy === 'max';
  const maxClipSeconds = Number(args['max-clip-seconds'] ?? (maxEnergy ? 3.2 : 6));
  const maxBrollSeconds = Number(args['max-broll-seconds'] ?? (maxEnergy ? 1.35 : 3));
  const maxBrollClips = Math.max(0, Number(args['max-broll-clips'] ?? (maxEnergy ? 5 : 2)));
  const brollDir = path.resolve(String(args['broll-dir'] ?? path.join(projectDir, 'story-broll')));
  const brollPosition = String(args['broll-position'] ?? (maxEnergy ? 'interleave' : 'end'));
  const includeBroll = Boolean(args['include-broll'] || maxEnergy);
  const sfxLibraryDir = path.resolve(String(args['sfx-library'] ?? path.join(projectRoot, 'sfx-library')));
  const sfxEnabled = args['no-sfx'] !== true && args.sfx !== false && (maxEnergy || args.sfx === true);
  const sfxVolume = Number(args['sfx-volume'] ?? (maxEnergy ? 0.11 : 0.075));
  const musicLibraryDir = path.resolve(String(args['music-library'] ?? path.join(projectRoot, 'music-library', 'lofi-house')));
  const musicEnabled = args['no-music'] !== true && (maxEnergy || args.music === true || args['music-track']);
  const musicVolume = Number(args['music-volume'] ?? (maxEnergy ? 0.035 : 0.025));
  const selectedMusicTrack = args['music-track'] ? path.resolve(String(args['music-track'])) : null;
  const brollClips = includeBroll
    ? listVideoFiles(brollDir).slice(0, maxBrollClips)
    : [];
  const assemblyClips = orderAssemblyClips({
    productClips: sourceClips,
    brollClips,
    position: brollPosition,
  });
  const itemId = path.basename(projectDir);
  const finalDir = path.join(projectDir, 'final');
  const workDir = path.join(projectDir, 'outputs', `assemble-${timestampSlug()}`);
  ensureDir(finalDir);
  ensureDir(workDir);

  const clipInfos = [];
  const normalizedClips = assemblyClips.map(({clip, kind}, index) => {
    const out = path.join(workDir, `${String(index + 1).padStart(2, '0')}.mp4`);
    const filters = [
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
      `fps=${fps}`,
      'setsar=1',
      'format=yuv420p',
    ].join(',');

    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        clip,
        '-map',
        '0:v:0',
        '-dn',
        '-map_metadata',
        '-1',
        '-t',
        String(kind === 'broll' ? maxBrollSeconds : maxClipSeconds),
        '-vf',
        filters,
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '18',
        out,
      ],
      {stdio: 'inherit'},
    );
    clipInfos.push({
      source: clip,
      normalized: out,
      kind,
      durationSeconds: ffprobeDuration(out),
    });
    return out;
  });

  const concatFile = path.join(workDir, 'concat.txt');
  fs.writeFileSync(
    concatFile,
    normalizedClips.map((clip) => `file '${clip.replaceAll("'", "'\\''")}'`).join('\n') + '\n',
  );

  const finalPath = path.join(finalDir, `${itemId}-cinematic-ad.mp4`);
  const audioMixEnabled = sfxEnabled || musicEnabled;
  const videoOnlyPath = audioMixEnabled
    ? path.join(workDir, `${itemId}-cinematic-ad.video-only.mp4`)
    : finalPath;
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatFile,
      '-map',
      '0:v:0',
      '-dn',
      '-map_metadata',
      '-1',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      videoOnlyPath,
    ],
    {stdio: 'inherit'},
  );

  let sfxPlan = null;
  let sfxEvents = [];
  if (audioMixEnabled) {
    const mix = mixEnergySfx({
      inputPath: videoOnlyPath,
      outPath: finalPath,
      libraryDir: sfxLibraryDir,
      clipInfos,
      energy,
      volume: sfxVolume,
      musicEnabled,
      musicLibraryDir,
      musicTrack: selectedMusicTrack,
      musicVolume,
    });
    sfxPlan = mix.planPath;
    sfxEvents = mix.events;
  }

  const proofFrame = path.join(finalDir, `${itemId}-proof-frame.jpg`);
  execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '1', '-i', finalPath, '-frames:v', '1', proofFrame],
    {stdio: 'inherit'},
  );

  const manifest = {
    created_at: new Date().toISOString(),
    project_dir: projectDir,
    clips_dir: clipsDir,
    broll_dir: brollDir,
    source_clips: sourceClips,
    broll_clips: brollClips,
    assembly_clips: assemblyClips,
    clip_infos: clipInfos,
    final_video: finalPath,
    proof_frame: proofFrame,
    duration_seconds: ffprobeDuration(finalPath),
    output: {width, height, fps},
    energy,
    broll: {
      included: brollClips.length > 0,
      position: brollPosition,
      max_broll_clips: maxBrollClips,
      max_broll_seconds: maxBrollSeconds,
    },
    sfx: {
      enabled: sfxEnabled,
      library_dir: sfxLibraryDir,
      volume: sfxVolume,
      music_enabled: musicEnabled,
      music_library_dir: musicLibraryDir,
      music_track: selectedMusicTrack,
      music_volume: musicVolume,
      plan: sfxPlan,
      event_count: sfxEvents.length,
      events: sfxEvents.map((event) => ({
        start_seconds: event.startSeconds,
        sound_id: event.sound.id,
        category: event.sound.category,
        reason: event.reason,
      })),
    },
  };
  safeJsonWrite(path.join(finalDir, 'manifest.json'), manifest);

  console.log(`Final cinematic ad: ${finalPath}`);
  console.log(`Proof frame: ${proofFrame}`);
};

const upload = async () => {
  const itemId = requireValue('item-id');
  const videoPath = path.resolve(requireValue('video'));
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const bytes = fs.readFileSync(videoPath);
  const maxKvBytes = 24 * 1024 * 1024;
  if (bytes.length > maxKvBytes) {
    throw new Error(
      `Video is ${(bytes.length / 1024 / 1024).toFixed(1)} MiB. upload_public_asset is capped for temporary KV hosting; use external HTTPS hosting or compress below 24 MiB.`,
    );
  }

  const asset = await mcpTool('upload_public_asset', {
    filename: path.basename(videoPath),
    content_type: 'video/mp4',
    content_base64: bytes.toString('base64'),
    asset_id: `ebay-${itemId}-cinematic-${timestampSlug()}`,
  });
  const publicUrl = asset.url ?? asset.public_url;
  if (!publicUrl) {
    throw new Error(`upload_public_asset did not return a public URL: ${JSON.stringify(asset)}`);
  }

  const created = await mcpTool('ebay_create_video_upload', {
    title: `Cinematic listing video ${itemId}`,
    video_url: publicUrl,
    size: bytes.length,
  });

  safeJsonWrite(path.join(path.dirname(videoPath), `${itemId}-upload-result.json`), {
    public_asset: asset,
    ebay_video: created,
  });

  console.log(`Public asset: ${publicUrl}`);
  console.log(`eBay video ID: ${created.video_id ?? created.videoId ?? 'unknown'}`);

  const videoId = created.video_id ?? created.videoId;
  if (args.attach && videoId) {
    const revision = await mcpTool('ebay_revise_listing_media', {
      item_id: itemId,
      video_ids: [videoId],
      apply_immediately: Boolean(args['apply-immediately']),
    });
    safeJsonWrite(path.join(path.dirname(videoPath), `${itemId}-revise-result.json`), revision);
    console.log(Boolean(args['apply-immediately']) ? 'Attached video live.' : 'Staged video attachment preview.');
  }

  if (args.poll && videoId) {
    const status = await mcpTool('ebay_get_video', {video_id: videoId});
    safeJsonWrite(path.join(path.dirname(videoPath), `${itemId}-video-status.json`), status);
    console.log(`Video status: ${status.status ?? status.video?.status ?? 'unknown'}`);
  }
};

const status = async () => {
  const videoId = requireValue('video-id');
  const result = await mcpTool('ebay_get_video', {video_id: videoId});
  console.log(JSON.stringify(result, null, 2));
};

if (command === 'roi-plan') {
  await roiPlan();
} else if (command === 'competitive-plan') {
  await competitivePlan();
} else if (command === 'prepare') {
  await prepare();
} else if (command === 'find-broll') {
  findBroll();
} else if (command === 'seed-local-broll') {
  seedLocalBroll();
} else if (command === 'assemble') {
  assemble();
} else if (command === 'upload') {
  await upload();
} else if (command === 'status') {
  await status();
} else {
  throw new Error(`Unknown command: ${command}\n${usage}`);
}
