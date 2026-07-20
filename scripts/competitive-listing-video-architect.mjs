#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';
import {slugify, timestampSlug} from './clipkit-lib.mjs';

const usage = `
Usage:
  npm run ebay:creative-intel -- plan --project-dir outputs/.../398160795273 --competitors kalodata-export.csv
  npm run ebay:creative-intel -- plan --projects-dir outputs/ebay-cinematic-ads/.../projects --competitors competitor-refs.json
  npm run ebay:creative-intel -- plan --project-dir outputs/.../398160795273 --discover-youtube

Commands:
  plan      Rank competitor/trend references and write product-safe video blueprints.
  help      Show this help.

Options:
  --project-dir DIR          One listing project folder containing listing.json.
  --projects-dir DIR         Folder to scan recursively for listing.json files.
  --competitors FILE         JSON, NDJSON, or CSV export from Kalodata/Automatio/TikTok/YouTube.
  --kalodata-export FILE     Alias for --competitors.
  --out-dir DIR              Output folder. Default: project-dir/competitive-creative or outputs/competitive-creative/run-*
  --max-references N         Keep top N references per listing. Default: 5
  --discover-youtube         Use yt-dlp metadata search to seed public competitor links. No competitor footage is used in final assets.
  --max-discover-results N   YouTube metadata results per listing. Default: 8
  --analyze-reference-video  Research-only: download a bounded clip from the selected reference, detect scene cuts, and write a 1:1 shot-replica map.
  --analysis-max-seconds N   Maximum seconds to download/analyze from selected reference. Default: 30
  --analysis-scene-threshold N
                            ffmpeg scene-change threshold. Default: 0.25
  --duration N               Target ad duration seconds. Default: inferred from top reference, clamped 16-30
`;

const rawArgs = process.argv.slice(2);
const command = rawArgs[0] && !rawArgs[0].startsWith('--') ? rawArgs[0] : 'plan';
const args = parseArgs(rawArgs);

if (command === 'help' || args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

if (command !== 'plan') {
  throw new Error(`Unknown command: ${command}\n${usage}`);
}

const numberValue = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const safeJsonWrite = (file, value) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

const readJsonFile = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const splitCsvLine = (line) => {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
};

const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
};

const extractRowsFromJson = (value) => {
  if (Array.isArray(value)) return value;
  for (const key of ['records', 'items', 'videos', 'products', 'rows', 'data', 'results']) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return value && typeof value === 'object' ? [value] : [];
};

