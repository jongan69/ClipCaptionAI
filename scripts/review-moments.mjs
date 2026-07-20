#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  buildViralScorecard,
  slugify,
} from './clipkit-lib.mjs';
import {
  ensureDir,
  parseArgs,
  outputsRoot,
} from './lib.mjs';

const usage = `
Usage:
  npm run moments:review -- [options]

Options:
  --run DIR               Review one run folder. Default: latest outputs/run-*
  --selection FILE        Review one specific selection.json file.
  --video-slug TEXT       Filter to one video folder slug or title fragment.
  --top N                 Limit the number of clips shown. Default: all
  --format TYPE           text, markdown, or json. Default: text
  --out FILE              Write the report to this file.
  --write                 Write the report to the run folder (viral-scorecards.md/json).
  --persist               Write viralScorecard blocks back into selection.json files.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(usage);
  process.exit(0);
}

const formatSeconds = (value) => {
  const total = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(total / 60);
  const seconds = (total % 60).toFixed(1).padStart(4, '0');
  return `${String(minutes).padStart(2, '0')}:${seconds}`;
};

const latestRunDir = () => {
  if (!fs.existsSync(outputsRoot)) {
    return null;
  }

  const candidates = fs
    .readdirSync(outputsRoot, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && /^run-\d{4}-\d{2}-\d{2}-\d{6}/.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(outputsRoot, entry.name),
    }))
    .sort((a, b) => b.name.localeCompare(a.name));

  return candidates[0]?.fullPath ?? null;
};

const resolveRunDir = () => {
  if (args.selection) {
    return path.dirname(path.dirname(path.dirname(path.resolve(String(args.selection)))));
  }
  if (args.run) {
    return path.resolve(String(args.run));
  }
  const latest = latestRunDir();
  if (!latest) {
    throw new Error('No outputs/run-* folders found. Pass --run explicitly.');
  }
  return latest;
};

const selectionPathsForRun = (runDir) => {
  const captionedClipsDir = path.join(runDir, 'captioned-clips');
  if (!fs.existsSync(captionedClipsDir)) {
    throw new Error(`No captioned-clips folder found in ${runDir}`);
  }

  return fs
    .readdirSync(captionedClipsDir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(captionedClipsDir, entry.name, 'selection.json'))
    .filter((selectionPath) => fs.existsSync(selectionPath))
    .sort((a, b) => a.localeCompare(b));
};

const selectedPaths = (() => {
  if (args.selection) {
    const selectionPath = path.resolve(String(args.selection));
    if (!fs.existsSync(selectionPath)) {
      throw new Error(`selection.json not found: ${selectionPath}`);
    }
    return [selectionPath];
  }

  const runDir = resolveRunDir();
  const paths = selectionPathsForRun(runDir);
  const filter = String(args['video-slug'] ?? '').trim().toLowerCase();
  if (!filter) {
    return paths;
  }
  return paths.filter((selectionPath) =>
    path.basename(path.dirname(selectionPath)).toLowerCase().includes(filter),
  );
})();

const runDir = resolveRunDir();

if (selectedPaths.length === 0) {
  throw new Error('No matching selection.json files found for this review.');
}

const persist = Boolean(args.persist);
const reportItems = [];

for (const selectionPath of selectedPaths) {
  const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
  const videoSlug = path.basename(path.dirname(selectionPath));
  let touched = false;

  for (const [index, clip] of (selection.clips ?? []).entries()) {
    const scorecard = buildViralScorecard(clip);
    if (persist || !clip.viralScorecard) {
      clip.viralScorecard = scorecard;
      touched = true;
    }

    reportItems.push({
      runDir,
      selectionPath,
      videoSlug,
      sourceProfile: selection.sourceProfile ?? clip.sourceProfile ?? null,
      transcriptSource: selection.transcriptSource ?? null,
      clipNumber: index + 1,
      clipSlug: `${String(index + 1).padStart(2, '0')}-${slugify(clip.title, 'clip')}`,
      title: clip.title,
      overallScore: scorecard.overall,
      startSeconds: Number(clip.selectedStartSeconds ?? clip.startSeconds ?? 0),
      endSeconds: Number(clip.selectedEndSeconds ?? clip.endSeconds ?? 0),
      durationSeconds: Math.max(
        0,
        Number(clip.selectedEndSeconds ?? clip.endSeconds ?? 0) -
          Number(clip.selectedStartSeconds ?? clip.startSeconds ?? 0),
      ),
      hook: clip.hook ?? '',
      reason: clip.reason ?? '',
      highlightWords: Array.isArray(clip.highlightWords) ? clip.highlightWords : [],
      thoughtBoundaryAdjusted: Boolean(clip.thoughtBoundaryAdjusted),
      viralScorecard: scorecard,
      rawClipPath: clip.momentExportPath ?? clip.exportedPath ?? null,
    });
  }

  if (touched) {
    fs.writeFileSync(selectionPath, `${JSON.stringify(selection, null, 2)}\n`);
  }
}

reportItems.sort((a, b) => b.overallScore - a.overallScore || a.videoSlug.localeCompare(b.videoSlug));

const topLimit = Number(args.top ?? 0);
const limitedItems =
  Number.isFinite(topLimit) && topLimit > 0 ? reportItems.slice(0, topLimit) : reportItems;

const format = String(args.format ?? 'text').toLowerCase();

const buildTextReport = () => {
  const lines = [
    'ClipCaptionAI Viral Scorecards',
    `Run: ${runDir}`,
    `Generated: ${new Date().toISOString()}`,
    '',
  ];

  for (const item of limitedItems) {
    lines.push(
      `[${item.overallScore}/100] ${item.videoSlug} :: ${formatSeconds(item.startSeconds)}-${formatSeconds(item.endSeconds)} :: ${item.title}`,
    );
    lines.push(
      `  Why: ${item.viralScorecard.strongestSignals.join(', ')}`,
    );
    lines.push(
      `  Breakdown: hook ${item.viralScorecard.hookStrength} | emotion ${item.viralScorecard.emotionalIntensity} | practical ${item.viralScorecard.practicalValue} | identity ${item.viralScorecard.identityResonance} | visual ${item.viralScorecard.visualPayoff} | complete ${item.viralScorecard.thoughtCompleteness}`,
    );
    if (item.reason) {
      lines.push(`  Reason: ${item.reason}`);
    }
    if (item.hook) {
      lines.push(`  Hook: ${item.hook}`);
    }
    if (item.highlightWords.length > 0) {
      lines.push(`  Highlight words: ${item.highlightWords.join(', ')}`);
    }
    lines.push(`  Selection: ${item.selectionPath}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
};

