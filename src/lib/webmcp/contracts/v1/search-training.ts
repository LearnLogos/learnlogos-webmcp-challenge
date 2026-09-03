import { z } from 'zod'
import { trainingSourceProvenanceSchema } from '../../ports/training-search'

export const searchTrainingInputSchema = z.object({
  question: z.string().trim().min(1).max(500),
  logosVersion: z.string().trim().min(1).max(50).optional(),
  ownedOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(10).default(5),
}).strict()

export type SearchTrainingInput = z.input<typeof searchTrainingInputSchema>

export const searchTrainingResultSchema = z.object({
  segmentId: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(500),
  source: trainingSourceProvenanceSchema,
  logosVersion: z.string().trim().min(1).max(50).nullable(),
  access: z.enum(['owned', 'free']),
  relevance: z.number().min(0).max(1),
  whyMatched: z.string().trim().min(1).max(300),
  contentClassification: z.literal('public-contest'),
  playback: z.object({
    url: z.string().regex(
      /^\/api\/webmcp\/contest\/media\/[A-Za-z0-9_-]{8,128}\?grant=[A-Za-z0-9_-]{20,2048}\.[A-Za-z0-9_-]{43}$/,
    ),
    captionsUrl: z.string().regex(
      /^\/api\/webmcp\/contest\/captions\/[A-Za-z0-9_-]{8,128}\?grant=[A-Za-z0-9_-]{20,2048}\.[A-Za-z0-9_-]{43}$/,
    ),
    expiresAt: z.number().int().positive(),
  }).strict().optional(),
}).strict()

export const searchTrainingResponseSchema = z.object({
  query: z.string().trim().min(1).max(500),
  results: z.array(searchTrainingResultSchema).max(10),
  total: z.number().int().min(0).max(10),
}).strict()

export type SearchTrainingResponse = z.infer<typeof searchTrainingResponseSchema>

export const SEARCH_TRAINING_TOOL = {
  name: 'learnlogos.search_training.v1',
  title: 'Search LearnLogos training',
  description: 'Find relevant LearnLogos teaching segments for a user question.',
  inputSchema: z.toJSONSchema(searchTrainingInputSchema),
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
} as const