const readCompetitorRows = (file) => {
  if (!file) return [];
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Competitor export not found: ${resolved}`);
  }
  const text = fs.readFileSync(resolved, 'utf8').trim();
  if (!text) return [];
  if (/\.csv$/i.test(resolved)) return parseCsv(text);
  if (/\.ndjson$/i.test(resolved) || text.split(/\r?\n/).every((line) => line.trim().startsWith('{'))) {
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
  return extractRowsFromJson(JSON.parse(text));
};

const firstValue = (row, keys, fallback = '') => {
  for (const key of keys) {
    const exact = row?.[key];
    if (exact !== undefined && exact !== null && String(exact).trim()) return exact;
    const matchedKey = Object.keys(row ?? {}).find((candidate) =>
      candidate.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, ''),
    );
    if (matchedKey && String(row[matchedKey] ?? '').trim()) return row[matchedKey];
  }
  return fallback;
};

const normalizeMetric = (value) => {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return 0;
  const compact = text
    .replace(/\s+/g, '')
    .replace(/views?|sold|orders?|units?|likes?|comments?|shares?|saves?|usd|us\$/g, '');
  const multiplier = compact.endsWith('b')
    ? 1_000_000_000
    : compact.endsWith('m')
      ? 1_000_000
      : compact.endsWith('k')
        ? 1_000
        : compact.endsWith('万')
          ? 10_000
          : 1;
  const number = Number(compact.replace(/[$,%+,]/g, '').replace(/[bmk万]$/, ''));
  return Number.isFinite(number) ? number * multiplier : 0;
};

const normalizePercent = (value) => {
  const number = normalizeMetric(value);
  if (!number) return 0;
  return String(value ?? '').includes('%') || number > 1 ? number / 100 : number;
};

const normalizeDate = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const daysSince = (isoDate) => {
  if (!isoDate) return null;
  const ageMs = Date.now() - new Date(isoDate).getTime();
  if (!Number.isFinite(ageMs)) return null;
  return Math.max(0, ageMs / 86_400_000);
};

const velocityFor = (metric, postedAt) => {
  const days = daysSince(postedAt);
  if (!days || days < 0.25) return 0;
  return metric / days;
};

const trendScoreForReference = (reference) => {
  const engagementCount = reference.likes + reference.comments + reference.shares + reference.saves;
  const engagementRate = reference.engagement_rate || (reference.views > 0 ? engagementCount / reference.views : 0);
  const viewsPerDay = velocityFor(reference.views, reference.posted_at);
  const soldPerDay = velocityFor(reference.sold, reference.posted_at);
  const revenuePerDay = velocityFor(reference.revenue, reference.posted_at);
  const recencyDays = daysSince(reference.posted_at);
  const recencyScore = recencyDays === null ? 0 : Math.max(0, 14 - Math.min(14, recencyDays)) * 1.2;
  const velocityScore =
    Math.min(18, Math.log10(viewsPerDay + 1) * 3.4) +
    Math.min(16, Math.log10(soldPerDay + 1) * 5.2) +
    Math.min(16, Math.log10(revenuePerDay + 1) * 4.2);
  const metricScore =
    Math.min(18, Math.log10(reference.views + 1) * 2.8) +
    Math.min(18, Math.log10(reference.sold + 1) * 4.6) +
    Math.min(18, Math.log10(reference.revenue + 1) * 3.8);
  const engagementScore = Math.min(16, engagementRate * 180) + Math.min(8, Math.log10(engagementCount + 1) * 2);
  const growthScore = Math.min(16, reference.growth_rate / 8);
  return Math.round(metricScore + velocityScore + engagementScore + growthScore + recencyScore);
};

const normalizeReference = (row, source = 'import') => {
  const title = String(firstValue(row, ['title', 'Product Title', 'Video Title', 'product_title', 'name'])).trim();
  const caption = String(firstValue(row, ['caption', 'description', 'Description', 'video_caption', 'post_copy'])).trim();
  const transcript = String(firstValue(row, ['transcript', 'script', 'voiceover', 'spoken_text'])).trim();
  const hook = String(firstValue(row, ['hook', 'opening_hook', 'first_three_seconds'])).trim();
  const url = String(firstValue(row, ['url', 'video_url', 'Video URL', 'link', 'permalink'])).trim();
  const platform = String(firstValue(row, ['platform', 'source_platform'], source)).trim() || source;
  const creator = String(firstValue(row, ['creator', 'creator_handle', 'Creator Handle', 'shop_name', 'Shop Name', 'seller'])).trim();
  const category = String(firstValue(row, ['category', 'Product Category', 'product_category', 'niche'])).trim();
  const shotNotes = String(firstValue(row, ['shot_notes', 'shot_breakdown', 'Shot Breakdown', 'visual_notes', 'Visual Notes', 'creative_notes', 'Creative Notes'])).trim();
  const audioNotes = String(firstValue(row, ['audio_notes', 'Audio Notes', 'music', 'Music', 'sound', 'Sound', 'sound_notes'])).trim();
  const durationSeconds = normalizeMetric(firstValue(row, ['duration_seconds', 'Duration Seconds', 'duration', 'length_seconds', 'Video Duration']));
  const views = normalizeMetric(firstValue(row, ['views', 'Video Views', 'video_views', 'view_count', 'play_count', 'plays']));
  const sold = normalizeMetric(firstValue(row, ['sold', 'Items Sold', 'items_sold', 'orders', 'units_sold', 'Sales Volume', 'Product Units Sold']));
  const revenue = normalizeMetric(firstValue(row, ['revenue', 'Total Revenue', 'gmv', 'sales', 'Product GMV', 'Video GMV', 'Gross Merchandise Value']));
  const growthRate = normalizeMetric(firstValue(row, ['Revenue Growth Rate', 'growth_rate', 'growth', 'GMV Growth Rate', 'Sales Growth Rate']));
  const likes = normalizeMetric(firstValue(row, ['likes', 'Video Likes', 'like_count', 'digg_count']));
  const comments = normalizeMetric(firstValue(row, ['comments', 'Video Comments', 'comment_count']));
  const shares = normalizeMetric(firstValue(row, ['shares', 'Video Shares', 'share_count']));
  const saves = normalizeMetric(firstValue(row, ['saves', 'Video Saves', 'save_count', 'collect_count']));
  const engagementRate = normalizePercent(firstValue(row, ['engagement_rate', 'Engagement Rate']));
  const postedAt = normalizeDate(firstValue(row, ['posted_at', 'Posting Date', 'post_date', 'created_at', 'publish_time', 'Video Publish Time']));
  const reference = {
    id: slugify(`${platform}-${creator || title || url}`, `ref-${Date.now()}`),
    source,
    platform,
    title,
    caption,
    transcript,
    hook,
    url,
    creator,
    category,
    duration_seconds: durationSeconds || null,
    views,
    sold,
    revenue,
    growth_rate: growthRate,
    likes,
    comments,
    shares,
    saves,
    engagement_rate: engagementRate,
    posted_at: postedAt,
    views_per_day: 0,
    sold_per_day: 0,
    revenue_per_day: 0,
    trend_score: 0,
    shot_notes: shotNotes,
    audio_notes: audioNotes,
    raw: row,
  };
  reference.views_per_day = Number(velocityFor(reference.views, reference.posted_at).toFixed(2));
  reference.sold_per_day = Number(velocityFor(reference.sold, reference.posted_at).toFixed(2));
  reference.revenue_per_day = Number(velocityFor(reference.revenue, reference.posted_at).toFixed(2));
  reference.trend_score = trendScoreForReference(reference);
  return reference;
};

const commandExists = (command) => {
  try {
    execFileSync('zsh', ['-lc', `command -v ${command}`], {stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
};

const stopWords = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you', 'are', 'new', 'used',
  'set', 'kit', 'bundle', 'black', 'white', 'size', 'adult', 'mens', 'women', 'ebay', 'sale',
]);

const keywordsFor = (value) =>
  String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !stopWords.has(word));

const unique = (values) => [...new Set(values.filter(Boolean))];

const inferCategory = (listing) => {
  const title = String(listing.title ?? '').toLowerCase();
  if (/\b(camera|sony|alpha|lens|mirrorless|gimbal|stabilizer|dji|smallrig)\b/.test(title)) return 'creator gear';
  if (/\b(card|psa|kobe|pokemon|collectible|slab)\b/.test(title)) return 'collectibles';
  if (/\b(rug|carpet|mat|chair|desk|crate|shelf|home|furniture|curtain|throw)\b/.test(title)) return 'home goods';
  if (/\b(tool|extractor|pump|socket|automotive|jack|stand|stands|lift|garage|mechanic)\b/.test(title)) return 'tools';
  if (/\b(shoe|shirt|hoodie|hat|jacket|fashion|sneaker)\b/.test(title)) return 'fashion';
  return 'marketplace product';
};

const anchorTermsForListing = (listing) => {
  const title = String(listing.title ?? '').toLowerCase();
  if (/\b(rug|carpet|mat)\b/.test(title)) return ['rug', 'carpet', 'mat', 'home', 'decor', 'room'];
  if (/\b(jack|stand|stands|lift)\b/.test(title)) return ['jack', 'stand', 'stands', 'lift', 'car', 'garage', 'automotive'];
  if (/\b(camera|sony|alpha|lens|mirrorless|gimbal|stabilizer|dji|smallrig)\b/.test(title)) return ['camera', 'sony', 'lens', 'rig', 'creator', 'gear'];
  if (/\b(card|psa|kobe|pokemon|collectible|slab)\b/.test(title)) return ['card', 'psa', 'collectible', 'slab'];
  return [];
};

const mustMatchTermsForListing = (listing) => {
  const title = String(listing.title ?? '').toLowerCase();
  if (/\b(rug|carpet|mat)\b/.test(title)) return ['rug', 'carpet', 'mat'];
  if (/\b(jack|stand|stands|lift)\b/.test(title)) return ['jack', 'stand', 'stands', 'lift'];
  if (/\b(camera|sony|alpha|lens|mirrorless|gimbal|stabilizer|dji|smallrig)\b/.test(title)) return ['camera', 'sony', 'lens', 'smallrig', 'rig'];
  return [];
};

const scoreReferenceForListing = (reference, listing) => {
  const listingKeywords = new Set(keywordsFor(`${listing.title ?? ''} ${inferCategory(listing)}`));
  const referenceText = [
    reference.title,
    reference.caption,
    reference.transcript,
    reference.hook,
    reference.category,
    reference.shot_notes,
  ].join(' ');
  const refKeywords = keywordsFor(referenceText);
  const overlap = refKeywords.filter((word) => listingKeywords.has(word)).length;
  const anchorTerms = anchorTermsForListing(listing);
  const anchorOverlap = anchorTerms.filter((word) => refKeywords.includes(word)).length;
  const mustMatchTerms = mustMatchTermsForListing(listing);
  const mustMatchOverlap = mustMatchTerms.filter((word) => refKeywords.includes(word)).length;
  const textScore = Math.min(45, overlap * 9);
  const anchorScore = anchorTerms.length === 0 ? 0 : anchorOverlap > 0 ? Math.min(18, anchorOverlap * 9) : -28;
  const mustMatchScore = mustMatchTerms.length === 0 ? 0 : mustMatchOverlap > 0 ? Math.min(24, mustMatchOverlap * 12) : -45;
  const categoryScore = reference.category && inferCategory(listing).includes(reference.category.toLowerCase()) ? 12 : 0;
  const viewScore = Math.min(18, Math.log10(reference.views + 1) * 3.2);
  const revenueScore = Math.min(18, Math.log10(reference.revenue + 1) * 3.4);
  const soldScore = Math.min(12, Math.log10(reference.sold + 1) * 3.4);
  const growthScore = Math.min(8, reference.growth_rate / 10);
  const trendScore = Math.min(16, reference.trend_score / 7);
  const hasCreativeDataScore = reference.transcript || reference.hook || reference.shot_notes ? 12 : 0;
  const duration = reference.duration_seconds ?? 20;
  const durationScore = duration >= 8 && duration <= 45 ? 5 : -4;
  return Math.round(textScore + anchorScore + mustMatchScore + categoryScore + viewScore + revenueScore + soldScore + growthScore + trendScore + hasCreativeDataScore + durationScore);
};

const firstSentence = (value) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.split(/(?<=[.!?])\s+/)[0]?.slice(0, 180) ?? text.slice(0, 180);
};

const detectHookPattern = (reference) => {
  const text = `${reference.hook} ${reference.caption} ${reference.transcript}`.toLowerCase();
  if (/\bstop scrolling\b|\bwait\b|\bdon't buy\b|\bbefore you buy\b/.test(text)) return 'pattern interrupt / buyer warning';
  if (/\bproblem\b|\btired of\b|\bstruggle\b|\bfix\b|\bsolution\b/.test(text)) return 'problem-solution';
  if (/\bamazon finds?\b|\btiktok made me buy\b|\bfound this\b|\bhidden gem\b/.test(text)) return 'discovery / product find';
  if (/\bbefore\b.*\bafter\b|\bupgrade\b|\btransform\b/.test(text)) return 'before-after transformation';
  if (/\bunder\s+\$|\bdeal\b|\bsave\b|\bcheap\b|\bsteal\b/.test(text)) return 'price-value hook';
  return 'direct product reveal';
};

const listingProofPoints = (listing) => {
  const title = String(listing.title ?? '');
  const category = inferCategory(listing);
  const points = ['actual listing photos', 'visible condition only', 'included items only'];
  if (category === 'creator gear') points.push('creator-ready use case', 'detail shots for ports/accessories');
  if (category === 'tools') points.push('job-ready utility', 'closeups of set/components');
  if (category === 'home goods') points.push('room/use-case scale', 'shipping-ready details');
  if (category === 'collectibles') points.push('grade/authenticity cues', 'front and back proof');
  if (title) points.push(title.slice(0, 72));
  return unique(points).slice(0, 7);
};

const imageListForListing = (listing, listingDir) => {
  const directImages = (listing.images ?? [])
    .map((image) => image.path ? path.resolve(projectRoot, image.path) : image.filename ? path.join(listingDir, image.filename) : null)
    .filter(Boolean);
  const localImages = fs.existsSync(listingDir)
    ? fs.readdirSync(listingDir)
        .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => path.join(listingDir, name))
    : [];
  return unique([...directImages, ...localImages]).filter((file) => fs.existsSync(file));
};

const structureStepsForReference = (reference) =>
  String(reference.shot_notes ?? '')
    .split(/\s*(?:,|>|\||→|;|\n)\s*/u)
    .map((step) => step.trim())
    .filter(Boolean)
    .slice(0, 8);

const importedBeatRole = ({step, index, count}) => {
  const text = String(step ?? '').toLowerCase();
  if (index === 0 || /hook|open|problem|mess|before/.test(text)) return 'hook';
  if (index === count - 1 || /cta|close|offer|checkout|buy|listing/.test(text)) return 'offer close';
  if (/hero|reveal|showcase|unbox|product/.test(text)) return 'hero reveal';
  if (/macro|detail|close|proof|label|condition|component/.test(text)) return 'proof detail';
  if (/b-roll|broll|lifestyle|room|use|demo|install|style/.test(text)) return 'use-case b-roll';
  return `structure beat ${index + 1}`;
};

const importedBeatCaptionIntent = (role) => {
  if (/hook/.test(role)) return 'competitor hook structure, rewritten for our exact item';
  if (/hero/.test(role)) return 'what is for sale';
  if (/proof|detail/.test(role)) return 'condition and included items';
  if (/use-case|structure beat/.test(role)) return 'buyer outcome';
  if (/offer/.test(role)) return 'view on eBay / check listing details';
  return 'product-safe structure beat';
};

const importedBeatSfx = (role) => {
  if (/hook/.test(role)) return ['impact hit', 'camera shutter'];
  if (/hero/.test(role)) return ['whoosh riser'];
  if (/proof|detail/.test(role)) return ['subtle clicks', 'macro ticks'];
  if (/use-case|structure beat/.test(role)) return ['speed ramp', 'light transition'];
  if (/offer/.test(role)) return ['soft hit', 'cash register tick'];
  return ['light transition'];
};

const importedBeatAssets = ({role, imageRefs, detailImageRefs}) => {
  if (/hook|offer/.test(role)) return imageRefs.slice(0, 1);
  if (/hero/.test(role)) return imageRefs.slice(0, 2);
  if (/proof|detail/.test(role)) return detailImageRefs;
  return ['cleared_story_broll'];
};

const productSafeExecutionForImportedBeat = ({listing, role, step, proof}) => {
  const title = listing.title ?? `eBay item ${listing.item_id ?? ''}`;
  if (/hook/.test(role)) {
    return `Recreate the reference beat "${step}" as a fast product-first opening for the exact ${title}; do not copy wording.`;
  }
  if (/hero/.test(role)) {
    return `Translate "${step}" into a clean reveal using our best real product photo or product-preserving generated shot.`;
  }
  if (/proof|detail/.test(role)) {
    return `Translate "${step}" into proof of ${proof.slice(0, 3).join(', ')} without inventing accessories or condition.`;
  }
  if (/offer/.test(role)) {
    return `Translate "${step}" into a plain eBay CTA using our actual product image/video and listing details.`;
  }
  return `Translate "${step}" into cleared supporting B-roll for ${inferCategory(listing)} without implying extra included items.`;
};

const blueprintBeats = ({listing, reference, durationSeconds, imageCount}) => {
  const hookPattern = detectHookPattern(reference);
  const title = listing.title ?? `eBay item ${listing.item_id ?? ''}`;
  const proof = listingProofPoints(listing);
  const imageRefs = Array.from({length: Math.max(1, Math.min(imageCount, 6))}, (_, index) => `image_${index + 1}`);
  const detailImageRefs = imageRefs.length > 1 ? imageRefs.slice(1, 4) : imageRefs.slice(0, 1);
  const structureSteps = structureStepsForReference(reference);
  const audioNote = String(reference.audio_notes ?? '').trim();
  if (structureSteps.length >= 3) {
    const segmentDuration = durationSeconds / structureSteps.length;
    return structureSteps.map((step, index) => {
      const role = importedBeatRole({step, index, count: structureSteps.length});
      const start = Number((index * segmentDuration).toFixed(2));
      const end = Number((index === structureSteps.length - 1 ? durationSeconds : (index + 1) * segmentDuration).toFixed(2));
      return {
        beat: role,
        competitor_pattern: step,
        original_execution: productSafeExecutionForImportedBeat({listing, role, step, proof}),
        source_assets: importedBeatAssets({role, imageRefs, detailImageRefs}),
        caption_intent: importedBeatCaptionIntent(role),
        sfx: importedBeatSfx(role),
        imported_structure_note: step,
        imported_audio_note: audioNote || null,
        time_seconds: {start, end},
      };
    });
  }
  const importedPattern = (index, fallback) => structureSteps[index] || fallback;
  const beats = [
    {
      beat: 'hook',
      time: [0, 2],
      competitor_pattern: importedPattern(0, hookPattern),
      original_execution: `Open with a fast product-first claim about the exact ${title}; do not copy the competitor wording.`,
      source_assets: imageRefs.slice(0, 1),
      caption_intent: 'one-line pattern interrupt',
      sfx: ['impact hit', 'camera shutter'],
      imported_structure_note: structureSteps[0] || null,
      imported_audio_note: audioNote || null,
    },
    {
      beat: 'hero reveal',
      time: [2, 5],
      competitor_pattern: importedPattern(1, 'fast reveal into clean product framing'),
      original_execution: 'Use our best real product photo or a Higgsfield reference-preserving hero shot.',
      source_assets: imageRefs.slice(0, 2),
      caption_intent: 'what is for sale',
      sfx: ['whoosh riser'],
      imported_structure_note: structureSteps[1] || null,
      imported_audio_note: audioNote || null,
    },
    {
      beat: 'proof detail',
      time: [5, 10],
      competitor_pattern: importedPattern(2, 'rapid closeups proving the product is real'),
      original_execution: `Show ${proof.slice(0, 3).join(', ')} with macro movement and no invented accessories.`,
      source_assets: detailImageRefs,
      caption_intent: 'condition and included items',
      sfx: ['subtle clicks', 'macro ticks'],
      imported_structure_note: structureSteps[2] || null,
      imported_audio_note: audioNote || null,
    },
    {
      beat: 'use-case b-roll',
      time: [10, Math.max(13, durationSeconds - 6)],
      competitor_pattern: importedPattern(3, 'aspirational lifestyle/use-case bridge'),
      original_execution: `Use cleared B-roll for ${inferCategory(listing)}. It should support the story without implying the listing includes anything not shown.`,
      source_assets: ['cleared_story_broll'],
      caption_intent: 'buyer outcome',
      sfx: ['speed ramp', 'light transition'],
      imported_structure_note: structureSteps[3] || null,
      imported_audio_note: audioNote || null,
    },
    {
      beat: 'offer close',
      time: [Math.max(13, durationSeconds - 6), durationSeconds],
      competitor_pattern: importedPattern(4, 'CTA with urgency and final product confidence shot'),
      original_execution: 'Return to our actual product image/video, mention eBay checkout, and make the CTA plain.',
      source_assets: imageRefs.slice(0, 1),
      caption_intent: 'view on eBay / check listing details',
      sfx: ['soft hit', 'cash register tick'],
      imported_structure_note: structureSteps[4] || null,
      imported_audio_note: audioNote || null,
    },
  ];
  return beats.map((beat) => ({
    ...beat,
    time_seconds: {
      start: Number(beat.time[0].toFixed(2)),
      end: Number(beat.time[1].toFixed(2)),
    },
    time: undefined,
  }));
};

const buildBlueprint = ({listing, listingDir, references, maxReferences, forcedDuration}) => {
  const ranked = references
    .map((reference) => ({
      ...reference,
      fit_score: scoreReferenceForListing(reference, listing),
      hook_pattern: detectHookPattern(reference),
      extracted_hook: firstSentence(reference.hook || reference.transcript || reference.caption || reference.title),
    }))
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, maxReferences);
  const fallbackReference = normalizeReference({
    title: `${listing.title ?? 'Product'} direct product ad`,
    hook: 'Direct product reveal with buyer confidence close',
    duration_seconds: 20,
  }, 'fallback-template');
  const top = ranked[0] ?? {
    ...fallbackReference,
    fit_score: 0,
    hook_pattern: detectHookPattern(fallbackReference),
    extracted_hook: firstSentence(fallbackReference.hook),
  };
  const durationSeconds = forcedDuration
    ? clamp(numberValue(forcedDuration, 22), 12, 45)
    : clamp(numberValue(top.duration_seconds, 22), 16, 30);
  const images = imageListForListing(listing, listingDir);
  const itemId = String(listing.item_id ?? listing.itemId ?? path.basename(listingDir));
  const brollPrompts = brollPromptsForBlueprint(listing, top);
  return {
    id: `${itemId}-${slugify(top.hook_pattern, 'creative')}`,
    created_at: new Date().toISOString(),
    compliance_mode: 'structure-inspired-only',
    listing: {
      item_id: itemId,
      title: listing.title ?? null,
      url: listing.url ?? listing.listing_url ?? null,
      inferred_category: inferCategory(listing),
      image_count: images.length,
    },
    selected_reference: {
      id: top.id,
      platform: top.platform,
      creator: top.creator || null,
      title: top.title,
      url: top.url || null,
      fit_score: top.fit_score ?? 0,
      hook_pattern: top.hook_pattern,
      extracted_hook_for_analysis_only: top.extracted_hook || null,
      structure_notes_for_analysis_only: {
        shot_breakdown: top.shot_notes || null,
        audio_notes: top.audio_notes || null,
      },
      metrics: {
        views: top.views,
        sold: top.sold,
        revenue: top.revenue,
        growth_rate: top.growth_rate,
        likes: top.likes,
        comments: top.comments,
        shares: top.shares,
        saves: top.saves,
        engagement_rate: top.engagement_rate,
        posted_at: top.posted_at,
        views_per_day: top.views_per_day,
        sold_per_day: top.sold_per_day,
        revenue_per_day: top.revenue_per_day,
        trend_score: top.trend_score,
      },
    },
    target_duration_seconds: durationSeconds,
    ranked_references: ranked,
    product_truth_rules: [
      'Do not use competitor footage, audio, captions, thumbnails, or exact copy in the final ad.',
      'Copy only the strategic structure: hook type, beat order, pacing, proof density, and CTA role.',
      'Use our own actual listing photos, owned/generated product-preserving video, licensed music, licensed SFX, and cleared B-roll.',
      'Reject any generated shot that changes condition, colors, model labels, included accessories, or product geometry.',
    ],
    original_script: scriptForListing(listing, top, durationSeconds),
    beats: blueprintBeats({listing, reference: top, durationSeconds, imageCount: images.length}),
    broll_prompts: brollPrompts,
    higgsfield_prompts: higgsPromptsForBlueprint(listing, top),
    render_queue: [
      'Review ranked competitor references for structure only.',
      'Render one product-preserving Higgsfield hero shot using actual listing photos.',
      'Find/download only cleared B-roll matching story-broll-prompts.competitive.txt.',
      'Assemble with fast cuts, quiet music bed, SFX accents, captions, and final eBay CTA.',
      'QA against product truth rules before upload or listing attachment.',
    ],
  };
};

const scriptForListing = (listing, reference, durationSeconds) => {
  const category = inferCategory(listing);
  const hookPattern = detectHookPattern(reference);
  const title = listing.title ?? 'this listing';
  const opening = hookPattern.includes('warning')
    ? `Before you buy another ${category} piece, look at the actual item in this listing.`
    : hookPattern.includes('price')
      ? `This is the kind of ${category} deal that only works if the details are clear.`
      : `Here is the exact ${category} item from the listing, shown fast and clearly.`;
  return {
    voiceover_style: 'avatar-like confident seller voice, energetic but honest',
    lines: [
      opening,
      `You are seeing the real photos and the real included items, not a stock fantasy version.`,
      `Check the closeups, confirm the condition, and use the eBay listing for the final details.`,
      durationSeconds <= 18 ? 'If it fits what you need, grab it before someone else does.' : 'If it fits what you need, open the listing, verify the details, and grab it before someone else does.',
    ],
    caption_lines: [
      'Actual listing photos',
      'Real details only',
      'Check it on eBay',
    ],
  };
};

const brollPromptsForBlueprint = (listing, reference) => {
  const category = inferCategory(listing);
  const hookPattern = detectHookPattern(reference);
  const base = {
    'creator gear': [
      'fast paced creator desk camera gear closeups commercial b roll',
      'mirrorless camera packing setup quick cuts clean desk b roll',
      'cinematic product photography camera gear macro focus pull',
    ],
    tools: [
      'workbench tool kit closeup fast paced commercial b roll',
      'garage repair detail shot hands tools quick cuts',
      'mechanic workbench product utility macro b roll',
    ],
    'home goods': [
      'modern home product setup quick commercial b roll',
      'clean room detail product lifestyle fast cuts b roll',
      'ecommerce home goods packing shipping b roll',
    ],
    collectibles: [
      'collector desk graded card closeup cinematic b roll',
      'premium collectible packaging careful handling b roll',
      'trading card slab macro focus pull dramatic light b roll',
    ],
    fashion: [
      'streetwear resale product detail quick cuts b roll',
      'fashion item packing shipping clean desk b roll',
      'sneaker apparel macro texture commercial b roll',
    ],
    'marketplace product': [
      'ecommerce product photography quick cuts clean desk b roll',
      'online resale shipping station fast packing b roll',
      'premium product macro focus pull commercial b roll',
    ],
  };
  return [
    ...(base[category] ?? base['marketplace product']),
    `${hookPattern} product ad pacing reference fast cut b roll`,
  ];
};

const higgsPromptsForBlueprint = (listing, reference) => {
  const title = listing.title ?? 'product listing';
  const hookPattern = detectHookPattern(reference);
  return [
    {
      id: 'competitive-01-hero',
      purpose: `Recreate the competitor's ${hookPattern} opening energy with our own product.`,
      prompt: `Vertical high-converting marketplace product ad hero shot for the exact item in the reference photos: ${title}. Fast premium reveal, realistic camera movement, clean commercial lighting, no added accessories, no altered condition, no text baked into the video.`,
      duration_seconds: 5,
      references: ['best actual listing photo'],
    },
    {
      id: 'competitive-02-proof',
      purpose: 'Replace competitor proof closeups with real listing-specific proof.',
      prompt: `Macro detail pass across the actual listed item: ${title}. Show real surfaces, labels, edges, components, and included items only. Product-preserving movement, honest resale condition, no stock-packaging fantasy.`,
      duration_seconds: 5,
      references: ['detail listing photos'],
    },
  ];
};

