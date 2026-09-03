import { describe, expect, it } from 'vitest'
import { createInMemoryContestSessionStore } from './session-store'

function createStore(overrides: Partial<Parameters<typeof createInMemoryContestSessionStore>[0]> = {}) {
  let sequence = 0
  let now = 1_800_000_000_000
  const store = createInMemoryContestSessionStore({
    idFactory: () => `session-${++sequence}`,
    now: () => now,
    ttlMs: 60_000,
    maxSessions: 2,
    searchLimit: 2,
    searchWindowMs: 10_000,
    ...overrides,
  })
  return { store, advance: (milliseconds: number) => { now += milliseconds } }
}

describe('contest session store', () => {
  it('starts every synthetic persona from the same deterministic snapshot', () => {
    const { store } = createStore()

    const first = store.open()
    const second = store.open()

    expect(first.sessionId).not.toBe(second.sessionId)
    expect(first.snapshot).toEqual(second.snapshot)
    expect(first.snapshot).toEqual({
      persona: {
        id: 'webmcp-contest-learner',
        displayName: 'WebMCP Challenge Learner',
        accessBoundary: 'approved-contest-content-only',
      },
      activity: { searches: 0 },
    })
  })

  it('isolates mutable activity between sessions', () => {
    const { store } = createStore()
    const first = store.open()
    const second = store.open()

    expect(store.authorizeSearch(first.sessionId).allowed).toBe(true)

    expect(store.open(first.sessionId).snapshot.activity.searches).toBe(1)
    expect(store.open(second.sessionId).snapshot.activity.searches).toBe(0)
  })

  it('rotates unknown or expired identifiers instead of accepting fixation', () => {
    const { store, advance } = createStore()
    const first = store.open()

    expect(store.open('attacker-selected').sessionId).not.toBe('attacker-selected')
    advance(60_001)
    expect(store.open(first.sessionId).sessionId).not.toBe(first.sessionId)
  })

  it('resumes only an existing live session without allocating a replacement', () => {
    const { store, advance } = createStore()
    const first = store.open()

    expect(store.resume(first.sessionId)?.isNew).toBe(false)
    expect(store.resume('attacker-selected')).toBeNull()
    expect(store.resume()).toBeNull()
    advance(60_001)
    expect(store.resume(first.sessionId)).toBeNull()
  })

  it('rejects unsafe or repeatedly duplicated generated identifiers', () => {
    const unsafe = createStore({ idFactory: () => 'unsafe\r\nset-cookie: injected=1' })
    expect(() => unsafe.store.open()).toThrow('Unable to allocate a contest session')

    const duplicated = createStore({ idFactory: () => 'duplicate-session' })
    duplicated.store.open()
    expect(() => duplicated.store.open()).toThrow('Unable to allocate a contest session')
  })

  it('fails closed after the per-session search allowance is exhausted', () => {
    const { store, advance } = createStore()
    const session = store.open()

    expect(store.authorizeSearch(session.sessionId)).toMatchObject({ allowed: true })
    expect(store.authorizeSearch(session.sessionId)).toMatchObject({ allowed: true })
    expect(store.authorizeSearch(session.sessionId)).toEqual({ allowed: false, retryAfterSeconds: 10 })
    advance(10_001)
    expect(store.authorizeSearch(session.sessionId)).toMatchObject({ allowed: true })
  })

  it('evicts the least recently used session at the hard capacity bound', () => {
    const { store } = createStore()
    const first = store.open()
    const second = store.open()
    store.open(first.sessionId)

    store.open()

    expect(store.open(first.sessionId).isNew).toBe(false)
    expect(store.open(second.sessionId).isNew).toBe(true)
  })
})
