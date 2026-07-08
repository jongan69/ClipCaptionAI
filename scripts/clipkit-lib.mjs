import path from 'node:path';

export const slugify = (value, fallback = 'run') => {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return slug || fallback;
};

export const timestampSlug = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
};

export const mergeStyleConfig = (baseConfig = {}, overrides = {}) => ({
  ...baseConfig,
  ...overrides,
});

const boundaryEpsilonSeconds = 0.12;
const stopWordSet = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'his',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'she',
  'so',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'to',
  'was',
  'we',
  'were',
  'with',
  'you',
  'your',
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeThoughtText = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeToken = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9$]+/g, '')
    .replace(/(ing|ed|es|s)$/g, '');

const countWords = (value) =>
  normalizeThoughtText(value)
    .split(/\s+/)
    .filter(Boolean).length;

const tokenize = (value) =>
  normalizeThoughtText(value)
    .split(/[^a-zA-Z0-9$]+/)
    .map(normalizeToken)
    .filter((token) => token && !stopWordSet.has(token));

const hasTerminalPunctuation = (value) => /[.!?]["')\]]*$/.test(normalizeThoughtText(value));

const buildThoughtUnitsFromSource = (entries, {
  gapSeconds = 0.85,
  maxDurationSeconds = 8.5,
  maxWords = 18,
} = {}) => {
  const units = [];
  let current = null;

  const flush = () => {
    if (!current || !normalizeThoughtText(current.text)) {
      return;
    }
    units.push({
      startSeconds: Number(current.startSeconds.toFixed(3)),
      endSeconds: Number(current.endSeconds.toFixed(3)),
      text: normalizeThoughtText(current.text),
    });
    current = null;
  };

  const normalizedEntries = entries
    .map((entry) => {
      const startSeconds = toFiniteNumber(entry.startSeconds ?? entry.start);
      const endSeconds = toFiniteNumber(entry.endSeconds ?? entry.end);
      const text = normalizeThoughtText(entry.text ?? entry.correctedText ?? entry.rawText);

      if (
        startSeconds === null ||
        endSeconds === null ||
        endSeconds <= startSeconds ||
        !text
      ) {
        return null;
      }

      return {startSeconds, endSeconds, text};
    })
    .filter(Boolean)
    .sort((a, b) => a.startSeconds - b.startSeconds);

  for (const entry of normalizedEntries) {
    if (!current) {
      current = {...entry};
      continue;
    }

    const gap = Math.max(0, entry.startSeconds - current.endSeconds);
    const nextText = normalizeThoughtText(`${current.text} ${entry.text}`);
    const nextDuration = entry.endSeconds - current.startSeconds;
    const shouldBreak =
      gap >= gapSeconds ||
      hasTerminalPunctuation(current.text) ||
      nextDuration >= maxDurationSeconds ||
      countWords(nextText) >= maxWords;

    if (shouldBreak) {
      flush();
      current = {...entry};
      continue;
    }

    current.endSeconds = Math.max(current.endSeconds, entry.endSeconds);
    current.text = nextText;
  }

  flush();
  return units;
};

export const buildThoughtUnits = ({
  transcription = null,
  transcriptEnhancement = null,
  captions = [],
} = {}) => {
  const segmentUnits = buildThoughtUnitsFromSource(transcription?.segments ?? [], {
    gapSeconds: 0.9,
    maxDurationSeconds: 9.5,
    maxWords: 22,
  });
  if (segmentUnits.length > 0) {
    return {source: 'transcription.segments', units: segmentUnits};
  }

  const enhancedUnits = buildThoughtUnitsFromSource(transcriptEnhancement?.chunks ?? [], {
    gapSeconds: 0.9,
    maxDurationSeconds: 10.5,
    maxWords: 24,
  });
  if (enhancedUnits.length > 0) {
    return {source: 'analysis.textEnhancement.chunks', units: enhancedUnits};
  }

  const captionUnits = buildThoughtUnitsFromSource(
    captions.map((caption) => ({
      startSeconds: Number(caption.startMs ?? 0) / 1000,
      endSeconds: Number(caption.endMs ?? 0) / 1000,
      text: caption.text,
    })),
    {
      gapSeconds: 0.7,
      maxDurationSeconds: 6.5,
      maxWords: 14,
    },
  );

  return {source: 'captions', units: captionUnits};
};

const latestThoughtStartBefore = (units, timeSeconds, lookaroundSeconds) => {
  const containingUnit = units.find(
    (unit) =>
      timeSeconds >= unit.startSeconds - boundaryEpsilonSeconds &&
      timeSeconds <= unit.endSeconds + boundaryEpsilonSeconds,
  );
  if (containingUnit) {
    return containingUnit.startSeconds;
  }

  let candidate = null;
  for (const unit of units) {
    if (unit.startSeconds > timeSeconds + boundaryEpsilonSeconds) {
      break;
    }
    const distance = timeSeconds - unit.startSeconds;
    if (distance >= -boundaryEpsilonSeconds && distance <= lookaroundSeconds) {
      candidate = unit.startSeconds;
    }
  }
  return candidate;
};

const earliestThoughtEndAfter = (units, timeSeconds, lookaroundSeconds) => {
  const containingUnit = units.find(
    (unit) =>
      timeSeconds >= unit.startSeconds - boundaryEpsilonSeconds &&
      timeSeconds <= unit.endSeconds + boundaryEpsilonSeconds,
  );
  if (containingUnit) {
    return containingUnit.endSeconds;
  }

  for (const unit of units) {
    const distance = unit.endSeconds - timeSeconds;
    if (distance >= -boundaryEpsilonSeconds && distance <= lookaroundSeconds) {
      return unit.endSeconds;
    }
  }
  return null;
};

export const snapSelectionToThoughtBoundaries = ({
  startSeconds,
  endSeconds,
  durationSeconds = null,
  thoughtUnits = [],
  lookaroundSeconds = 6,
} = {}) => {
  const safeStart = Math.max(0, toFiniteNumber(startSeconds) ?? 0);
  const safeEnd = Math.max(safeStart, toFiniteNumber(endSeconds) ?? safeStart);
  const safeDurationSeconds = toFiniteNumber(durationSeconds);
  const units = Array.isArray(thoughtUnits) ? thoughtUnits : [];
  const boundaryRadius = Math.max(0, toFiniteNumber(lookaroundSeconds) ?? 0);

  if (units.length === 0 || boundaryRadius <= 0) {
    return {
      startSeconds: safeStart,
      endSeconds: safeDurationSeconds === null ? safeEnd : Math.min(safeDurationSeconds, safeEnd),
      adjusted: false,
      source: null,
    };
  }

  const snappedStart = latestThoughtStartBefore(units, safeStart, boundaryRadius);
  const snappedEnd = earliestThoughtEndAfter(units, safeEnd, boundaryRadius);

  const normalizedStart = snappedStart === null ? safeStart : Math.max(0, snappedStart);
  const normalizedEndBase = snappedEnd === null ? safeEnd : Math.max(normalizedStart, snappedEnd);
  const normalizedEnd =
    safeDurationSeconds === null
      ? normalizedEndBase
      : Math.min(safeDurationSeconds, normalizedEndBase);

  return {
    startSeconds: Number(normalizedStart.toFixed(3)),
    endSeconds: Number(normalizedEnd.toFixed(3)),
    adjusted:
      Math.abs(normalizedStart - safeStart) > boundaryEpsilonSeconds ||
      Math.abs(normalizedEnd - safeEnd) > boundaryEpsilonSeconds,
    source: {
      start: snappedStart === null ? 'original' : 'thought-start',
      end: snappedEnd === null ? 'original' : 'thought-end',
    },
  };
};

const normalizeOverallScore = (value) => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return 70;
  }
  if (parsed <= 10) {
    return clamp(Math.round(parsed * 10), 0, 100);
  }
  return clamp(Math.round(parsed), 0, 100);
};