const ffprobeDuration = (file) => {
  try {
    const raw = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
      {encoding: 'utf8'},
    ).trim();
    return numberValue(raw, 0);
  } catch {
    return 0;
  }
};

const downloadReferenceClip = ({reference, analysisDir, maxSeconds}) => {
  if (!reference?.url) return null;
  if (!commandExists('yt-dlp')) {
    return {error: 'yt-dlp is not installed or not on PATH.'};
  }
  const sourceDir = path.join(analysisDir, 'source');
  ensureDir(sourceDir);
  const outputTemplate = path.join(sourceDir, 'selected-reference.%(ext)s');
  const baseArgs = [
    '--no-playlist',
    '--download-sections',
    `*0-${maxSeconds}`,
    '--force-keyframes-at-cuts',
    '--merge-output-format',
    'mp4',
    '--output',
    outputTemplate,
    '--print',
    'after_move:filepath',
    reference.url,
  ];
  const attempts = [
    ['-f', 'bv*[height<=720]+ba/b[height<=720]/best[height<=720]/best', ...baseArgs],
    baseArgs,
  ];
  for (const attemptArgs of attempts) {
    const result = spawnSync('yt-dlp', attemptArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const downloaded = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1);
    if (result.status === 0 && downloaded && fs.existsSync(downloaded)) {
      return {
        file: path.resolve(downloaded),
        duration_seconds: ffprobeDuration(downloaded),
        source_url: reference.url,
        max_seconds: maxSeconds,
      };
    }
  }
  return {error: `Could not download bounded reference clip from ${reference.url}`};
};

