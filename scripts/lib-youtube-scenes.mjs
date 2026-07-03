import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ensureDir, probeVideo} from './lib.mjs';

const youtubeWatchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;

const slugify = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

const normalizeToken = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

const genericQueryTokens = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'inside',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  '4k',
  'b',
  'roll',
  'broll',
  'cinematic',
  'commercial',
  'dramatic',
  'close',
  'up',
  'slow',
  'motion',
  'camera',
  'movement',
  'moving',
  'fast',
  'stock',
  'footage',
  'video',
  'free',
  'copyright',
]);

const normalizeStringList = (value, fallback = []) => {
  const raw = Array.isArray(value) ? value : fallback;
  return raw
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
};

const buildQueryStyle = (queryStyle = {}) => ({
  maxExpandedQueriesPerBase: Math.max(
    1,
    Math.min(10, Number(queryStyle.maxExpandedQueriesPerBase ?? 5)),
  ),
  minCandidateScore: Number(queryStyle.minCandidateScore ?? 5),
  minCoreQueryMatches: Math.max(1, Number(queryStyle.minCoreQueryMatches ?? 2)),
  preferMotion: queryStyle.preferMotion !== false,
  preferCinematic: queryStyle.preferCinematic !== false,
  preferMovieScenes: Boolean(queryStyle.preferMovieScenes),
  avoidTalkingHeads: queryStyle.avoidTalkingHeads !== false,
  officialClipBoost: Number(queryStyle.officialClipBoost ?? 10),
  movieSceneBoost: Number(queryStyle.movieSceneBoost ?? 12),
  stockFootagePenalty: Number(queryStyle.stockFootagePenalty ?? 0),
  watermarkPenalty: Number(queryStyle.watermarkPenalty ?? 35),
  trailerPenalty: Number(queryStyle.trailerPenalty ?? 8),
  lowQualityPenalty: Number(queryStyle.lowQualityPenalty ?? 10),
  nonScenePenalty: Number(queryStyle.nonScenePenalty ?? 18),
  styleModifiers: normalizeStringList(queryStyle.styleModifiers, [
    'cinematic',
    '4k',
    'close up',
    'dramatic',
    'slow motion',
    'commercial',
    'b roll',
  ]),
  themeBoosts: normalizeStringList(queryStyle.themeBoosts, [
    'money',
    'discipline',
    'faith',
    'urgency',
    'luxury',
    'transformation',
    'motivation',
  ]),
  avoidTerms: normalizeStringList(queryStyle.avoidTerms, [
    'podcast',
    'interview',
    'reaction',
    'slideshow',
    'lyrics',
    'compilation',
    'news',
    'talk show',
    'meme',
    'anime',
    'cartoon',
    'gameplay',
    'music video',
    'lyrics',
    'trailer',
    'compilation',
    'funny',
    'recreates',
    'ishowspeed',
    'streamer',
    'vlog',
    'prank',
    'challenge',
    'shorts',
    'instruction',
    'instructions',
    'tutorial',
    'review',
    'unboxing',
    'toy',
    'charging',
    'how to',
    'product',
    'killed',
    'kills',
    'stabbed',
    'stabbing',
    'shooting',
    'shot',
    'carjacking',
    'sheriff',
    'deputies',
    'deputy',
    'county',
    'hcso',
    'says',
    'police',
    'crime',
    'suspect',
    'arrested',
    'dead',
    'death',
    'homicide',
    'subscribe',
    'report',
    'reporter',
    'breaking',
    'cbs',
    'fox',
    'abc',
    'nbc',
    'ktla',
    'news',
    'couple',
    'romantic',
    'romance',
    'kissing',
    'kiss',
    'sound',
    'effect',
    'effects',
    'sfx',
  ]),
});

