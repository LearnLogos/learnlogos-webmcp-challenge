import { describe, expect, it } from 'vitest'
import {
  createSharedContestAbuseLimiter,
  createSharedContestSessionStore,
  type ContestSharedStateBackend,
} from './shared-state'

interface RecordState {
  expiresAt: number
  searches: number
  windowStartedAt: number
  windowCount: number
}

class FakeBackend implements ContestSharedStateBackend {
  private readonly sessions = new Map<string, RecordState>()
  private readonly abuseWindows = new Map<string, { startedAt: number; count: number }>()

  async openExisting(id: string, now: number, ttlMs: number) {
    const record = this.sessions.get(id)
    if (!record || record.expiresAt <= now) return null
    record.expiresAt = now + ttlMs
    return record.searches
  }

  async createSession(id: string, now: number, ttlMs: number, maxSessions: number) {
    if (this.sessions.has(id)) return false
    const live = [...this.sessions].filter(([, value]) => value.expiresAt > now)
    this.sessions.clear()
    for (const entry of live.slice(-(maxSessions - 1))) this.sessions.set(...entry)
    this.sessions.set(id, { expiresAt: now + ttlMs, searches: 0, windowStartedAt: now, windowCount: 0 })
    return true
  }

  async authorizeSession(id: string, now: number, limit: number, windowMs: number) {
    const record = this.sessions.get(id)
    if (!record || record.expiresAt <= now) return { allowed: false as const, retryAfterSeconds: 1 }
    if (now - record.windowStartedAt >= windowMs) Object.assign(record, { windowStartedAt: now, windowCount: 0 })
    if (record.windowCount >= limit) {
      return { allowed: false as const, retryAfterSeconds: retryAfter(record.windowStartedAt, now, windowMs) }
    }
    record.windowCount += 1
    record.searches += 1
    return { allowed: true as const, retryAfterSeconds: 0 as const }
  }

  async authorizeAbuse(client: string, now: number, clientLimit: number, globalLimit: number, windowMs: number) {
    const global = this.window('global', now, windowMs)
    const clientWindow = this.window(client, now, windowMs)
    const denied = global.count >= globalLimit ? global : clientWindow.count >= clientLimit ? clientWindow : null
    if (denied) return { allowed: false as const, retryAfterSeconds: retryAfter(denied.startedAt, now, windowMs) }
    global.count += 1
    clientWindow.count += 1
    return { allowed: true as const, retryAfterSeconds: 0 as const }
  }

  private window(key: string, now: number, windowMs: number) {
    const value = this.abuseWindows.get(key) ?? { startedAt: now, count: 0 }
    if (now - value.startedAt >= windowMs) Object.assign(value, { startedAt: now, count: 0 })
    this.abuseWindows.set(key, value)
    return value
  }
}

function retryAfter(startedAt: number, now: number, windowMs: number): number {
  return Math.ceil((windowMs - now + startedAt) / 1_000)
}

function createBackend(): ContestSharedStateBackend {
  return new FakeBackend()
}

function options(backend: ContestSharedStateBackend, now: () => number, idFactory: () => string) {
  return {
    backend,
    idFactory,
    now,
    ttlMs: 60_000,
    maxSessions: 100,
    searchLimit: 2,
    searchWindowMs: 10_000,
  }
}

describe('shared contest state', () => {
  it('preserves one session across independent application instances', async () => {
    const backend = createBackend()
    let sequence = 0
    const first = createSharedContestSessionStore(options(backend, () => 1_000, () => `session-${++sequence}`))
    const second = createSharedContestSessionStore(options(backend, () => 1_001, () => `session-${++sequence}`))

    const opened = await first.open()
    expect((await first.authorizeSearch(opened.sessionId)).allowed).toBe(true)

    const resumed = await second.open(opened.sessionId)
    expect(resumed.isNew).toBe(false)
    expect(resumed.snapshot.activity.searches).toBe(1)
  })

  it('rotates unknown identifiers and never accepts an unsafe generated identifier', async () => {
    const backend = createBackend()
    const store = createSharedContestSessionStore(options(backend, () => 1_000, () => 'safe-session-id'))
    expect((await store.open('attacker-choice')).sessionId).toBe('safe-session-id')

    const unsafe = createSharedContestSessionStore(options(
      backend,
      () => 1_000,
      () => 'unsafe\r\nset-cookie: injected=1',
    ))
    await expect(unsafe.open()).rejects.toThrow('Unable to allocate a contest session')
  })

  it('resumes only an existing shared session without allocating a replacement', async () => {
    const backend = createBackend()
    let allocations = 0
    const store = createSharedContestSessionStore(options(
      backend,
      () => 1_000,
      () => `safe-session-${++allocations}`,
    ))
    const opened = await store.open()

    expect((await store.resume(opened.sessionId))?.isNew).toBe(false)
    expect(await store.resume('attacker-choice')).toBeNull()
    expect(await store.resume()).toBeNull()
    expect(allocations).toBe(1)
  })

  it('shares a deployment-wide allowance across instances and cookie resets', async () => {
    const backend = createBackend()
    let now = 1_000
    const limiterOptions = { backend, now: () => now, clientLimit: 2, globalLimit: 2, windowMs: 10_000 }
    const first = createSharedContestAbuseLimiter(limiterOptions)
    const second = createSharedContestAbuseLimiter(limiterOptions)

    expect((await first.authorizeSearch('client-a')).allowed).toBe(true)
    expect((await second.authorizeSearch('client-b')).allowed).toBe(true)
    expect(await first.authorizeSearch('client-a')).toEqual({ allowed: false, retryAfterSeconds: 10 })
    now += 10_001
    expect((await second.authorizeSearch('client-b')).allowed).toBe(true)
  })

  it('prevents one client from consuming the deployment allowance', async () => {
    const limiter = createSharedContestAbuseLimiter({
      backend: createBackend(), now: () => 1_000, clientLimit: 1, globalLimit: 3, windowMs: 10_000,
    })

    expect((await limiter.authorizeSearch('client-a')).allowed).toBe(true)
    expect((await limiter.authorizeSearch('client-a')).allowed).toBe(false)
    expect((await limiter.authorizeSearch('client-b')).allowed).toBe(true)
  })

  it('keeps the shared allowance bounded under concurrent instance requests', async () => {
    const backend = createBackend()
    const limiters = Array.from({ length: 8 }, () => createSharedContestAbuseLimiter({
      backend,
      now: () => 1_000,
      clientLimit: 3,
      globalLimit: 3,
      windowMs: 10_000,
    }))

    const results = await Promise.all(limiters.map((limiter, index) => limiter.authorizeSearch(`client-${index}`)))

    expect(results.filter((result) => result.allowed)).toHaveLength(3)
    expect(results.filter((result) => !result.allowed)).toHaveLength(5)
  })
})
