#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs, projectRoot} from './lib.mjs';
import {slugify, timestampSlug} from './clipkit-lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/optimize-ebay-traffic-report.mjs --traffic-report /path/to/eBay-ListingsTrafficReport.csv
  npm run ebay:traffic-optimize -- --traffic-report /path/to/eBay-ListingsTrafficReport.csv --max-listings 12

Options:
  --traffic-report FILE      eBay Listings Traffic Report CSV.
  --out-dir DIR              Default: outputs/ebay-traffic-optimization/run-YYYY-MM-DD-HHMMSS
  --max-listings N           Top listings to put in the immediate action queue. Default: 15
  --min-impressions N        Minimum impressions for immediate queue. Default: 50
  --dropship-only            Only include likely supplier/dropship listings.
  --dropship-min-quantity N  Quantity threshold for dropship-only. Default: 2
  --dropship-start-date DATE Include newer supplier-style listings from this date. Default: disabled unless passed.

Turns eBay traffic CSV rows into an optimization worklist: main-image/title
CTR fixes, conversion-trust fixes, promotion review, and competitive-video
priorities. It does not change live eBay listings or prices.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const requireArg = (key) => {
  if (!args[key]) throw new Error(`Missing --${key}.\n${usage}`);
  return String(args[key]);
};

const csvCell = (value) => {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
};

const parseCsvLine = (line) => {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
};

const clean = (value) => {
  let text = String(value ?? '').trim();
  if (text.startsWith('="') && text.endsWith('"')) text = text.slice(2, -1);
  if (/^=\d+$/.test(text)) text = text.slice(1);
  return text;
};

const numberValue = (value) => {
  const text = clean(value).replaceAll(',', '').replaceAll('$', '');
  if (!text || text === '-') return 0;
  const normalized = text.endsWith('%') ? text.slice(0, -1) : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
};

const percentValue = (value) => {
  const text = clean(value);
  if (!text || text === '-') return 0;
  const number = numberValue(text);
  return text.endsWith('%') ? number / 100 : number;
};

const readTrafficReport = (file) => {
  const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith('Listing title,'));
  if (headerIndex < 0) throw new Error(`Could not find Listing title header in ${file}`);
  const headers = parseCsvLine(lines[headerIndex]).map(clean);
  return lines.slice(headerIndex + 1)
    .filter((line) => line.trim())
    .map((line) => {
      const cells = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, clean(cells[index])]));
    })
    .filter((row) => row['Listing title']);
};