const detectSceneCuts = ({videoPath, durationSeconds, threshold}) => {
  if (!videoPath || !fs.existsSync(videoPath) || !commandExists('ffmpeg')) {
    return [];
  }
  const result = spawnSync('ffmpeg', [
    '-hide_banner',
    '-i',
    videoPath,
    '-vf',
    `select='gt(scene,${threshold})',showinfo`,
    '-f',
    'null',
    '-',
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const cuts = [0];
  for (const match of log.matchAll(/pts_time:([0-9.]+)/g)) {
    const time = Number(match[1]);
    if (
      Number.isFinite(time) &&
      time > 0.35 &&
      time < Math.max(0.5, durationSeconds - 0.25)
    ) {
      cuts.push(Number(time.toFixed(3)));
    }
  }
  const uniqueCuts = unique(cuts.map((time) => String(time))).map(Number).sort((a, b) => a - b);
  if (uniqueCuts.length >= 4) return uniqueCuts;

  const targetSegments = clamp(Math.round(durationSeconds / 3), 5, 10);
  return Array.from({length: targetSegments}, (_, index) =>
    Number(((durationSeconds / targetSegments) * index).toFixed(3)),
  );
};

const extractReferenceFrames = ({videoPath, cuts, durationSeconds, analysisDir}) => {
  const framesDir = path.join(analysisDir, 'frames');
  ensureDir(framesDir);
  if (!videoPath || !fs.existsSync(videoPath) || !commandExists('ffmpeg')) return [];
  return cuts.map((start, index) => {
    const frameTime = clamp(start + 0.2, 0, Math.max(0, durationSeconds - 0.1));
    const framePath = path.join(framesDir, `${String(index + 1).padStart(2, '0')}-${frameTime.toFixed(2)}s.jpg`);
    const result = spawnSync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-ss',
      frameTime.toFixed(3),
      '-i',
      videoPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=480:-1',
      framePath,
    ], {stdio: 'ignore'});
    return result.status === 0 && fs.existsSync(framePath)
      ? {index: index + 1, time_seconds: frameTime, file: framePath}
      : {index: index + 1, time_seconds: frameTime, error: 'frame extraction failed'};
  });
};

