import { describe, expect, it } from 'vitest'
import {
  SEARCH_TRAINING_TOOL,
  searchTrainingInputSchema,
  searchTrainingResponseSchema,
} from './search-training'

describe('searchTrainingInputSchema', () => {
  it('accepts a bounded question without identity or tenant input', () => {
    expect(searchTrainingInputSchema.parse({
      question: 'How do I find commands in Paul’s letters?',
      logosVersion: 'Logos 10',
      limit: 3,
    })).toEqual({
      question: 'How do I find commands in Paul’s letters?',
      logosVersion: 'Logos 10',
      limit: 3,
    })
  })

  it('rejects unknown fields such as user and tenant selectors', () => {
    expect(() => searchTrainingInputSchema.parse({
      question: 'Find training',
      userId: 'another-customer',
    })).toThrow()

    expect(() => searchTrainingInputSchema.parse({
      question: 'Find training',
      tenant: 'production',
    })).toThrow()
  })

  it('rejects empty, oversized, and excessive-result requests', () => {
    expect(() => searchTrainingInputSchema.parse({ question: '' })).toThrow()
    expect(() => searchTrainingInputSchema.parse({ question: 'x'.repeat(501) })).toThrow()
    expect(() => searchTrainingInputSchema.parse({ question: 'Find training', limit: 11 })).toThrow()
  })
})

describe('SEARCH_TRAINING_TOOL', () => {
  it('uses a versioned valid WebMCP name and read-only annotations', () => {
    expect(SEARCH_TRAINING_TOOL.name).toBe('learnlogos.search_training.v1')
    expect(SEARCH_TRAINING_TOOL.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/)
    expect(SEARCH_TRAINING_TOOL.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    })
  })
})

describe('searchTrainingResponseSchema playback grants', () => {
  const result = {
    segmentId: 'shortcut-program-scaling-v1',
    title: 'Set Exact Program Scaling',
    summary: 'Entrant-authored summary.',
    source: {
      webinarTitle: 'The Ultimate Logos Shortcut List, Part 1/5',
      webinarDate: '2026-04-23',
      excerptStartMs: 152_960,
      excerptEndMs: 227_862,
      citation: 'LearnLogos, “The Ultimate Logos Shortcut List, Part 1/5,” webinar, April 23, 2026, 02:32.960–03:47.862.',
    },
    logosVersion: null,
    access: 'free',
    relevance: 1,
    whyMatched: 'Matched approved contest training metadata.',
    contentClassification: 'public-contest',
  } as const

  it('accepts only a bounded same-origin playback grant URL', () => {
    const token = `${'a'.repeat(30)}.${'b'.repeat(43)}`
    const response = {
      query: 'scaling',
      total: 1,
      results: [{
        ...result,
        playback: {
          url: `/api/webmcp/contest/media/shortcut-program-scaling-v1?grant=${token}`,
          captionsUrl: `/api/webmcp/contest/captions/shortcut-program-scaling-v1?grant=${token}`,
          expiresAt: 1_800_000_120_000,
        },
      }],
    }
    expect(searchTrainingResponseSchema.parse(response)).toEqual(response)
    expect(() => searchTrainingResponseSchema.parse({
      ...response,
      results: [{
        ...result,
        playback: {
          url: 'https://attacker.test/video',
          captionsUrl: 'https://attacker.test/captions',
          expiresAt: 1,
        },
      }],
    })).toThrow()
  })

  it('rejects unbounded, inverted, or expanded provenance', () => {
    const response = { query: 'scaling', total: 1, results: [result] }
    expect(() => searchTrainingResponseSchema.parse({
      ...response,
      results: [{ ...result, source: { ...result.source, excerptEndMs: 300_000 } }],
    })).toThrow()
    expect(() => searchTrainingResponseSchema.parse({
      ...response,
      results: [{ ...result, source: { ...result.source, excerptEndMs: 100_000 } }],
    })).toThrow()
    expect(() => searchTrainingResponseSchema.parse({
      ...response,
      results: [{ ...result, source: { ...result.source, sourceUrl: 'https://example.test/private' } }],
    })).toThrow()
  })
})
