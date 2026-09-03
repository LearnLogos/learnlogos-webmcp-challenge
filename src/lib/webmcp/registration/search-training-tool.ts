import { contestSearchEnvelopeSchema, type ContestSearchEnvelope } from '../contracts/v1/contest-search'
import { SEARCH_TRAINING_TOOL, searchTrainingInputSchema } from '../contracts/v1/search-training'
import type { WebMcpTool } from './register-tools'

interface SearchTrainingToolOptions {
  fetcher?: typeof fetch
}

export function createSearchTrainingWebMcpTool(
  options: SearchTrainingToolOptions = {},
): WebMcpTool {
  const fetcher = options.fetcher ?? fetch
  return {
    ...SEARCH_TRAINING_TOOL,
    async execute(input, execution): Promise<ContestSearchEnvelope> {
      const parsed = searchTrainingInputSchema.parse(input)
      const response = await fetcher('/api/webmcp/contest/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed),
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'error',
        signal: execution.signal,
      })
      if (!response.ok) throw new Error(`Contest search is unavailable (${response.status}).`)
      return contestSearchEnvelopeSchema.parse(await response.json())
    },
  }
}