const writeContactSheet = ({frames, analysisDir}) => {
  const validFrames = frames.filter((frame) => frame.file && fs.existsSync(frame.file));
  if (validFrames.length === 0) return null;
  const contactSheet = path.join(analysisDir, 'reference-contact-sheet.jpg');
  const script = String.raw`
import math, sys
from pathlib import Path
try:
 from PIL import Image, ImageDraw, ImageFont
except Exception:
 sys.exit(2)
out = Path(sys.argv[1])
files = [Path(p) for p in sys.argv[2:]]
thumb_w, thumb_h = 320, 180
cols = 3
rows = math.ceil(len(files) / cols)
sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + 28)), "white")
draw = ImageDraw.Draw(sheet)
for idx, file in enumerate(files):
 im = Image.open(file).convert("RGB")
 im.thumbnail((thumb_w, thumb_h))
 x = (idx % cols) * thumb_w + (thumb_w - im.width) // 2
 y = (idx // cols) * (thumb_h + 28)
 sheet.paste(im, (x, y))
 draw.text(((idx % cols) * thumb_w + 8, y + thumb_h + 6), f"{idx + 1:02d} {file.stem}", fill=(0,0,0))
sheet.save(out, quality=92)
`;
  const result = spawnSync('python3', ['-c', script, contactSheet, ...validFrames.map((frame) => frame.file)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 && fs.existsSync(contactSheet) ? contactSheet : null;
};

const downloadReferenceSubtitles = ({reference, analysisDir}) => {
  if (!reference?.url || !commandExists('yt-dlp')) return [];
  const subtitlesDir = path.join(analysisDir, 'subtitles');
  ensureDir(subtitlesDir);
  const outputTemplate = path.join(subtitlesDir, 'reference-subtitles.%(ext)s');
  const result = spawnSync('yt-dlp', [
    '--skip-download',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs',
    'en.*',
    '--sub-format',
    'vtt',
    '--output',
    outputTemplate,
    reference.url,
  ], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  if (result.status !== 0) return [];
  const vttFiles = fs.readdirSync(subtitlesDir)
    .filter((name) => /\.vtt$/i.test(name))
    .map((name) => path.join(subtitlesDir, name));
  if (vttFiles.length === 0) return [];
  return parseVttCues(fs.readFileSync(vttFiles[0], 'utf8'));
};

const parseVttTimestamp = (value) => {
  const parts = String(value ?? '').trim().split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(value) || 0;
};

const cleanVttText = (value) =>
  String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const parseVttCues = (text) => {
  const lines = text.split(/\r?\n/);
  const cues = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const timeMatch = line.match(/(?<start>\d\d?:\d\d:\d\d\.\d+|\d\d:\d\d\.\d+)\s+-->\s+(?<end>\d\d?:\d\d:\d\d\.\d+|\d\d:\d\d\.\d+)/);
    if (!timeMatch?.groups) continue;
    const textLines = [];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      textLines.push(lines[index]);
      index += 1;
    }
    const cueText = cleanVttText(textLines.join(' '));
    if (!cueText) continue;
    cues.push({
      start_seconds: Number(parseVttTimestamp(timeMatch.groups.start).toFixed(3)),
      end_seconds: Number(parseVttTimestamp(timeMatch.groups.end).toFixed(3)),
      text: cueText,
    });
  }
  return cues;
};

const transcriptForSegment = (cues, start, end) =>
  cues
    .filter((cue) => cue.end_seconds >= start && cue.start_seconds <= end)
    .map((cue) => cue.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260);

const shotRoleForIndex = (index, total) => {
  if (index === 0) return 'hook';
  if (index === total - 1) return 'cta-close';
  const ratio = index / Math.max(1, total - 1);
  if (ratio <= 0.25) return 'hero-reveal';
  if (ratio < 0.58) return 'proof-detail';
  if (ratio < 0.82) return 'use-case-broll';
  return 'offer-build';
};

const sourceAssetsForShot = ({role, imageFiles, index}) => {
  const imageLabels = imageFiles.map((file, fileIndex) => ({
    label: `image_${fileIndex + 1}`,
    file,
  }));
  if (role === 'use-case-broll') return [{label: 'cleared_story_broll', file: null}];
  if (role === 'proof-detail') return imageLabels.length > 1 ? imageLabels.slice(1, 5) : imageLabels.slice(0, 1);
  if (role === 'cta-close') return imageLabels.slice(0, 2);
  return imageLabels.slice(index % Math.max(1, imageLabels.length), (index % Math.max(1, imageLabels.length)) + 1)
    .concat(imageLabels[0] ? [imageLabels[0]] : [])
    .filter((asset, assetIndex, list) => list.findIndex((candidate) => candidate.label === asset.label) === assetIndex)
    .slice(0, 2);
};

const buildShotReplicaMap = ({segments, cues, listing, listingDir}) => {
  const imageFiles = imageListForListing(listing, listingDir);
  const total = segments.length;
  return segments.map((segment, index) => {
    const role = shotRoleForIndex(index, total);
    const sourceAssets = sourceAssetsForShot({role, imageFiles, index});
    const transcript = transcriptForSegment(cues, segment.start_seconds, segment.end_seconds);
    return {
      shot: index + 1,
      role,
      reference_timing: {
        start_seconds: segment.start_seconds,
        end_seconds: segment.end_seconds,
        duration_seconds: Number((segment.end_seconds - segment.start_seconds).toFixed(3)),
      },
      reference_frame: segment.frame?.file ?? null,
      reference_transcript_excerpt_for_analysis_only: transcript || null,
      copy_structure_not_assets: true,
      original_asset_plan: {
        source_assets: sourceAssets,
        motion: motionForShotRole(role),
        caption_strategy: captionForShotRole(role, listing),
        sound_design: sfxForShotRole(role),
      },
      higgsfield_prompt:
        role === 'use-case-broll'
          ? null
          : `Recreate only the pacing and camera role of reference shot ${index + 1} as an original marketplace ad shot for the exact item shown in our listing photos: ${listing.title ?? 'product'}. Use the listed source assets only. Preserve actual product condition, color, labels, and included items. No competitor footage, no competitor text, no extra accessories.`,
      broll_prompt:
        role === 'use-case-broll'
          ? `${inferCategory(listing)} commercial lifestyle cutaway matching reference shot ${index + 1} energy, cleared b roll only`
          : null,
    };
  });
};

const motionForShotRole = (role) => ({
  hook: '0.3s impact cut, fast push-in, freeze-frame caption pulse',
  'hero-reveal': 'smooth 3D parallax or Higgsfield hero reveal, slight speed ramp',
  'proof-detail': 'macro pan/focus pull across real detail photos',
  'use-case-broll': 'fast 1.0-1.6s cleared B-roll cutaway, no misleading accessories',
  'offer-build': 'return to product with tighter crop and value-proof caption',
  'cta-close': 'stable final product shot, clear CTA, no visual clutter',
}[role] ?? 'fast product-safe cut');

const captionForShotRole = (role, listing) => ({
  hook: `Before you buy: ${truncateWords(listing.title ?? 'this', 46)}`,
  'hero-reveal': 'Actual listing item',
  'proof-detail': 'Real details. Real condition.',
  'use-case-broll': 'Built for the buyer outcome',
  'offer-build': 'Check included items',
  'cta-close': 'View full details on eBay',
}[role] ?? 'Actual listing media');

const truncateWords = (value, maxLength) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength + 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${sliced.slice(0, lastSpace > 16 ? lastSpace : maxLength).trim()}...`;
};

const sfxForShotRole = (role) => ({
  hook: ['impact hit', 'camera shutter'],
  'hero-reveal': ['whoosh riser', 'soft hit'],
  'proof-detail': ['macro ticks', 'subtle click'],
  'use-case-broll': ['speed ramp whoosh'],
  'offer-build': ['light transition'],
  'cta-close': ['soft hit', 'cash register tick'],
}[role] ?? ['soft transition']);

const analyzeSelectedReferenceVideo = ({reference, listing, listingDir, outDir, maxSeconds, sceneThreshold}) => {
  const analysisDir = path.join(outDir, 'reference-video-analysis');
  ensureDir(analysisDir);
  const downloaded = downloadReferenceClip({reference, analysisDir, maxSeconds});
  if (!downloaded?.file) {
    return {
      ok: false,
      reason: downloaded?.error ?? 'Selected reference has no downloadable URL.',
      selected_reference_url: reference?.url ?? null,
    };
  }
  const durationSeconds = clamp(downloaded.duration_seconds || maxSeconds, 1, maxSeconds);
  const cuts = detectSceneCuts({
    videoPath: downloaded.file,
    durationSeconds,
    threshold: sceneThreshold,
  });
  const segmentBoundaries = unique([...cuts, durationSeconds].map((value) => String(Number(value).toFixed(3))))
    .map(Number)
    .sort((a, b) => a - b);
  const boundarySegments = segmentBoundaries.slice(0, -1).map((start, index) => ({
    start_seconds: start,
    end_seconds: segmentBoundaries[index + 1],
  })).filter((segment) => segment.end_seconds > segment.start_seconds);
  const rawSegments = mergeShortSegments(boundarySegments, 0.35);
  const frames = extractReferenceFrames({
    videoPath: downloaded.file,
    cuts: rawSegments.map((segment) => segment.start_seconds),
    durationSeconds,
    analysisDir,
  });
  const contactSheet = writeContactSheet({frames, analysisDir});
  const cues = downloadReferenceSubtitles({reference, analysisDir});
  const segments = rawSegments.map((segment, index) => ({
    ...segment,
    frame: frames[index] ?? null,
  }));
  const shotReplicaMap = buildShotReplicaMap({segments, cues, listing, listingDir});
  const analysis = {
    ok: true,
    created_at: new Date().toISOString(),
    selected_reference: {
      id: reference.id,
      title: reference.title,
      creator: reference.creator,
      platform: reference.platform,
      url: reference.url,
    },
    research_only_notice: 'Reference video is analyzed only to infer timing, scene density, and creative structure. Do not reuse competitor footage/audio/captions in final commercial assets.',
    downloaded_reference_clip: downloaded,
    scene_detection: {
      threshold: sceneThreshold,
      cut_count: Math.max(0, segmentBoundaries.length - 2),
      segment_count: segments.length,
    },
    subtitles: {
      cue_count: cues.length,
      transcript_available: cues.length > 0,
    },
    contact_sheet: contactSheet,
    segments,
    shot_replica_map: shotReplicaMap,
  };
  safeJsonWrite(path.join(analysisDir, 'reference-video-analysis.json'), analysis);
  fs.writeFileSync(path.join(analysisDir, 'shot-replica-map.md'), markdownForShotReplicaMap(analysis, listing));
  return analysis;
};

const mergeShortSegments = (segments, minDurationSeconds) => {
  const merged = [];
  let pending = null;
  for (const segment of segments) {
    const current = pending
      ? {start_seconds: pending.start_seconds, end_seconds: segment.end_seconds}
      : segment;
    const duration = current.end_seconds - current.start_seconds;
    if (duration < minDurationSeconds) {
      if (merged.length > 0) {
        merged[merged.length - 1].end_seconds = current.end_seconds;
        pending = null;
      } else {
        pending = current;
      }
      continue;
    }
    merged.push({
      start_seconds: Number(current.start_seconds.toFixed(3)),
      end_seconds: Number(current.end_seconds.toFixed(3)),
    });
    pending = null;
  }
  if (pending && merged.length > 0) {
    merged[merged.length - 1].end_seconds = Number(pending.end_seconds.toFixed(3));
  } else if (pending) {
    merged.push(pending);
  }
  return merged;
};

const markdownForShotReplicaMap = (analysis, listing) => {
  const lines = [
    `# 1:1 Structure Map: ${listing.title ?? analysis.selected_reference.title}`,
    '',
    `Reference: ${analysis.selected_reference.title}`,
    analysis.selected_reference.url ? `URL: ${analysis.selected_reference.url}` : null,
    '',
    analysis.research_only_notice,
    '',
    analysis.contact_sheet ? `Contact sheet: ${analysis.contact_sheet}` : null,
    '',
    '| Shot | Time | Role | Our Assets | Motion | Caption | SFX |',
    '| ---: | --- | --- | --- | --- | --- | --- |',
    ...analysis.shot_replica_map.map((shot) => [
      `${shot.shot}`,
      `${shot.reference_timing.start_seconds}-${shot.reference_timing.end_seconds}s`,
      shot.role,
      shot.original_asset_plan.source_assets.map((asset) => asset.label).join(', '),
      shot.original_asset_plan.motion,
      shot.original_asset_plan.caption_strategy,
      shot.original_asset_plan.sound_design.join(', '),
    ].join(' | ')).map((row) => `| ${row} |`),
    '',
    '## Guardrail',
    '',
    'This is a structure map only. The final eBay video must be built from our listing photos, generated product-preserving shots, licensed music/SFX, and cleared B-roll.',
    '',
  ].filter((line) => line !== null);
  return `${lines.join('\n')}\n`;
};

