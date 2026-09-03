import {
  searchTrainingInputSchema,
  searchTrainingResponseSchema,
  type SearchTrainingInput,
  type SearchTrainingResponse,
} from '../contracts/v1/search-training'
import type { ContestContentPolicy } from '../policy/contest-content-policy'
import type { TrainingSearchCandidate, TrainingSearchPort } from '../ports/training-search'

interface SearchTrainingDependencies {
  searchPort: TrainingSearchPort
  contentPolicy: ContestContentPolicy
}

function toPublicResult(candidate: TrainingSearchCandidate) {
  return {
    segmentId: candidate.assetId,
    title: candidate.title,
    summary: candidate.summary,
    source: candidate.source,
    logosVersion: candidate.logosVersion,
    access: candidate.access,
    relevance: Math.min(1, Math.max(0, candidate.score)),
    whyMatched: 'Matched approved contest training metadata.',
    contentClassification: 'public-contest' as const,
  }
}

export async function searchTraining(
  input: SearchTrainingInput,
  dependencies: SearchTrainingDependencies,
): Promise<SearchTrainingResponse> {
  const query = searchTrainingInputSchema.parse(input)
  const candidates = await dependencies.searchPort.search({
    question: query.question,
    logosVersion: query.logosVersion,
    candidateLimit: Math.min(query.limit * 4, 40),
  })
  const allowed = candidates.filter((candidate) => {
    if (!dependencies.contentPolicy.decide(candidate, 'search').allowed) return false
    return !query.ownedOnly || candidate.access === 'owned'
  })
  return searchTrainingResponseSchema.parse({
    query: query.question,
    results: allowed.slice(0, query.limit).map(toPublicResult),
    total: Math.min(allowed.length, query.limit),
  })
}
