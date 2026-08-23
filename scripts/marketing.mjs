#!/usr/bin/env bun
import {execFileSync, spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';

import {commandPath} from './command-utils.mjs';
import {
  ensureDir,
  loadEnv,
  parseArgs,
  projectRoot,
  publicMediaRoot,
  requireArg,
  videoToSrc,
} from './lib.mjs';
import {hashValue, serializeCatalog} from './platform/catalog.mjs';
import {writeJsonAtomic} from './platform/jobs.mjs';
import {
  AssetRecord,
  CampaignBrief,
  CampaignRun,
  CreativePlan,
  ProductManifest,
  QAReport,
} from './marketing/schemas.mjs';

const action = process.argv[2];
const args = parseArgs(process.argv.slice(3));
loadEnv();
const campaignsRoot = path.resolve(
  process.env.CCA_CAMPAIGNS_ROOT || path.join(projectRoot, 'campaigns'),
);
const now = () => new Date().toISOString();
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const fileHash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const print = (value) => console.log(JSON.stringify(value));
const appendEvent = (directory, type, data = {}) =>
  fs.appendFileSync(
    path.join(directory, 'events.ndjson'),
    `${JSON.stringify({at: now(), type, ...data})}\n`,
  );

const runDirectory = (value) => {
  const requested = path.resolve(String(value));
  if (fs.existsSync(requested) && fs.statSync(requested).isDirectory()) return requested;
  const byId = path.join(campaignsRoot, String(value));
  if (fs.existsSync(byId)) return byId;
  throw new Error(`Campaign run not found: ${value}`);
};

const loadRun = (value) => {
  const directory = runDirectory(value);
  return {
    directory,
    plan: CreativePlan.parse(readJson(path.join(directory, 'plan.json'))),
    run: CampaignRun.parse(readJson(path.join(directory, 'run.json'))),
    assets: zAssets(readJson(path.join(directory, 'assets', 'index.json'))),
  };
};

const zAssets = (value) => {
  if (!Array.isArray(value)) throw new Error('assets/index.json must contain an array.');
  return value.map((entry) => AssetRecord.parse(entry));
};

const saveRun = (directory, run, patch = {}) => {
  const next = CampaignRun.parse({...run, ...patch, updatedAt: now()});
  writeJsonAtomic(path.join(directory, 'run.json'), next);
  return next;
};

const currentCapabilities = async () => {
  const catalog = await serializeCatalog();
  const tools = [
    {
      name: 'rotato',
      executable:
        commandPath('rotato') ||
        (fs.existsSync('/usr/local/bin/rotato') ? '/usr/local/bin/rotato' : null),
    },
    {
      name: 'higgsfield',
      executable:
        process.env.CCA_HIGGSFIELD_BIN ||
        commandPath('higgsfield') ||
        commandPath('higgs') ||
        [
          path.join(projectRoot, 'node_modules', '.bin', 'higgs'),
          path.join(projectRoot, 'node_modules', '.bin', 'higgsfield'),
          path.join(projectRoot, 'bin', 'higgsfield'),
        ].find((candidate) => fs.existsSync(candidate)),
    },
  ];
  const toolHelp = tools.map(({name, executable}) => {
    if (!executable) return {name, available: false};
    const result = spawnSync(executable, ['--help'], {encoding: 'utf8', shell: false});
    return {
      name,
      available: result.status === 0,
      fingerprint: result.status === 0 ? hashValue(result.stdout) : null,
    };
  });
  return hashValue({
    adapters: catalog.map(({id, version, capabilityFingerprint}) => ({
      id,
      version,
      capabilityFingerprint,
    })),
    toolHelp,
  });
};

const currentPlanHash = (plan) => hashValue({...plan, planHash: ''});

const requireCurrentApproval = async ({plan, run}) => {
  const capabilityFingerprint = await currentCapabilities();
  const planHash = currentPlanHash(plan);
  if (planHash !== plan.planHash || run.planHash !== planHash)
    throw new Error('PLAN_HASH_MISMATCH');
  if (
    capabilityFingerprint !== plan.capabilityFingerprint ||
    run.capabilityFingerprint !== capabilityFingerprint
  )
    throw new Error('CAPABILITY_FINGERPRINT_CHANGED');
  if (
    !run.approval ||
    run.approval.planHash !== planHash ||
    run.approval.capabilityFingerprint !== capabilityFingerprint ||
    run.approval.estimateHash !== hashValue(run.estimates)
  )
    throw new Error('APPROVAL_REQUIRED');
  if ((run.estimateCredits ?? 0) > run.approval.budgetCredits) throw new Error('BUDGET_EXCEEDED');
};

const resolveProduct = (campaignPath, value) => {
  if (typeof value !== 'string') return ProductManifest.parse(value);
  const file = path.resolve(path.dirname(campaignPath), value);
  return ProductManifest.parse(
    yaml.load(fs.readFileSync(file, 'utf8'), {schema: yaml.YAML11_SCHEMA}),
  );
};

const expandSlides = (variant) => {
  if (variant.slides.length === 0) return variant;
  let startSeconds = 0;
  const timeline = [];
  const intents = [...variant.intents];
  for (const slide of variant.slides) {
    timeline.push(
      {
        type: 'image',
        startSeconds,
        durationSeconds: slide.durationSeconds,
        src: slide.src,
        motion: slide.motion,
        fit: slide.fit,
        transition: 'fade',
      },
      {
        type: 'slide-text',
        startSeconds,
        durationSeconds: slide.durationSeconds,
        eyebrow: slide.eyebrow,
        headline: slide.headline,
        body: slide.body,
        textPosition: slide.textPosition,
        transition: 'fade',
      },
    );
    intents.push({
      type: 'source',
      source: slide.src,
      provenance: {
        sourceType: slide.sourceType,
        ...(slide.attribution || {}),
      },
    });
    startSeconds += slide.durationSeconds;
  }
  if (variant.format === 'carousel')
    return {...variant, durationSeconds: startSeconds, timeline: [], intents};
  timeline.push({
    type: 'end-card',
    startSeconds,
    durationSeconds: variant.endCardDurationSeconds,
    text: variant.cta,
    transition: 'fade',
  });
  return {
    ...variant,
    durationSeconds: startSeconds + variant.endCardDurationSeconds,
    slides: [],
    timeline,
    intents,
  };
};

const planCampaign = async () => {
  const campaignPath = path.resolve(requireArg(args, 'campaign'));
  const campaign = CampaignBrief.parse(
    yaml.load(fs.readFileSync(campaignPath, 'utf8'), {schema: yaml.YAML11_SCHEMA}),
  );
  const variants = CampaignBrief.parse({
    ...campaign,
    variants: campaign.variants.map(expandSlides),
  }).variants;
  const product = resolveProduct(campaignPath, campaign.product);
  const runId = String(args['run-id'] || `${campaign.id}-${Date.now().toString(36)}`);
  if (!/^[a-zA-Z0-9._-]+$/.test(runId))
    throw new Error('Run id may only contain letters, numbers, dots, underscores, and hyphens.');
  const directory = path.join(campaignsRoot, runId);
  if (fs.existsSync(directory)) throw new Error(`Campaign run already exists: ${directory}`);
  for (const child of [
    'assets',
    'artifacts/source',
    'artifacts/generated',
    'artifacts/mockups',
    'artifacts/previews',
    'artifacts/final',
    'qa',
  ])
    ensureDir(path.join(directory, child));
  fs.copyFileSync(campaignPath, path.join(directory, 'campaign.yaml'));
  const createdAt = now();
  const capabilityFingerprint = await currentCapabilities();
  const draft = {
    schemaVersion: 1,
    runId,
    campaignId: campaign.id,
    createdAt,
    planHash: '',
    capabilityFingerprint,
    product,
    approvedClaims: [...new Set([...product.approvedClaims, ...campaign.approvedClaims])],
    variants: variants.map((variant) => {
      return {
        ...variant,
        music: variant.music ? path.resolve(path.dirname(campaignPath), variant.music) : undefined,
        voice: variant.voice ? path.resolve(path.dirname(campaignPath), variant.voice) : undefined,
        slides: variant.slides.map((slide) => ({
          ...slide,
          src: path.resolve(path.dirname(campaignPath), slide.src),
        })),
        timeline: variant.timeline.map((entry) => ({
          ...entry,
          src: entry.src ? path.resolve(path.dirname(campaignPath), entry.src) : undefined,
        })),
        intents: variant.intents.map((intent) => ({
          ...intent,
          source: intent.source
            ? path.resolve(path.dirname(campaignPath), intent.source)
            : undefined,
          output: intent.output
            ? path.resolve(path.dirname(campaignPath), intent.output)
            : undefined,
        })),
      };
    }),
  };
  const creativePlan = CreativePlan.parse({...draft, planHash: hashValue(draft)});
  const run = CampaignRun.parse({
    schemaVersion: 1,
    id: runId,
    status: 'planned',
    planHash: creativePlan.planHash,
    capabilityFingerprint,
    createdAt,
    updatedAt: createdAt,
    jobIds: process.env.CCA_JOB_ID ? [process.env.CCA_JOB_ID] : [],
    reviews: {
      technical: 'pending',
      contentClaims: 'pending',
      visualHuman: 'pending',
      publication: 'blocked',
    },
  });
  writeJsonAtomic(path.join(directory, 'plan.json'), creativePlan);
  writeJsonAtomic(path.join(directory, 'run.json'), run);
  writeJsonAtomic(path.join(directory, 'assets', 'index.json'), []);
  fs.writeFileSync(path.join(directory, 'events.ndjson'), '');
  appendEvent(directory, 'campaign.planned', {
    jobId: process.env.CCA_JOB_ID,
    planHash: creativePlan.planHash,
  });
  print({runId, directory, planHash: creativePlan.planHash});
};

const estimateCampaign = async () => {
  const state = loadRun(requireArg(args, 'run'));
  const estimates = {};
  for (const variant of state.plan.variants)
    for (const intent of variant.intents) {
      const key = hashValue({
        intent,
        adapterVersion: '1',
        capabilityFingerprint: state.plan.capabilityFingerprint,
      });
      let credits = intent.estimateCredits;
      if (intent.type === 'generation' && intent.estimateArgv.length > 0) {
        const result = spawnSync(
          process.execPath,
          [
            path.join(projectRoot, 'scripts', 'higgsfield-cli.mjs'),
            'estimate',
            ...intent.estimateArgv,
          ],
          {cwd: projectRoot, encoding: 'utf8', shell: false},
        );
        if (result.error || result.status !== 0)
          throw new Error(`Higgsfield estimate failed: ${result.stderr || result.error?.message}`);
        const estimated = JSON.parse(result.stdout.trim().split('\n').at(-1));
        credits = Number(estimated.credits);
        if (!Number.isFinite(credits) || credits < 0)
          throw new Error('Higgsfield estimate did not return non-negative credits.');
      }
      estimates[key] = credits;
    }
  const estimateCredits = Object.values(estimates).reduce((sum, credits) => sum + credits, 0);
  const run = saveRun(state.directory, state.run, {
    status: 'estimated',
    estimateCredits,
    estimates,
    jobIds: [
      ...new Set([
        ...state.run.jobIds,
        ...(process.env.CCA_JOB_ID ? [process.env.CCA_JOB_ID] : []),
      ]),
    ],
  });
  appendEvent(state.directory, 'campaign.estimated', {
    jobId: process.env.CCA_JOB_ID,
    estimateCredits,
  });
  print({runId: run.id, estimateCredits});
};

const approveCampaign = async () => {
  const state = loadRun(requireArg(args, 'run'));
  if (state.run.estimateCredits === undefined) throw new Error('ESTIMATE_REQUIRED');
  const budgetCredits = Number(requireArg(args, 'budget-credits'));
  if (!Number.isFinite(budgetCredits) || budgetCredits < 0)
    throw new Error('Budget credits must be a non-negative number.');
  await requireCurrentApproval({
    ...state,
    run: {
      ...state.run,
      approval: {
        planHash: state.plan.planHash,
        capabilityFingerprint: state.plan.capabilityFingerprint,
        estimateHash: hashValue(state.run.estimates),
        budgetCredits,
        approvedAt: now(),
      },
    },
  });
  const run = saveRun(state.directory, state.run, {
    status: 'approved',
    approval: {
      planHash: state.plan.planHash,
      capabilityFingerprint: state.plan.capabilityFingerprint,
      estimateHash: hashValue(state.run.estimates),
      budgetCredits,
      approvedAt: now(),
    },
  });
  appendEvent(state.directory, 'campaign.approved', {budgetCredits});
  print(run);
};

const copyAsset = (state, variant, intent, source, type, extra = {}) => {
  if (!fs.existsSync(source)) throw new Error(`Asset source not found: ${source}`);
  const hash = fileHash(source);
  const extension = path.extname(source);
  const target = path.join(
    state.directory,
    'artifacts',
    type,
    `${variant.id}${extra.slideIndex ? `-slide-${String(extra.slideIndex).padStart(2, '0')}` : ''}-${hash.slice(0, 12)}${extension}`,
  );
  if (!fs.existsSync(target)) fs.copyFileSync(source, target);
  const adapter =
    type === 'source'
      ? 'filesystem'
      : type === 'mockups'
        ? 'rotato'
        : type === 'generated'
          ? 'higgsfield'
          : 'capture';
  const adapterVersion = extra.adapterVersion || '1';
  const idempotencyKey = hashValue({
    intent,
    inputHashes: [hash],
    adapterVersion,
    provider: intent.provider,
    model: intent.model,
    capabilityFingerprint: state.plan.capabilityFingerprint,
  });
  const mediaResult = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', target],
    {encoding: 'utf8', shell: false},
  );
  return AssetRecord.parse({
    id: `${variant.id}-${idempotencyKey.slice(0, 12)}`,
    type,
    path: target,
    hash: fileHash(target),
    createdAt: now(),
    provenance: {
      variantId: variant.id,
      idempotencyKey,
      adapter,
      adapterVersion,
      timelineHash: hashValue(variant.timeline),
      ...extra,
    },
    media: mediaResult.status === 0 ? JSON.parse(mediaResult.stdout) : undefined,
  });
};

