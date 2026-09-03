import { describe, expect, it } from 'vitest'

import rightsInputs from '../../../../config/webmcp-contest-rights.private.json'
import { createContestContent, contestTrainingFixtures, parseContestRights } from './contest-content'

function approveAll() {
  return parseContestRights(rightsInputs).map((record) => ({
    ...record,
    reviewStatus: 'approved' as const,
    reviewer: 'Test content reviewer',
    reviewedAt: '2026-08-31T20:00:00.000Z',
  }))
}

function pendAll() {
  return parseContestRights(rightsInputs).map((record) => ({
    ...record,
    reviewStatus: 'pending' as const,
    reviewer: null,
    reviewedAt: null,
  }))
}

describe('contest content activation', () => {
  it('defines exactly the two selected shortcut fixtures', () => {
    expect(contestTrainingFixtures.map((fixture) => fixture.assetId)).toEqual([
      'shortcut-program-scaling-v1',
      'shortcut-next-reading-v1',
    ])
    expect(contestTrainingFixtures.map((fixture) => fixture.source)).toEqual([
      {
        webinarTitle: 'The Ultimate Logos Shortcut List, Part 1/5',
        webinarDate: '2026-04-23',
        excerptStartMs: 152_960,
        excerptEndMs: 227_862,
        citation: 'LearnLogos, “The Ultimate Logos Shortcut List, Part 1/5,” webinar, April 23, 2026, 02:32.960–03:47.862.',
      },
      {
        webinarTitle: 'The Ultimate Logos Shortcut List, Part 2/5',
        webinarDate: '2026-06-18',
        excerptStartMs: 78_320,
        excerptEndMs: 125_159,
        citation: 'LearnLogos, “The Ultimate Logos Shortcut List, Part 2/5,” webinar, June 18, 2026, 01:18.320–02:05.159.',
      },
    ])
    expect(parseContestRights(rightsInputs)).toHaveLength(6)
  })

  it('keeps all fixtures unavailable while review records are pending', () => {
    expect(createContestContent(contestTrainingFixtures, pendAll()))
      .toEqual({ candidates: [], mediaAssets: [], rights: [] })
  })

  it('activates both fixtures only when every bundle file is approved', () => {
    const approved = approveAll()
    const active = createContestContent(contestTrainingFixtures, approved)
    expect(active.candidates).toHaveLength(2)
    expect(active.mediaAssets).toEqual([
      {
        segmentId: 'shortcut-program-scaling-v1', version: '1',
        fileName: 'shortcut-program-scaling-v1.mp4', sha256: '6828810d5e73d189c7b145bc07cb71dd31cb36c4c3b47abce16f26cf0ce61b5c',
        captionFile: 'shortcut-program-scaling-v1.srt',
        captionSha256: '1b17f6fb928bf26bd08ce1225db9e7ee01c94db2c182249a7fcfd53080284f0a',
      },
      {
        segmentId: 'shortcut-next-reading-v1', version: '1',
        fileName: 'shortcut-next-reading-v1.mp4', sha256: '8a67f42f76cfcdca72d0cc040539c9e98d4a84bac4ef9c28c4f6bdba92c76bc5',
        captionFile: 'shortcut-next-reading-v1.srt',
        captionSha256: 'd8dc856f6e1962dc8f66cd5d9ee2341ccf5e20adc3c799cf71b123ec23c8540d',
      },
    ])

    const incomplete = approved.map((record) => record.assetId === 'shortcut-program-scaling-v1-captions'
      ? { ...record, reviewStatus: 'pending' as const, reviewer: null, reviewedAt: null }
      : record)
    expect(createContestContent(contestTrainingFixtures, incomplete).candidates.map(({ assetId }) => assetId))
      .toEqual(['shortcut-next-reading-v1'])
  })

  it('rejects a fixture whose video digest differs from its rights record', () => {
    const changed = contestTrainingFixtures.map((fixture) => fixture.assetId === 'shortcut-program-scaling-v1'
      ? { ...fixture, sha256: 'f'.repeat(64) }
      : fixture)
    expect(() => createContestContent(changed, approveAll())).toThrow('digest')
  })
})
