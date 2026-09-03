import { z } from 'zod'

type RuntimeEnvironment = Record<string, string | undefined>

const deploymentSchema = z.enum(['production', 'contest']).default('production')
const clientIpHeaderSchema = z.enum([
  'cf-connecting-ip',
  'fly-client-ip',
  'true-client-ip',
  'x-real-ip',
])
const positiveInteger = (fallback: number, maximum: number) => z.coerce.number()
  .int().min(1).max(maximum).default(fallback)

export interface ContestStateConfig {
  redisUrl: string
  namespace: 'webmcp-contest:v1'
  clientIpHeader: z.infer<typeof clientIpHeaderSchema>
  clientHashSecret: string
  sessionTtlMs: number
  maxSessions: number
  sessionSearchLimit: number
  sessionSearchWindowMs: number
  clientSearchLimit: number
  globalSearchLimit: number
  globalSearchWindowMs: number
}

function dedicatedRedisUrl(env: RuntimeEnvironment): string {
  const value = z.string().url().parse(env.WEBMCP_CONTEST_REDIS_URL)
  const url = new URL(value)
  if (url.protocol !== 'rediss:' || !url.password) {
    throw new Error('Contest shared state requires an authenticated TLS Redis URL')
  }
  const productionUrlHost = env.REDIS_URL ? new URL(env.REDIS_URL).hostname : null
  const productionHosts = [env.REDIS_HOST, productionUrlHost].filter(Boolean)
  if (env.REDIS_URL === value
    || productionHosts.some((host) => host?.toLowerCase() === url.hostname.toLowerCase())) {
    throw new Error('Contest shared state must not reuse production Redis')
  }
  return value
}

function milliseconds(seconds: number): number {
  return seconds * 1_000
}

function clientHashSecret(env: RuntimeEnvironment, redisUrl: string): string {
  const secret = z.string().min(32).max(256).parse(env.WEBMCP_CONTEST_CLIENT_HASH_SECRET)
  const reused = [env.NEXTAUTH_SECRET, env.REDIS_PASSWORD, new URL(redisUrl).password]
  if (reused.some((value) => value && value === secret)) {
    throw new Error('Contest client hashing must use a dedicated secret')
  }
  return secret
}

export function resolveContestStateConfig(env: RuntimeEnvironment): ContestStateConfig {
  if (deploymentSchema.parse(env.WEBMCP_DEPLOYMENT) !== 'contest') {
    throw new Error('Contest shared state is available only in a contest deployment')
  }
  const redisUrl = dedicatedRedisUrl(env)
  return {
    redisUrl,
    namespace: 'webmcp-contest:v1',
    clientIpHeader: clientIpHeaderSchema.parse(env.WEBMCP_CONTEST_CLIENT_IP_HEADER),
    clientHashSecret: clientHashSecret(env, redisUrl),
    sessionTtlMs: milliseconds(positiveInteger(1_800, 86_400).parse(env.WEBMCP_CONTEST_SESSION_TTL_SECONDS)),
    maxSessions: positiveInteger(1_000, 100_000).parse(env.WEBMCP_CONTEST_MAX_SESSIONS),
    sessionSearchLimit: positiveInteger(30, 1_000).parse(env.WEBMCP_CONTEST_SESSION_SEARCH_LIMIT),
    sessionSearchWindowMs: milliseconds(positiveInteger(60, 3_600)
      .parse(env.WEBMCP_CONTEST_SESSION_SEARCH_WINDOW_SECONDS)),
    clientSearchLimit: positiveInteger(30, 1_000).parse(env.WEBMCP_CONTEST_CLIENT_SEARCH_LIMIT),
    globalSearchLimit: positiveInteger(300, 10_000).parse(env.WEBMCP_CONTEST_GLOBAL_SEARCH_LIMIT),
    globalSearchWindowMs: milliseconds(positiveInteger(60, 3_600)
      .parse(env.WEBMCP_CONTEST_GLOBAL_SEARCH_WINDOW_SECONDS)),
  }
}