const renderVariant = (state, variant) => {
  const propsPath = path.join(state.directory, 'artifacts', 'previews', `${variant.id}-props.json`);
  const renderPath = path.join(state.directory, 'artifacts', 'previews', `${variant.id}.mp4`);
  const normalizedPath = path.join(
    state.directory,
    'artifacts',
    'previews',
    `${variant.id}-normalized.mp4`,
  );
  const props = {
    width: variant.width,
    height: variant.height,
    fps: variant.fps,
    durationSeconds: variant.durationSeconds,
    timeline: variant.timeline.map((entry) => ({
      ...entry,
      src: entry.src ? videoToSrc(entry.src) : undefined,
    })),
    captions: variant.captions,
    voice: variant.voice ? videoToSrc(variant.voice) : undefined,
    music: variant.music ? videoToSrc(variant.music) : undefined,
    musicVolume: variant.musicVolume,
    theme: variant.theme,
  };
  writeJsonAtomic(propsPath, props);
  const result = spawnSync(
    'bunx',
    [
      'remotion',
      'render',
      path.join(projectRoot, 'src', 'index.tsx'),
      'MarketingTimeline',
      renderPath,
      `--props=${propsPath}`,
      '--codec=h264',
      '--concurrency=1',
      `--public-dir=${path.dirname(publicMediaRoot)}`,
      '--overwrite',
    ],
    {cwd: projectRoot, encoding: 'utf8', shell: false},
  );
  if (result.error || result.status !== 0)
    throw new Error(`Marketing render failed: ${result.stderr || result.error?.message}`);
  const audioTargetLufs = variant.audioTargetLufs ?? -16;
  const normalized = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      renderPath,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      'copy',
      '-af',
      `loudnorm=I=${audioTargetLufs}:TP=-1.5:LRA=11`,
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      normalizedPath,
    ],
    {cwd: projectRoot, encoding: 'utf8', shell: false},
  );
  if (normalized.error || normalized.status !== 0)
    throw new Error(
      `Marketing audio normalization failed: ${normalized.stderr || normalized.error?.message}`,
    );
  const asset = copyAsset(
    state,
    variant,
    {type: 'source', source: normalizedPath},
    normalizedPath,
    'final',
    {
      adapter: 'remotion',
      adapterVersion: '3',
      composition: 'MarketingTimeline',
      propsPath,
      audioNormalization: 'ffmpeg-loudnorm',
      audioTargetLufs,
    },
  );
  fs.rmSync(renderPath, {force: true});
  fs.rmSync(normalizedPath, {force: true});
  return asset;
};