const metricRow = (row) => {
  const itemId = clean(row['eBay item ID']);
  const impressions = numberValue(row['Total impressions']);
  const views = numberValue(row['Total page views']);
  const sold = numberValue(row['Quantity sold']);
  const ctr = percentValue(row['Click-through rate = Page views from eBay site/Total impressions']);
  const conversion = percentValue(row['Sales conversion rate = Quantity sold/Total page views']);
  const promoted = clean(row['Current promoted listings status']);
  const top20 = percentValue(row['% Top 20 Search Impressions']);
  const searchImpressions = numberValue(row['Total Search Impressions']);
  const promotedImpressions = numberValue(row['Total Promoted Listings impressions (applies to eBay site only)']);
  const organicImpressions = numberValue(row['Total organic impressions on eBay site']);
  const startDate = clean(row['Item Start Date']);
  const quantityAvailable = numberValue(row['Quantity available']);
  const issueTags = [];
  const actions = [];

  if (sold === 0) issueTags.push('no_sales');
  if (impressions >= 500 && ctr < 0.005) {
    issueTags.push('ctr_crisis');
    actions.push('Replace main image with a cleaner high-contrast staged hero and rewrite title for exact buyer query.');
  }
  if (impressions >= 75 && ctr > 0 && ctr < 0.01) {
    issueTags.push('weak_ctr');
    actions.push('Improve first photo, title tokens, and item specifics; current search exposure is not earning enough clicks.');
  }
  if (impressions >= 100 && views === 0) {
    issueTags.push('zero_clicks');
    actions.push('Fix thumbnail/title mismatch before spending on video; current listing is being seen but ignored.');
  }
  if (views >= 25 && sold === 0) {
    issueTags.push('conversion_crisis');
    actions.push('Add trust media: detail photos, condition proof, included-items proof, and a short competitive-structure video.');
  }
  if (views >= 5 && sold === 0 && ctr >= 0.01) {
    issueTags.push('offer_trust_gap');
    actions.push('Keep price unless margin review says otherwise; improve description proof, shipping clarity, and buyer-confidence close.');
  }
  if (promoted.toLowerCase() !== 'promoted' && impressions >= 75) {
    issueTags.push('promotion_gap');
    actions.push('Review margin for low-rate promoted listing coverage; do not promote if fees erase profit.');
  }
  if (top20 < 0.2 && searchImpressions >= 75) {
    issueTags.push('search_rank_gap');
    actions.push('Improve item specifics and title tokens for search rank.');
  }
  if (views >= 1 || impressions >= 75) {
    issueTags.push('video_candidate');
    actions.push('Run competitor-video blueprint workflow and prioritize product-truth clips over slideshow ads.');
  }

  let priorityScore = 0;
  priorityScore += Math.min(45, impressions / 400);
  priorityScore += Math.min(35, views / 10);
  if (sold === 0) priorityScore += 20;
  if (impressions >= 500 && ctr < 0.005) priorityScore += 25;
  if (impressions >= 75 && ctr > 0 && ctr < 0.01) priorityScore += 18;
  if (impressions >= 100 && views === 0) priorityScore += 30;
  if (views >= 25 && sold === 0) priorityScore += 25;
  if (promoted.toLowerCase() !== 'promoted' && impressions >= 75) priorityScore += 12;
  if (top20 < 0.2 && searchImpressions >= 75) priorityScore += 10;

  let primaryAction = 'monitor';
  if (issueTags.includes('conversion_crisis')) primaryAction = 'conversion_trust_video';
  else if (issueTags.includes('ctr_crisis')) primaryAction = 'main_image_title';
  else if (issueTags.includes('weak_ctr')) primaryAction = 'main_image_title';
  else if (issueTags.includes('zero_clicks')) primaryAction = 'main_image_title';
  else if (issueTags.includes('offer_trust_gap')) primaryAction = 'description_media_trust';
  else if (issueTags.includes('promotion_gap')) primaryAction = 'promotion_review';

  return {
    item_id: itemId,
    title: clean(row['Listing title']),
    url: itemId ? `https://www.ebay.com/itm/${itemId}` : '',
    start_date: startDate,
    category: clean(row.Category),
    promoted_status: promoted,
    quantity_available: quantityAvailable,
    impressions,
    views,
    ctr,
    sold,
    conversion,
    top20_search_impression_rate: top20,
    search_impressions: searchImpressions,
    promoted_impressions: promotedImpressions,
    organic_impressions: organicImpressions,
    issue_tags: issueTags,
    primary_action: primaryAction,
    action_notes: [...new Set(actions)],
    priority_score: Math.round(priorityScore * 10) / 10,
  };
};

const trafficReport = path.resolve(requireArg('traffic-report'));
if (!fs.existsSync(trafficReport)) throw new Error(`Traffic report not found: ${trafficReport}`);
const outDir = path.resolve(String(args['out-dir'] ?? path.join(projectRoot, 'outputs', 'ebay-traffic-optimization', `run-${timestampSlug()}`)));
const maxListings = Math.max(1, Math.floor(numberValue(args['max-listings'] ?? 15)));
const minImpressions = Math.max(0, numberValue(args['min-impressions'] ?? 50));
const dropshipOnly = args['dropship-only'] === true;
const dropshipMinQuantity = Math.max(1, Math.floor(numberValue(args['dropship-min-quantity'] ?? 2)));
const dropshipStartDate = args['dropship-start-date'] ? String(args['dropship-start-date']) : null;
ensureDir(outDir);

