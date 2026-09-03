import { describe, expect, it, vi } from 'vitest'

import { createInMemoryContestSessionStore } from '../adapters/contest/session-store'
import { createPlaybackGrantService } from '../media/playback-grant'
import { resolveWebMcpRuntime } from '../runtime/config'
import { createContestMediaHandler } from './contest-media'

const HOST = 'challenge.learnlogos.test'
const SEGMENT = 'approved-segment'

function harness(enabled = true) {
  const runtime = resolveWebMcpRuntime({
    WEBMCP_DEPLOYMENT: 'contest',
    WEBMCP_CONTEST_HOST: HOST,
    WEBMCP_ENABLED: enabled ? 'true' : 'false',
    WEBMCP_PUBLIC_TOOLS_ENABLED: 'true',
    WEBMCP_PUBLIC_PREVIEWS_ENABLED: 'true',
  })
  const sessions = createInMemoryContestSessionStore({
    idFactory: () => 'opaque-session-1',
    now: () => 1_800_000_000_000,
    ttlMs: 60_000,
    maxSessions: 10,
    searchLimit: 10,
    searchWindowMs: 60_000,
  })
  const session = sessions.open()
  const grants = createPlaybackGrantService({
    assets: [{ segmentId: SEGMENT, version: '1' }],
    secret: '0123456789abcdef0123456789abcdef', // gitleaks:allow
    ttlMs: 120_000,
    now: () => 1_800_000_000_000,
  })
  const issued = grants.issue(SEGMENT, session.sessionId)
  const store = {
    serve: vi.fn(async () => new Response('video-bytes', { status: 200 })),
    serveCaptions: vi.fn(async () => new Response('WEBVTT\n\n', { status: 200 })),
  }
  const abuseLimiter = {
    authorizeSearch: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
  }
  const clientIdentity = vi.fn(() => 'opaque-client-identity')
  return {
    handler: createContestMediaHandler({
      runtime, sessions, grants, store, abuseLimiter, clientIdentity,
    }),
    abuseLimiter,
    clientIdentity,
    session,
    store,
    token: issued.token,
  }
}

function request(
  token: string,
  headers: Record<string, string> = {},
  segment = SEGMENT,
  kind: 'media' | 'captions' = 'media',
) {
  return new Request(`https://${HOST}/api/webmcp/contest/${kind}/${segment}?grant=${token}`, {
    headers: {
      host: HOST,
      'sec-fetch-site': 'same-origin',
      cookie: '__Host-learnlogos_webmcp_contest=opaque-session-1',
      ...headers,
    },
  })
}

describe('contest media HTTP boundary', () => {
  it('serves an allowlisted segment only with a live session-bound grant', async () => {
    const { handler, store, token } = harness()
    const response = await handler(request(token, { range: 'bytes=0-99' }))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('video-bytes')
    expect(store.serve).toHaveBeenCalledWith(SEGMENT, 'bytes=0-99')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('serves the matching caption track under the same grant', async () => {
    const { handler, store, token } = harness()
    const response = await handler(request(token, {}, SEGMENT, 'captions'))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('WEBVTT')
    expect(store.serveCaptions).toHaveBeenCalledWith(SEGMENT)
    expect(store.serve).not.toHaveBeenCalled()
  })

  it('rejects missing sessions, cross-session grants, and path substitution', async () => {
    const { handler, token, store } = harness()
    const missing = await handler(request(token, { cookie: '' }))
    const forged = await handler(request(token, {
      cookie: '__Host-learnlogos_webmcp_contest=forged-session',
    }))
    const substituted = await handler(request(token, {}, 'different-segment'))

    expect(missing.status).toBe(404)
    expect(forged.status).toBe(404)
    expect(substituted.status).toBe(404)
    expect(store.serve).not.toHaveBeenCalled()
  })

  it('rejects cross-site, tampered, duplicate-query, and disabled requests', async () => {
    const active = harness()
    expect((await active.handler(request(active.token, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
    expect((await active.handler(request(`${active.token}x`))).status).toBe(404)
    expect((await active.handler(new Request(
      `${request(active.token).url}&grant=${active.token}`,
      { headers: request(active.token).headers },
    ))).status).toBe(404)

    const disabled = harness(false)
    expect((await disabled.handler(request(disabled.token))).status).toBe(404)
  })

  it('fails closed when client identity is missing or the shared abuse budget is exhausted', async () => {
    const missing = harness()
    missing.clientIdentity.mockReturnValueOnce(null)
    expect((await missing.handler(request(missing.token))).status).toBe(403)
    expect(missing.store.serve).not.toHaveBeenCalled()

    const limited = harness()
    limited.abuseLimiter.authorizeSearch.mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 17,
    })
    const response = await limited.handler(request(limited.token))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('17')
    expect(limited.store.serve).not.toHaveBeenCalled()
  })

  it('redacts media-store failures', async () => {
    const active = harness()
    active.store.serve.mockRejectedValueOnce(new Error('/srv/private/approved.mp4'))

    const response = await active.handler(request(active.token))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Contest media is unavailable.' })
  })
})