const renderCarousel = (state, variant) =>
  variant.slides.map((slide, index) => {
    const number = index + 1;
    const basename = `${variant.id}-slide-${String(number).padStart(2, '0')}`;
    const propsPath = path.join(state.directory, 'artifacts', 'previews', `${basename}-props.json`);
    const renderPath = path.join(state.directory, 'artifacts', 'previews', `${basename}.png`);
    writeJsonAtomic(propsPath, {
      width: variant.width,
      height: variant.height,
      fps: variant.fps,
      durationSeconds: 1,
      timeline: [
        {
          type: 'image',
          startSeconds: 0,
          durationSeconds: 1,
          src: videoToSrc(slide.src),
          fit: slide.fit,
          transition: 'cut',
        },
        {
          type: 'slide-text',
          startSeconds: 0,
          durationSeconds: 1,
          eyebrow: slide.eyebrow,
          headline: slide.headline,
          body: slide.body,
          textPosition: slide.textPosition,
          transition: 'cut',
        },
      ],
      captions: [],
      theme: variant.theme,
    });
    const result = spawnSync(
      'bunx',
      [
        'remotion',
        'still',
        path.join(projectRoot, 'src', 'index.tsx'),
        'MarketingTimeline',
        renderPath,
        `--props=${propsPath}`,
        '--frame=0',
        '--image-format=png',
        `--public-dir=${path.dirname(publicMediaRoot)}`,
        '--overwrite',
      ],
      {cwd: projectRoot, encoding: 'utf8', shell: false},
    );
    if (result.error || result.status !== 0)
      throw new Error(
        `Marketing carousel render failed: ${result.stderr || result.error?.message}`,
      );
    const asset = copyAsset(
      state,
      variant,
      {type: 'source', source: renderPath, slideIndex: number},
      renderPath,
      'final',
      {
        adapter: 'remotion',
        adapterVersion: '3',
        composition: 'MarketingTimeline',
        outputFormat: 'carousel',
        slideIndex: number,
        propsPath,
      },
    );
    fs.rmSync(renderPath, {force: true});
    return asset;
  });

