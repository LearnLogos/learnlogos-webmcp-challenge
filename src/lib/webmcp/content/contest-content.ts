import { z } from 'zod'

import {
  contestRightsRecordSchema,
  trainingSourceProvenanceSchema,
  type ContestContentKind,
  type ContestRightsRecord,
  type ContestSurface,
  type TrainingSearchCandidate,
} from '../ports/training-search'

const privateRightsRecordSchema = contestRightsRecordSchema.extend({
  sourcePath: z.string().trim().min(1).max(200),
}).strict()

const fixtureSchema = z.object({
  assetId: z.string().trim().min(1).max(128),
  captionAssetId: z.string().trim().min(1).max(128),
  transcriptAssetId: z.string().trim().min(1).max(128),
  mediaFile: z.string().regex(/^[a-z0-9-]{3,80}\.mp4$/),
  captionFile: z.string().regex(/^[a-z0-9-]{3,80}\.srt$/),
  version: z.string().trim().min(1).max(32),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  contentKind: z.literal('video'),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(500),
  source: trainingSourceProvenanceSchema,
  logosVersion: z.string().trim().min(1).max(50).nullable(),
  terms: z.array(z.string().trim().min(2).max(40)).min(1).max(20),
  access: z.enum(['owned', 'free']),
  score: z.number().min(0).max(1),
}).strict()
const candidateSchema = fixtureSchema.omit({
  captionAssetId: true,
  transcriptAssetId: true,
  mediaFile: true,
  captionFile: true,
})

type ContestTrainingFixture = z.infer<typeof fixtureSchema>

export const contestTrainingFixtures: ContestTrainingFixture[] = [
  {
    assetId: 'shortcut-program-scaling-v1',
    captionAssetId: 'shortcut-program-scaling-v1-captions',
    transcriptAssetId: 'shortcut-program-scaling-v1-transcript',
    mediaFile: 'shortcut-program-scaling-v1.mp4',
    captionFile: 'shortcut-program-scaling-v1.srt',
    version: '1',
    sha256: '6828810d5e73d189c7b145bc07cb71dd31cb36c4c3b47abce16f26cf0ce61b5c',
    contentKind: 'video',
    title: 'Set Exact Program Scaling',
    summary: 'Set an exact interface scaling percentage and save that command for quick reuse.',
    source: {
      webinarTitle: 'The Ultimate Logos Shortcut List, Part 1/5',
      webinarDate: '2026-04-23',
      excerptStartMs: 152_960,
      excerptEndMs: 227_862,
      citation: 'LearnLogos, “The Ultimate Logos Shortcut List, Part 1/5,” webinar, April 23, 2026, 02:32.960–03:47.862.',
    },
    logosVersion: null,
    terms: ['program', 'scaling', 'percentage', 'favorites', 'shortcut', 'toolbar', 'resolution'],
    access: 'free',
    score: 0,
  },
  {
    assetId: 'shortcut-next-reading-v1',
    captionAssetId: 'shortcut-next-reading-v1-captions',
    transcriptAssetId: 'shortcut-next-reading-v1-transcript',
    mediaFile: 'shortcut-next-reading-v1.mp4',
    captionFile: 'shortcut-next-reading-v1.srt',
    version: '1',
    sha256: '8a67f42f76cfcdca72d0cc040539c9e98d4a84bac4ef9c28c4f6bdba92c76bc5',
    contentKind: 'video',
    title: 'Jump to Your Next Reading',
    summary: 'Use the reading-plan calendar control to jump to the next reading and mark progress complete.',
    source: {
      webinarTitle: 'The Ultimate Logos Shortcut List, Part 2/5',
      webinarDate: '2026-06-18',
      excerptStartMs: 78_320,
      excerptEndMs: 125_159,
      citation: 'LearnLogos, “The Ultimate Logos Shortcut List, Part 2/5,” webinar, June 18, 2026, 01:18.320–02:05.159.',
    },
    logosVersion: null,
    terms: ['reading', 'plan', 'calendar', 'next', 'book', 'progress', 'done'],
    access: 'free',
    score: 0,
  },
].map((fixture) => fixtureSchema.parse(fixture))

export function parseContestRights(inputs: unknown[]): ContestRightsRecord[] {
  return inputs.map((input) => {
    const parsed = privateRightsRecordSchema.parse(input)
    const publicEntries = Object.entries(parsed).filter(([key]) => key !== 'sourcePath')
    return contestRightsRecordSchema.parse(Object.fromEntries(publicEntries))
  })
}

function exactRecord(
  records: Map<string, ContestRightsRecord>,
  assetId: string,
  kind: ContestContentKind,
): ContestRightsRecord {
  const record = records.get(assetId)
  if (!record) throw new Error(`Missing contest rights record: ${assetId}`)
  if (record.contentKind !== kind) throw new Error(`Contest content kind mismatch: ${assetId}`)
  return record
}

function approvedFor(record: ContestRightsRecord, surface: ContestSurface): boolean {
  return record.reviewStatus === 'approved'
    && !record.containsThirdPartyMaterial
    && record.permittedSurfaces.includes(surface)
}

function candidateFrom(fixture: ContestTrainingFixture): TrainingSearchCandidate {
  const publicEntries = Object.entries(fixture)
    .filter(([key]) => ![
      'captionAssetId', 'transcriptAssetId', 'mediaFile', 'captionFile',
    ].includes(key))
  return candidateSchema.parse(Object.fromEntries(publicEntries))
}

export interface ContestMediaAsset {
  segmentId: string
  version: string
  fileName: string
  sha256: string
  captionFile: string
  captionSha256: string
}

function mediaAssetFrom(
  fixture: ContestTrainingFixture,
  records: Map<string, ContestRightsRecord>,
): ContestMediaAsset {
  return {
    segmentId: fixture.assetId,
    version: fixture.version,
    fileName: fixture.mediaFile,
    sha256: fixture.sha256,
    captionFile: fixture.captionFile,
    captionSha256: exactRecord(records, fixture.captionAssetId, 'caption').sha256,
  }
}

export function createContestContent(
  fixtureInputs: ContestTrainingFixture[],
  rightsInputs: ContestRightsRecord[],
): {
  candidates: TrainingSearchCandidate[]
  mediaAssets: ContestMediaAsset[]
  rights: ContestRightsRecord[]
} {
  const fixtures = z.array(fixtureSchema).length(2).parse(fixtureInputs)
  const rights = rightsInputs.map((record) => contestRightsRecordSchema.parse(record))
  const records = new Map(rights.map((record) => [record.assetId, record]))
  if (records.size !== rights.length) throw new Error('Duplicate contest rights record')
  const active = fixtures.filter((fixture) => {
    const video = exactRecord(records, fixture.assetId, 'video')
    const caption = exactRecord(records, fixture.captionAssetId, 'caption')
    const transcript = exactRecord(records, fixture.transcriptAssetId, 'transcript')
    if (video.version !== fixture.version) throw new Error(`Contest version mismatch: ${fixture.assetId}`)
    if (video.sha256 !== fixture.sha256) throw new Error(`Contest digest mismatch: ${fixture.assetId}`)
    return approvedFor(video, 'search')
      && approvedFor(caption, 'playback')
      && approvedFor(transcript, 'search')
  })
  const activeIds = new Set(active.flatMap((fixture) => [
    fixture.assetId, fixture.captionAssetId, fixture.transcriptAssetId,
  ]))
  return {
    candidates: active.map(candidateFrom),
    mediaAssets: active.map((fixture) => mediaAssetFrom(fixture, records)),
    rights: rights.filter((record) => activeIds.has(record.assetId)),
  }
}
