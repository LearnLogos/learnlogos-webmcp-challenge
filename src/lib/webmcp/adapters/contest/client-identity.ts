import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

export type ContestClientIdentityResolver = (request: Request) => string | null

export function createContestClientIdentityResolver(
  headerName: string,
  hashSecret: string,
): ContestClientIdentityResolver {
  return (request) => {
    const address = request.headers.get(headerName)?.trim()
    if (!address || address.includes(',') || isIP(address) === 0) return null
    return createHmac('sha256', hashSecret).update(address).digest('hex')
  }
}
