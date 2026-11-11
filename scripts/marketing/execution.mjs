import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectRoot, requireArg} from '../lib.mjs';
import {writeJsonAtomic} from '../platform/jobs.mjs';
import {copyAsset} from './assets.mjs';
import {renderVariant, renderCarousel} from './rendering.mjs';
import {bindVariantMedia, requireGenerationBindings} from './media.mjs';
import {generationKey, generationAssetsReady, parseSubmissionResult} from './generation.mjs';
import {
  args,
  now,
  print,
  appendEvent,
  loadRun,
  saveRun,
  requireCurrentApproval,
} from './runtime.mjs';

const executeGeneration = ({
  state,
  variant,
  intent,
  live,
  providerJobs,
  spentCredits,
  spentKeys,
  assets,
}) => {
  if (!live) return;
  if (intent.argv.length === 0)
    throw new Error('Generation intents require discovered Higgsfield argv.');
  if (intent.estimateArgv.length === 0)
    throw new Error('Live generation intents require installed-CLI cost argv.');
  const key = generationKey(intent, state.plan.capabilityFingerprint);
  const approvedCredits = state.run.estimates[key];
  if (!Number.isFinite(approvedCredits)) throw new Error('APPROVED_ESTIMATE_REQUIRED');
  if (!providerJobs[key]) {
    if (intent.output && fs.existsSync(intent.output))
      throw new Error(
        `GENERATION_OUTPUT_EXISTS: choose a new output path before submission: ${intent.output}`,
      );
    // Persist before crossing the paid boundary. An ambiguous response must
    // never turn a resume into a duplicate submission.
    providerJobs[key] = {status: 'submission-uncertain', attemptedAt: now()};
    saveRun(state.directory, state.run, {status: 'awaiting-assets', providerJobs});
    const result = spawnSync(
      process.execPath,
      [
        path.join(projectRoot, 'scripts', 'higgsfield-cli.mjs'),
        'submit',
        '--approval-file',
        path.join(state.directory, 'run.json'),
        '--plan-hash',
        state.plan.planHash,
        '--capability-fingerprint',
        state.plan.capabilityFingerprint,
        '--intent-key',
        key,
        '--estimated-credits',
        String(approvedCredits),
        '--total-spent-credits',
        String(spentCredits()),
        '--live-execution',
        ...intent.argv,
      ],
      {cwd: projectRoot, encoding: 'utf8', shell: false},
    );
    if (result.error || result.status !== 0)
      throw new Error(`Higgsfield submission failed: ${result.stderr || result.error?.message}`);
    providerJobs[key] = parseSubmissionResult(result.stdout);
    saveRun(state.directory, state.run, {
      status: 'awaiting-assets',
      providerJobs,
    });
    appendEvent(state.directory, 'generation.submitted', {
      jobId: process.env.CCA_JOB_ID,
      idempotencyKey: key,
      providerJob: providerJobs[key],
    });
  }
  spentKeys.add(key);
  const existing = assets.findLast(
    (asset) =>
      asset.type === 'generated' &&
      asset.provenance.variantId === variant.id &&
      asset.provenance.generationKey === key,
  );
  if (existing) {
    if (
      !generationAssetsReady(
        {...variant, intents: [intent]},
        [existing],
        state.plan.capabilityFingerprint,
      )
    )
      throw new Error(`ARTIFACT_HASH_MISMATCH: ${existing.path}`);
    return;
  }
  const generatedPath = intent.output || providerJobs[key].output || providerJobs[key].result_path;
  if (generatedPath && fs.existsSync(generatedPath)) {
    assets.push(
      copyAsset(state, variant, intent, generatedPath, 'generated', {
        adapterVersion: '2',
        generationKey: key,
        providerJob: providerJobs[key],
      }),
    );
  }
};

const executeCapture = ({state, variant, intent, assets}) => {
  if (!intent.flow) throw new Error('Capture intents require a flow id.');
  const result = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, 'scripts', 'capture-cli.mjs'),
      'run',
      '--plan',
      path.join(state.directory, 'plan.json'),
      '--flow',
      intent.flow,
      ...(intent.provider ? ['--profile', intent.provider] : []),
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      shell: false,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(`Capture flow failed: ${result.stderr || result.error?.message}`);
  const record = JSON.parse(result.stdout);
  for (const artifact of record.artifacts) {
    assets.push(
      copyAsset(state, variant, intent, artifact.path, 'source', {
        adapter: 'capture',
        repositoryCommit: record.repositoryCommit,
        flowHash: record.flowHash,
        seedVersion: record.seedVersion,
        platformProfile: record.platformProfile,
        capturedAt: record.capturedAt,
      }),
    );
  }
};

