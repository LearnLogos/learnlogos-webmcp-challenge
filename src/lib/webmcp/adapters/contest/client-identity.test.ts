import { describe, expect, it } from 'vitest'
import { createContestClientIdentityResolver } from './client-identity'

describe('contest edge client identity', () => {
  const resolve = createContestClientIdentityResolver(
    'x-real-ip',
    '0123456789abcdef0123456789abcdef',
  )

  it('accepts one edge-provided IP and returns only a stable opaque digest', () => {
    const first = resolve(new Request('https://challenge.test', {
      headers: { 'x-real-ip': '192.0.2.10' },
    }))
    const same = resolve(new Request('https://challenge.test', {
      headers: { 'x-real-ip': '192.0.2.10' },
    }))

    expect(first).toBe(same)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(first).not.toContain('192.0.2.10')
  })

  it('rejects absent, forwarded-list, and non-IP values', () => {
    expect(resolve(new Request('https://challenge.test'))).toBeNull()
    expect(resolve(new Request('https://challenge.test', {
      headers: { 'x-real-ip': '192.0.2.10, 198.51.100.2' },
    }))).toBeNull()
    expect(resolve(new Request('https://challenge.test', {
      headers: { 'x-real-ip': 'attacker-controlled' },
    }))).toBeNull()
  })
})
