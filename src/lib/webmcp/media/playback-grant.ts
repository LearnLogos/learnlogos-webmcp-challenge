import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{8,128}$/
const grantAssetSchema = z.object({
  segmentId: z.string().regex(SAFE_IDENTIFIER),
  version: z.string().trim().min(1).max(32),
}).strict()
const payloadSchema = z.object({
  v: z.literal(1),
  segmentId: z.string().regex(SAFE_IDENTIFIER),
  version: z.string().trim().min(1).max(32),
  expiresAt: z.number().int().positive(),
  sessionBinding: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict()

export type PlaybackGrantAsset = z.infer<typeof grantAssetSchema>

interface PlaybackGrantOptions {
  assets: PlaybackGrantAsset[]
  secret: string
  ttlMs: number
  now: () => number
}

function hmac(secret: string, value: string): Buffer {
  return createHmac('sha256', secret).update(value).digest()
}

function sessionBinding(secret: string, sessionId: string): string {
  return hmac(secret, `contest-session\0${sessionId}`).toString('base64url')
}

function safeSignatureMatch(actual: string, expected: Buffer): boolean {
  try {
    const decoded = Buffer.from(actual, 'base64url')
    return decoded.length === expected.length && timingSafeEqual(decoded, expected)
  } catch {
    return false
  }
}

function parseToken(token: string, secret: string) {
  if (token.length > 2_048) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  if (!safeSignatureMatch(parts[1], hmac(secret, parts[0]))) return null
  try {
    return payloadSchema.parse(JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')))
  } catch {
    return null
  }
}

function validateOptions(options: PlaybackGrantOptions): Map<string, PlaybackGrantAsset> {
  if (Buffer.byteLength(options.secret) < 32 || Buffer.byteLength(options.secret) > 256) {
    throw new Error('Contest playback grant secret must contain 32 to 256 bytes')
  }
  if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs < 1 || options.ttlMs > 300_000) {
    throw new Error('Contest playback grant lifetime must be between 1 ms and five minutes')
  }
  const assets = options.assets.map((asset) => grantAssetSchema.parse(asset))
  const byId = new Map(assets.map((asset) => [asset.segmentId, asset]))
  if (byId.size !== assets.length) throw new Error('Duplicate contest playback asset')
  return byId
}

export function createPlaybackGrantService(options: PlaybackGrantOptions) {
  const assets = validateOptions(options)
  return {
    issue(segmentId: string, sessionId: string) {
      if (!SAFE_IDENTIFIER.test(sessionId)) throw new Error('Invalid contest session')
      const asset = assets.get(segmentId)
      if (!asset) throw new Error('Contest segment is not available')
      const expiresAt = options.now() + options.ttlMs
      const payload = payloadSchema.parse({
        v: 1, segmentId: asset.segmentId, version: asset.version, expiresAt,
        sessionBinding: sessionBinding(options.secret, sessionId),
      })
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const token = `${encoded}.${hmac(options.secret, encoded).toString('base64url')}`
      return { token, expiresAt }
    },
    verify(token: string, sessionId: string): PlaybackGrantAsset | null {
      if (!SAFE_IDENTIFIER.test(sessionId)) return null
      const payload = parseToken(token, options.secret)
      if (!payload || payload.expiresAt <= options.now()) return null
      if (payload.sessionBinding !== sessionBinding(options.secret, sessionId)) return null
      const asset = assets.get(payload.segmentId)
      if (!asset || asset.version !== payload.version) return null
      return { ...asset }
    },
  }
}
