import { describe, expect, it, vi } from 'vitest'
import { resolveWebMcpRuntime } from '../runtime/config'
import { createInMemoryContestSessionStore } from '../adapters/contest/session-store'
import { createContestSearchHandler } from './contest-search'
import type { SearchTrainingResponse } from '../contracts/v1/search-training'

const URL = 'https://challenge.learnlogos.test/api/webmcp/contest/search'
const RESPONSE = {
  query: 'How do I search?',
  results: [],
  total: 0,
}

interface HarnessOverrides {
  enabled?: boolean
  idFactory?: () => string
  searchLimit?: number
  globalLimit?: number
  clientLimit?: number
  response?: SearchTrainingResponse
  issuePlayback?: (
    segmentId: string,
    sessionId: string,
  ) => { url: string; captionsUrl: string; expiresAt: number }
}

function createAbuseLimiter(overrides: HarnessOverrides) {
  let globalSearches = 0
  const clientSearches = new Map<string, number>()
  return {
    authorizeSearch: vi.fn(async (client: string) => {
      const clientCount = clientSearches.get(client) ?? 0
      if (globalSearches >= (overrides.globalLimit ?? 100)
        || clientCount >= (overrides.clientLimit ?? 100)) {
        return { allowed: false as const, retryAfterSeconds: 60 }
      }
      globalSearches += 1
      clientSearches.set(client, clientCount + 1)
      return { allowed: true as const, retryAfterSeconds: 0 as const }
    }),
  }
}