const buildFallbackQueries = (query, queryStyle = {}) => {
  const base = String(query ?? '').trim();
  if (!base) {
    return [];
  }

  const style = buildQueryStyle(queryStyle);
  const lowerBase = base.toLowerCase();
  if (/\b(official clip|official trailer|tv scene|movie scene)\b/.test(lowerBase)) {
    return [base];
  }
  if (
    /\b(scene|clip)\b/.test(lowerBase) &&
    /\b(movie|film|tv|show|series|netflix|hbo|disney|warner|paramount|sony|universal|fox|amc|fx|bbc)\b/.test(lowerBase)
  ) {
    return [base];
  }

  if (style.preferMovieScenes) {
    return [
      `${base} movie scene`,
      `${base} official clip`,
      `${base} tv scene`,
      `${base} film scene`,
      `${base} iconic scene`,
      `movie scene about ${base}`,
    ]
      .filter((variant) => variant.length <= 120)
      .slice(0, style.maxExpandedQueriesPerBase);
  }

  const variants = [base];
  const modifiers = style.styleModifiers.slice(0, 5);

  for (const modifier of modifiers) {
    variants.push(`${base} ${modifier}`);
  }

  if (style.preferCinematic) {
    variants.push(`${base} cinematic 4k`);
    variants.push(`${base} dramatic close up`);
  }

  if (style.preferMotion) {
    variants.push(`${base} camera movement`);
    variants.push(`${base} fast moving b roll`);
  }

  return [...new Set(variants)]
    .filter((variant) => variant.length <= 120)
    .slice(0, style.maxExpandedQueriesPerBase);
};

const scoreCandidate = (candidate, query, queryStyle = {}) => {
  const style = buildQueryStyle(queryStyle);
  const text = [
    candidate.title,
    candidate.description,
    candidate.channelTitle,
  ].join(' ').toLowerCase();
  const titleChannelText = [candidate.title, candidate.channelTitle]
    .join(' ')
    .toLowerCase();
  const queryTokens = normalizeToken(query);
  const styleTokens = new Set(
    [
      ...style.styleModifiers,
      ...style.themeBoosts,
    ].flatMap(normalizeToken),
  );
  const coreQueryTokens = queryTokens.filter(
    (token) => !genericQueryTokens.has(token) && !styleTokens.has(token),
  );
  const titleTokens = normalizeToken(candidate.title);
  const textTokens = normalizeToken(text);
  const textTokenSet = new Set(textTokens);
  let score = 0;
  let coreMatches = 0;

  for (const token of [...new Set(coreQueryTokens)]) {
    if (textTokenSet.has(token)) {
      coreMatches += 1;
      score += titleTokens.includes(token) ? 4.5 : 2;
    }
  }

  if (coreQueryTokens.length > 0 && coreMatches < style.minCoreQueryMatches) {
    score -= 12;
  }

  for (const token of queryTokens) {
    if (coreQueryTokens.includes(token)) {
      continue;
    }
    if (titleTokens.includes(token)) {
      score += 0.35;
    } else if (text.includes(token)) {
      score += 0.15;
    }
  }

  for (const modifier of style.styleModifiers) {
    if (text.includes(modifier.toLowerCase())) {
      score += 1.2;
    }
  }

  for (const theme of style.themeBoosts) {
    if (text.includes(theme.toLowerCase())) {
      score += 0.8;
    }
  }

  for (const avoid of style.avoidTerms) {
    if (text.includes(avoid.toLowerCase())) {
      score -= 5;
    }
  }

  if (/\b(watermark|watermarked|preview only|storyblocks?|shutterstock|alamy|pond5|envato|videohive|depositphotos|123rf)\b/i.test(text)) {
    score -= style.watermarkPenalty;
  }

  if (style.avoidTalkingHeads && /\b(podcast|interview|talk show|reaction|lecture)\b/i.test(text)) {
    score -= 6;
  }

  if (/\b(edit|fan edit|sigma|green screen|greenscreen|tribute|recap|explained|ending|last scene|reunion|shorts?)\b/i.test(text)) {
    score -= 8;
  }

  if (/\b(official clip|movieclips|filmclips|clip from|scene from)\b/i.test(text)) {
    score += style.officialClipBoost;
  }

  if (/\b(movie scene|film scene|tv scene|show scene|iconic scene|famous scene)\b/i.test(text)) {
    score += style.movieSceneBoost;
  }

  if (/\b(trailer|teaser|promo|behind the scenes|making of)\b/i.test(text)) {
    score -= style.trailerPenalty;
  }

  if (/\b(official video|music video|lyrics?|compilation|full episode)\b/i.test(text)) {
    score -= 3;
  }

  if (style.preferMovieScenes && /\b(stock|stock footage|b-?roll|royalty free|no copyright|free footage|background video|commercial|advertisement|ad\b)\b/i.test(text)) {
    score -= style.stockFootagePenalty;
  }

  if (style.preferMovieScenes && /\b(free to use|free download|cc free|copyright free|download cc|free stock|stock video|rent an apartment|apartment tour|home tour)\b/i.test(text)) {
    score -= style.stockFootagePenalty;
  }

  if (
    style.preferMovieScenes &&
    !/\b(official clip|movieclips|filmclips|movie clip|film clip|clip from|scene from|movie scene|film scene|tv scene|show scene|iconic scene|famous scene|netflix|hbo|disney|warner|paramount|universal|sony pictures|20th century|amc|fx|bbc|movie|film|series)\b/i.test(titleChannelText)
  ) {
    score -= style.nonScenePenalty;
  }

  if (/\b(top 10|best scenes|best movies|explained|recap|review|analysis|essay|reaction|fan edit|amv|tribute|shorts?)\b/i.test(text)) {
    score -= style.lowQualityPenalty;
  }

  if (Number(candidate.durationSeconds ?? 0) > 0 && Number(candidate.durationSeconds) <= 20) {
    score += 0.8;
  }

  return score;
};

