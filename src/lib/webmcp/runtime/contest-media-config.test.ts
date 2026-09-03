import { describe, expect, it } from 'vitest'

import { resolveContestMediaConfig } from './contest-media-config'

const ENV = {
  WEBMCP_DEPLOYMENT: 'contest',
  WEBMCP_PUBLIC_PREVIEWS_ENABLED: 'true',
  WEBMCP_CONTEST_MEDIA_ROOT: '/srv/learnlogos-contest-media',
  WEBMCP_CONTEST_MEDIA_GRANT_SECRET: '0123456789abcdef0123456789abcdef', // gitleaks:allow
}

describe('contest media configuration', () => {
  it('accepts dedicated private storage and a bounded grant lifetime', () => {
    expect(resolveContestMediaConfig(ENV)).toEqual({
      mediaRoot: '/srv/learnlogos-contest-media',
      grantSecret: ENV.WEBMCP_CONTEST_MEDIA_GRANT_SECRET,
      grantTtlMs: 120_000,
    })
    expect(resolveContestMediaConfig({
      ...ENV,
      WEBMCP_CONTEST_MEDIA_GRANT_TTL_SECONDS: '300',
    }).grantTtlMs).toBe(300_000)
  })

  it('rejects production mode, disabled previews, and unsafe storage roots', () => {
    expect(() => resolveContestMediaConfig({ ...ENV, WEBMCP_DEPLOYMENT: 'production' })).toThrow()
    expect(() => resolveContestMediaConfig({ ...ENV, WEBMCP_PUBLIC_PREVIEWS_ENABLED: 'false' })).toThrow()
    expect(() => resolveContestMediaConfig({ ...ENV, WEBMCP_CONTEST_MEDIA_ROOT: '/' })).toThrow()
    expect(() => resolveContestMediaConfig({ ...ENV, WEBMCP_CONTEST_MEDIA_ROOT: 'relative/media' })).toThrow()
    expect(() => resolveContestMediaConfig({
      ...ENV,
      WEBMCP_CONTEST_MEDIA_ROOT: '/srv/media/../other',
    })).toThrow()
  })

  it('rejects weak, reused, or overlong grant configuration', () => {
    expect(() => resolveContestMediaConfig({
      ...ENV,
      WEBMCP_CONTEST_MEDIA_GRANT_SECRET: 'weak',
    })).toThrow()
    expect(() => resolveContestMediaConfig({
      ...ENV,
      WEBMCP_CONTEST_CLIENT_HASH_SECRET: ENV.WEBMCP_CONTEST_MEDIA_GRANT_SECRET,
    })).toThrow('dedicated')
    expect(() => resolveContestMediaConfig({
      ...ENV,
      WEBMCP_CONTEST_MEDIA_GRANT_TTL_SECONDS: '301',
    })).toThrow()
  })
})
