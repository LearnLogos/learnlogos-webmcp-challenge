import 'server-only'

import { randomBytes } from 'node:crypto'
import { createContestMediaStore } from '../adapters/contest/media-store'
import { createContestTrainingSearchAdapter } from '../adapters/contest/training-search'
import { createContestClientIdentityResolver } from '../adapters/contest/client-identity'
import { createContestRedisClient } from '../adapters/contest/redis-client'
import { createRedisContestStateBackend } from '../adapters/contest/redis-state'
import {
  createSharedContestAbuseLimiter,
  createSharedContestSessionStore,
  type ContestSharedStateBackend,
} from '../adapters/contest/shared-state'
import { searchTraining } from '../application/search-training'
import {
  createContestContent,
  contestTrainingFixtures,
  parseContestRights,
} from '../content/contest-content'
import rightsInputs from '../../../../config/webmcp-contest-rights.private.json'
import { createContestMediaHandler } from '../http/contest-media'
import { createContestSearchHandler } from '../http/contest-search'
import { createPlaybackGrantService } from '../media/playback-grant'
import { createContestContentPolicy } from '../policy/contest-content-policy'
import type { ContestAbuseLimiter } from '../ports/contest-abuse'
import type { AsyncContestSessionStore } from '../ports/contest-session'
import { resolveContestStateConfig } from '../runtime/contest-state-config'
import { resolveContestMediaConfig } from '../runtime/contest-media-config'
import { resolveWebMcpRuntime } from '../runtime/config'

type RuntimeEnvironment = Record<string, string | undefined>

interface ContestServiceOverrides {
  backend?: ContestSharedStateBackend
  idFactory?: () => string
  now?: () => number
}

function unavailableState(): { sessions: AsyncContestSessionStore; abuseLimiter: ContestAbuseLimiter } {
  const fail = async (): Promise<never> => { throw new Error('Contest state is unavailable') }
  return {
    sessions: { open: fail, resume: fail, authorizeSearch: fail },
    abuseLimiter: { authorizeSearch: fail },
  }
}

function sharedState(env: RuntimeEnvironment, overrides: ContestServiceOverrides) {
  const config = resolveContestStateConfig(env)
  const now = overrides.now ?? (() => Date.now())
  const backend = overrides.backend ?? createRedisContestStateBackend(
    createContestRedisClient(config.redisUrl),
    config.namespace,
  )
  const sessions = createSharedContestSessionStore({
    backend,
    now,
    idFactory: overrides.idFactory ?? (() => randomBytes(32).toString('base64url')),
    ttlMs: config.sessionTtlMs,
    maxSessions: config.maxSessions,
    searchLimit: config.sessionSearchLimit,
    searchWindowMs: config.sessionSearchWindowMs,
  })
  const abuseLimiter = createSharedContestAbuseLimiter({
    backend,
    now,
    clientLimit: config.clientSearchLimit,
    globalLimit: config.globalSearchLimit,
    windowMs: config.globalSearchWindowMs,
  })
  const clientIdentity = createContestClientIdentityResolver(
    config.clientIpHeader,
    config.clientHashSecret,
  )
  return { sessions, abuseLimiter, clientIdentity }
}

// Pending or incomplete three-file bundles are removed before either adapter sees them.
const contestContent = createContestContent(contestTrainingFixtures, parseContestRights(rightsInputs))
const searchPort = createContestTrainingSearchAdapter(contestContent.candidates)
const contentPolicy = createContestContentPolicy(contestContent.rights)

function unavailablePlayback() {
  return {
    grants: { verify: () => null },
    store: { serve: async () => null, serveCaptions: async () => null },
    issuePlayback: undefined,
  }
}

function playbackState(env: RuntimeEnvironment, runtime: ReturnType<typeof resolveWebMcpRuntime>) {
  if (!runtime.capabilities.publicPreviews) return unavailablePlayback()
  const config = resolveContestMediaConfig(env)
  const grants = createPlaybackGrantService({
    assets: contestContent.mediaAssets.map(({ segmentId, version }) => ({ segmentId, version })),
    secret: config.grantSecret,
    ttlMs: config.grantTtlMs,
    now: () => Date.now(),
  })
  return {
    grants,
    store: createContestMediaStore({ root: config.mediaRoot, assets: contestContent.mediaAssets }),
    issuePlayback(segmentId: string, sessionId: string) {
      const issued = grants.issue(segmentId, sessionId)
      return {
        url: `/api/webmcp/contest/media/${segmentId}?grant=${issued.token}`,
        captionsUrl: `/api/webmcp/contest/captions/${segmentId}?grant=${issued.token}`,
        expiresAt: issued.expiresAt,
      }
    },
  }
}

export function createContestSearchServices(
  env: RuntimeEnvironment,
  overrides: ContestServiceOverrides = {},
) {
  const runtime = resolveWebMcpRuntime(env)
  const state = runtime.deployment === 'contest'
    ? sharedState(env, overrides)
    : { ...unavailableState(), clientIdentity: () => null }
  const playback = playbackState(env, runtime)
  return createContestSearchHandler({
    runtime,
    ...state,
    search: (input) => searchTraining(input, { searchPort, contentPolicy }),
    issuePlayback: playback.issuePlayback,
  })
}

export function createContestMediaServices(
  env: RuntimeEnvironment,
  overrides: ContestServiceOverrides = {},
) {
  const runtime = resolveWebMcpRuntime(env)
  const state = runtime.deployment === 'contest'
    ? sharedState(env, overrides)
    : { ...unavailableState(), clientIdentity: () => null }
  const playback = playbackState(env, runtime)
  return createContestMediaHandler({ runtime, ...state, ...playback })
}

export const contestSearchHandler = createContestSearchServices(process.env)
export const contestMediaHandler = createContestMediaServices(process.env)
