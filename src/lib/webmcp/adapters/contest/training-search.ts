import type {
  TrainingSearchCandidate,
  TrainingSearchPort,
  TrainingSearchQuery,
} from '../../ports/training-search'

const QUERY_STOP_WORDS = new Set([
  'a', 'an', 'and', 'can', 'do', 'from', 'how', 'i', 'in', 'is', 'make', 'my', 'of', 'on', 'the', 'to',
])

function tokenize(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length > 1) ?? []
}

function scoreCandidate(candidate: TrainingSearchCandidate, queryTerms: Set<string>): number {
  const candidateTerms = new Set(tokenize([
    candidate.title,
    candidate.summary,
    ...candidate.terms,
  ].join(' ')))
  const matches = [...queryTerms].filter((term) => candidateTerms.has(term)).length
  return queryTerms.size ? matches / queryTerms.size : 0
}

function validateQuery(query: TrainingSearchQuery): void {
  if (!query.question.trim()) throw new Error('Contest search question is required')
  if (!Number.isInteger(query.candidateLimit) || query.candidateLimit < 1 || query.candidateLimit > 40) {
    throw new Error('Contest candidate limit must be between 1 and 40')
  }
}

export function createContestTrainingSearchAdapter(
  fixtures: TrainingSearchCandidate[],
): TrainingSearchPort {
  const contestFixtures = fixtures.map((fixture) => ({ ...fixture, terms: [...fixture.terms] }))
  return {
    async search(query) {
      validateQuery(query)
      const queryTerms = new Set(
        tokenize(query.question).filter((term) => !QUERY_STOP_WORDS.has(term)),
      )
      return contestFixtures
        .filter((candidate) => !query.logosVersion || candidate.logosVersion === query.logosVersion)
        .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, queryTerms) }))
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score || left.assetId.localeCompare(right.assetId))
        .slice(0, query.candidateLimit)
    },
  }
}
