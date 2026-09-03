import { describe, expect, it } from 'vitest'
import { resolveContestStateConfig } from './contest-state-config'

const BASE = {
  WEBMCP_DEPLOYMENT: 'contest',
  WEBMCP_CONTEST_REDIS_URL: 'rediss://contest-user:secret@contest-state.example.test:6380/0',
  WEBMCP_CONTEST_CLIENT_IP_HEADER: 'x-real-ip',
  WEBMCP_CONTEST_CLIENT_HASH_SECRET: '0123456789abcdef0123456789abcdef', // gitleaks:allow
}

describe('contest shared-state configuration', () => {
  it('requires a dedicated TLS Redis URL in contest mode', () => {
    expect(() => resolveContestStateConfig({
      WEBMCP_DEPLOYMENT: 'contest',
      WEBMCP_CONTEST_CLIENT_IP_HEADER: BASE.WEBMCP_CONTEST_CLIENT_IP_HEADER,
      WEBMCP_CONTEST_CLIENT_HASH_SECRET: BASE.WEBMCP_CONTEST_CLIENT_HASH_SECRET,
    })).toThrow()
    expect(() => resolveContestStateConfig({
      WEBMCP_DEPLOYMENT: 'contest',
      WEBMCP_CONTEST_REDIS_URL: 'redis://contest-state.example.test:6379',
    })).toThrow()
  })

  it('requires a supported trusted-edge IP header and a separate hashing secret', () => {
    expect(() => resolveContestStateConfig({
      ...BASE,
      WEBMCP_CONTEST_CLIENT_IP_HEADER: 'x-forwarded-for',
    })).toThrow()
    expect(() => resolveContestStateConfig({
      ...BASE,
      WEBMCP_CONTEST_CLIENT_HASH_SECRET: 'short',
    })).toThrow()
    expect(() => resolveContestStateConfig({
      ...BASE,
      NEXTAUTH_SECRET: BASE.WEBMCP_CONTEST_CLIENT_HASH_SECRET,
    })).toThrow()
  })

  it('rejects production Redis credentials and hosts', () => {
    expect(() => resolveContestStateConfig({
      ...BASE,
      REDIS_URL: BASE.WEBMCP_CONTEST_REDIS_URL,
    })).toThrow()
    expect(() => resolveContestStateConfig({
      ...BASE,
      REDIS_HOST: 'contest-state.example.test',
    })).toThrow()
    expect(() => resolveContestStateConfig({
      ...BASE,
      REDIS_URL: 'rediss://different:credentials@contest-state.example.test:6380/1',
    })).toThrow()
  })

  it('returns bounded defaults and accepts bounded overrides', () => {
    expect(resolveContestStateConfig(BASE)).toMatchObject({
      redisUrl: BASE.WEBMCP_CONTEST_REDIS_URL,
      namespace: 'webmcp-contest:v1',
      clientIpHeader: 'x-real-ip',
      globalSearchLimit: 300,
      clientSearchLimit: 30,
      globalSearchWindowMs: 60_000,
    })
    expect(resolveContestStateConfig({
      ...BASE,
      WEBMCP_CONTEST_GLOBAL_SEARCH_LIMIT: '25',
      WEBMCP_CONTEST_GLOBAL_SEARCH_WINDOW_SECONDS: '10',
    })).toMatchObject({ globalSearchLimit: 25, globalSearchWindowMs: 10_000 })
  })

  it('rejects non-integer, unbounded, and unknown deployment settings', () => {
    expect(() => resolveContestStateConfig({
      ...BASE,
      WEBMCP_CONTEST_GLOBAL_SEARCH_LIMIT: '0',
    })).toThrow()
    expect(() => resolveContestStateConfig({
      ...BASE,
      WEBMCP_CONTEST_GLOBAL_SEARCH_LIMIT: '10001',
    })).toThrow()
    expect(() => resolveContestStateConfig({ ...BASE, WEBMCP_DEPLOYMENT: 'preview' })).toThrow()
  })
})
