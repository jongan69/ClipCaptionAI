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
  provenance: z.record(z.string(), z.unknown()).optional(),
});

const attribution = z.object({
  provider: z.string().min(1),
  creator: z.string().min(1),
  creatorUrl: z.string().url().optional(),
  sourceUrl: z.string().url(),
  licenseUrl: z.string().url(),
});

const slide = z
  .object({
    src: z.string().min(1),
    eyebrow: z.string().max(40).optional(),
    headline: z.string().min(1).max(100),
    body: z.string().max(180).optional(),
    durationSeconds: z.number().min(1).max(8).default(2.2),
    motion: z.enum(['push-in', 'pan-left', 'pan-right']).default('push-in'),
    fit: z.enum(['cover', 'contain']).default('cover'),
    textPosition: z.enum(['top', 'center', 'bottom']).default('bottom'),
    sourceType: z.enum(['owned', 'stock', 'generated']).default('owned'),
    attribution: attribution.optional(),
  })
  .superRefine((entry, context) => {
    if (entry.sourceType === 'stock' && !entry.attribution)
      context.addIssue({
        code: 'custom',
        path: ['attribution'],
        message: 'Stock slides require creator, source, and license attribution metadata.',
      });
  });

const timelineEntry = z
  .object({
    type: z.enum(['video', 'image', 'text', 'slide-text', 'end-card']),
    startSeconds: z.number().nonnegative(),
    durationSeconds: z.number().positive(),
    src: z.string().optional(),
    text: z.string().optional(),
    eyebrow: z.string().optional(),
    headline: z.string().optional(),
    body: z.string().optional(),
    transition: z.enum(['cut', 'fade']).default('cut'),
    sourceStartSeconds: z.number().nonnegative().default(0),
    muted: z.boolean().default(false),
    volume: z.number().min(0).max(4).default(1),
    fit: z.enum(['cover', 'contain']).default('cover'),
    motion: z.enum(['none', 'push-in', 'pan-left', 'pan-right']).default('none'),
    textPosition: z.enum(['top', 'center', 'bottom']).default('bottom'),
  })
  .superRefine((entry, context) => {
    if (['video', 'image'].includes(entry.type) && !entry.src)
      context.addIssue({
        code: 'custom',
        path: ['src'],
        message: `${entry.type} entries require src.`,
      });
    if (['text', 'end-card'].includes(entry.type) && !entry.text)
      context.addIssue({
        code: 'custom',
        path: ['text'],
        message: `${entry.type} entries require text.`,
      });
    if (entry.type === 'slide-text' && !entry.headline)
      context.addIssue({
        code: 'custom',
        path: ['headline'],
        message: 'slide-text entries require a headline.',
      });
  });

const variant = z
  .object({
    id: z.string().min(1),
    width: z.number().int().positive().default(1080),
    height: z.number().int().positive().default(1920),
    fps: z.number().positive().default(30),
    format: z.enum(['video', 'carousel']).default('video'),
    durationSeconds: z.number().positive().default(15),
    cta: z.string().min(1),
    intents: z.array(intent).default([]),
    timeline: z.array(timelineEntry).default([]),
    slides: z.array(slide).default([]),
    endCardDurationSeconds: z.number().min(1).max(5).default(1.8),
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
    music: z.string().optional(),
    voice: z.string().optional(),
    musicVolume: z.number().min(0).max(1).default(0.08),
    audioTargetLufs: z.number().min(-24).max(-10).optional(),
    theme: z
      .object({
        backgroundColor: z.string(),
        foregroundColor: z.string(),
        accentColor: z.string(),
      })
      .default({
        backgroundColor: '#080b12',
        foregroundColor: '#ffffff',
        accentColor: '#3b82f6',
      }),
  })
  .superRefine((entry, context) => {
    if (entry.slides.length > 0 && entry.timeline.length > 0)
      context.addIssue({
        code: 'custom',
        path: ['slides'],
        message: 'Use slides or timeline, not both.',
      });
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
  status: z.enum([
    'planned',
    'estimated',
    'approved',
    'awaiting-assets',
    'executed',
    'dry-run-complete',
    'qa-complete',
    'exported',
  ]),
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
    technical: z.enum(['pending', 'passed', 'failed']),
    contentClaims: z.enum(['pending', 'approved', 'rejected']),
    visualHuman: z.enum(['pending', 'approved', 'rejected']),
    publication: z.enum(['blocked', 'approved', 'rejected']),
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
