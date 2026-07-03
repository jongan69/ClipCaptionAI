import fs from 'node:fs';
import path from 'node:path';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatSeconds = (seconds) => `${Number(seconds ?? 0).toFixed(2)}s`;

const normalizeStringList = (value, fallback = []) => {
  const raw = Array.isArray(value) ? value : fallback;
  return raw
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
};

const transcriptForWindow = (captions, startSeconds, endSeconds) => {
  const startMs = Number(startSeconds ?? 0) * 1000;
  const endMs = Number(endSeconds ?? 0) * 1000;
  return captions
    .filter((caption) => caption.endMs >= startMs && caption.startMs <= endMs)
    .map((caption) => String(caption.text ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const buildResearchSegments = ({insertions, captions}) =>
  insertions.map((insertion, index) => {
    const transcript = transcriptForWindow(
      captions,
      insertion.startSeconds,
      insertion.endSeconds,
    );
    const visualBrief = insertion.visualBrief ?? {};
    const fallbackSegment = [
      insertion.query,
      insertion.reason,
      visualBrief.emotion,
      visualBrief.visualMetaphor,
      visualBrief.idealShot,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .join(' | ');

    return {
      index: index + 1,
      startSeconds: Number(insertion.startSeconds ?? 0),
      endSeconds: Number(insertion.endSeconds ?? 0),
      segment: transcript || fallbackSegment || String(insertion.query ?? ''),
      query: String(insertion.query ?? ''),
      reason: String(insertion.reason ?? ''),
      visualBrief: {
        emotion: String(visualBrief.emotion ?? ''),
        visualMetaphor: String(visualBrief.visualMetaphor ?? ''),
        energy: String(visualBrief.energy ?? ''),
        idealShot: String(visualBrief.idealShot ?? ''),
        motion: String(visualBrief.motion ?? ''),
      },
      searchQueries: normalizeStringList(insertion.searchQueries, [insertion.query]),
      keywords: normalizeStringList(insertion.keywords),
      avoidTerms: normalizeStringList(insertion.avoidTerms),
    };
  });

const buildSchema = (candidatesPerSegment) => ({
  type: 'object',
  additionalProperties: false,
  required: ['segments'],
  properties: {
    segments: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'segment',
          'intent',
          'bestSceneMatches',
          'saferAlternatives',
          'searchExpansionTerms',
          'avoid',
        ],
        properties: {
          segment: {type: 'string'},
          intent: {type: 'string'},
          bestSceneMatches: {
            type: 'array',
            minItems: 5,
            maxItems: candidatesPerSegment,
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'title',
                'sceneName',
                'whyItWorks',
                'youtubeSearch',
                'alternateSearch',
                'visualDescription',
                'tone',
                'confidenceScore',
                'rightsStatus',
              ],
              properties: {
                title: {type: 'string'},
                sceneName: {type: 'string'},
                whyItWorks: {type: 'string'},
                youtubeSearch: {type: 'string'},
                alternateSearch: {type: 'string'},
                visualDescription: {type: 'string'},
                tone: {type: 'string'},
                confidenceScore: {type: 'number'},
                rightsStatus: {type: 'string'},
              },
            },
          },
          saferAlternatives: {
            type: 'array',
            minItems: 3,
            maxItems: 8,
            items: {type: 'string'},
          },
          searchExpansionTerms: {
            type: 'array',
            minItems: 5,
            maxItems: 14,
            items: {type: 'string'},
          },
          avoid: {
            type: 'array',
            minItems: 3,
            maxItems: 10,
            items: {type: 'string'},
          },
        },
      },
    },
  },
});

