import { Buffer } from 'node:buffer'
import { isAbsolute, resolve } from 'node:path'
import { z } from 'zod'

type RuntimeEnvironment = Record<string, string | undefined>

export interface ContestMediaConfig {
  mediaRoot: string
  grantSecret: string
  grantTtlMs: number
}

const secretSchema = z.string().refine((value) => {
  const length = Buffer.byteLength(value)
  return length >= 32 && length <= 256
}, 'Contest media grant secret must contain 32 to 256 bytes')

function mediaRoot(value: string | undefined): string {
  const parsed = z.string().trim().min(1).max(1_024).parse(value)
  if (!isAbsolute(parsed) || parsed === '/' || resolve(parsed) !== parsed) {
    throw new Error('Contest media root must be a normalized dedicated absolute directory')
  }
  return parsed
}

function redisPassword(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value).password || undefined
  } catch {
    return undefined
  }
}

function grantSecret(env: RuntimeEnvironment): string {
  const secret = secretSchema.parse(env.WEBMCP_CONTEST_MEDIA_GRANT_SECRET)
  const reserved = [
    env.WEBMCP_CONTEST_CLIENT_HASH_SECRET,
    env.NEXTAUTH_SECRET,
    env.AUTH_SECRET,
    redisPassword(env.WEBMCP_CONTEST_REDIS_URL),
  ]
  if (reserved.some((value) => value && value === secret)) {
    throw new Error('Contest media signing requires a dedicated secret')
  }
  return secret
}

export function resolveContestMediaConfig(env: RuntimeEnvironment): ContestMediaConfig {
  if (env.WEBMCP_DEPLOYMENT !== 'contest' || env.WEBMCP_PUBLIC_PREVIEWS_ENABLED !== 'true') {
    throw new Error('Contest media is available only for enabled contest previews')
  }
  const seconds = z.coerce.number().int().min(1).max(300).default(120)
    .parse(env.WEBMCP_CONTEST_MEDIA_GRANT_TTL_SECONDS)
  return {
    mediaRoot: mediaRoot(env.WEBMCP_CONTEST_MEDIA_ROOT),
    grantSecret: grantSecret(env),
    grantTtlMs: seconds * 1_000,
  }
}
