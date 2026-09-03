import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { config, proxy } from './src/proxy'

describe('contest page content security policy', () => {
  it('uses a fresh nonce without unsafe script directives', () => {
    const first = proxy(new NextRequest('https://challenge.learnlogos.test/webmcp-challenge'))
    const second = proxy(new NextRequest('https://challenge.learnlogos.test/webmcp-challenge'))
    const firstPolicy = first.headers.get('content-security-policy') ?? ''
    const secondPolicy = second.headers.get('content-security-policy') ?? ''
    const firstNonce = firstPolicy.match(/'nonce-([^']+)'/)?.[1]
    const secondNonce = secondPolicy.match(/'nonce-([^']+)'/)?.[1]

    expect(firstNonce).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(secondNonce).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(firstNonce).not.toBe(secondNonce)
    expect(firstPolicy).toContain("script-src 'self'")
    expect(firstPolicy).toContain("'strict-dynamic'")
    expect(firstPolicy).not.toContain("'unsafe-inline'")
    expect(firstPolicy).not.toContain("'unsafe-eval'")
    expect(first.headers.get('x-middleware-request-x-nonce')).toBe(firstNonce)
  })

  it('runs only for the contest page', () => {
    expect(config.matcher).toEqual(['/webmcp-challenge'])
  })
})
