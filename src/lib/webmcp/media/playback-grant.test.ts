import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'

import { createPlaybackGrantService } from './playback-grant'

const ASSETS = [{ segmentId: 'shortcut-program-scaling-v1', version: '1' }]
const SECRET = '0123456789abcdef0123456789abcdef' // gitleaks:allow

function service(overrides: Partial<Parameters<typeof createPlaybackGrantService>[0]> = {}) {
  let now = 1_800_000_000_000
  const grants = createPlaybackGrantService({
    assets: ASSETS,
    secret: SECRET,
    ttlMs: 120_000,
    now: () => now,
    ...overrides,
  })
  return { grants, advance: (milliseconds: number) => { now += milliseconds } }
}

describe('contest playback grants', () => {
  it('issues and verifies an allowlisted grant for the same session', () => {
    const { grants } = service()
    const issued = grants.issue('shortcut-program-scaling-v1', 'opaque-session-1')

    expect(grants.verify(issued.token, 'opaque-session-1')).toEqual(ASSETS[0])
    expect(issued.expiresAt).toBe(1_800_000_120_000)
  })

  it('does not serialize the session identifier, media path, URL, or digest', () => {
    const { grants } = service()
    const { token } = grants.issue('shortcut-program-scaling-v1', 'private-session-value')
    const payload = Buffer.from(token.split('.')[0], 'base64url').toString('utf8')

    expect(payload).not.toContain('private-session-value')
    expect(payload).not.toContain('.mp4')
    expect(payload).not.toContain('http')
    expect(payload).not.toMatch(/[a-f0-9]{64}/)
  })

  it('rejects cross-session, expired, tampered, malformed, and unknown grants', () => {
    const { grants, advance } = service()
    const issued = grants.issue('shortcut-program-scaling-v1', 'opaque-session-1')

    expect(grants.verify(issued.token, 'opaque-session-2')).toBeNull()
    expect(grants.verify(`${issued.token}changed`, 'opaque-session-1')).toBeNull()
    expect(grants.verify('not-a-token', 'opaque-session-1')).toBeNull()
    advance(120_001)
    expect(grants.verify(issued.token, 'opaque-session-1')).toBeNull()
    expect(() => grants.issue('unknown-segment', 'opaque-session-1')).toThrow('not available')
  })

  it('rejects weak secrets, unsafe session identifiers, and excessive lifetimes', () => {
    expect(() => service({ secret: 'weak' })).toThrow()
    expect(() => service({ ttlMs: 300_001 })).toThrow()
    const { grants } = service()
    expect(() => grants.issue(ASSETS[0].segmentId, 'unsafe cookie')).toThrow()
  })
})