const allRows = readTrafficReport(trafficReport).map(metricRow);
const rows = allRows.filter((row) => {
  if (!dropshipOnly) return true;
  if (row.quantity_available >= dropshipMinQuantity) return true;
  return Boolean(dropshipStartDate && row.start_date >= dropshipStartDate);
}).map((row) => {
  if (!dropshipOnly || row.primary_action !== 'monitor' || row.sold > 0 || row.impressions < minImpressions) return row;
  const primaryAction = row.views <= 1 || row.ctr < 0.015 ? 'main_image_title' : 'description_media_trust';
  return {
    ...row,
    primary_action: primaryAction,
    issue_tags: [...new Set([...row.issue_tags, 'dropship_active_optimization'])],
    action_notes: [
      ...row.action_notes,
      primaryAction === 'main_image_title'
        ? 'Supplier listing has enough exposure to act: refresh main image/title even without a classic CTR crisis.'
        : 'Supplier listing has clicks without sales: add proof media, shipping clarity, and buyer-confidence copy.',
    ],
    priority_score: Math.round((row.priority_score + 10) * 10) / 10,
  };
});
const immediate = rows
  .filter((row) => row.impressions >= minImpressions)
  .filter((row) => row.issue_tags.includes('no_sales'))
  .sort((a, b) => b.priority_score - a.priority_score || b.views - a.views || b.impressions - a.impressions)
  .slice(0, maxListings);

const summary = {
  listing_count: rows.length,
  all_listing_count: allRows.length,
  filter: {
    dropship_only: dropshipOnly,
    dropship_min_quantity: dropshipOnly ? dropshipMinQuantity : null,
    dropship_start_date: dropshipOnly ? dropshipStartDate : null,
  },
  total_impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
  total_views: rows.reduce((sum, row) => sum + row.views, 0),
  total_sold: rows.reduce((sum, row) => sum + row.sold, 0),
  overall_ctr: rows.reduce((sum, row) => sum + row.views, 0) / Math.max(1, rows.reduce((sum, row) => sum + row.impressions, 0)),
  promoted_count: rows.filter((row) => row.promoted_status.toLowerCase() === 'promoted').length,
  non_promoted_count: rows.filter((row) => row.promoted_status.toLowerCase() !== 'promoted').length,
  ctr_crisis_count: rows.filter((row) => row.issue_tags.includes('ctr_crisis')).length,
  conversion_crisis_count: rows.filter((row) => row.issue_tags.includes('conversion_crisis')).length,
  zero_click_over_100_impressions_count: rows.filter((row) => row.issue_tags.includes('zero_clicks')).length,
  immediate_queue_count: immediate.length,
};

const dashboardSnapshot = {
  summary: {
    source: trafficReport,
    generated_by: scriptName,
    active_listing_count: rows.length,
    total_impressions: summary.total_impressions,
    total_page_views: summary.total_views,
    total_sold: summary.total_sold,
    overall_ctr: summary.overall_ctr,
  },
  listings: immediate.map((row) => ({
    ok: true,
    item_id: row.item_id,
    title: row.title,
    url: row.url,
    current_price: 0,
    price: {value: 0, currency: 'USD'},
    asset_score: row.primary_action === 'main_image_title' ? 35 : 50,
    picture_count: 0,
    video_count: row.issue_tags.includes('video_candidate') ? 0 : 1,
    bid_count: 0,
    watch_count: 0,
    traffic: {
      impressions: row.impressions,
      page_views: row.views,
      ctr: row.ctr,
      quantity_sold: row.sold,
      conversion_rate: row.conversion,
    },
  })),
};

const jsonPath = path.join(outDir, 'traffic-optimization-worklist.json');
const csvPath = path.join(outDir, 'traffic-optimization-worklist.csv');
const markdownPath = path.join(outDir, 'traffic-optimization-worklist.md');
const dashboardPath = path.join(outDir, 'traffic-dashboard-snapshot.json');
const itemIdsPath = path.join(outDir, 'selected-item-ids.txt');

