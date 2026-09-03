import {
  searchTrainingInputSchema,
  searchTrainingResponseSchema,
  type SearchTrainingInput,
  type SearchTrainingResponse,
} from '../contracts/v1/search-training'
import { contestSearchEnvelopeSchema } from '../contracts/v1/contest-search'
import type { ContestAbuseLimiter } from '../ports/contest-abuse'
import type { ContestSessionPort } from '../ports/contest-session'
import { contestWebMcpRequestIsEnabled, type WebMcpRuntime } from '../runtime/config'

const SESSION_COOKIE = '__Host-learnlogos_webmcp_contest'
const ENDPOINT = '/api/webmcp/contest/search'
const MAX_BODY_BYTES = 4_096

interface ContestSearchHandlerDependencies {
  runtime: WebMcpRuntime
  sessions: ContestSessionPort
  abuseLimiter: ContestAbuseLimiter
  clientIdentity: (request: Request) => string | null
  search: (input: SearchTrainingInput) => Promise<unknown>
  issuePlayback?: (
    segmentId: string,
    sessionId: string,
  ) => { url: string; captionsUrl: string; expiresAt: number }
}

function json(body: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  })
}

function unavailable(): Response {
  return json({ error: 'Not found.' }, 404)
}

function requestHost(request: Request, url: URL): string {
  const host = request.headers.get('host')?.trim()
  return host && !host.includes(',') ? host : url.host
}

function requestOrigin(request: Request, url: URL, host: string): string {
  const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const protocol = forwarded === 'http' || forwarded === 'https'
    ? forwarded
    : url.protocol.replace(/:$/, '')
  return `${protocol}://${host}`.toLowerCase()
}

function requestIsSameOrigin(request: Request, url: URL, host: string): boolean {
  if (request.headers.get('origin')?.toLowerCase() !== requestOrigin(request, url, host)) return false
  const fetchSite = request.headers.get('sec-fetch-site')
  return !fetchSite || fetchSite === 'same-origin'
}

function getCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return undefined
  const values = cookieHeader.split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`))
    .map((part) => part.slice(SESSION_COOKIE.length + 1))
  if (values.length !== 1 || !values[0] || values[0].length > 256) return undefined
  return values[0]
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let size = 0
  let body = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) return body + decoder.decode()
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    body += decoder.decode(value, { stream: true })
  }
}

async function parseInput(request: Request): Promise<
  | { ok: true; input: SearchTrainingInput }
  | { ok: false; response: Response }
> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return { ok: false, response: json({ error: 'JSON is required.' }, 415) }
  }
  const body = await readBoundedBody(request)
  if (body === null) return { ok: false, response: json({ error: 'Request is too large.' }, 413) }
  try {
    return { ok: true, input: searchTrainingInputSchema.parse(JSON.parse(body)) }
  } catch {
    return { ok: false, response: json({ error: 'Invalid search request.' }, 400) }
  }
}

function sessionCookie(identifier: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(identifier)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=1800`
}

function attachPlayback(
  data: SearchTrainingResponse,
  sessionId: string,
  issuePlayback?: ContestSearchHandlerDependencies['issuePlayback'],
): SearchTrainingResponse {
  if (!issuePlayback) return data
  return searchTrainingResponseSchema.parse({
    ...data,
    results: data.results.map((result) => ({
      ...result,
      playback: issuePlayback(result.segmentId, sessionId),
    })),
  })
}

export function createContestSearchHandler(dependencies: ContestSearchHandlerDependencies) {
  return async function handleContestSearch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const host = requestHost(request, url)
    if (request.method !== 'POST' || url.pathname !== ENDPOINT) return unavailable()
    if (!contestWebMcpRequestIsEnabled(dependencies.runtime, host)) return unavailable()
    if (!requestIsSameOrigin(request, url, host)) return json({ error: 'Forbidden.' }, 403)
    try {
      const clientIdentity = dependencies.clientIdentity(request)
      if (!clientIdentity) return json({ error: 'Forbidden.' }, 403)
      const globalAuthorization = await dependencies.abuseLimiter.authorizeSearch(clientIdentity)
      if (!globalAuthorization.allowed) {
        return json({ error: 'Contest capacity limit reached.' }, 429, {
          'retry-after': String(globalAuthorization.retryAfterSeconds),
        })
      }
      const parsed = await parseInput(request)
      if (!parsed.ok) return parsed.response
      const session = await dependencies.sessions.open(getCookie(request))
      const authorization = await dependencies.sessions.authorizeSearch(session.sessionId)
      if (!authorization.allowed) {
        return json({ error: 'Contest search limit reached.' }, 429, {
          'retry-after': String(authorization.retryAfterSeconds),
        })
      }
      const searched = searchTrainingResponseSchema.parse(await dependencies.search(parsed.input))
      const data = attachPlayback(searched, session.sessionId, dependencies.issuePlayback)
      const envelope = contestSearchEnvelopeSchema.parse({ data, persona: session.snapshot.persona })
      const headers = session.isNew ? { 'set-cookie': sessionCookie(session.sessionId) } : undefined
      return json(envelope, 200, headers)
    } catch {
      return json({ error: 'Contest search is unavailable.' }, 500)
    }
  }
}
