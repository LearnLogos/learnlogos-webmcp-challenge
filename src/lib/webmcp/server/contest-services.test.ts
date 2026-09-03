import { afterEach, describe, expect, it, vi } from 'vitest'
import { contestSearchEnvelopeSchema } from '../contracts/v1/contest-search'
import type { ContestSharedStateBackend } from '../adapters/contest/shared-state'

const CONTEST_URL = 'https://challenge.learnlogos.test/api/webmcp/contest/search'

vi.mock('server-only', () => ({}))

function backend(): ContestSharedStateBackend {
  const sessions = new Map<string, number>()
  return {
    async openExisting(id) { return sessions.get(id) ?? null },
    async createSession(id) { sessions.set(id, 0); return true },
    async authorizeSession(id) {
      sessions.set(id, (sessions.get(id) ?? 0) + 1)
      return { allowed: true, retryAfterSeconds: 0 }
    },
    async authorizeAbuse() { return { allowed: true, retryAfterSeconds: 0 } },
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('contest service composition', () => {
  it('fails closed when contest mode lacks its dedicated shared-state connection', async () => {
    const { createContestSearchServices } = await import('./contest-services')

    expect(() => createContestSearchServices({
      WEBMCP_DEPLOYMENT: 'contest',
      WEBMCP_CONTEST_HOST: 'challenge.learnlogos.test',
      WEBMCP_ENABLED: 'true',
      WEBMCP_PUBLIC_TOOLS_ENABLED: 'true',
    })).toThrow()
  })

  it('requires dedicated media configuration before public previews can be enabled', async () => {
    const { createContestSearchServices } = await import('./contest-services')

    expect(() => createContestSearchServices({
      WEBMCP_DEPLOYMENT: 'contest',
      WEBMCP_CONTEST_HOST: 'challenge.learnlogos.test',
      WEBMCP_ENABLED: 'true',
      WEBMCP_PUBLIC_TOOLS_ENABLED: 'true',
      WEBMCP_PUBLIC_PREVIEWS_ENABLED: 'true',
      WEBMCP_CONTEST_REDIS_URL: 'rediss://contest:secret@contest-state.example.test:6380/0',
      WEBMCP_CONTEST_CLIENT_IP_HEADER: 'x-real-ip',
      WEBMCP_CONTEST_CLIENT_HASH_SECRET: '0123456789abcdef0123456789abcdef', // gitleaks:allow
    }, { backend: backend() })).toThrow()
  })

  it('returns an exact entrant-owned fixture after it passes the server allowlist', async () => {
    vi.stubEnv('WEBMCP_DEPLOYMENT', 'contest')
    vi.stubEnv('WEBMCP_CONTEST_HOST', 'challenge.learnlogos.test')
    vi.stubEnv('WEBMCP_ENABLED', 'true')
    vi.stubEnv('WEBMCP_PUBLIC_TOOLS_ENABLED', 'true')
    vi.stubEnv('WEBMCP_CONTEST_REDIS_URL', 'rediss://contest:secret@contest-state.example.test:6380/0')
    vi.stubEnv('WEBMCP_CONTEST_CLIENT_IP_HEADER', 'x-real-ip')
    vi.stubEnv('WEBMCP_CONTEST_CLIENT_HASH_SECRET', '0123456789abcdef0123456789abcdef') // gitleaks:allow

    const { createContestSearchServices } = await import('./contest-services')
    const contestSearchHandler = createContestSearchServices(process.env, {
      backend: backend(),
      idFactory: () => 'opaque-contest-session',
      now: () => 1_800_000_000_000,
    })
    const response = await contestSearchHandler(new Request(CONTEST_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://challenge.learnlogos.test',
        'sec-fetch-site': 'same-origin',
        'x-real-ip': '192.0.2.10',
      },
      body: JSON.stringify({ question: 'program scaling percentage' }),
    }))

    expect(response.status).toBe(200)
    const envelope = contestSearchEnvelopeSchema.parse(await response.json())
    expect(envelope.data.results.map(({ segmentId }) => segmentId))
      .toEqual(['shortcut-program-scaling-v1'])
  })
})
