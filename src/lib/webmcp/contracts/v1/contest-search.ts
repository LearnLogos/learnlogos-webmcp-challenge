import { z } from 'zod'
import { searchTrainingResponseSchema } from './search-training'
import { contestPersonaSchema } from '../../ports/contest-session'

export const contestSearchEnvelopeSchema = z.object({
  data: searchTrainingResponseSchema,
  persona: contestPersonaSchema,
}).strict()

export type ContestSearchEnvelope = z.infer<typeof contestSearchEnvelopeSchema>