const kalodataPromptForListing = (listing) => {
  const title = listing.title ?? 'product';
  const category = inferCategory(listing);
  return [
    `Find TikTok Shop / Kalodata videos selling products similar to: ${title}`,
    '',
    'Return rows with these fields:',
    'Product Title, Product Category, Shop Name, Creator Handle, Video URL, Video Title, Caption, Hook, Duration Seconds, Video Views, Items Sold, Total Revenue, Revenue Growth Rate, Ad Spend Estimate, Regional Ranking, Shot Breakdown, Audio Notes, Hashtags, Posting Date',
    '',
    'Filters:',
    `- Region: United States`,
    `- Category intent: ${category}`,
    '- Prefer videos with measurable revenue, sold units, or growth rate',
    '- Prefer direct product demonstration, creator UGC, comparison, problem-solution, or price-value hooks',
    '- Exclude unrelated accessories, fake giveaways, obvious reposts, and videos with no product match',
    '',
    'Export as CSV or JSON, then run:',
    'npm run ebay:creative-intel -- plan --project-dir "<listing project>" --competitors "<export.csv>"',
    '',
  ].join('\n');
};

const trendReasonForReference = (reference) => {
  const reasons = [];
  if (reference.views) reasons.push(`${Math.round(reference.views).toLocaleString()} views`);
  if (reference.sold) reasons.push(`${Math.round(reference.sold).toLocaleString()} sold`);
  if (reference.revenue) reasons.push(`$${Math.round(reference.revenue).toLocaleString()} revenue`);
  if (reference.growth_rate) reasons.push(`${reference.growth_rate}% growth`);
  if (reference.views_per_day) reasons.push(`${Math.round(reference.views_per_day).toLocaleString()} views/day`);
  if (reference.sold_per_day) reasons.push(`${Number(reference.sold_per_day.toFixed(2)).toLocaleString()} sold/day`);
  if (reference.engagement_rate) reasons.push(`${(reference.engagement_rate * 100).toFixed(1)}% engagement`);
  if (reference.posted_at) reasons.push(`posted ${reference.posted_at.slice(0, 10)}`);
  return reasons.length ? reasons.join(', ') : 'no trend metrics provided';
};