export const parseIso8601DurationToSeconds = (iso) => {
  const match = String(iso ?? '').match(
    /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );

  if (!match) {
    return 0;
  }

  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
};

const youtubeApiGet = async (apiKey, endpoint, params) => {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  url.searchParams.set('key', apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `YouTube Data API ${endpoint} failed with ${response.status}: ${body.slice(0, 400)}`,
    );
  }

  return response.json();
};

const ytDlpJson = (args) => {
  const stdout = execFileSync('yt-dlp', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 1024 * 1024 * 32,
  });

  return JSON.parse(stdout);
};

const readIndexPath = (sceneLibraryDir) => path.join(sceneLibraryDir, 'index.json');

const loadIndex = (sceneLibraryDir) => {
  const indexPath = readIndexPath(sceneLibraryDir);
  if (!fs.existsSync(indexPath)) {
    return {scenes: []};
  }

  const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  return {
    scenes: Array.isArray(parsed?.scenes) ? parsed.scenes : [],
  };
};

const saveIndex = (sceneLibraryDir, index) => {
  fs.writeFileSync(readIndexPath(sceneLibraryDir), JSON.stringify(index, null, 2));
};

const loadExistingSceneIds = (sceneLibraryDir) => {
  const index = loadIndex(sceneLibraryDir);
  return new Set(index.scenes.map((scene) => String(scene.id ?? '')));
};

const mergeSceneIntoIndex = (sceneLibraryDir, sceneEntry) => {
  const index = loadIndex(sceneLibraryDir);
  const existingIndex = index.scenes.findIndex(
    (scene) => String(scene.id ?? '') === String(sceneEntry.id),
  );

  if (existingIndex === -1) {
    index.scenes.push(sceneEntry);
  } else {
    index.scenes[existingIndex] = sceneEntry;
  }

  index.scenes.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  saveIndex(sceneLibraryDir, index);
};

const searchVideos = async ({
  apiKey,
  query,
  maxResults,
  channelId,
}) => {
  const searchResponse = await youtubeApiGet(apiKey, 'search', {
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults,
    safeSearch: 'none',
    relevanceLanguage: 'en',
    videoEmbeddable: 'true',
    ...(channelId ? {channelId} : {}),
  });

  const ids = (searchResponse.items ?? [])
    .map((item) => item.id?.videoId)
    .filter(Boolean);

  if (ids.length === 0) {
    return [];
  }

  const detailsResponse = await youtubeApiGet(apiKey, 'videos', {
    part: 'snippet,contentDetails,status',
    id: ids.join(','),
    maxResults: ids.length,
  });

  return (detailsResponse.items ?? []).map((item) => ({
    videoId: item.id,
    title: item.snippet?.title ?? '',
    description: item.snippet?.description ?? '',
    channelTitle: item.snippet?.channelTitle ?? '',
    channelId: item.snippet?.channelId ?? '',
    publishedAt: item.snippet?.publishedAt ?? '',
    durationSeconds: parseIso8601DurationToSeconds(item.contentDetails?.duration),
    url: youtubeWatchUrl(item.id),
    thumbnails: item.snippet?.thumbnails ?? {},
  }));
};

