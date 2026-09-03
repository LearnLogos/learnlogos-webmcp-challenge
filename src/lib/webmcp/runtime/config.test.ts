import { describe, expect, it } from 'vitest'
import {
  contestWebMcpRequestIsEnabled,
  resolveWebMcpRuntime,
  webMcpRequestIsEnabled,
} from './config'

describe('resolveWebMcpRuntime', () => {
  it('keeps every WebMCP capability disabled by default', () => {
    expect(resolveWebMcpRuntime({})).toEqual({
      deployment: 'production',
      contestHost: null,
      capabilities: {
        enabled: false,
        publicTools: false,
        authenticatedTools: false,
        transactionalTools: false,
        publicPreviews: false,
      },
    })
  })

  it('does not let dependent capabilities bypass the master switch', () => {
    const runtime = resolveWebMcpRuntime({
      WEBMCP_PUBLIC_TOOLS_ENABLED: 'true',
      WEBMCP_AUTHENTICATED_TOOLS_ENABLED: 'true',
      WEBMCP_TRANSACTIONAL_TOOLS_ENABLED: 'true',
      WEBMCP_PUBLIC_PREVIEWS_ENABLED: 'true',
    })

    expect(runtime.capabilities).toEqual({
      enabled: false,
      publicTools: false,
      authenticatedTools: false,
      transactionalTools: false,
      publicPreviews: false,
    })
  })

  it('requires authenticated tools before transactional tools can be enabled', () => {
    const runtime = resolveWebMcpRuntime({
      WEBMCP_ENABLED: 'true',
      WEBMCP_TRANSACTIONAL_TOOLS_ENABLED: 'true',
    })

    expect(runtime.capabilities.transactionalTools).toBe(false)
  })

  it('rejects invalid configuration instead of silently enabling it', () => {
    expect(() => resolveWebMcpRuntime({ WEBMCP_ENABLED: 'yes' })).toThrow()
    expect(() => resolveWebMcpRuntime({ WEBMCP_DEPLOYMENT: 'demo' })).toThrow()
  })
})

describe('webMcpRequestIsEnabled', () => {
  it('keeps WebMCP unavailable in production even when the master flag is set', () => {
    const runtime = resolveWebMcpRuntime({ WEBMCP_ENABLED: 'true' })

    expect(webMcpRequestIsEnabled(runtime, 'challenge.learnlogos.test')).toBe(false)
    expect(runtime.deployment).toBe('production')
  })

  it('requires an exact configured host for a contest deployment', () => {
    const runtime = resolveWebMcpRuntime({
      WEBMCP_DEPLOYMENT: 'contest',
      WEBMCP_CONTEST_HOST: 'challenge.learnlogos.test',
      WEBMCP_ENABLED: 'true',
    })

    expect(webMcpRequestIsEnabled(runtime, 'challenge.learnlogos.test')).toBe(true)
    expect(webMcpRequestIsEnabled(runtime, 'CHALLENGE.LEARNLOGOS.TEST:443')).toBe(true)
    expect(webMcpRequestIsEnabled(runtime, 'www.learnlogos.test')).toBe(false)
    expect(webMcpRequestIsEnabled(runtime, 'challenge.learnlogos.test.attacker.test')).toBe(false)
  })

  it('rejects a contest deployment without a configured host', () => {
    expect(() => resolveWebMcpRuntime({
      WEBMCP_DEPLOYMENT: 'contest',
      WEBMCP_ENABLED: 'true',
    })).toThrow()
  })
})

describe('contestWebMcpRequestIsEnabled', () => {
  it('never exposes the contest boundary from a production deployment', () => {
    const runtime = resolveWebMcpRuntime({
      WEBMCP_ENABLED: 'true',
      WEBMCP_PUBLIC_TOOLS_ENABLED: 'true',
    })

    expect(contestWebMcpRequestIsEnabled(runtime, 'challenge.learnlogos.test')).toBe(false)
  })

  it('requires the master switch, public tools, and exact contest host', () => {
    const base = {
      WEBMCP_DEPLOYMENT: 'contest',
      WEBMCP_CONTEST_HOST: 'challenge.learnlogos.test',
      WEBMCP_ENABLED: 'true',
    }

    expect(contestWebMcpRequestIsEnabled(resolveWebMcpRuntime(base), 'challenge.learnlogos.test')).toBe(false)
    expect(contestWebMcpRequestIsEnabled(resolveWebMcpRuntime({
      ...base,
      WEBMCP_PUBLIC_TOOLS_ENABLED: 'true',
    }), 'challenge.learnlogos.test')).toBe(true)
    expect(contestWebMcpRequestIsEnabled(resolveWebMcpRuntime({
      ...base,
      WEBMCP_PUBLIC_TOOLS_ENABLED: 'true',
    }), 'www.learnlogos.test')).toBe(false)
    expect(contestWebMcpRequestIsEnabled(resolveWebMcpRuntime({
      ...base,
      WEBMCP_PUBLIC_TOOLS_ENABLED: 'true',
    }), 'challenge.learnlogos.test.attacker.test')).toBe(false)
  })
})
