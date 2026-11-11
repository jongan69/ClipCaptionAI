import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import * as yaml from 'js-yaml';
import {
  buildHiggsfieldProductionPrompt,
  withHiggsfieldProductionPrompt,
} from '../higgsfield-production.mjs';
import {ensureDir, projectRoot, requireArg} from '../lib.mjs';
import {hashValue} from '../platform/catalog.mjs';
import {writeJsonAtomic} from '../platform/jobs.mjs';
import {CampaignBrief, CampaignRun, CreativePlan, ProductManifest} from './schemas.mjs';
import {generationKey} from './generation.mjs';
import {
  args,
  campaignsRoot,
  now,
  print,
  appendEvent,
  loadRun,
  saveRun,
  currentCapabilities,
  requireCurrentApproval,
} from './runtime.mjs';

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
        intents: variant.intents.map((intent) => {
          const generation = intent.type === 'generation';
          return {
            ...intent,
            prompt:
              generation && intent.prompt
                ? buildHiggsfieldProductionPrompt({
                    ...intent.production,
                    prompt: intent.prompt,
                    durationSeconds: variant.durationSeconds,
                    aspectRatio: `${variant.width}:${variant.height}`,
                  })
                : intent.prompt,
            argv: generation
              ? withHiggsfieldProductionPrompt(intent.argv, intent.production)
              : intent.argv,
            estimateArgv: generation
              ? withHiggsfieldProductionPrompt(intent.estimateArgv, intent.production)
              : intent.estimateArgv,
            source: intent.source
              ? path.resolve(path.dirname(campaignPath), intent.source)
              : undefined,
            output: intent.output
              ? path.resolve(path.dirname(campaignPath), intent.output)
              : undefined,
          };
        }),
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
      const key = generationKey(intent, state.plan.capabilityFingerprint);
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

export {planCampaign, estimateCampaign, approveCampaign};
