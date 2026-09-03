import type { ContestAbuseLimiter } from '../../ports/contest-abuse'
import type {
  ContestSearchAuthorization,
  ContestSessionOpenResult,
  ContestSessionSnapshot,
  AsyncContestSessionStore,
} from '../../ports/contest-session'

export interface ContestSharedStateBackend {
  openExisting: (id: string, now: number, ttlMs: number) => Promise<number | null>
  createSession: (id: string, now: number, ttlMs: number, maxSessions: number) => Promise<boolean>
  authorizeSession: (
    id: string,
    now: number,
    limit: number,
    windowMs: number,
  ) => Promise<ContestSearchAuthorization>
  authorizeAbuse: (
    clientIdentity: string,
    now: number,
    clientLimit: number,
    globalLimit: number,
    windowMs: number,
  ) => Promise<ContestSearchAuthorization>
}

interface SharedSessionOptions {
  backend: ContestSharedStateBackend
  idFactory: () => string
  now: () => number
  ttlMs: number
  maxSessions: number
  searchLimit: number
  searchWindowMs: number
}

interface SharedAbuseOptions {
  backend: ContestSharedStateBackend
  now: () => number
  clientLimit: number
  globalLimit: number
  windowMs: number
}

const PERSONA = {
  id: 'webmcp-contest-learner',
  displayName: 'WebMCP Challenge Learner',
  accessBoundary: 'approved-contest-content-only',
} as const

const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{8,128}$/

function validateLimits(values: number[]): void {
  if (values.some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error('Contest shared-state limits must be positive safe integers')
  }
}

function snapshot(searches: number): ContestSessionSnapshot {
  return { persona: PERSONA, activity: { searches } }
}

class SharedContestSessionStore implements AsyncContestSessionStore {
  constructor(private readonly options: SharedSessionOptions) {
    validateLimits([
      options.ttlMs,
      options.maxSessions,
      options.searchLimit,
      options.searchWindowMs,
    ])
  }

  async open(sessionId?: string): Promise<ContestSessionOpenResult> {
    const resumed = await this.resume(sessionId)
    return resumed ?? this.allocate(this.options.now())
  }

  async resume(sessionId?: string): Promise<ContestSessionOpenResult | null> {
    if (!sessionId || !SAFE_IDENTIFIER.test(sessionId)) return null
    const searches = await this.options.backend.openExisting(
      sessionId,
      this.options.now(),
      this.options.ttlMs,
    )
    return searches === null ? null : { sessionId, isNew: false, snapshot: snapshot(searches) }
  }

  authorizeSearch(sessionId: string): Promise<ContestSearchAuthorization> {
    return this.options.backend.authorizeSession(
      sessionId,
      this.options.now(),
      this.options.searchLimit,
      this.options.searchWindowMs,
    )
  }

  private async allocate(now: number): Promise<ContestSessionOpenResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const sessionId = this.options.idFactory()
      if (!SAFE_IDENTIFIER.test(sessionId)) continue
      const created = await this.options.backend.createSession(
        sessionId,
        now,
        this.options.ttlMs,
        this.options.maxSessions,
      )
      if (created) return { sessionId, isNew: true, snapshot: snapshot(0) }
    }
    throw new Error('Unable to allocate a contest session')
  }
}

export function createSharedContestSessionStore(options: SharedSessionOptions): AsyncContestSessionStore {
  return new SharedContestSessionStore(options)
}

export function createSharedContestAbuseLimiter(options: SharedAbuseOptions): ContestAbuseLimiter {
  validateLimits([options.clientLimit, options.globalLimit, options.windowMs])
  return {
    authorizeSearch: (clientIdentity) => options.backend.authorizeAbuse(
      clientIdentity,
      options.now(),
      options.clientLimit,
      options.globalLimit,
      options.windowMs,
    ),
  }
}
