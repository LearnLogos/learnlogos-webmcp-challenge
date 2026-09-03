import { describe, expect, it, vi } from 'vitest'

import { searchTraining } from './search-training'
import { createContestContentPolicy } from '../policy/contest-content-policy'
import type { ContestRightsRecord, TrainingSearchCandidate, TrainingSearchPort } from '../ports/training-search'

const digest = (letter: string) => letter.repeat(64)
const rights = (assetId: string, sha256: string): ContestRightsRecord => ({
  assetId,
  version: '1',
  sha256,
  contentKind: 'fixture',
  owner: 'entrant',
  rightsBasis: 'ownership',
  evidenceUrl: null,
  evidenceDate: '2026-08-28',
  permittedSurfaces: ['search'],
  requiredNotice: null,
  containsThirdPartyMaterial: false,
  reviewStatus: 'approved',
  reviewer: 'Test content reviewer',
  reviewedAt: '2026-08-28T00:00:00.000Z',
})
const candidate = (assetId: string, sha256: string, access: 'owned' | 'free'): TrainingSearchCandidate => ({
  assetId,
  version: '1',
  sha256,
  contentKind: 'fixture',
  title: `Training ${assetId}`,
  summary: 'Entrant-authored contest training metadata.',
  source: {
    webinarTitle: 'The Ultimate Logos Shortcut List, Part 1/5',
    webinarDate: '2026-04-23',
    excerptStartMs: 152_960,
    excerptEndMs: 227_862,
    citation: 'LearnLogos, “The Ultimate Logos Shortcut List, Part 1/5,” webinar, April 23, 2026, 02:32.960–03:47.862.',
  },
  logosVersion: 'Logos 10',
  terms: ['search', 'training'],
  access,
  score: 0.8,
})

describe('searchTraining', () => {
  it('returns deliberate DTOs only after the hard rights allowlist', async () => {
    const approved = candidate('approved', digest('a'), 'owned')
    const denied = candidate('denied', digest('b'), 'owned')
    const port: TrainingSearchPort = { search: vi.fn().mockResolvedValue([denied, approved]) }

    const response = await searchTraining(
      { question: 'How do I search?', limit: 5 },
      { searchPort: port, contentPolicy: createContestContentPolicy([rights('approved', digest('a'))]) },
    )

    expect(response.results).toEqual([expect.objectContaining({ segmentId: 'approved', access: 'owned' })])
    expect(response.results[0].source).toEqual(approved.source)
    expect(response.results[0]).not.toHaveProperty('sha256')
    expect(response.results[0]).not.toHaveProperty('terms')
    expect(response.results[0].source).not.toHaveProperty('sourceUrl')
    expect(response.total).toBe(1)
  })

  it('applies owned-only and result limits after policy filtering', async () => {
    const owned = candidate('owned', digest('a'), 'owned')
    const free = candidate('free', digest('b'), 'free')
    const port: TrainingSearchPort = { search: vi.fn().mockResolvedValue([free, owned]) }
    const policy = createContestContentPolicy([
      rights('owned', digest('a')),
      rights('free', digest('b')),
    ])

    const response = await searchTraining(
      { question: 'search', ownedOnly: true, limit: 1 },
      { searchPort: port, contentPolicy: policy },
    )

    expect(response.results.map((result) => result.segmentId)).toEqual(['owned'])
  })

  it('returns a stable no-result response without a production fallback', async () => {
    const port: TrainingSearchPort = { search: vi.fn().mockResolvedValue([]) }
    const response = await searchTraining(
      { question: 'unknown topic' },
      { searchPort: port, contentPolicy: createContestContentPolicy([]) },
    )
    expect(response).toEqual({ query: 'unknown topic', results: [], total: 0 })
    expect(port.search).toHaveBeenCalledOnce()
  })
})
