import { describe, expect, it } from 'vitest'

import { createContestContentPolicy } from './contest-content-policy'
import {
  contestRightsRecordSchema,
  type ContestRightsRecord,
  type TrainingSearchCandidate,
} from '../ports/training-search'

const RIGHTS: ContestRightsRecord = {
  assetId: 'contest-training-layouts-v1',
  version: '1',
  sha256: 'a'.repeat(64),
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
}

const CANDIDATE: TrainingSearchCandidate = {
  assetId: RIGHTS.assetId,
  version: RIGHTS.version,
  sha256: RIGHTS.sha256,
  contentKind: RIGHTS.contentKind,
  title: 'Build a repeatable study layout',
  summary: 'Organize a repeatable study workspace.',
  source: {
    webinarTitle: 'Test webinar',
    webinarDate: '2026-04-23',
    excerptStartMs: 1_000,
    excerptEndMs: 2_000,
    citation: 'LearnLogos, “Test webinar,” webinar, April 23, 2026, 00:01.000–00:02.000.',
  },
  logosVersion: 'Logos 10',
  terms: ['layout', 'workspace', 'study'],
  access: 'owned',
  score: 0.9,
}

describe('contest content policy', () => {
  it('allows only an exact approved asset revision on the requested surface', () => {
    const policy = createContestContentPolicy([RIGHTS])
    expect(policy.decide(CANDIDATE, 'search')).toEqual({ allowed: true, reason: 'allowed' })
  })

  it.each([
    [{ ...CANDIDATE, assetId: 'unknown' }, 'asset_not_allowlisted'],
    [{ ...CANDIDATE, version: '2' }, 'asset_version_mismatch'],
    [{ ...CANDIDATE, sha256: 'b'.repeat(64) }, 'asset_digest_mismatch'],
    [{ ...CANDIDATE, contentKind: 'map' as const }, 'content_kind_mismatch'],
  ])('denies an invalid candidate even when it is marked owned', (candidate, reason) => {
    const policy = createContestContentPolicy([RIGHTS])
    expect(policy.decide(candidate, 'search')).toEqual({ allowed: false, reason })
  })

  it('denies pending rights and unapproved surfaces', () => {
    const pending = { ...RIGHTS, reviewStatus: 'pending' as const }
    expect(createContestContentPolicy([pending]).decide(CANDIDATE, 'search').allowed).toBe(false)
    expect(createContestContentPolicy([RIGHTS]).decide(CANDIDATE, 'playback')).toEqual({
      allowed: false,
      reason: 'surface_not_permitted',
    })
  })

  it('denies approved records containing third-party material', () => {
    const policy = createContestContentPolicy([{ ...RIGHTS, containsThirdPartyMaterial: true }])
    expect(policy.decide(CANDIDATE, 'search')).toEqual({
      allowed: false,
      reason: 'third_party_material',
    })
  })

  it('rejects duplicate or malformed rights records at startup', () => {
    expect(() => createContestContentPolicy([RIGHTS, RIGHTS])).toThrow('Duplicate contest asset')
    expect(() => createContestContentPolicy([{ ...RIGHTS, sha256: 'not-a-digest' }])).toThrow()
  })

  it('allows empty reviewer fields only while review is pending', () => {
    const pending = { ...RIGHTS, reviewStatus: 'pending', reviewer: null, reviewedAt: null }
    expect(contestRightsRecordSchema.safeParse(pending).success).toBe(true)
    expect(contestRightsRecordSchema.safeParse({ ...pending, reviewStatus: 'approved' }).success).toBe(false)
  })
})
