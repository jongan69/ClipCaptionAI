import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {requireArg} from '../lib.mjs';
import {hashValue} from '../platform/catalog.mjs';
import {writeJsonAtomic} from '../platform/jobs.mjs';
import {QAReport} from './schemas.mjs';
import {generationAssetsReady, artifactMatchesFile} from './generation.mjs';
import {args, now, print, appendEvent, loadRun, saveRun} from './runtime.mjs';

const probe = (file) =>
  JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {
      encoding: 'utf8',
    }),
  );
const mediaChecks = (variant, asset) => {
  const checks = [];
  if (!asset)
    return [{name: 'asset', passed: false, detail: 'No final rendered asset is registered.'}];
  try {
    const metadata = probe(asset.path);
    const video = metadata.streams?.find((stream) => stream.codec_type === 'video');
    const audio = metadata.streams?.find((stream) => stream.codec_type === 'audio');
    const duration = Number(metadata.format?.duration || video?.duration || 0);
    checks.push({
      name: 'decoding',
      passed: Boolean(video),
      detail: video ? `Video codec ${video.codec_name || 'unknown'}.` : 'No video stream.',
    });
    checks.push({
      name: 'dimensions',
      passed: Number(video?.width) === variant.width && Number(video?.height) === variant.height,
      detail: `${video?.width || 0}x${video?.height || 0}, expected ${variant.width}x${variant.height}.`,
    });
    checks.push({
      name: 'aspect-ratio',
      passed: Boolean(
        video && Math.abs(video.width / video.height - variant.width / variant.height) < 0.01,
      ),
      detail: 'Compared probed and planned aspect ratios.',
    });
    checks.push({
      name: 'duration',
      passed: Math.abs(duration - variant.durationSeconds) <= 0.5,
      detail: `${duration}s, expected ${variant.durationSeconds}s.`,
    });
    checks.push({
      name: 'streams',
      passed: Boolean(video && audio),
      detail: audio ? 'Video and audio streams present.' : 'Audio stream missing.',
    });
  } catch (error) {
    checks.push({name: 'decoding', passed: false, detail: String(error.message)});
  }
  return checks;
};

const carouselChecks = (variant, assets) => {
  const checks = [
    {
      name: 'carousel-slide-count',
      passed: assets.length === variant.slides.length,
      detail: `${assets.length} rendered images, expected ${variant.slides.length}.`,
    },
  ];
  const media = assets.map((asset) => {
    try {
      const metadata = probe(asset.path);
      return metadata.streams?.find((stream) => stream.codec_type === 'video');
    } catch {
      return null;
    }
  });
  checks.push({
    name: 'decoding',
    passed: media.length > 0 && media.every(Boolean),
    detail: 'Every carousel image must decode.',
  });
  checks.push({
    name: 'dimensions',
    passed: media.every(
      (entry) => Number(entry?.width) === variant.width && Number(entry?.height) === variant.height,
    ),
    detail: `Every carousel image must be ${variant.width}x${variant.height}.`,
  });
  return checks;
};

const detectSignal = (asset, filter, pattern) => {
  if (!asset) return {passed: false, detail: 'No asset to analyze.'};
  const result = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', asset.path, ...filter, '-f', 'null', '-'],
    {encoding: 'utf8', shell: false},
  );
  if (result.error) return {passed: false, detail: result.error.message};
  if (result.status !== 0)
    return {
      passed: false,
      detail: String(result.stderr || `ffmpeg exited ${result.status}`).trim(),
    };
  const detected = pattern.test(`${result.stdout || ''}\n${result.stderr || ''}`);
  return {passed: !detected, detail: detected ? 'Signal detected.' : 'No signal detected.'};
};

const detectBlackBoundary = (asset, durationSeconds) => {
  if (!asset) return {passed: false, detail: 'No asset to analyze.'};
  const result = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', asset.path, '-vf', 'blackdetect=d=0.25:pix_th=0.10', '-f', 'null', '-'],
    {encoding: 'utf8', shell: false},
  );
  if (result.error || result.status !== 0)
    return {passed: false, detail: result.error?.message || String(result.stderr).trim()};
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const ranges = [...text.matchAll(/black_start:([\d.]+).*?black_end:([\d.]+)/g)].map(
    ([, start, end]) => ({start: Number(start), end: Number(end)}),
  );
  const detected = ranges.some((range) => range.start <= 0.5 || range.end >= durationSeconds - 0.5);
  return {
    passed: !detected,
    detail: detected ? 'Black frames detected at the lead or tail.' : 'No black lead or tail.',
  };
};