const buildTrendReport = ({listing, references, blueprint}) => {
  const ranked = references
    .map((reference) => ({
      id: reference.id,
      platform: reference.platform,
      creator: reference.creator || null,
      title: reference.title,
      url: reference.url || null,
      fit_score: scoreReferenceForListing(reference, listing),
      trend_score: reference.trend_score,
      hook_pattern: detectHookPattern(reference),
      trend_reason: trendReasonForReference(reference),
      metrics: {
        views: reference.views,
        sold: reference.sold,
        revenue: reference.revenue,
        growth_rate: reference.growth_rate,
        likes: reference.likes,
        comments: reference.comments,
        shares: reference.shares,
        saves: reference.saves,
        engagement_rate: reference.engagement_rate,
        posted_at: reference.posted_at,
        views_per_day: reference.views_per_day,
        sold_per_day: reference.sold_per_day,
        revenue_per_day: reference.revenue_per_day,
      },
    }))
    .sort((a, b) => {
      if (b.fit_score !== a.fit_score) return b.fit_score - a.fit_score;
      return b.trend_score - a.trend_score;
    });
  return {
    item_id: blueprint.listing.item_id,
    title: blueprint.listing.title,
    created_at: new Date().toISOString(),
    selected_reference_id: blueprint.selected_reference.id,
    ranking_policy: 'Product fit is primary; trend metrics break ties and add upside only after product match.',
    references_considered: ranked.length,
    ranked_references: ranked,
  };
};

const markdownForTrendReport = (report) => {
  const rows = report.ranked_references.slice(0, 12).map((reference, index) =>
    [
      index + 1,
      reference.fit_score,
      reference.trend_score,
      reference.platform,
      reference.creator ?? '',
      reference.title || 'unknown',
      reference.hook_pattern,
      reference.trend_reason,
      reference.url ?? '',
    ].map((cell) => String(cell).replace(/\|/g, '/')).join(' | '),
  );
  return [
    `# Competitor Trend Report: ${report.title}`,
    '',
    `Item: ${report.item_id}`,
    `References considered: ${report.references_considered}`,
    '',
    report.ranking_policy,
    '',
    '| Rank | Fit | Trend | Platform | Creator | Reference | Hook Pattern | Trend Evidence | URL |',
    '| ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row} |`),
    '',
    'Guardrail: this report selects structure references only. Do not reuse competitor media, audio, captions, thumbnails, or exact copy in final eBay ads.',
    '',
  ].join('\n');
};

const youtubeDiscoveryQueriesForListing = (listing) => {
  const title = String(listing.title ?? '').toLowerCase();
  const category = inferCategory(listing);
  const modelPatterns = [
    /\bsony\s+a\d{3,4}\b/i,
    /\bdji\s+[a-z0-9 ]{2,24}\b/i,
    /\bsmallrig\s+[a-z0-9 -]{2,24}\b/i,
    /\bkobe\s+bryant\b/i,
    /\bpsa\s+\d+\b/i,
  ];
  const models = modelPatterns
    .map((pattern) => title.match(pattern)?.[0])
    .filter(Boolean)
    .map((model) => model.replace(/\s+/g, ' ').trim());
  const keywords = keywordsFor(title)
    .filter((word) => !/^\d+$/.test(word))
    .slice(0, 5);
  const base = unique([...models, ...keywords]).slice(0, 6).join(' ');
  const primaryModel = models[0] ?? keywords.slice(0, 3).join(' ');
  const querySet = category === 'creator gear'
    ? [
        `${primaryModel || base} camera review`,
        `${primaryModel || base} camera rig`,
        `${primaryModel || base} shorts product ad`,
        `${base || title} creator kit`,
        `${base || title} smallrig setup`,
      ]
    : /\b(rug|carpet|mat)\b/.test(title)
      ? [
          `${base || title} rug room decor`,
          `${base || title} carpet product review`,
          'novelty rug home decor product ad',
          'playing card rug room decor',
          'area rug product video home decor',
        ]
      : /\b(jack|stand|stands|lift)\b/.test(title)
        ? [
            `${base || title} car jack stands`,
            'car jack stands product review',
            'how to use jack stands garage',
            'automotive jack stands safety product',
          ]
    : [
        `${base || title} product review`,
        `${base || title} product ad`,
        `${base || title} tiktok shop`,
        `${base || title} shorts`,
      ];
  return unique(querySet.map((query) => query.replace(/\s+/g, ' ').trim()).filter(Boolean));
};

const discoverYoutubeReferences = (listing, maxResults) => {
  const queries = youtubeDiscoveryQueriesForListing(listing);
  if (queries.length === 0) return [];
  const references = [];
  const seen = new Set();
  const perQuery = Math.max(3, Math.min(8, maxResults));
  for (const query of queries) {
    const target = `ytsearch${perQuery}:${query}`;
    try {
      const output = execFileSync('yt-dlp', [
        '--flat-playlist',
        '--dump-json',
        '--skip-download',
        '--no-playlist',
        '--extractor-args',
        'youtube:player_client=android,web',
        target,
      ], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
      for (const line of output.split(/\r?\n/).filter(Boolean)) {
        const entry = JSON.parse(line);
        const url = entry.webpage_url || entry.url;
        const dedupeKey = url || entry.id || entry.title;
        if (!dedupeKey || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        references.push(normalizeReference({
          title: entry.title,
          url,
          platform: 'youtube',
          creator: entry.uploader || entry.channel,
          views: entry.view_count,
          duration_seconds: entry.duration,
          description: entry.description,
          hook: entry.title,
          discovery_query: query,
        }, 'yt-dlp-search'));
      }
    } catch (error) {
      references.push({
        ...normalizeReference({
          title: `YouTube discovery failed for ${query}`,
          description: String(error.message ?? error),
        }, 'discovery-error'),
        discovery_error: String(error.message ?? error),
      });
    }
  }
  return references.slice(0, maxResults * Math.max(1, queries.length));
};

const listingProjectDirs = () => {
  const dirs = [];
  if (args['project-dir']) dirs.push(path.resolve(String(args['project-dir'])));
  if (args['projects-dir']) {
    const root = path.resolve(String(args['projects-dir']));
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      if (fs.existsSync(path.join(dir, 'listing.json'))) {
        dirs.push(dir);
        return;
      }
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
      }
    };
    walk(root);
  }
  return unique(dirs);
};

