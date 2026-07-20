#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureDir, parseArgs} from './lib.mjs';

const scriptName = path.basename(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const usage = `
Usage:
  node scripts/export-competitive-research-queue.mjs --packets-manifest outputs/.../competitive-creative-packets-manifest.json
  npm run ebay:competitive-research-queue -- --status outputs/.../competitive-video-pipeline-status.json

Options:
  --packets-manifest FILE  Manifest from ebay:competitive-packets.
  --status FILE            Pipeline status JSON; infers sibling competitive-creative-packets manifest.
  --out-dir DIR            Default: sibling competitive-research-queue.
  --credit-budget N        Included in generated rerun commands. Default: 45.
  --max-jobs-per-listing N Included in generated rerun commands. Default: 1.

Builds one consolidated Automatio/Kalodata research queue from every held
creative packet. Use this when several listings are research_review_required.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const csvCell = (value) => {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
};

const requireManifest = () => {
  if (args['packets-manifest']) return path.resolve(String(args['packets-manifest']));
  if (args.status) {
    const statusPath = path.resolve(String(args.status));
    return path.join(path.dirname(statusPath), 'competitive-creative-packets', 'competitive-creative-packets-manifest.json');
  }
  throw new Error(`Missing --packets-manifest or --status.\n${usage}`);
};

const shellQuote = (value) => {
  const text = String(value);
  return text.includes(' ') ? `"${text.replaceAll('"', '\\"')}"` : text;
};

const packetsManifestPath = requireManifest();
if (!fs.existsSync(packetsManifestPath)) {
  throw new Error(`Creative packets manifest not found: ${packetsManifestPath}. Run ebay:competitive-packets first.`);
}
const packetsManifest = readJson(packetsManifestPath);
const outDir = path.resolve(String(args['out-dir'] ?? path.join(path.dirname(packetsManifestPath), '..', 'competitive-research-queue')));
ensureDir(outDir);

const creditBudget = String(args['credit-budget'] ?? 45);
const maxJobsPerListing = String(args['max-jobs-per-listing'] ?? 1);
const queueRows = [];
const listings = [];

for (const packetSummary of packetsManifest.packets ?? []) {
  const packetJson = packetSummary.packet_json;
  const researchBriefJson = packetSummary.research_brief
    ? path.join(path.dirname(packetSummary.research_brief), 'research-brief.json')
    : null;
  if (!packetJson || !fs.existsSync(packetJson) || !researchBriefJson || !fs.existsSync(researchBriefJson)) {
    continue;
  }
  const packet = readJson(packetJson);
  const research = readJson(researchBriefJson);
  if (packet.status !== 'research_review_required' && research.status !== 'research_review_required') {
    continue;
  }
  const packetDir = packetSummary.packet_dir ?? path.dirname(packetJson);
  const importTemplate = research.competitor_import_template ?? path.join(packetDir, 'research', 'competitor-import-template.csv');
  const rerunCommand = [
    'npm run ebay:competitive-research-rerun --',
    '--packet-dir',
    shellQuote(packetDir),
    '--competitors',
    shellQuote(importTemplate),
    '--credit-budget',
    creditBudget,
    '--max-jobs-per-listing',
    maxJobsPerListing,
  ].join(' ');
  const listing = {
    item_id: String(research.item_id ?? packet.item_id),
    title: research.title ?? packet.title,
    status: research.status ?? packet.status,
    issues: research.issues ?? packet.blockers ?? [],
    packet_dir: packetDir,
    packet_json: packetJson,
    research_brief: packetSummary.research_brief,
    competitor_import_template: importTemplate,
    required_columns: research.required_columns ?? [],
    rerun_command: rerunCommand,
    search_queries: research.search_queries ?? [],
  };
  listings.push(listing);
  for (const [index, query] of listing.search_queries.entries()) {
    queueRows.push({
      item_id: listing.item_id,
      title: listing.title,
      status: listing.status,
      issue_summary: listing.issues.join('; '),
      query_index: index + 1,
      search_query: query,
      required_columns: listing.required_columns.join(', '),
      packet_dir: listing.packet_dir,
      research_brief: listing.research_brief,
      competitor_import_template: listing.competitor_import_template,
      rerun_command: listing.rerun_command,
    });
  }
}

const jsonPath = path.join(outDir, 'competitive-research-queue.json');
const csvPath = path.join(outDir, 'automatio-search-queue.csv');
const markdownPath = path.join(outDir, 'competitive-research-queue.md');
const csvHeaders = [
  'Item ID',
  'Title',
  'Status',
  'Issue Summary',
  'Query #',
  'Search Query',
  'Required Export Columns',
  'Packet Dir',
  'Research Brief',
  'Competitor Import Template',
  'Rerun Command',
];

writeJson(jsonPath, {
  created_at: new Date().toISOString(),
  script: scriptName,
  source_packets_manifest: packetsManifestPath,
  out_dir: outDir,
  listing_count: listings.length,
  query_count: queueRows.length,
  listings,
  rows: queueRows,
});

fs.writeFileSync(csvPath, `${[
  csvHeaders.join(','),
  ...queueRows.map((row) => [
    row.item_id,
    row.title,
    row.status,
    row.issue_summary,
    row.query_index,
    row.search_query,
    row.required_columns,
    row.packet_dir,
    row.research_brief,
    row.competitor_import_template,
    row.rerun_command,
  ].map(csvCell).join(',')),
].join('\n')}\n`);

fs.writeFileSync(markdownPath, `${[
  '# Competitive Research Queue',
  '',
  `Source packets: ${packetsManifestPath}`,
  `Listings needing research: ${listings.length}`,
  `Search rows: ${queueRows.length}`,
  '',
  '## How To Use',
  '',
  '1. Open `automatio-search-queue.csv`.',
  '2. For each listing, use the search queries in Automatio/Kalodata.',
  '3. Export rows with the required columns into that listing\'s `Competitor Import Template` path.',
  '4. Run the listed rerun command to rebuild the blueprint and premium queue.',
  '',
  '## Listings',
  '',
  ...listings.flatMap((listing) => [
    `### ${listing.item_id} - ${listing.title}`,
    '',
    `Status: ${listing.status}`,
    listing.issues.length ? `Issues: ${listing.issues.join('; ')}` : 'Issues: none listed',
    `Research brief: ${listing.research_brief}`,
    `Competitor import template: ${listing.competitor_import_template}`,
    '',
    'Search queries:',
    ...listing.search_queries.map((query) => `- ${query}`),
    '',
    'Rerun:',
    '',
    '```bash',
    listing.rerun_command,
    '```',
    '',
  ]),
].join('\n')}\n`);

console.log(`Competitive research queue: ${jsonPath}`);
console.log(`Automatio queue CSV: ${csvPath}`);
console.log(`Listings needing research: ${listings.length}`);
console.log(`Search rows: ${queueRows.length}`);
