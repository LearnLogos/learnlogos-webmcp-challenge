import type { ContestAbuseLimiter } from '../ports/contest-abuse'
import type { ContestSessionPort } from '../ports/contest-session'
import { webMcpRequestIsEnabled, type WebMcpRuntime } from '../runtime/config'

const SESSION_COOKIE = '__Host-learnlogos_webmcp_contest'
const MEDIA_PREFIX = '/api/webmcp/contest/media/'
const CAPTION_PREFIX = '/api/webmcp/contest/captions/'
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{8,128}$/

interface PlaybackGrantVerifier {
  verify: (token: string, sessionId: string) => { segmentId: string; version: string } | null
}

interface ContestMediaStore {
  serve: (segmentId: string, rangeHeader: string | null) => Promise<Response | null>
  serveCaptions: (segmentId: string) => Promise<Response | null>
}

interface ContestMediaHandlerDependencies {
  runtime: WebMcpRuntime
  sessions: ContestSessionPort
  abuseLimiter: ContestAbuseLimiter
  clientIdentity: (request: Request) => string | null
  grants: PlaybackGrantVerifier
  store: ContestMediaStore
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
  if (request.headers.get('sec-fetch-site') !== 'same-origin') return false
  const origin = request.headers.get('origin')
  return !origin || origin.toLowerCase() === requestOrigin(request, url, host)
}

function sessionId(request: Request): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`))
    .map((part) => part.slice(SESSION_COOKIE.length + 1))
  if (values.length !== 1 || !SAFE_SEGMENT.test(values[0])) return null
  return values[0]
}

function requestTarget(url: URL): {
  kind: 'media' | 'captions'
  segmentId: string
  token: string
} | null {
  const kind = url.pathname.startsWith(MEDIA_PREFIX)
    ? 'media'
    : url.pathname.startsWith(CAPTION_PREFIX) ? 'captions' : null
  if (!kind) return null
  const prefix = kind === 'media' ? MEDIA_PREFIX : CAPTION_PREFIX
  const segmentId = url.pathname.slice(prefix.length)
  const grants = url.searchParams.getAll('grant')
  if (!SAFE_SEGMENT.test(segmentId) || grants.length !== 1 || url.searchParams.size !== 1) return null
  if (!grants[0] || grants[0].length > 2_048) return null
  return { kind, segmentId, token: grants[0] }
}

export function createContestMediaHandler(dependencies: ContestMediaHandlerDependencies) {
  return async function handleContestMedia(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const host = requestHost(request, url)
    const target = requestTarget(url)
    if (request.method !== 'GET' || !target) return unavailable()
    if (!webMcpRequestIsEnabled(dependencies.runtime, host)
      || !dependencies.runtime.capabilities.publicPreviews) return unavailable()
    if (!requestIsSameOrigin(request, url, host)) return json({ error: 'Forbidden.' }, 403)
    try {
      const clientIdentity = dependencies.clientIdentity(request)
      if (!clientIdentity) return json({ error: 'Forbidden.' }, 403)
      const authorization = await dependencies.abuseLimiter.authorizeSearch(clientIdentity)
      if (!authorization.allowed) {
        return json({ error: 'Contest media limit reached.' }, 429, {
          'retry-after': String(authorization.retryAfterSeconds),
        })
      }
      const cookieSessionId = sessionId(request)
      if (!cookieSessionId || !await dependencies.sessions.resume(cookieSessionId)) return unavailable()
      const asset = dependencies.grants.verify(target.token, cookieSessionId)
      if (!asset || asset.segmentId !== target.segmentId) return unavailable()
      const response = target.kind === 'media'
        ? await dependencies.store.serve(asset.segmentId, request.headers.get('range'))
        : await dependencies.store.serveCaptions(asset.segmentId)
      return response ?? unavailable()
    } catch {
      return json({ error: 'Contest media is unavailable.' }, 500)
    }
  }
}