const renderMarkdown = (research) => {
  const lines = [
    '# Pop Culture Query Enrichment',
    '',
    'Trace output for movie/TV scene concepts injected into the B-roll YouTube query system. Do not treat a public YouTube result as cleared; manually review rights or replace with licensed, owned, public-domain, stock, or AI-generated footage before use.',
    '',
  ];

  for (const segment of research.segments ?? []) {
    lines.push(`## Segment`);
    lines.push('');
    lines.push(`"${segment.segment}"`);
    lines.push('');
    lines.push(`**Intent:** ${segment.intent}`);
    lines.push('');
    lines.push('### Best Scene Matches');
    lines.push('');

    segment.bestSceneMatches?.forEach((match, index) => {
      lines.push(`${index + 1}. **${match.title} — ${match.sceneName}**`);
      lines.push(`   - Why it works: ${match.whyItWorks}`);
      lines.push(`   - YouTube search: ${match.youtubeSearch}`);
      lines.push(`   - Alternate search: ${match.alternateSearch}`);
      lines.push(`   - Visual: ${match.visualDescription}`);
      lines.push(`   - Tone: ${match.tone}`);
      lines.push(`   - Confidence: ${Number(match.confidenceScore).toFixed(1)}/10`);
      lines.push(`   - Rights/status: ${match.rightsStatus}`);
    });

    lines.push('');
    lines.push('### Safer Alternatives');
    for (const alternative of segment.saferAlternatives ?? []) {
      lines.push(`- ${alternative}`);
    }
    lines.push('');
    lines.push('### Search Expansion Terms');
    lines.push((segment.searchExpansionTerms ?? []).map((term) => `\`${term}\``).join(', '));
    lines.push('');
    lines.push('### Avoid');
    for (const avoid of segment.avoid ?? []) {
      lines.push(`- ${avoid}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
};

const blockedListValues = new Set([
  'avoid',
  'bestscenematches',
  'rightsstatus',
  'saferalternatives',
  'searchexpansionterms',
  'segment',
  'tone',
]);

const cleanList = (items, fallback) => {
  const cleaned = normalizeStringList(items)
    .filter((item) => !blockedListValues.has(item.replace(/[^a-z0-9]+/gi, '').toLowerCase()));
  return [...new Set([...cleaned, ...fallback])];
};

const matchSearchQueries = (match) =>
  [
    match.youtubeSearch,
    match.alternateSearch,
    `${match.title} ${match.sceneName} official clip`,
    `${match.title} ${match.sceneName} scene`,
  ]
    .map((query) => String(query ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

export const popCultureSearchQueriesForResearch = (
  research,
  {maxQueriesPerSegment = 16, minConfidence = 6} = {},
) =>
  (research?.segments ?? []).map((segment) => {
    const matchQueries = (segment.bestSceneMatches ?? [])
      .filter((match) => Number(match.confidenceScore ?? 0) >= minConfidence)
      .flatMap(matchSearchQueries);
    return [
      ...new Set([
        ...matchQueries,
        ...normalizeStringList(segment.searchExpansionTerms),
      ]),
    ].slice(0, Math.max(1, Number(maxQueriesPerSegment ?? 16)));
  });

export const enrichInsertionsWithPopCultureQueries = (
  insertions,
  research,
  {maxQueriesPerInsertion = 16, minConfidence = 6} = {},
) => {
  const queriesBySegment = popCultureSearchQueriesForResearch(research, {
    maxQueriesPerSegment: maxQueriesPerInsertion,
    minConfidence,
  });

  return insertions.map((insertion, index) => {
    const segment = research?.segments?.[index] ?? {};
    const popCultureSearchQueries = queriesBySegment[index] ?? [];
    const matchKeywords = (segment.bestSceneMatches ?? [])
      .filter((match) => Number(match.confidenceScore ?? 0) >= minConfidence)
      .flatMap((match) => [match.title, match.sceneName, match.tone])
      .flatMap((value) => String(value ?? '').split(/[^a-zA-Z0-9]+/))
      .map((value) => value.trim())
      .filter((value) => value.length >= 3);

    return {
      ...insertion,
      popCultureIntent: segment.intent ?? null,
      popCultureSearchQueries,
      searchQueries: [
        ...new Set([
          ...normalizeStringList(insertion.searchQueries, [insertion.query]),
          ...popCultureSearchQueries,
        ]),
      ],
      keywords: [
        ...new Set([
          ...normalizeStringList(insertion.keywords),
          ...matchKeywords,
        ]),
      ].slice(0, 40),
    };
  });
};

const normalizeResearch = (research, sourceSegments) => ({
  ...research,
  segments: (research.segments ?? []).map((segment, index) => {
    const sourceSegment = sourceSegments[index] ?? {};
    const intent = String(segment.intent ?? sourceSegment.reason ?? sourceSegment.query ?? '');
    const coreCue = sourceSegment.query || sourceSegment.visualBrief?.visualMetaphor || intent;
    const searchSeeds = [
      ...normalizeStringList(sourceSegment.searchQueries),
      `${coreCue} movie scene`,
      `${coreCue} iconic TV scene`,
      `famous scene about ${coreCue}`,
      `best movie scenes about ${coreCue}`,
      `${coreCue} official clip`,
    ];

    return {
      ...segment,
      segment: sourceSegment.segment ?? String(segment.segment ?? ''),
      bestSceneMatches: (segment.bestSceneMatches ?? []).map((match) => {
        const rawConfidence = Number(match.confidenceScore ?? 0);
        const confidenceScore = rawConfidence > 0 && rawConfidence <= 1
          ? rawConfidence * 10
          : rawConfidence;
        return {
          ...match,
          confidenceScore: clamp(confidenceScore, 1, 10),
        };
      }),
      saferAlternatives: cleanList(segment.saferAlternatives, [
        `Licensed stock footage matching: ${intent || coreCue}`,
        `Public-domain or Creative Commons footage for: ${coreCue}`,
        `AI-generated original recreation of the same visual metaphor: ${coreCue}`,
      ]).slice(0, 8),
      searchExpansionTerms: cleanList(segment.searchExpansionTerms, searchSeeds).slice(0, 14),
      avoid: cleanList(segment.avoid, [
        'Long fan-uploaded full scenes without review',
        'Low-quality compilations or screen recordings',
        'Obscure references that need too much context',
      ]).slice(0, 10),
    };
  }),
});

export const writePopCultureResearchFiles = ({research, outputPath, writeMarkdown = true}) => {
  const jsonPath = outputPath;
  fs.mkdirSync(path.dirname(jsonPath), {recursive: true});
  fs.writeFileSync(jsonPath, `${JSON.stringify(research, null, 2)}\n`);

  const markdownPath = jsonPath.replace(/\.json$/i, '.md');
  if (writeMarkdown) {
    fs.writeFileSync(markdownPath, renderMarkdown(research));
  }

  return {
    jsonPath,
    markdownPath: writeMarkdown ? markdownPath : null,
  };
};

export const researchPopCultureScenes = async ({
  client,
  model = 'gpt-4.1',
  insertions,
  captions,
  selectionClip = null,
  clipMetadata = null,
  outputPath,
  candidatesPerSegment = 8,
  writeMarkdown = true,
  maxIntegratedQueriesPerSegment = 16,
  minIntegratedConfidence = 6,
}) => {
  const segments = buildResearchSegments({insertions, captions});
  if (segments.length === 0) {
    return null;
  }

  const maxCandidates = clamp(Number(candidatesPerSegment ?? 8), 5, 10);
  const response = await client.responses.create({
    model,
    text: {
      verbosity: 'medium',
      format: {
        type: 'json_schema',
        name: 'pop_culture_scene_research',
        strict: true,
        schema: buildSchema(maxCandidates),
      },
    },
    input: [
      {
        role: 'system',
        content:
          'You are a sharp short-form video editor and pop-culture reference researcher. For each transcript or B-roll cue, infer the emotional meaning, situation, visual metaphor, meme value, and cultural shorthand. Recommend famous movie, TV, cartoon, anime, reality TV, sports-doc, or viral TV scenes that viewers can understand visually in 1-3 seconds. Do not merely match literal keywords. Prefer mainstream recognizable scenes, memeable moments, underdog/comeback/villain-arc/chaos/luxury/focus metaphors, and scenes with obvious visual action. Do not recommend commercials, product ads, music videos, podcasts, influencer videos, or ordinary YouTube videos as best scene matches. This is query enrichment only: do not claim a public YouTube upload is cleared. Use conservative rights/status labels such as official clip, trailer clip, fan upload, unclear, or needs manual licensing review.',
      },
      {
        role: 'user',
        content: `Create pop-culture B-roll scene candidates for these planned insertions.

Return ${maxCandidates} best scene matches per segment when possible.

Ranking rules:
- Higher rank for scenes recognizable in 1-3 seconds.
- Higher rank for memeable or culturally obvious moments.
- Higher rank for emotional/metaphorical fit over literal word matching.
- Higher rank for search queries likely to surface official studio, network, trailer, verified, behind-the-scenes, or promo clips.
- Lower rank for obscure scenes, low-quality uploads, scenes needing too much context, or rights-risky long fan uploads.
- Confidence score must be from 1 to 10, not 0 to 1.
- Do not recommend commercials, product ads, music videos, lyric videos, podcasts, influencer videos, or ordinary YouTube vlogs as pop-culture scene matches.

For rights/status, be conservative. If uncertain, say "needs manual licensing review" or "rights unclear". Do not mark anything cleared just because it is on YouTube.

Clip context:
- duration: ${clipMetadata?.durationSeconds ? formatSeconds(clipMetadata.durationSeconds) : 'unknown'}
- title: ${selectionClip?.title ?? 'n/a'}
- hook: ${selectionClip?.hook ?? 'n/a'}
- reason: ${selectionClip?.reason ?? 'n/a'}
- highlight words: ${(selectionClip?.highlightWords ?? []).join(', ') || 'n/a'}

Segments:
${segments
  .map(
    (segment) => `Segment ${segment.index} [${formatSeconds(segment.startSeconds)}-${formatSeconds(segment.endSeconds)}]
Transcript/cue: "${segment.segment}"
Planner query: ${segment.query}
Planner reason: ${segment.reason}
Visual brief: emotion=${segment.visualBrief.emotion}; metaphor=${segment.visualBrief.visualMetaphor}; energy=${segment.visualBrief.energy}; ideal shot=${segment.visualBrief.idealShot}; motion=${segment.visualBrief.motion}
Existing search queries: ${segment.searchQueries.join(' | ')}
Keywords: ${segment.keywords.join(', ') || 'n/a'}
Avoid terms: ${segment.avoidTerms.join(', ') || 'n/a'}`,
  )
  .join('\n\n')}`,
      },
    ],
  });

  const parsed = normalizeResearch(JSON.parse(response.output_text), segments);
  const files = writePopCultureResearchFiles({
    research: parsed,
    outputPath,
    writeMarkdown,
  });

  return {
    ...files,
    research: parsed,
    integratedSearchQueries: popCultureSearchQueriesForResearch(parsed, {
      maxQueriesPerSegment: maxIntegratedQueriesPerSegment,
      minConfidence: minIntegratedConfidence,
    }),
    segmentCount: segments.length,
    model,
  };
};