const searchVideosViaYtDlp = async ({
  query,
  maxResults,
  log = console,
}) => {
  const entries = [];

  log.log?.(`Searching YouTube via yt-dlp fallback for: ${query}`);
  const searchResults = ytDlpJson([
    '--flat-playlist',
    '--dump-single-json',
    `ytsearch${maxResults}:${query}`,
  ]);
  const variantEntries = Array.isArray(searchResults?.entries) ? searchResults.entries : [];
  entries.push(...variantEntries);

  const seenUrls = new Set();
  const results = [];

  for (const entry of entries) {
    const videoId = entry?.id ?? (/^[a-zA-Z0-9_-]{8,}$/.test(String(entry?.url ?? '')) ? entry.url : null);
    const url = /^https?:\/\//.test(String(entry?.url ?? ''))
      ? entry.url
      : videoId
        ? youtubeWatchUrl(videoId)
        : null;
    if (!url || seenUrls.has(url)) {
      continue;
    }
    seenUrls.add(url);

    results.push({
      videoId: videoId ?? String(results.length + 1),
      title: entry.title ?? '',
      description: entry.description ?? '',
      channelTitle: entry.channel ?? entry.uploader ?? '',
      channelId: entry.channel_id ?? '',
      publishedAt: entry.upload_date ?? '',
      durationSeconds: Number(entry.duration ?? 0),
      url,
      thumbnails: entry.thumbnails ?? {},
    });
  }

  return results;
};

const ytDlpDownload = (url, outputTemplate) => {
  const baseArgs = [
    '--no-playlist',
    '--extractor-args',
    'youtube:player_client=android,web',
    '--merge-output-format',
    'mp4',
    '--remux-video',
    'mp4',
    '--output',
    outputTemplate,
    '--print',
    'after_move:filepath',
    url,
  ];

  let stdout = '';
  try {
    stdout = execFileSync('yt-dlp', baseArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 1024 * 1024 * 8,
    });
  } catch {
    stdout = execFileSync('yt-dlp', ['--cookies-from-browser', 'chrome', ...baseArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 1024 * 1024 * 8,
    });
  }

  const downloaded = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!downloaded) {
    throw new Error(`yt-dlp did not return a downloaded file for ${url}`);
  }

  return path.resolve(downloaded);
};

const writeSidecar = (videoPath, sceneEntry) => {
  const sidecarPath = `${videoPath}.scene.json`;
  const sidecar = {
    title: sceneEntry.title,
    source: sceneEntry.source,
    description: sceneEntry.description,
    tags: sceneEntry.tags,
    startSeconds: sceneEntry.startSeconds,
    endSeconds: sceneEntry.endSeconds,
    attribution: sceneEntry.attribution,
  };

  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));
};

