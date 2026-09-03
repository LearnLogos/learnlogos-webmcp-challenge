import { describe, expect, it } from 'vitest'
import config from './next.config'

describe('contest security headers', () => {
  it('sets transport and browser capability protections', async () => {
    const headers = await config.headers?.()
    const values = new Map(headers?.[0]?.headers.map(({ key, value }) => [key, value]))

    expect(values.get('Strict-Transport-Security')).toBe('max-age=31536000')
    expect(values.get('Permissions-Policy')).toContain('camera=()')
    expect(values.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
  })

  it('bundles only approved contest media with the server routes that read it', () => {
    expect(config.outputFileTracingIncludes).toEqual({
      '/api/webmcp/contest/captions/*': ['./media/**/*.srt'],
      '/api/webmcp/contest/media/*': ['./media/**/*.mp4'],
    })
  })
})