function createHarness(overrides: HarnessOverrides = {}) {
  let sequence = 0
  const runtime = resolveWebMcpRuntime({
    WEBMCP_DEPLOYMENT: 'contest',
    WEBMCP_CONTEST_HOST: 'challenge.learnlogos.test',
    WEBMCP_ENABLED: overrides.enabled === false ? 'false' : 'true',
    WEBMCP_PUBLIC_TOOLS_ENABLED: 'true',
  })
  const sessions = createInMemoryContestSessionStore({
    idFactory: overrides.idFactory ?? (() => `opaque-${++sequence}`),
    now: () => 1_800_000_000_000,
    ttlMs: 60_000,
    maxSessions: 10,
    searchLimit: overrides.searchLimit ?? 10,
    searchWindowMs: 60_000,
  })
  const search = vi.fn(async () => overrides.response ?? RESPONSE)
  const abuseLimiter = createAbuseLimiter(overrides)
  return {
    handler: createContestSearchHandler({
      runtime,
      sessions,
      abuseLimiter,
      clientIdentity: (incoming) => incoming.headers.get('x-real-ip'),
      search,
      issuePlayback: overrides.issuePlayback,
    }),
    abuseLimiter,
    search,
  }
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request(URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'challenge.learnlogos.test',
      origin: 'https://challenge.learnlogos.test',
      'sec-fetch-site': 'same-origin',
      'x-real-ip': '192.0.2.10',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('contest search HTTP boundary', () => {
  it('is undiscoverable when the server-owned contest switch is disabled', async () => {
    const { handler, search } = createHarness({ enabled: false })

    const response = await handler(request({ question: 'search' }))

    expect(response.status).toBe(404)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('rejects cross-origin and cross-site execution before opening a session', async () => {
    const { handler, search } = createHarness()

    const wrongOrigin = await handler(request({ question: 'search' }, { origin: 'https://attacker.test' }))
    const crossSite = await handler(request({ question: 'search' }, { 'sec-fetch-site': 'cross-site' }))

    expect(wrongOrigin.status).toBe(403)
    expect(crossSite.status).toBe(403)
    expect(wrongOrigin.headers.get('set-cookie')).toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('rejects a host header that does not match server contest configuration', async () => {
    const { handler, search } = createHarness()

    const response = await handler(request({ question: 'search' }, { host: 'www.learnlogos.test' }))

    expect(response.status).toBe(404)
    expect(search).not.toHaveBeenCalled()
  })

  it('rejects unsupported, oversized, malformed, and schema-invalid bodies', async () => {
    const { handler, search } = createHarness()

    const wrongType = await handler(request({}, { 'content-type': 'text/plain' }))
    const tooLarge = await handler(request('x'.repeat(4_097)))
    const malformed = await handler(request('{'))
    const invalid = await handler(request({ question: 'ok', userId: 'production-user' }))

    expect(wrongType.status).toBe(415)
    expect(tooLarge.status).toBe(413)
    expect(malformed.status).toBe(400)
    expect(invalid.status).toBe(400)
    expect(search).not.toHaveBeenCalled()
  })

  it('returns only the public envelope and a hardened opaque session cookie', async () => {
    const { handler, search } = createHarness()

    const response = await handler(request({ question: 'How do I search?' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: RESPONSE,
      persona: {
        id: 'webmcp-contest-learner',
        displayName: 'WebMCP Challenge Learner',
        accessBoundary: 'approved-contest-content-only',
      },
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('set-cookie')).toContain('__Host-learnlogos_webmcp_contest=opaque-1')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('set-cookie')).toContain('Secure')
    expect(response.headers.get('set-cookie')).toContain('SameSite=Strict')
    expect(search).toHaveBeenCalledWith({ question: 'How do I search?', limit: 5 })
  })

  it('adds a session-bound playback grant only after a result passes search policy', async () => {
    const token = `${'a'.repeat(30)}.${'b'.repeat(43)}`
    const issuePlayback = vi.fn(() => ({
      url: `/api/webmcp/contest/media/approved-segment?grant=${token}`,
      captionsUrl: `/api/webmcp/contest/captions/approved-segment?grant=${token}`,
      expiresAt: 1_800_000_120_000,
    }))
    const response: SearchTrainingResponse = {
      query: 'approved',
      total: 1,
      results: [{
        segmentId: 'approved-segment',
        title: 'Approved segment',
        summary: 'Approved summary.',
        source: {
          webinarTitle: 'Test webinar',
          webinarDate: '2026-04-23',
          excerptStartMs: 1_000,
          excerptEndMs: 2_000,
          citation: 'LearnLogos, “Test webinar,” webinar, April 23, 2026, 00:01.000–00:02.000.',
        },
        logosVersion: null,
        access: 'free',
        relevance: 1,
        whyMatched: 'Matched approved contest training metadata.',
        contentClassification: 'public-contest',
      }],
    }
    const { handler } = createHarness({ response, issuePlayback })

    const result = await handler(request({ question: 'approved' }))

    expect((await result.json()).data.results[0].playback.url).toContain('?grant=')
    expect(issuePlayback).toHaveBeenCalledWith('approved-segment', 'opaque-1')
  })

  it('reuses a valid session, rotates a forged cookie, and isolates counters', async () => {
    const { handler } = createHarness()
    const first = await handler(request({ question: 'first' }))
    const cookie = first.headers.get('set-cookie')!.split(';')[0]

    const same = await handler(request({ question: 'second' }, { cookie }))
    const forged = await handler(request({ question: 'forged' }, {
      cookie: '__Host-learnlogos_webmcp_contest=chosen-by-attacker',
    }))

    expect(same.headers.get('set-cookie')).toBeNull()
    expect(forged.headers.get('set-cookie')).toContain('opaque-2')
  })

  it('returns a bounded retry response when the isolated limiter denies', async () => {
    const { handler, search } = createHarness({ searchLimit: 1 })
    const first = await handler(request({ question: 'first' }))
    const cookie = first.headers.get('set-cookie')!.split(';')[0]

    const limited = await handler(request({ question: 'second' }, { cookie }))

    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('60')
    expect(await limited.json()).toEqual({ error: 'Contest search limit reached.' })
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('enforces the deployment-wide limiter before allocating a cookie session', async () => {
    const { handler, search } = createHarness({ globalLimit: 1 })

    expect((await handler(request({ question: 'first' }))).status).toBe(200)
    const limited = await handler(request({ question: 'second' }))

    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('60')
    expect(limited.headers.get('set-cookie')).toBeNull()
    expect(await limited.json()).toEqual({ error: 'Contest capacity limit reached.' })
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('limits one edge client without consuming another client allowance', async () => {
    const { handler, search } = createHarness({ clientLimit: 1, globalLimit: 3 })

    expect((await handler(request({ question: 'first' }))).status).toBe(200)
    expect((await handler(request({ question: 'limited' }))).status).toBe(429)
    expect((await handler(request({ question: 'other' }, { 'x-real-ip': '198.51.100.2' }))).status)
      .toBe(200)
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('fails closed before shared state when trusted edge identity is absent', async () => {
    const { handler, abuseLimiter, search } = createHarness()

    const response = await handler(request({ question: 'search' }, { 'x-real-ip': '' }))

    expect(response.status).toBe(403)
    expect(abuseLimiter.authorizeSearch).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })

  it('fails closed and redacts deployment limiter failures', async () => {
    const { handler, abuseLimiter, search } = createHarness()
    abuseLimiter.authorizeSearch.mockRejectedValueOnce(new Error('rediss://secret@private'))

    const response = await handler(request({ question: 'search' }))

    expect(response.status).toBe(500)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(JSON.stringify(await response.json())).not.toContain('rediss://')
    expect(search).not.toHaveBeenCalled()
  })

  it('does not disclose internal failures', async () => {
    const { handler, search } = createHarness()
    search.mockRejectedValueOnce(new Error('DATABASE_URL=private'))

    const response = await handler(request({ question: 'search' }))

    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('DATABASE_URL')
  })

  it('redacts session allocation failures at the HTTP boundary', async () => {
    const { handler } = createHarness({
      idFactory: () => 'unsafe\r\nset-cookie: injected=1',
    })

    const response = await handler(request({ question: 'search' }))

    expect(response.status).toBe(500)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.json()).toEqual({ error: 'Contest search is unavailable.' })
  })
})