const buildMarkdownReport = () => {
  const lines = [
    '# ClipCaptionAI Viral Scorecards',
    '',
    `- Run: \`${runDir}\``,
    `- Generated: \`${new Date().toISOString()}\``,
    '',
    '| Score | Video | Window | Title | Strongest signals |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const item of limitedItems) {
    lines.push(
      `| ${item.overallScore}/100 | \`${item.videoSlug}\` | \`${formatSeconds(item.startSeconds)}-${formatSeconds(item.endSeconds)}\` | ${item.title.replace(/\|/g, '\\|')} | ${item.viralScorecard.strongestSignals.join(', ')} |`,
    );
  }

  lines.push('');

  for (const item of limitedItems) {
    lines.push(`## ${item.title}`);
    lines.push('');
    lines.push(`- Video: \`${item.videoSlug}\``);
    lines.push(`- Window: \`${formatSeconds(item.startSeconds)}-${formatSeconds(item.endSeconds)}\``);
    lines.push(`- Score: \`${item.overallScore}/100\``);
    lines.push(`- Why: ${item.viralScorecard.explanation}`);
    lines.push(
      `- Breakdown: hook ${item.viralScorecard.hookStrength}, emotion ${item.viralScorecard.emotionalIntensity}, practical ${item.viralScorecard.practicalValue}, identity ${item.viralScorecard.identityResonance}, visual ${item.viralScorecard.visualPayoff}, complete ${item.viralScorecard.thoughtCompleteness}`,
    );
    if (item.reason) {
      lines.push(`- Reason: ${item.reason}`);
    }
    if (item.hook) {
      lines.push(`- Hook: ${item.hook}`);
    }
    if (item.highlightWords.length > 0) {
      lines.push(`- Highlight words: ${item.highlightWords.join(', ')}`);
    }
    lines.push(`- Selection: \`${item.selectionPath}\``);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
};

const buildJsonReport = () => JSON.stringify({
  runDir,
  generatedAt: new Date().toISOString(),
  clipCount: limitedItems.length,
  clips: limitedItems,
}, null, 2) + '\n';

const reportContent =
  format === 'json'
    ? buildJsonReport()
    : format === 'markdown' || format === 'md'
      ? buildMarkdownReport()
      : buildTextReport();

const explicitOut = args.out ? path.resolve(String(args.out)) : null;
const writeDefault = Boolean(args.write);
const derivedOut =
  explicitOut ??
  (writeDefault
    ? path.join(
        runDir,
        `viral-scorecards.${format === 'json' ? 'json' : 'md'}`,
      )
    : null);

if (derivedOut) {
  ensureDir(path.dirname(derivedOut));
  fs.writeFileSync(derivedOut, reportContent);
  console.log(`Wrote scorecard report: ${derivedOut}`);
} else {
  process.stdout.write(reportContent);
}

if (persist) {
  console.log(`Updated ${selectedPaths.length} selection file(s) with viralScorecard blocks.`);
}
