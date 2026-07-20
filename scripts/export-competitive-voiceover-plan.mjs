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
  node scripts/export-competitive-voiceover-plan.mjs --blueprints-dir outputs/.../competitive-creative
  npm run ebay:voiceover-plan -- --blueprints-dir outputs/.../competitive-creative

Options:
  --blueprints-dir DIR       Directory to scan recursively for creative-blueprint.json files.
  --out-dir DIR              Default: <blueprints-dir>/competitive-voiceover-plan
  --voice-name NAME          Friendly voice label. Default: jonathan-seller-voice
  --voice-provider NAME      Provider label for the plan. Default: pending-cloned-tts
  --voiceover-filename NAME  Default per project: voiceover.mp3
  --duration N               Target read duration seconds. Default: blueprint target duration or 16.
  --max-words N              Max narration words per listing. Default: 58

Writes per-listing narration scripts and render commands. It does not clone a
voice or call a TTS provider. Use it after the voice clone/provider is connected
or for a manually recorded seller voiceover file.
`;

if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const requireArg = (key) => {
  if (!args[key]) throw new Error(`Missing --${key}.\n${usage}`);
  return String(args[key]);
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const findBlueprints = (root) => {
  const files = [];
  const ignored = new Set(['node_modules', '.git', 'work', 'final', 'story-broll', 'higgsfield-renders']);
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) walk(full);
      } else if (entry.name === 'creative-blueprint.json') {
        files.push(full);
      }
    }
  };
  walk(root);
  return files.sort((a, b) => a.localeCompare(b));
};

const findProjectDir = (blueprintPath, blueprint) => {
  const itemId = blueprint?.listing?.item_id;
  const blueprintDir = path.dirname(blueprintPath);
  const candidates = [
    path.resolve(blueprintDir, '..', '..', 'projects', String(itemId)),
    path.resolve(blueprintDir, '..', 'projects', String(itemId)),
    path.resolve(blueprintDir, '..', '..', '..', 'projects', String(itemId)),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'listing.json'))) ?? blueprintDir;
};

const cleanLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const trimWords = (text, maxWords) => {
  const cleaned = cleanLine(text);
  const sentences = cleaned.split(/(?<=[.!?])\s+/).map(cleanLine).filter(Boolean);
  const kept = [];
  let count = 0;
  for (const sentence of sentences) {
    const sentenceWords = sentence.split(/\s+/).filter(Boolean);
    if (kept.length > 0 && count + sentenceWords.length > maxWords) break;
    kept.push(sentence);
    count += sentenceWords.length;
    if (count >= maxWords) break;
  }
  if (kept.length > 0) return kept.join(' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}.`;
};

const fallbackLines = (listing, durationSeconds) => {
  const title = cleanLine(listing?.title || 'this eBay listing');
  return [
    `Quick look at the actual item: ${title}.`,
    'The photos are the source of truth, so check the details before you buy.',
    'If it fits what you need, open the eBay listing and grab it while it is available.',
    durationSeconds > 18 ? 'I would rather keep this clear and honest than oversell it.' : '',
  ].filter(Boolean);
};

const productUseLine = (title) => {
  const lower = title.toLowerCase();
  if (/\b(dethatcher|scarifier|lawn rake|lawn sweeper)\b/.test(lower)) {
    return 'If your lawn needs a cleaner reset, this is the kind of tool buyers compare fast.';
  }
  if (/\b(ring|moissanite|sterling|silver|jewelry)\b/.test(lower)) {
    return 'If you want a gift-ready piece without guessing from vague photos, this listing keeps the details visible.';
  }
  if (/\b(transmission|atf|fluid pump|refill)\b/.test(lower)) {
    return 'If you are doing transmission service, the adapters and pump details are what matter most.';
  }
  if (/\b(dog crate|kennel|pet cage)\b/.test(lower)) {
    return 'If you need a simple foldable crate setup, check the size and tray details before someone else grabs it.';
  }
  if (/\b(chair|desk|converter|office)\b/.test(lower)) {
    return 'If your setup needs an ergonomic upgrade, the dimensions and fit are the things to confirm first.';
  }
  if (/\b(projector|screen)\b/.test(lower)) {
    return 'If you need a cleaner viewing setup, check the size and mounting details before checkout.';
  }
  if (/\b(cabinet|greenhouse|storage|rack)\b/.test(lower)) {
    return 'If this solves a space or organization problem, compare the dimensions and finish in the listing.';
  }
  if (/\b(tights|clothing|fleece)\b/.test(lower)) {
    return 'If the fit and material are right for you, this is a quick listing to check before it moves.';
  }
  return 'If it fits what you need, the next step is checking the live eBay details before checkout.';
};

