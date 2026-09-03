import { describe, expect, it } from 'vitest'

import { createContestTrainingSearchAdapter } from './training-search'
import { contestTrainingFixtures } from '../../content/contest-content'
import type { TrainingSearchCandidate } from '../../ports/training-search'

const fixture = (
  assetId: string,
  title: string,
  terms: string[],
  logosVersion = 'Logos 10',
): TrainingSearchCandidate => ({
  assetId,
  version: '1',
  sha256: 'a'.repeat(64),
  contentKind: 'fixture',
  title,
  summary: `Entrant-authored summary for ${title}.`,
  source: {
    webinarTitle: 'Test webinar',
    webinarDate: '2026-04-23',
    excerptStartMs: 1_000,
    excerptEndMs: 2_000,
    citation: 'LearnLogos, “Test webinar,” webinar, April 23, 2026, 00:01.000–00:02.000.',
  },
  logosVersion,
  terms,
  access: 'owned',
  score: 0,
})

describe('contest training search adapter', () => {
  it('ranks explicit fixtures deterministically with a stable tie-break', async () => {
    const adapter = createContestTrainingSearchAdapter([
      fixture('second', 'Search a library', ['search', 'library']),
      fixture('first', 'Search within a book', ['search', 'book']),
    ])

    const query = { question: 'search', candidateLimit: 10 }
    expect(await adapter.search(query)).toEqual(await adapter.search(query))
    expect((await adapter.search(query)).map((result) => result.assetId)).toEqual(['first', 'second'])
  })

  it('applies exact version and candidate limits', async () => {
    const adapter = createContestTrainingSearchAdapter([
      fixture('logos-10', 'Search in Logos 10', ['search'], 'Logos 10'),
      fixture('logos-9', 'Search in Logos 9', ['search'], 'Logos 9'),
    ])

    const results = await adapter.search({
      question: 'search',
      logosVersion: 'Logos 10',
      candidateLimit: 1,
    })
    expect(results.map((result) => result.assetId)).toEqual(['logos-10'])
  })

  it('returns no result for an unmatched question without any fallback', async () => {
    const adapter = createContestTrainingSearchAdapter([
      fixture('search', 'Search training', ['search']),
    ])
    expect(await adapter.search({ question: 'unrelated', candidateLimit: 5 })).toEqual([])
  })

  it('maps every guided demonstration question to its intended lesson', async () => {
    const adapter = createContestTrainingSearchAdapter(contestTrainingFixtures)
    const cases = [
      ['How do I set program scaling to a specific percentage?', 'shortcut-program-scaling-v1'],
      ['How can I make the Logos interface larger?', 'shortcut-program-scaling-v1'],
      ['How do I save a scaling command to Favorites?', 'shortcut-program-scaling-v1'],
      ['How do I change scaling from the toolbar?', 'shortcut-program-scaling-v1'],
      ['How do I jump to my next reading?', 'shortcut-next-reading-v1'],
      ['How do I use the reading-plan calendar?', 'shortcut-next-reading-v1'],
      ['How do I mark my reading progress complete?', 'shortcut-next-reading-v1'],
      ['How do I move to the next reading in my plan?', 'shortcut-next-reading-v1'],
    ] as const

    for (const [question, assetId] of cases) {
      const results = await adapter.search({ question, candidateLimit: 2 })
      expect(results.map((result) => result.assetId)).toEqual([assetId])
    }
  })

  it('rejects invalid limits at its boundary', async () => {
    const adapter = createContestTrainingSearchAdapter([])
    await expect(adapter.search({ question: 'search', candidateLimit: 0 })).rejects.toThrow()
    await expect(adapter.search({ question: 'search', candidateLimit: 41 })).rejects.toThrow()
  })
})
