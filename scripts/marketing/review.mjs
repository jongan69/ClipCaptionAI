import fs from 'node:fs';
import path from 'node:path';
import {requireArg} from '../lib.mjs';
import {hashValue} from '../platform/catalog.mjs';
import {writeJsonAtomic} from '../platform/jobs.mjs';
import {artifactMatchesFile} from './generation.mjs';
import {QAReport} from './schemas.mjs';
import {
  args,
  now,
  print,
  readJson,
  loadRun,
  saveRun,
  currentPlanHash,
  appendEvent,
} from './runtime.mjs';

export const readReports = (directory) =>
  fs
    .readdirSync(path.join(directory, 'qa'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => QAReport.parse(readJson(path.join(directory, 'qa', name))));

export const evidenceHash = (state) => hashValue({plan: state.plan, assets: state.assets});

export const hasCurrentQA = (state, reports) =>
  state.run.reviews.technical === 'passed' &&
  state.plan.planHash === currentPlanHash(state.plan) &&
  state.assets.length > 0 &&
  state.assets.every(artifactMatchesFile) &&
  state.plan.variants.every((variant) =>
    reports.some(
      (report) =>
        report.variantId === variant.id &&
        report.technical.status === 'passed' &&
        report.evidenceHash === evidenceHash(state),
    ),
  );

const decision = (flag, fallback) => {
  if (args[flag] === undefined) return fallback;
  if (!['approved', 'rejected'].includes(args[flag]))
    throw new Error(`${flag} must be approved or rejected.`);
  return args[flag];
};

export const reviewCampaign = () => {
  const state = loadRun(requireArg(args, 'run'));
  if (!['content-claims', 'visual-human', 'publication'].some((key) => args[key] !== undefined))
    throw new Error(
      'Provide --content-claims, --visual-human, or --publication approved|rejected.',
    );
  const reviewedBy = requireArg(args, 'reviewer').trim();
  if (!reviewedBy) throw new Error('Reviewer must not be blank.');
  const reports = readReports(state.directory);
  const reviews = {
    ...state.run.reviews,
    contentClaims: decision('content-claims', state.run.reviews.contentClaims),
    visualHuman: decision('visual-human', state.run.reviews.visualHuman),
    publication: decision('publication', state.run.reviews.publication),
    reviewedBy,
    reviewedAt: now(),
    evidenceHash: evidenceHash(state),
  };
  if (
    ['content-claims', 'visual-human', 'publication'].some((flag) => args[flag] === 'approved') &&
    !hasCurrentQA(state, reports)
  )
    throw new Error(
      'CURRENT_QA_REQUIRED: run technical QA on unchanged artifacts before approving.',
    );
  if (reviews.contentClaims !== 'approved' || reviews.visualHuman !== 'approved') {
    if (args.publication === 'approved') throw new Error('CONTENT_AND_VISUAL_REVIEW_REQUIRED');
    if (reviews.publication !== 'rejected') reviews.publication = 'blocked';
  }
  const run = saveRun(state.directory, state.run, {reviews});
  for (const report of reports) {
    writeJsonAtomic(path.join(state.directory, 'qa', `${report.variantId}.json`), {
      ...report,
      contentClaims: {...report.contentClaims, status: reviews.contentClaims},
      visualHuman: {status: reviews.visualHuman},
      publication: {status: reviews.publication},
    });
  }
  appendEvent(state.directory, 'campaign.reviewed', {reviews});
  print({runId: run.id, reviews});
};