const compactTitle = (title, maxWords = 12) => {
  const words = cleanLine(title).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}...`;
};

const sentence = (text) => {
  const cleaned = cleanLine(text);
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
};

const shouldReplaceOriginalScript = (lines) => {
  const joined = lines.join(' ').toLowerCase();
  const genericHits = [
    'exact marketplace product item',
    'not a stock fantasy version',
    'real included items',
    'use the ebay listing for the final details',
  ].filter((needle) => joined.includes(needle)).length;
  return genericHits >= 2;
};

const sellerPitchLines = (blueprint, durationSeconds) => {
  const title = cleanLine(blueprint.listing?.title || 'this eBay listing');
  const category = cleanLine(blueprint.listing?.inferred_category || '').replace(/^marketplace product$/i, '');
  const itemLabel = category ? `${category} item` : 'item';
  const lines = [
    sentence(`Quick look: ${compactTitle(title)}`),
    productUseLine(title),
    `Real eBay listing photos first, so you can judge the actual ${itemLabel} fast.`,
    'Confirm live price, shipping, and condition on eBay before checkout.',
  ];
  if (durationSeconds > 18) {
    lines.push('The goal is a clear decision without pretending the item is something it is not.');
  }
  return lines;
};

const scriptForBlueprint = ({blueprint, durationSeconds, maxWords}) => {
  const originalLines = Array.isArray(blueprint.original_script?.lines)
    ? blueprint.original_script.lines.map(cleanLine).filter(Boolean)
    : [];
  const sourceLines = originalLines.length > 0 && !shouldReplaceOriginalScript(originalLines)
    ? originalLines
    : sellerPitchLines(blueprint, durationSeconds);
  const finalLines = sourceLines.length > 0 ? sourceLines : fallbackLines(blueprint.listing, durationSeconds);
  const text = trimWords(finalLines.join(' '), maxWords);
  const words = text.split(/\s+/).filter(Boolean);
  return {
    style: cleanLine(blueprint.original_script?.voiceover_style)
      || 'avatar-like confident seller voice, energetic but honest',
    lines: text
      .split(/(?<=[.!?])\s+/)
      .map(cleanLine)
      .filter(Boolean),
    text,
    estimated_words: words.length,
    estimated_read_seconds: Math.round((words.length / 2.65) * 10) / 10,
  };
};

const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

const blueprintsDir = path.resolve(requireArg('blueprints-dir'));
if (!fs.existsSync(blueprintsDir) || !fs.statSync(blueprintsDir).isDirectory()) {
  throw new Error(`Blueprints directory not found: ${blueprintsDir}`);
}

const outDir = path.resolve(String(args['out-dir'] ?? path.join(blueprintsDir, 'competitive-voiceover-plan')));
const voiceName = String(args['voice-name'] ?? 'jonathan-seller-voice');
const voiceProvider = String(args['voice-provider'] ?? 'pending-cloned-tts');
const voiceoverFilename = String(args['voiceover-filename'] ?? 'voiceover.mp3');
const maxWords = Math.max(20, Math.floor(Number(args['max-words'] ?? 58)));
ensureDir(outDir);

const entries = [];
for (const blueprintPath of findBlueprints(blueprintsDir)) {
  const blueprint = readJson(blueprintPath);
  const itemId = String(blueprint.listing?.item_id ?? path.basename(path.dirname(blueprintPath)));
  const title = cleanLine(blueprint.listing?.title ?? itemId);
  const durationSeconds = Number(args.duration ?? blueprint.target_duration_seconds ?? 16);
  const projectDir = findProjectDir(blueprintPath, blueprint);
  const voiceDir = path.join(projectDir, 'voiceover');
  ensureDir(voiceDir);
  const voiceoverPath = path.join(voiceDir, voiceoverFilename);
  const script = scriptForBlueprint({blueprint, durationSeconds, maxWords});
  const slug = slugify(`${itemId}-${title}`);
  const packetDir = path.join(outDir, slug);
  ensureDir(packetDir);

  const ttsPrompt = [
    `Voice: ${voiceName}`,
    `Provider: ${voiceProvider}`,
    'Delivery: confident seller voice, fast but clear, trustworthy, no hypey radio-announcer tone.',
    'Do not add disclaimers, music, sound effects, breaths, or extra words.',
    `Target duration: ${durationSeconds}s max.`,
    '',
    script.text,
    '',
  ].join('\n');
  const renderCommand = [
    'npm run ebay:render-blueprint-ad --',
    '--blueprint', shellQuote(blueprintPath),
    '--voiceover', shellQuote(voiceoverPath),
    '--voiceover-volume', '1',
  ].join(' ');

  const entry = {
    item_id: itemId,
    title,
    blueprint: blueprintPath,
    project_dir: projectDir,
    voice_name: voiceName,
    voice_provider: voiceProvider,
    voiceover_target_path: voiceoverPath,
    script,
    tts_prompt_file: path.join(packetDir, 'tts-prompt.txt'),
    script_file: path.join(packetDir, 'voiceover-script.txt'),
    render_command: renderCommand,
  };
  fs.writeFileSync(entry.tts_prompt_file, ttsPrompt);
  fs.writeFileSync(entry.script_file, `${script.lines.join('\n')}\n`);
  fs.writeFileSync(path.join(packetDir, 'voiceover-entry.json'), `${JSON.stringify(entry, null, 2)}\n`);
  entries.push(entry);
}

const manifest = {
  created_at: new Date().toISOString(),
  script: scriptName,
  blueprints_dir: blueprintsDir,
  out_dir: outDir,
  voice_name: voiceName,
  voice_provider: voiceProvider,
  listing_count: entries.length,
  entries,
  next_steps: [
    'Generate each voiceover_target_path with the cloned seller voice using the corresponding tts_prompt_file.',
    'Run each render_command to mix the voiceover into the product-safe preview.',
    'Run QA before attaching any video to eBay.',
  ],
};
const manifestPath = path.join(outDir, `competitive-voiceover-plan-${timestampSlug()}.json`);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'render-voiceover-previews.sh'), `${[
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  ...entries.map((entry) => entry.render_command),
  '',
].join('\n')}`);
fs.chmodSync(path.join(outDir, 'render-voiceover-previews.sh'), 0o755);

console.log(`Competitive voiceover plan: ${manifestPath}`);
console.log(`Listings: ${entries.length}`);
console.log(`Runbook: ${path.join(outDir, 'render-voiceover-previews.sh')}`);
