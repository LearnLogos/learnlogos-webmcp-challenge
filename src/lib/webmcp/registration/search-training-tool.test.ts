import { describe, expect, it, vi } from 'vitest'
import { createSearchTrainingWebMcpTool } from './search-training-tool'

const ENVELOPE = {
  data: { query: 'search', results: [], total: 0 },
  persona: {
    id: 'webmcp-contest-learner',
    displayName: 'WebMCP Challenge Learner',
    accessBoundary: 'approved-contest-content-only',
  },
}

describe('search training WebMCP tool', () => {
  it('uses the narrow same-origin endpoint and forwards cancellation', async () => {
    const fetcher = vi.fn(async () => Response.json(ENVELOPE))
    const tool = createSearchTrainingWebMcpTool({ fetcher })
    const controller = new AbortController()

    const result = await tool.execute({ question: 'search' }, { signal: controller.signal })

    expect(result).toEqual(ENVELOPE)
    expect(fetcher).toHaveBeenCalledWith('/api/webmcp/contest/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'search', limit: 5 }),
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
    })
  })

  it('rejects invalid input before making a request', async () => {
    const fetcher = vi.fn()
    const tool = createSearchTrainingWebMcpTool({ fetcher })

    await expect(tool.execute({ question: '', userId: 'customer' }, {
      signal: new AbortController().signal,
    })).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects nonconforming responses and does not echo server error bodies', async () => {
    const malformed = createSearchTrainingWebMcpTool({
      fetcher: vi.fn(async () => Response.json({ privateCustomer: true })),
    })
    const failed = createSearchTrainingWebMcpTool({
      fetcher: vi.fn(async () => Response.json({ error: 'secret details' }, { status: 500 })),
    })

    await expect(malformed.execute({ question: 'search' }, {
      signal: new AbortController().signal,
    })).rejects.toThrow()
    await expect(failed.execute({ question: 'search' }, {
      signal: new AbortController().signal,
    })).rejects.toThrow('Contest search is unavailable (500).')
  })

  it('publishes the read-only and untrusted-content annotations', () => {
    const tool = createSearchTrainingWebMcpTool({ fetcher: vi.fn() })

    expect(tool.name).toBe('learnlogos.search_training.v1')
    expect(tool.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true })
  })
})