export const ingestYouTubeScenes = async ({
  apiKey = null,
  sceneLibraryDir,
  queries,
  maxResultsPerQuery = 6,
  maxDownloadsPerQuery = 2,
  maxDurationSeconds = 60,
  channelId = null,
  queryStyle = {},
  log = console,
}) => {
  ensureDir(sceneLibraryDir);

  const resolvedQueryStyle = buildQueryStyle(queryStyle);
  const dedupedQueries = [...new Set((queries ?? []).map((query) => String(query ?? '').trim()).filter(Boolean))];
  if (dedupedQueries.length === 0) {
    return {downloaded: [], skipped: []};
  }

  const existingIds = loadExistingSceneIds(sceneLibraryDir);
  const downloaded = [];
  const skipped = [];

  for (const query of dedupedQueries) {
    const expandedQueries = buildFallbackQueries(query, resolvedQueryStyle);
    const resultByUrl = new Map();

    for (const searchQuery of expandedQueries) {
      let results = [];

      if (apiKey) {
        try {
          results = await searchVideos({
            apiKey,
            query: searchQuery,
            maxResults: maxResultsPerQuery,
            channelId,
          });
        } catch (error) {
          log.warn?.(
            `YouTube Data API search failed for "${searchQuery}", falling back to yt-dlp search: ${error.message}`,
          );
        }
      }

      if (results.length === 0) {
        results = await searchVideosViaYtDlp({
          query: searchQuery,
          maxResults: maxResultsPerQuery,
          log,
        });
      }

      for (const result of results) {
        if (!result.url) {
          continue;
        }

        const existing = resultByUrl.get(result.url);
        const score = scoreCandidate(result, searchQuery, resolvedQueryStyle);
        if (!existing || score > existing.searchScore) {
          resultByUrl.set(result.url, {
            ...result,
            searchQuery,
            baseQuery: query,
            searchScore: score,
          });
        }
      }
    }

    const results = [...resultByUrl.values()]
      .sort((a, b) => b.searchScore - a.searchScore);
    let downloadedForQuery = 0;

    for (const result of results) {
      const sceneId = `yt-${result.videoId}`;

      if (existingIds.has(sceneId)) {
        skipped.push({query, reason: 'already_ingested', videoId: result.videoId});
        continue;
      }

      const durationSeconds =
        Number.isFinite(result.durationSeconds) && result.durationSeconds > 0
          ? result.durationSeconds
          : maxDurationSeconds;

      if (
        Number.isFinite(result.searchScore) &&
        result.searchScore < resolvedQueryStyle.minCandidateScore
      ) {
        skipped.push({
          query,
          searchQuery: result.searchQuery ?? query,
          reason: 'low_search_score',
          videoId: result.videoId,
          searchScore: Number(result.searchScore.toFixed(2)),
        });
        continue;
      }

      if (durationSeconds > maxDurationSeconds) {
        skipped.push({
          query,
          reason: 'too_long',
          videoId: result.videoId,
          durationSeconds,
        });
        continue;
      }

      const baseName = `${sceneId}-${slugify(result.title || result.videoId) || result.videoId}`;
      const outputTemplate = path.join(sceneLibraryDir, `${baseName}.%(ext)s`);
      log.log?.(
        `Ingesting YouTube scene: ${result.title} (${result.url}) [query="${result.searchQuery}", score=${result.searchScore.toFixed(1)}]`,
      );
      let downloadedPath = null;
      let metadata = null;
      try {
        downloadedPath = ytDlpDownload(result.url, outputTemplate);
        metadata = probeVideo(downloadedPath);
      } catch (error) {
        skipped.push({
          query,
          searchQuery: result.searchQuery ?? query,
          reason: 'download_failed',
          videoId: result.videoId,
          error: error.message,
        });
        for (const file of fs.readdirSync(sceneLibraryDir)) {
          if (file.startsWith(baseName)) {
            fs.rmSync(path.join(sceneLibraryDir, file), {force: true});
          }
        }
        continue;
      }
      const titleTokens = normalizeToken(result.title);
      const channelTokens = normalizeToken(result.channelTitle);
      const tags = [...new Set([...titleTokens, ...channelTokens])].slice(0, 20);

      const sceneEntry = {
        id: sceneId,
        file: path.relative(sceneLibraryDir, downloadedPath),
        title: result.title,
        source: result.channelTitle,
        description: result.description,
        tags,
        startSeconds: 0,
        endSeconds: Math.min(durationSeconds, maxDurationSeconds),
        attribution: {
          platform: 'YouTube',
          videoId: result.videoId,
          url: result.url,
          channelTitle: result.channelTitle,
          channelId: result.channelId,
          publishedAt: result.publishedAt,
          ingestedFromQuery: result.baseQuery ?? query,
          ingestedFromSearchQuery: result.searchQuery ?? query,
          searchScore: Number(result.searchScore.toFixed(2)),
        },
      };

      mergeSceneIntoIndex(sceneLibraryDir, sceneEntry);
      writeSidecar(downloadedPath, sceneEntry);
      existingIds.add(sceneId);
      downloaded.push({
        query,
        searchQuery: result.searchQuery ?? query,
        searchScore: Number(result.searchScore.toFixed(2)),
        sceneId,
        videoId: result.videoId,
        filePath: downloadedPath,
        title: result.title,
      });
      downloadedForQuery += 1;

      if (downloadedForQuery >= maxDownloadsPerQuery) {
        break;
      }
    }
  }

  return {downloaded, skipped};
};