const run = () => {
  const dirs = listingProjectDirs();
  if (dirs.length === 0) {
    throw new Error(`Missing --project-dir or --projects-dir.\n${usage}`);
  }
  const projectCollectionMode = Boolean(args['projects-dir']);
  const competitorFile = args.competitors ?? args['kalodata-export'];
  const importedReferences = readCompetitorRows(competitorFile)
    .map((row) => normalizeReference(row, competitorFile ? path.basename(String(competitorFile)) : 'import'));
  const maxReferences = Math.max(1, Math.floor(numberValue(args['max-references'], 5)));
  const maxDiscoverResults = Math.max(1, Math.floor(numberValue(args['max-discover-results'], 8)));
  const analyzeReferenceVideo = Boolean(args['analyze-reference-video']);
  const analysisMaxSeconds = clamp(numberValue(args['analysis-max-seconds'], 30), 5, 90);
  const sceneThreshold = clamp(numberValue(args['analysis-scene-threshold'], 0.25), 0.05, 0.8);
  const runOutDir = args['out-dir']
    ? path.resolve(String(args['out-dir']))
    : dirs.length === 1
      ? path.join(dirs[0], 'competitive-creative')
      : path.join(projectRoot, 'outputs', 'competitive-creative', `run-${timestampSlug()}`);
  ensureDir(runOutDir);

  const manifest = {
    created_at: new Date().toISOString(),
    source_competitor_file: competitorFile ? path.resolve(String(competitorFile)) : null,
    mode: args['discover-youtube'] ? 'import-plus-youtube-discovery' : 'import-or-research-brief',
    listings: [],
  };

  for (const listingDir of dirs) {
    const listing = readJsonFile(path.join(listingDir, 'listing.json'));
    const itemId = String(listing.item_id ?? listing.itemId ?? path.basename(listingDir));
    const outDir = dirs.length === 1 && !projectCollectionMode ? runOutDir : path.join(runOutDir, itemId);
    ensureDir(outDir);
    const discovered = args['discover-youtube']
      ? discoverYoutubeReferences(listing, maxDiscoverResults)
      : [];
    const references = [...importedReferences, ...discovered]
      .filter((reference) => reference.title || reference.caption || reference.transcript || reference.url);
    const blueprint = buildBlueprint({
      listing,
      listingDir,
      references,
      maxReferences,
      forcedDuration: args.duration,
    });
    let referenceAnalysis = null;
    if (analyzeReferenceVideo) {
      const selectedFullReference = blueprint.ranked_references.find((reference) =>
        reference.id === blueprint.selected_reference.id,
      ) ?? references.find((reference) => reference.url === blueprint.selected_reference.url);
      referenceAnalysis = analyzeSelectedReferenceVideo({
        reference: selectedFullReference,
        listing,
        listingDir,
        outDir,
        maxSeconds: analysisMaxSeconds,
        sceneThreshold,
      });
      blueprint.reference_video_analysis = referenceAnalysis?.ok
        ? {
            ok: true,
            analysis_file: path.join(outDir, 'reference-video-analysis', 'reference-video-analysis.json'),
            shot_replica_map_file: path.join(outDir, 'reference-video-analysis', 'shot-replica-map.md'),
            contact_sheet: referenceAnalysis.contact_sheet ?? null,
            segment_count: referenceAnalysis.segments?.length ?? 0,
          }
        : referenceAnalysis;
      if (referenceAnalysis?.ok) {
        blueprint.shot_replica_map = referenceAnalysis.shot_replica_map;
      }
    }

    safeJsonWrite(path.join(outDir, 'competitor-references.normalized.json'), references);
    const trendReport = buildTrendReport({listing, references, blueprint});
    safeJsonWrite(path.join(outDir, 'competitor-trend-report.json'), trendReport);
    fs.writeFileSync(path.join(outDir, 'competitor-trend-report.md'), `${markdownForTrendReport(trendReport)}\n`);
    safeJsonWrite(path.join(outDir, 'creative-blueprint.json'), blueprint);
    fs.writeFileSync(path.join(outDir, 'creative-blueprint.md'), markdownForBlueprint(blueprint, listingDir));
    fs.writeFileSync(path.join(outDir, 'story-broll-prompts.competitive.txt'), `${blueprint.broll_prompts.join('\n')}\n`);
    fs.writeFileSync(path.join(outDir, 'kalodata-automatio-prompt.md'), kalodataPromptForListing(listing));
    safeJsonWrite(path.join(outDir, 'higgsfield-competitive-render-jobs.json'), {
      item_id: itemId,
      title: listing.title,
      created_at: new Date().toISOString(),
      source_blueprint: path.join(outDir, 'creative-blueprint.json'),
      jobs: blueprint.higgsfield_prompts,
    });

    manifest.listings.push({
      item_id: itemId,
      title: listing.title,
      listing_dir: listingDir,
      output_dir: outDir,
      references_considered: references.length,
      selected_reference: blueprint.selected_reference,
      reference_video_analysis: blueprint.reference_video_analysis ?? null,
      blueprint: path.join(outDir, 'creative-blueprint.json'),
    });
  }

  safeJsonWrite(path.join(runOutDir, 'manifest.json'), manifest);
  console.log(`Competitive creative plan: ${path.join(runOutDir, 'manifest.json')}`);
  for (const listing of manifest.listings) {
    console.log(`- ${listing.item_id}: ${listing.output_dir}`);
  }
};

const markdownForBlueprint = (blueprint, listingDir) => {
  const lines = [
    `# Competitive Creative Blueprint: ${blueprint.listing.title}`,
    '',
    `Item: ${blueprint.listing.item_id}`,
    `Listing project: ${listingDir}`,
    `Mode: ${blueprint.compliance_mode}`,
    `Target duration: ${blueprint.target_duration_seconds}s`,
    '',
    '## Selected Reference',
    '',
    `Platform: ${blueprint.selected_reference.platform}`,
    `Creator: ${blueprint.selected_reference.creator ?? 'unknown'}`,
    `Title: ${blueprint.selected_reference.title || 'unknown'}`,
    blueprint.selected_reference.url ? `URL: ${blueprint.selected_reference.url}` : null,
    `Fit score: ${blueprint.selected_reference.fit_score}`,
    `Hook pattern: ${blueprint.selected_reference.hook_pattern}`,
    '',
    blueprint.reference_video_analysis?.ok ? '## Reference Video Analysis' : null,
    blueprint.reference_video_analysis?.ok ? '' : null,
    blueprint.reference_video_analysis?.ok ? `Shot replica map: ${blueprint.reference_video_analysis.shot_replica_map_file}` : null,
    blueprint.reference_video_analysis?.ok && blueprint.reference_video_analysis.contact_sheet ? `Contact sheet: ${blueprint.reference_video_analysis.contact_sheet}` : null,
    blueprint.reference_video_analysis?.ok ? `Segments detected: ${blueprint.reference_video_analysis.segment_count}` : null,
    blueprint.reference_video_analysis?.ok ? '' : null,
    '## Hard Boundary',
    '',
    ...blueprint.product_truth_rules.map((rule) => `- ${rule}`),
    '',
    '## Original Script',
    '',
    `Voice: ${blueprint.original_script.voiceover_style}`,
    '',
    ...blueprint.original_script.lines.map((line, index) => `${index + 1}. ${line}`),
    '',
    '## Beat Map',
    '',
    '| Time | Beat | Competitor Pattern | Our Original Execution | Captions | SFX |',
    '| --- | --- | --- | --- | --- | --- |',
    ...blueprint.beats.map((beat) =>
      `| ${beat.time_seconds.start}-${beat.time_seconds.end}s | ${beat.beat} | ${beat.competitor_pattern} | ${beat.original_execution} | ${beat.caption_intent} | ${beat.sfx.join(', ')} |`,
    ),
    '',
    '## Higgsfield Product-Preserving Prompts',
    '',
    ...blueprint.higgsfield_prompts.flatMap((prompt) => [
      `### ${prompt.id}`,
      '',
      `Purpose: ${prompt.purpose}`,
      '',
      prompt.prompt,
      '',
    ]),
    '## Competitive B-Roll Prompts',
    '',
    ...blueprint.broll_prompts.map((prompt) => `- ${prompt}`),
    '',
    '## Next Commands',
    '',
    '```bash',
    `npm run ebay:cinematic-ads -- find-broll --project-dir "${listingDir}" --energy max`,
    `npm run ebay:cinematic-ads -- assemble --project-dir "${listingDir}" --energy max --include-broll --broll-position interleave`,
    '```',
    '',
  ].filter((line) => line !== null);
  return `${lines.join('\n')}\n`;
};

run();
