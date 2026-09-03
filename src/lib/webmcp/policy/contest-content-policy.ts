import {
  contestRightsRecordSchema,
  type ContestRightsRecord,
  type ContestSurface,
  type TrainingSearchCandidate,
} from '../ports/training-search'

export type ContestContentDenialReason =
  | 'asset_not_allowlisted'
  | 'asset_version_mismatch'
  | 'asset_digest_mismatch'
  | 'content_kind_mismatch'
  | 'rights_not_approved'
  | 'third_party_material'
  | 'surface_not_permitted'

export type ContestContentDecision =
  | { allowed: true; reason: 'allowed' }
  | { allowed: false; reason: ContestContentDenialReason }

export interface ContestContentPolicy {
  decide: (candidate: TrainingSearchCandidate, surface: ContestSurface) => ContestContentDecision
}

function decideCandidate(
  record: ContestRightsRecord | undefined,
  candidate: TrainingSearchCandidate,
  surface: ContestSurface,
): ContestContentDecision {
  if (!record) return { allowed: false, reason: 'asset_not_allowlisted' }
  if (record.version !== candidate.version) return { allowed: false, reason: 'asset_version_mismatch' }
  if (record.sha256 !== candidate.sha256) return { allowed: false, reason: 'asset_digest_mismatch' }
  if (record.contentKind !== candidate.contentKind) return { allowed: false, reason: 'content_kind_mismatch' }
  if (record.reviewStatus !== 'approved') return { allowed: false, reason: 'rights_not_approved' }
  if (record.containsThirdPartyMaterial) return { allowed: false, reason: 'third_party_material' }
  if (!record.permittedSurfaces.includes(surface)) return { allowed: false, reason: 'surface_not_permitted' }
  return { allowed: true, reason: 'allowed' }
}

export function createContestContentPolicy(records: ContestRightsRecord[]): ContestContentPolicy {
  const rightsByAsset = new Map<string, ContestRightsRecord>()
  for (const input of records) {
    const record = contestRightsRecordSchema.parse(input)
    if (rightsByAsset.has(record.assetId)) throw new Error(`Duplicate contest asset: ${record.assetId}`)
    rightsByAsset.set(record.assetId, record)
  }
  return {
    decide: (candidate, surface) => decideCandidate(rightsByAsset.get(candidate.assetId), candidate, surface),
  }
}
