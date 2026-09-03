import { describe, expect, it, vi } from 'vitest'
import { createRedisContestStateBackend } from './redis-state'

describe('Redis contest state backend', () => {
  it('uses only the fixed contest namespace and maps atomic script responses', async () => {
    const evalScript = vi.fn()
      .mockResolvedValueOnce([1, 3])
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([0, 7])
      .mockResolvedValueOnce([1, 0])
    const backend = createRedisContestStateBackend({ eval: evalScript }, 'webmcp-contest:v1')

    await expect(backend.openExisting('opaque-session', 1_000, 60_000)).resolves.toBe(3)
    await expect(backend.createSession('new-session', 1_000, 60_000, 100)).resolves.toBe(true)
    await expect(backend.authorizeSession('opaque-session', 1_000, 2, 10_000)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 7,
    })
    await expect(backend.authorizeAbuse('client-digest', 1_000, 30, 300, 60_000)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })

    const keys = evalScript.mock.calls.flatMap((call) => call.slice(2, 2 + Number(call[1])))
    expect(keys.every((key) => String(key).startsWith('webmcp-contest:v1:'))).toBe(true)
    expect(keys.some((key) => String(key).includes('production'))).toBe(false)
  })

  it('rejects malformed script results instead of failing open', async () => {
    const backend = createRedisContestStateBackend({ eval: vi.fn().mockResolvedValue(['unexpected']) }, 'webmcp-contest:v1')

    await expect(backend.authorizeAbuse('client-digest', 1_000, 2, 10, 10_000)).rejects.toThrow()
  })
})