const executeCampaign = async () => {
  const state = loadRun(requireArg(args, 'run'));
  await requireCurrentApproval(state);
  const live = args['live-execution'] === true;
  const generated = state.plan.variants.flatMap((variant) =>
    variant.intents.filter((intent) => intent.type === 'generation'),
  );
  if (live && generated.length === 0)
    throw new Error('No paid generation intents exist in this plan.');
  const assets = [...state.assets];
  const providerJobs = {...state.run.providerJobs};
  const completedProviderKeys = new Set();
  const spentKeys = new Set(Object.keys(providerJobs));
  const spentCredits = () =>
    [...spentKeys].reduce((sum, key) => sum + (state.run.estimates[key] ?? 0), 0);
  for (const variant of state.plan.variants) {
    for (const intent of variant.intents) {
      if (intent.type === 'generation') {
        if (!live) continue;
        if (intent.argv.length === 0)
          throw new Error('Generation intents require discovered Higgsfield argv.');
        if (intent.estimateArgv.length === 0)
          throw new Error('Live generation intents require installed-CLI cost argv.');
        const key = hashValue({
          intent,
          adapterVersion: '1',
          capabilityFingerprint: state.plan.capabilityFingerprint,
        });
        const approvedCredits = state.run.estimates[key];
        if (!Number.isFinite(approvedCredits)) throw new Error('APPROVED_ESTIMATE_REQUIRED');
        if (!providerJobs[key]) {
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
            throw new Error(
              `Higgsfield submission failed: ${result.stderr || result.error?.message}`,
            );
          const output = result.stdout.trim();
          providerJobs[key] = output ? JSON.parse(output.split('\n').at(-1)) : {submitted: true};
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
        const generatedPath =
          intent.output || providerJobs[key].output || providerJobs[key].result_path;
        if (generatedPath && fs.existsSync(generatedPath)) {
          assets.push(
            copyAsset(state, variant, intent, generatedPath, 'generated', {
              providerJob: providerJobs[key],
            }),
          );
          completedProviderKeys.add(key);
        }
        continue;
      }
      if (intent.type === 'capture') {
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
        continue;
      }
      if (intent.type === 'mockup') {
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
        continue;
      }
      if (intent.source) {
        assets.push(
          copyAsset(state, variant, intent, intent.source, 'source', intent.provenance || {}),
        );
      }
    }
    assets.push(
      ...(variant.format === 'carousel'
        ? renderCarousel(state, variant)
        : [renderVariant(state, variant)]),
    );
  }
  writeJsonAtomic(path.join(state.directory, 'assets', 'index.json'), [
    ...new Map(assets.map((asset) => [asset.id, asset])).values(),
  ]);
  const run = saveRun(state.directory, state.run, {
    status:
      live && Object.keys(providerJobs).some((key) => !completedProviderKeys.has(key))
        ? 'awaiting-assets'
        : live
          ? 'executed'
          : 'dry-run-complete',
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

const inspectCampaign = () => {
  const state = loadRun(requireArg(args, 'run'));
  const reports = fs
    .readdirSync(path.join(state.directory, 'qa'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJson(path.join(state.directory, 'qa', name)));
  print({...state, reports});
};

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
    reviews: {...state.run.reviews, technical},
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

const exportCampaign = () => {
  const state = loadRun(requireArg(args, 'run'));
  const qa = fs
    .readdirSync(path.join(state.directory, 'qa'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJson(path.join(state.directory, 'qa', name)));
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
    publishReady: state.run.reviews.publication === 'approved',
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

const handlers = {
  doctor,
  plan: planCampaign,
  estimate: estimateCampaign,
  approve: approveCampaign,
  execute: executeCampaign,
  inspect: inspectCampaign,
  qa: qaCampaign,
  export: exportCampaign,
};
if (!handlers[action]) throw new Error(`Unknown marketing action: ${action || ''}`);
await handlers[action]();