const qaCampaign = () => {
  const state = loadRun(requireArg(args, 'run'));
  const reports = [];
  for (const variant of state.plan.variants) {
    const finalAssets = state.assets.filter(
      (entry) => entry.type === 'final' && entry.provenance.variantId === variant.id,
    );
    const asset = finalAssets.at(-1);
    const checks =
      variant.format === 'carousel'
        ? carouselChecks(variant, finalAssets)
        : mediaChecks(variant, asset);
    checks.push({
      name: 'generation-assets',
      passed: generationAssetsReady(variant, state.assets, state.plan.capabilityFingerprint),
      detail: 'Every generation intent requires a registered, unchanged local artifact.',
    });
    checks.push({
      name: 'artifact-integrity',
      passed: finalAssets.length > 0 && finalAssets.every(artifactMatchesFile),
      detail: 'Final artifacts must match their registered content hashes.',
    });
    if (variant.format === 'video') {
      checks.push({
        name: 'black-lead-tail',
        ...detectBlackBoundary(asset, variant.durationSeconds),
      });
      checks.push({
        name: 'silence',
        ...detectSignal(asset, ['-af', 'silencedetect=n=-50dB:d=1'], /silence_start/),
      });
    }
    checks.push({
      name: 'caption-safe-zone',
      passed: variant.captions.every(
        (caption) =>
          caption.startSeconds >= 0 &&
          caption.endSeconds <= variant.durationSeconds &&
          caption.yPercent >= 10 &&
          caption.yPercent <= 90,
      ),
      detail: 'Caption timing and vertical placement fit the safe zone.',
    });
    checks.push({
      name: 'cta-end-card',
      passed: Boolean(
        variant.cta &&
        (variant.format === 'carousel' ||
          variant.timeline.some((entry) => entry.type === 'end-card')),
      ),
      detail:
        variant.format === 'carousel'
          ? 'Carousel CTA metadata is present.'
          : 'CTA and end-card metadata are required.',
    });
    const captureAssets = state.assets.filter(
      (entry) =>
        entry.provenance.variantId === variant.id && entry.provenance.adapter === 'capture',
    );
    checks.push({
      name: 'capture-freshness',
      passed: captureAssets.every(
        (entry) => Date.now() - Date.parse(entry.provenance.capturedAt) < 30 * 86_400_000,
      ),
      detail: 'Capture artifacts must be newer than 30 days.',
    });
    const stockIntents = variant.intents.filter(
      (intent) => intent.provenance?.sourceType === 'stock',
    );
    checks.push({
      name: 'stock-provenance',
      passed: stockIntents.every(
        (intent) =>
          intent.provenance.provider &&
          intent.provenance.creator &&
          intent.provenance.sourceUrl &&
          intent.provenance.licenseUrl &&
          state.assets.some(
            (entry) =>
              entry.provenance.variantId === variant.id &&
              entry.provenance.sourceUrl === intent.provenance.sourceUrl,
          ),
      ),
      detail: 'Stock images require registered creator, source, provider, and license metadata.',
    });
    const mockups = state.assets.filter(
      (entry) => entry.provenance.variantId === variant.id && entry.provenance.adapter === 'rotato',
    );
    checks.push({
      name: 'rotato-template',
      passed: mockups.every((entry) => entry.provenance.templateValidated === true),
      detail: 'Rotato assets require a validated template mapping.',
    });
    const passed = checks.every((check) => check.passed);
    const report = QAReport.parse({
      variantId: variant.id,
      createdAt: now(),
      technical: {status: passed ? 'passed' : 'failed', checks},
      evidenceHash: hashValue({plan: state.plan, assets: state.assets}),
      contentClaims: {status: 'pending', approvedClaims: state.plan.approvedClaims},
      visualHuman: {status: 'pending'},
      publication: {status: 'blocked'},
    });
    writeJsonAtomic(path.join(state.directory, 'qa', `${variant.id}.json`), report);
    reports.push(report);
  }
  const technical = reports.every((report) => report.technical.status === 'passed')
    ? 'passed'
    : 'failed';
  saveRun(state.directory, state.run, {
    status: 'qa-complete',
    reviews: {
      ...state.run.reviews,
      technical,
      contentClaims: 'pending',
      visualHuman: 'pending',
      publication: 'blocked',
    },
    jobIds: [
      ...new Set([
        ...state.run.jobIds,
        ...(process.env.CCA_JOB_ID ? [process.env.CCA_JOB_ID] : []),
      ]),
    ],
  });
  appendEvent(state.directory, 'campaign.qa', {jobId: process.env.CCA_JOB_ID, technical});
  print({runId: state.run.id, technical, reports});
};

export {qaCampaign};