const scoreFromKeywords = (text, keywords, weight = 9) => {
  let score = 0;
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      score += weight;
    }
  }
  return score;
};

const topSignalNames = (signalMap, limit = 3) =>
  Object.entries(signalMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);

export const buildViralScorecard = (clip = {}) => {
  const title = normalizeThoughtText(clip.title);
  const hook = normalizeThoughtText(clip.hook);
  const reason = normalizeThoughtText(clip.reason);
  const highlightWords = Array.isArray(clip.highlightWords)
    ? clip.highlightWords.map((word) => normalizeThoughtText(word)).filter(Boolean)
    : [];
  const combinedText = [title, hook, reason, ...highlightWords].join(' ').toLowerCase();
  const tokens = tokenize(combinedText);
  const overall = normalizeOverallScore(clip.score);
  const durationSeconds = Math.max(
    0,
    (toFiniteNumber(clip.selectedEndSeconds ?? clip.endSeconds) ?? 0) -
      (toFiniteNumber(clip.selectedStartSeconds ?? clip.startSeconds) ?? 0),
  );

  let hookStrength = 48 + overall * 0.35;
  if (/[?!]/.test(hook)) {
    hookStrength += 8;
  }
  if (/^(how|why|when|if|the|this)\b/i.test(title) || /^(how|why|when|if)\b/i.test(hook)) {
    hookStrength += 9;
  }
  hookStrength += scoreFromKeywords(combinedText, [
    'first',
    'old identity',
    'rock bottom',
    'walmart',
    'homeless',
    'dream',
    'lazy',
    'empty',
    'luck',
  ], 6);

  let emotionalImpact = 42 + overall * 0.32;
  emotionalImpact += scoreFromKeywords(combinedText, [
    'homeless',
    'rock bottom',
    'empty',
    'lazy',
    'mother',
    'family',
    'dream',
    'kill',
    'old identity',
    'broke',
    'walmart',
    'shit',
    'scared',
    'blessing',
  ], 7);

  let practicalValue = 35 + overall * 0.22;
  practicalValue += scoreFromKeywords(combinedText, [
    'how',
    'why',
    'tip',
    'strategy',
    'post',
    'product',
    'sales',
    'business',
    'work',
    'mentor',
    'conviction',
    'visualization',
    'momentum',
  ], 6);

  let identityResonance = 40 + overall * 0.3;
  identityResonance += scoreFromKeywords(combinedText, [
    'identity',
    'family',
    'mother',
    'god',
    'faith',
    'discipline',
    'lock in',
    'mindset',
    'version',
    'old',
    'dream',
    'manifestation',
    'walmart',
    'homeless',
  ], 7);

  let visualPayoff = 32 + overall * 0.24;
  visualPayoff += scoreFromKeywords(combinedText, [
    'watch',
    'car',
    'walmart',
    'benz',
    'corvette',
    'rolex',
    'crib',
    'travel',
    'cali',
    'house',
    'luxury',
    'gas station',
  ], 7);
  visualPayoff += clamp(highlightWords.length * 3, 0, 12);

  let thoughtCompleteness = clip.thoughtBoundaryAdjusted ? 92 : 76;
  if (clip.thoughtBoundaryAlignment?.start === 'thought-start') {
    thoughtCompleteness += 3;
  }
  if (clip.thoughtBoundaryAlignment?.end === 'thought-end') {
    thoughtCompleteness += 3;
  }
  if (durationSeconds >= 25 && durationSeconds <= 60) {
    thoughtCompleteness += 2;
  }

  hookStrength = clamp(Math.round(hookStrength), 0, 100);
  emotionalImpact = clamp(Math.round(emotionalImpact), 0, 100);
  practicalValue = clamp(Math.round(practicalValue), 0, 100);
  identityResonance = clamp(Math.round(identityResonance), 0, 100);
  visualPayoff = clamp(Math.round(visualPayoff), 0, 100);
  thoughtCompleteness = clamp(Math.round(thoughtCompleteness), 0, 100);

  const signalMap = {
    hook_strength: hookStrength,
    emotional_intensity: emotionalImpact,
    practical_value: practicalValue,
    identity_resonance: identityResonance,
    visual_payoff: visualPayoff,
    thought_completeness: thoughtCompleteness,
  };

  const signalNames = {
    hook_strength: 'hook strength',
    emotional_intensity: 'emotional intensity',
    practical_value: 'practical value',
    identity_resonance: 'identity resonance',
    visual_payoff: 'visual payoff',
    thought_completeness: 'thought completeness',
  };

  const strongestSignals = topSignalNames(signalMap)
    .map((key) => signalNames[key] ?? key);

  const explanation = `Flagged for ${strongestSignals.join(', ')}.`;

  return {
    overall,
    hookStrength,
    emotionalIntensity: emotionalImpact,
    practicalValue,
    identityResonance,
    visualPayoff,
    thoughtCompleteness,
    strongestSignals,
    explanation,
    sourceScore: clip.score ?? null,
    highlightWords,
    tokenCount: tokens.length,
  };
};

const hasFlag = (args, flag) => args.includes(`--${flag}`);

export const buildBrollCaptionArgs = ({
  projectRoot,
  args = [],
  maxClips = '3',
  paddingSeconds = '2',
}) => {
  const mergedArgs = [
    '--links',
    path.join(projectRoot, 'links.txt'),
    '--out-dir',
    path.join(projectRoot, 'outputs'),
    '--max-clips',
    maxClips,
    '--padding-seconds',
    paddingSeconds,
    '--scene-library',
    path.join(projectRoot, 'custom-scenes-library'),
    '--library-config',
    path.join(projectRoot, 'custom-scenes-library', 'library.config.json'),
    '--style-config',
    path.join(projectRoot, 'styles', 'broll-heavy-custom-scenes.json'),
    '--context-scenes',
    '--local-scenes-only',
    ...args,
  ];

  if (!hasFlag(args, 'sound-effects') && !hasFlag(args, 'disable-sound-effects')) {
    mergedArgs.push('--disable-sound-effects');
  }

  if (!hasFlag(args, 'vertical') && !hasFlag(args, 'vertical-contain')) {
    mergedArgs.push('--vertical-contain');
  }

  return mergedArgs;
};
