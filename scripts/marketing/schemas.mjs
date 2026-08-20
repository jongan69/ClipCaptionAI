import {z} from 'zod';

const command = z.object({
  argv: z.array(z.string()).min(1),
  cwd: z.string().optional(),
  outputs: z.array(z.string()).default([]),
});

export const ProductManifest = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  repositoryRoot: z.string().optional(),
  repositoryCommit: z.string().optional(),
  seedVersion: z.string().default('1'),
  approvedClaims: z.array(z.string()).default([]),
  captureFlows: z.record(z.string(), command).default({}),
  platformProfiles: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});

const intent = z.object({
  type: z.enum(['source', 'capture', 'generation', 'mockup']).default('source'),
  source: z.string().optional(),
  flow: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  estimateCredits: z.number().nonnegative().default(0),
  prompt: z.string().optional(),
  template: z.string().optional(),
  argv: z.array(z.string()).default([]),
  estimateArgv: z.array(z.string()).default([]),
  output: z.string().optional(),
});

const timelineEntry = z.object({
  type: z.enum(['video', 'image', 'text', 'end-card']),
  startSeconds: z.number().nonnegative(),
  durationSeconds: z.number().positive(),
  src: z.string().optional(),
  text: z.string().optional(),
  transition: z.enum(['cut', 'fade']).default('cut'),
});

const variant = z.object({
  id: z.string().min(1),
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1920),
  fps: z.number().positive().default(30),
  durationSeconds: z.number().positive().default(15),
  cta: z.string().min(1),
  intents: z.array(intent).default([]),
  timeline: z.array(timelineEntry).default([]),
  captions: z
    .array(
      z.object({
        text: z.string(),
        startSeconds: z.number(),
        endSeconds: z.number(),
        yPercent: z.number().min(0).max(100).default(82),
      }),
    )
    .default([]),
});

export const CampaignBrief = z.object({
  id: z.string().min(1),
  product: z.union([z.string(), ProductManifest]),
  objective: z.string().min(1),
  approvedClaims: z.array(z.string()).default([]),
  variants: z.array(variant).min(1),
});

export const CreativePlan = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  campaignId: z.string(),
  createdAt: z.string(),
  planHash: z.string(),
  capabilityFingerprint: z.string(),
  product: ProductManifest,
  approvedClaims: z.array(z.string()),
  variants: z.array(variant),
});

export const CampaignRun = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  status: z.string(),
  planHash: z.string(),
  capabilityFingerprint: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  jobIds: z.array(z.string()).default([]),
  estimateCredits: z.number().nonnegative().optional(),
  estimates: z.record(z.string(), z.number().nonnegative()).default({}),
  approval: z
    .object({
      planHash: z.string(),
      capabilityFingerprint: z.string(),
      estimateHash: z.string(),
      budgetCredits: z.number().nonnegative(),
      approvedAt: z.string(),
    })
    .optional(),
  providerJobs: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  reviews: z.object({
    technical: z.string(),
    contentClaims: z.string(),
    visualHuman: z.string(),
    publication: z.string(),
  }),
});

export const AssetRecord = z.object({
  id: z.string(),
  type: z.string(),
  path: z.string(),
  hash: z.string(),
  createdAt: z.string(),
  provenance: z.record(z.string(), z.unknown()),
  media: z.record(z.string(), z.unknown()).optional(),
});

export const QAReport = z.object({
  variantId: z.string(),
  createdAt: z.string(),
  technical: z.object({
    status: z.enum(['passed', 'failed']),
    checks: z.array(z.object({name: z.string(), passed: z.boolean(), detail: z.string()})),
  }),
  contentClaims: z.object({status: z.string(), approvedClaims: z.array(z.string())}),
  visualHuman: z.object({status: z.string()}),
  publication: z.object({status: z.string()}),
});