fs.writeFileSync(jsonPath, `${JSON.stringify({created_at: new Date().toISOString(), source: trafficReport, summary, immediate, rows}, null, 2)}\n`);
fs.writeFileSync(dashboardPath, `${JSON.stringify(dashboardSnapshot, null, 2)}\n`);
fs.writeFileSync(itemIdsPath, `${immediate.map((row) => row.item_id).join(',')}\n`);

const csvHeaders = [
  'Priority',
  'Item ID',
  'Title',
  'Primary Action',
  'Issue Tags',
  'Impressions',
  'Views',
  'CTR',
  'Sold',
  'Promoted',
  'Top 20 Search %',
  'URL',
  'Action Notes',
];
fs.writeFileSync(csvPath, `${[
  csvHeaders.join(','),
  ...immediate.map((row, index) => [
    index + 1,
    row.item_id,
    row.title,
    row.primary_action,
    row.issue_tags.join('; '),
    row.impressions,
    row.views,
    `${(row.ctr * 100).toFixed(2)}%`,
    row.sold,
    row.promoted_status,
    `${(row.top20_search_impression_rate * 100).toFixed(1)}%`,
    row.url,
    row.action_notes.join(' '),
  ].map(csvCell).join(',')),
].join('\n')}\n`);

const formatPct = (value) => `${(value * 100).toFixed(2)}%`;
fs.writeFileSync(markdownPath, `${[
  '# eBay Traffic Optimization Worklist',
  '',
  `Source: ${trafficReport}`,
  `Listings: ${summary.listing_count}`,
  `Impressions: ${summary.total_impressions.toLocaleString()}`,
  `Page views: ${summary.total_views.toLocaleString()}`,
  `Sold: ${summary.total_sold.toLocaleString()}`,
  `Overall CTR: ${formatPct(summary.overall_ctr)}`,
  `Promoted / non-promoted: ${summary.promoted_count} / ${summary.non_promoted_count}`,
  '',
  '## Immediate Queue',
  '',
  '| # | Item | Action | Impressions | Views | CTR | Why |',
  '| ---: | --- | --- | ---: | ---: | ---: | --- |',
  ...immediate.map((row, index) => `| ${index + 1} | [${row.item_id}](${row.url}) ${row.title.replaceAll('|', '/')} | ${row.primary_action} | ${row.impressions.toLocaleString()} | ${row.views.toLocaleString()} | ${formatPct(row.ctr)} | ${row.issue_tags.join(', ')} |`),
  '',
  '## Execution Rules',
  '',
  '- Do not reprice from traffic data alone.',
  '- CTR crisis means fix main image and title before buying more ads.',
  '- Conversion crisis means the listing got attention; add proof media, condition/included-item clarity, and a short competitive-structure video.',
  '- Promotion gap means review margin first, then add low-rate promoted coverage only if profit survives fees.',
  '- Feed `traffic-dashboard-snapshot.json` into `ebay:cinematic-ads --dashboard-file` when live eBay dashboard calls are blocked.',
  '',
  '## Next Commands',
  '',
  '```bash',
  `npm run ebay:cinematic-ads -- competitive-plan --dashboard-file "${dashboardPath}" --only-item-ids "$(cat "${itemIdsPath}")" --min-price 0 --max-listings ${Math.min(5, immediate.length)} --credit-budget 40 --credits-per-shot 10 --max-higgs-shots 4 --run-control-loop --control-loop-dry-run --run-higgsfield-renders --higgs-render-dry-run --higgs-render-skip-cost`,
  '```',
  '',
].join('\n')}\n`);

console.log(`Traffic optimization worklist: ${jsonPath}`);
console.log(`Immediate queue CSV: ${csvPath}`);
console.log(`Markdown brief: ${markdownPath}`);
console.log(`Dashboard snapshot: ${dashboardPath}`);
console.log(`Immediate listings: ${immediate.length}`);
console.log(`Top item IDs: ${immediate.map((row) => row.item_id).join(',')}`);
