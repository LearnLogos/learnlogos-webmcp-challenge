import type { ContestSearchAuthorization } from './contest-session'

export interface ContestAbuseLimiter {
  authorizeSearch: (clientIdentity: string) => Promise<ContestSearchAuthorization>
}
