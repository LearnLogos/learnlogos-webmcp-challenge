import { describe, expect, it } from 'vitest'
import { createContestRedisClient } from './redis-client'

describe('contest Redis client', () => {
  it('rejects plaintext, unauthenticated, and malformed connection URLs', () => {
    expect(() => createContestRedisClient('redis://contest:secret@state.example.test/0')).toThrow()
    expect(() => createContestRedisClient('rediss://state.example.test/0')).toThrow()
    expect(() => createContestRedisClient('not-a-url')).toThrow()
  })

  it('accepts an authenticated TLS connection URL without eagerly connecting', () => {
    expect(() => createContestRedisClient(
      'rediss://contest:secret@state.example.test:6380/0',
    )).not.toThrow()
  })
})