const executeMockup = ({state, variant, intent, assets}) => {
  if (intent.argv.length === 0) throw new Error('Mockup intents require Rotato render argv.');
  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, 'scripts', 'rotato-cli.mjs'), 'render', ...intent.argv, '--json'],
    {cwd: projectRoot, encoding: 'utf8', shell: false},
  );
  if (result.error || result.status !== 0)
    throw new Error(`Rotato render failed: ${result.stderr || result.error?.message}`);
  const rendered = JSON.parse(result.stdout.trim().split('\n').at(-1));
  if (!rendered.artifact?.path) throw new Error('Rotato render did not return an artifact.');
  assets.push(
    copyAsset(state, variant, intent, rendered.artifact.path, 'mockups', {
      templateValidated: rendered.artifact.templateValidated,
      inspectFingerprint: rendered.artifact.inspectFingerprint,
    }),
  );
};

const executeCampaign = async () => {
  const state = loadRun(requireArg(args, 'run'));
  await requireCurrentApproval(state);
  if (process.argv.includes('--dry-run')) {
    print({runId: state.run.id, dryRun: true, live: false, status: state.run.status, finals: []});
    return;
  }
  const live = args['live-execution'] === true;
  const generated = state.plan.variants.flatMap((variant) =>
    variant.intents.filter((intent) => intent.type === 'generation'),
  );
  if (live && generated.length === 0)
    throw new Error('No paid generation intents exist in this plan.');
  for (const variant of state.plan.variants) requireGenerationBindings(variant);
  const assets = state.assets.filter((asset) => asset.type !== 'final');
  writeJsonAtomic(path.join(state.directory, 'assets', 'index.json'), assets);
  state.run = saveRun(state.directory, state.run, {
    reviews: {
      technical: 'pending',
      contentClaims: 'pending',
      visualHuman: 'pending',
      publication: 'blocked',
    },
  });
  for (const file of fs.readdirSync(path.join(state.directory, 'qa'))) {
    if (file.endsWith('.json')) fs.rmSync(path.join(state.directory, 'qa', file));
  }
  const providerJobs = {...state.run.providerJobs};
  let awaitingAssets = false;
  const spentKeys = new Set(Object.keys(providerJobs));
  const spentCredits = () =>
    [...spentKeys].reduce((sum, key) => sum + (state.run.estimates[key] ?? 0), 0);
  for (const variant of state.plan.variants) {
    for (const intent of variant.intents) {
      if (intent.type === 'generation') {
        executeGeneration({
          state,
          variant,
          intent,
          live,
          providerJobs,
          spentCredits,
          spentKeys,
          assets,
        });
        continue;
      }
      if (intent.type === 'capture') {
        executeCapture({state, variant, intent, assets});
        continue;
      }
      if (intent.type === 'mockup') {
        executeMockup({state, variant, intent, assets});
        continue;
      }
      if (
        intent.source &&
        !variant.intents.some(
          (candidate) => candidate.type === 'generation' && candidate.output === intent.source,
        )
      ) {
        assets.push(
          copyAsset(state, variant, intent, intent.source, 'source', intent.provenance || {}),
        );
      }
    }
    if (!generationAssetsReady(variant, assets, state.plan.capabilityFingerprint)) {
      awaitingAssets = true;
      continue;
    }
    const boundVariant = bindVariantMedia(state, variant, assets);
    assets.push(
      ...(variant.format === 'carousel'
        ? renderCarousel(state, boundVariant)
        : [renderVariant(state, boundVariant)]),
    );
  }
  writeJsonAtomic(path.join(state.directory, 'assets', 'index.json'), [
    ...new Map(assets.map((asset) => [asset.id, asset])).values(),
  ]);
  const run = saveRun(state.directory, state.run, {
    status: awaitingAssets ? 'awaiting-assets' : 'executed',
    providerJobs,
    jobIds: [
      ...new Set([
        ...state.run.jobIds,
        ...(process.env.CCA_JOB_ID ? [process.env.CCA_JOB_ID] : []),
      ]),
    ],
  });
  appendEvent(state.directory, 'campaign.executed', {
    jobId: process.env.CCA_JOB_ID,
    live,
    assetCount: assets.length,
  });
  print({
    runId: run.id,
    status: run.status,
    live,
    assets: assets.length,
    finals: assets.filter((asset) => asset.type === 'final').map((asset) => asset.path),
  });
};

export {executeCampaign};
