import { z } from 'zod'

export const contestPersonaSchema = z.object({
  id: z.literal('webmcp-contest-learner'),
  displayName: z.literal('WebMCP Challenge Learner'),
  accessBoundary: z.literal('approved-contest-content-only'),
}).strict()

export const contestSessionSnapshotSchema = z.object({
  persona: contestPersonaSchema,
  activity: z.object({ searches: z.number().int().min(0) }).strict(),
}).strict()

export type ContestSessionSnapshot = z.infer<typeof contestSessionSnapshotSchema>

export interface ContestSessionOpenResult {
  sessionId: string
  isNew: boolean
  snapshot: ContestSessionSnapshot
}

export type ContestSearchAuthorization =
  | { allowed: true; retryAfterSeconds: 0 }
  | { allowed: false; retryAfterSeconds: number }

export interface ContestSessionStore {
  open: (sessionId?: string) => ContestSessionOpenResult
  resume: (sessionId?: string) => ContestSessionOpenResult | null
  authorizeSearch: (sessionId: string) => ContestSearchAuthorization
}

export interface AsyncContestSessionStore {
  open: (sessionId?: string) => Promise<ContestSessionOpenResult>
  resume: (sessionId?: string) => Promise<ContestSessionOpenResult | null>
  authorizeSearch: (sessionId: string) => Promise<ContestSearchAuthorization>
}

export type ContestSessionPort = ContestSessionStore | AsyncContestSessionStore
