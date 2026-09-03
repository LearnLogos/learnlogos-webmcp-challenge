import { z } from 'zod'

export const contestContentKindSchema = z.enum([
  'fixture',
  'transcript',
  'caption',
  'video',
  'audio',
  'image',
  'map',
  'book',
])
export type ContestContentKind = z.infer<typeof contestContentKindSchema>

export const contestSurfaceSchema = z.enum(['search', 'playback', 'repository', 'demo'])
export type ContestSurface = z.infer<typeof contestSurfaceSchema>

export const contestRightsRecordSchema = z.object({
  assetId: z.string().trim().min(1).max(128),
  version: z.string().trim().min(1).max(32),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  contentKind: contestContentKindSchema,
  owner: z.string().trim().min(1).max(100),
  rightsBasis: z.string().trim().min(1).max(100),
  evidenceUrl: z.string().url().nullable(),
  evidenceDate: z.iso.date(),
  permittedSurfaces: z.array(contestSurfaceSchema).min(1),
  requiredNotice: z.string().max(500).nullable(),
  containsThirdPartyMaterial: z.boolean(),
  reviewStatus: z.enum(['pending', 'approved', 'denied', 'expired']),
  reviewer: z.string().trim().min(1).max(100).nullable(),
  reviewedAt: z.iso.datetime().nullable(),
}).strict().superRefine((record, context) => {
  if (record.reviewStatus !== 'pending' && (!record.reviewer || !record.reviewedAt)) {
    context.addIssue({
      code: 'custom',
      message: 'Completed rights review requires reviewer and reviewedAt',
    })
  }
})

export type ContestRightsRecord = z.infer<typeof contestRightsRecordSchema>

export const trainingSourceProvenanceSchema = z.object({
  webinarTitle: z.string().trim().min(1).max(200),
  webinarDate: z.iso.date(),
  excerptStartMs: z.number().int().nonnegative(),
  excerptEndMs: z.number().int().positive(),
  citation: z.string().trim().min(1).max(500),
}).strict().superRefine((source, context) => {
  const durationMs = source.excerptEndMs - source.excerptStartMs
  if (durationMs <= 0 || durationMs > 120_000) {
    context.addIssue({
      code: 'custom',
      message: 'Excerpt bounds must define at most two minutes',
      path: ['excerptEndMs'],
    })
  }
})

export type TrainingSourceProvenance = z.infer<typeof trainingSourceProvenanceSchema>

export interface TrainingSearchCandidate {
  assetId: string
  version: string
  sha256: string
  contentKind: ContestContentKind
  title: string
  summary: string
  source: TrainingSourceProvenance
  logosVersion: string | null
  terms: string[]
  access: 'owned' | 'free'
  score: number
}

export interface TrainingSearchQuery {
  question: string
  logosVersion?: string
  candidateLimit: number
}

export interface TrainingSearchPort {
  search: (query: TrainingSearchQuery) => Promise<TrainingSearchCandidate[]>
}
