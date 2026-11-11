import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {requireArg} from '../lib.mjs';
import {writeJsonAtomic} from '../platform/jobs.mjs';
import {hasCurrentQA, evidenceHash, readReports} from './review.mjs';
import {
  args,
  campaignsRoot,
  now,
  readJson,
  print,
  appendEvent,
  loadRun,
  saveRun,
  currentCapabilities,
} from './runtime.mjs';

const inspectCampaign = () => {
  const state = loadRun(requireArg(args, 'run'));
  const reports = fs
    .readdirSync(path.join(state.directory, 'qa'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJson(path.join(state.directory, 'qa', name)));
  print({...state, reports});
};

const exportCampaign = () => {
  const state = loadRun(requireArg(args, 'run'));
  const qa = readReports(state.directory);
  const run = saveRun(state.directory, state.run, {
    status: 'exported',
    jobIds: [
      ...new Set([
        ...state.run.jobIds,
        ...(process.env.CCA_JOB_ID ? [process.env.CCA_JOB_ID] : []),
      ]),
    ],
  });
  const manifest = {
    schemaVersion: 1,
    exportedAt: now(),
    run,
    plan: state.plan,
    assets: state.assets,
    qa,
    publishReady:
      state.run.reviews.publication === 'approved' &&
      state.run.reviews.technical === 'passed' &&
      state.run.reviews.contentClaims === 'approved' &&
      state.run.reviews.visualHuman === 'approved' &&
      state.run.reviews.evidenceHash === evidenceHash(state) &&
      hasCurrentQA(state, qa),
  };
  const target = path.join(state.directory, 'artifacts', 'final', 'export.json');
  writeJsonAtomic(target, manifest);
  appendEvent(state.directory, 'campaign.exported', {jobId: process.env.CCA_JOB_ID, path: target});
  print({runId: state.run.id, path: target, publishReady: manifest.publishReady});
};

const doctor = async () =>
  print({
    ok: true,
    campaignsRoot,
    capabilityFingerprint: await currentCapabilities(),
    tools: {ffprobe: Boolean(spawnSync('ffprobe', ['-version'], {stdio: 'ignore'}).status === 0)},
  });

export {inspectCampaign, exportCampaign, doctor};
