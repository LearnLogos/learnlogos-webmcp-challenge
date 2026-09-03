import type {
  ContestSearchAuthorization,
  ContestSessionOpenResult,
  ContestSessionSnapshot,
  ContestSessionStore,
} from '../../ports/contest-session'

interface ContestSessionRecord {
  expiresAt: number
  lastTouched: number
  searches: number
  searchWindowStartedAt: number
  searchWindowCount: number
}

interface ContestSessionStoreOptions {
  idFactory: () => string
  now: () => number
  ttlMs: number
  maxSessions: number
  searchLimit: number
  searchWindowMs: number
}

const PERSONA = {
  id: 'webmcp-contest-learner',
  displayName: 'WebMCP Challenge Learner',
  accessBoundary: 'approved-contest-content-only',
} as const

const SAFE_SESSION_IDENTIFIER = /^[A-Za-z0-9_-]{8,128}$/

function validateOptions(options: ContestSessionStoreOptions): void {
  const values = [options.ttlMs, options.maxSessions, options.searchLimit, options.searchWindowMs]
  if (values.some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error('Contest session limits must be positive safe integers')
  }
}

function snapshot(record: ContestSessionRecord): ContestSessionSnapshot {
  return { persona: PERSONA, activity: { searches: record.searches } }
}

class InMemoryContestSessionStore implements ContestSessionStore {
  private readonly sessions = new Map<string, ContestSessionRecord>()
  private touchSequence = 0

  constructor(private readonly options: ContestSessionStoreOptions) {
    validateOptions(options)
  }

  private purgeExpired(now: number): void {
    for (const [id, record] of this.sessions) {
      if (record.expiresAt <= now) this.sessions.delete(id)
    }
  }

  private evictLeastRecentlyUsed(): void {
    let oldest: [string, ContestSessionRecord] | undefined
    for (const entry of this.sessions) {
      if (!oldest || entry[1].lastTouched < oldest[1].lastTouched) oldest = entry
    }
    if (oldest) this.sessions.delete(oldest[0])
  }

  private createRecord(now: number): ContestSessionRecord {
    return {
      expiresAt: now + this.options.ttlMs,
      lastTouched: ++this.touchSequence,
      searches: 0,
      searchWindowStartedAt: now,
      searchWindowCount: 0,
    }
  }

  private createIdentifier(): string {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const identifier = this.options.idFactory()
      if (SAFE_SESSION_IDENTIFIER.test(identifier) && !this.sessions.has(identifier)) return identifier
    }
    throw new Error('Unable to allocate a contest session')
  }

  open(sessionId?: string): ContestSessionOpenResult {
    const resumed = this.resume(sessionId)
    if (resumed) return resumed
    const now = this.options.now()
    if (this.sessions.size >= this.options.maxSessions) this.evictLeastRecentlyUsed()
    const allocatedId = this.createIdentifier()
    const record = this.createRecord(now)
    this.sessions.set(allocatedId, record)
    return { sessionId: allocatedId, isNew: true, snapshot: snapshot(record) }
  }

  resume(sessionId?: string): ContestSessionOpenResult | null {
    const now = this.options.now()
    this.purgeExpired(now)
    if (!sessionId || !SAFE_SESSION_IDENTIFIER.test(sessionId)) return null
    const existing = this.sessions.get(sessionId)
    if (!existing) return null
    existing.lastTouched = ++this.touchSequence
    existing.expiresAt = now + this.options.ttlMs
    return { sessionId, isNew: false, snapshot: snapshot(existing) }
  }

  authorizeSearch(sessionId: string): ContestSearchAuthorization {
    const now = this.options.now()
    const record = this.sessions.get(sessionId)
    if (!record || record.expiresAt <= now) return { allowed: false, retryAfterSeconds: 1 }
    if (now - record.searchWindowStartedAt >= this.options.searchWindowMs) {
      record.searchWindowStartedAt = now
      record.searchWindowCount = 0
    }
    if (record.searchWindowCount >= this.options.searchLimit) {
      const remaining = this.options.searchWindowMs - (now - record.searchWindowStartedAt)
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remaining / 1_000)) }
    }
    record.searchWindowCount += 1
    record.searches += 1
    record.lastTouched = ++this.touchSequence
    return { allowed: true, retryAfterSeconds: 0 }
  }
}

export function createInMemoryContestSessionStore(
  options: ContestSessionStoreOptions,
): ContestSessionStore {
  return new InMemoryContestSessionStore(options)
}
