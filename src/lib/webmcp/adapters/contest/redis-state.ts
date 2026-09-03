import { z } from 'zod'
import type { ContestSearchAuthorization } from '../../ports/contest-session'
import type { ContestSharedStateBackend } from './shared-state'

export interface ContestRedisEvalClient {
  eval: (script: string, numberOfKeys: number, ...args: Array<string | number>) => Promise<unknown>
}

const OPEN_EXISTING = `
local exists = redis.call('EXISTS', KEYS[1])
if exists == 0 then return {0, 0} end
local searches = tonumber(redis.call('HGET', KEYS[1], 'searches') or '0')
redis.call('PEXPIRE', KEYS[1], ARGV[1])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])
return {1, searches}
`

const CREATE_SESSION = `
if redis.call('EXISTS', KEYS[2]) == 1 then return {0} end
local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
for _, id in ipairs(expired) do redis.call('DEL', ARGV[5] .. id) end
if #expired > 0 then redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1]) end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[4]) then
  local evicted = redis.call('ZPOPMIN', KEYS[1], 1)
  if #evicted > 0 then redis.call('DEL', ARGV[5] .. evicted[1]) end
end
redis.call('HSET', KEYS[2], 'searches', 0, 'windowStartedAt', ARGV[1], 'windowCount', 0)
redis.call('PEXPIRE', KEYS[2], ARGV[2])
redis.call('ZADD', KEYS[1], ARGV[3], ARGV[6])
return {1}
`

const AUTHORIZE_SESSION = `
if redis.call('EXISTS', KEYS[1]) == 0 then return {0, 1} end
local started = tonumber(redis.call('HGET', KEYS[1], 'windowStartedAt') or ARGV[1])
local count = tonumber(redis.call('HGET', KEYS[1], 'windowCount') or '0')
if tonumber(ARGV[1]) - started >= tonumber(ARGV[3]) then started = tonumber(ARGV[1]); count = 0 end
if count >= tonumber(ARGV[2]) then
  local remaining = tonumber(ARGV[3]) - (tonumber(ARGV[1]) - started)
  return {0, math.max(1, math.floor((remaining + 999) / 1000))}
end
redis.call('HSET', KEYS[1], 'windowStartedAt', started, 'windowCount', count + 1)
redis.call('HINCRBY', KEYS[1], 'searches', 1)
return {1, 0}
`

const AUTHORIZE_ABUSE = `
local function window(key)
  local started = tonumber(redis.call('HGET', key, 'windowStartedAt') or ARGV[1])
  local count = tonumber(redis.call('HGET', key, 'windowCount') or '0')
  if tonumber(ARGV[1]) - started >= tonumber(ARGV[4]) then return tonumber(ARGV[1]), 0 end
  return started, count
end
local clientStarted, clientCount = window(KEYS[1])
local globalStarted, globalCount = window(KEYS[2])
if clientCount >= tonumber(ARGV[2]) or globalCount >= tonumber(ARGV[3]) then
  local clientRetry = clientCount >= tonumber(ARGV[2]) and tonumber(ARGV[4]) - (tonumber(ARGV[1]) - clientStarted) or 0
  local globalRetry = globalCount >= tonumber(ARGV[3]) and tonumber(ARGV[4]) - (tonumber(ARGV[1]) - globalStarted) or 0
  return {0, math.max(1, math.floor((math.max(clientRetry, globalRetry) + 999) / 1000))}
end
redis.call('HSET', KEYS[1], 'windowStartedAt', clientStarted, 'windowCount', clientCount + 1)
redis.call('HSET', KEYS[2], 'windowStartedAt', globalStarted, 'windowCount', globalCount + 1)
redis.call('PEXPIRE', KEYS[1], ARGV[4])
redis.call('PEXPIRE', KEYS[2], ARGV[4])
return {1, 0}
`

const resultSchema = z.array(z.union([z.number(), z.string()])).min(1).max(2)

function resultNumbers(result: unknown): number[] {
  return resultSchema.parse(result).map((value) => {
    const number = Number(value)
    if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid contest state result')
    return number
  })
}

function authorization(result: unknown): ContestSearchAuthorization {
  const [allowed, retryAfterSeconds] = resultNumbers(result)
  if (allowed === 1 && retryAfterSeconds === 0) return { allowed: true, retryAfterSeconds: 0 }
  if (allowed === 0 && retryAfterSeconds && retryAfterSeconds > 0) {
    return { allowed: false, retryAfterSeconds }
  }
  throw new Error('Invalid contest authorization result')
}

export function createRedisContestStateBackend(
  client: ContestRedisEvalClient,
  namespace: string,
): ContestSharedStateBackend {
  const keyPrefix = `${namespace}:{contest}:`
  const indexKey = `${keyPrefix}sessions`
  const sessionPrefix = `${keyPrefix}session:`
  return {
    async openExisting(id, now, ttlMs) {
      const result = resultNumbers(await client.eval(
        OPEN_EXISTING, 2, `${sessionPrefix}${id}`, indexKey, ttlMs, now + ttlMs, id,
      ))
      return result[0] === 1 && result[1] !== undefined ? result[1] : null
    },
    async createSession(id, now, ttlMs, maxSessions) {
      const result = resultNumbers(await client.eval(
        CREATE_SESSION, 2, indexKey, `${sessionPrefix}${id}`,
        now, ttlMs, now + ttlMs, maxSessions, sessionPrefix, id,
      ))
      return result[0] === 1
    },
    authorizeSession(id, now, limit, windowMs) {
      return client.eval(AUTHORIZE_SESSION, 1, `${sessionPrefix}${id}`, now, limit, windowMs)
        .then(authorization)
    },
    authorizeAbuse(clientIdentity, now, clientLimit, globalLimit, windowMs) {
      return client.eval(
        AUTHORIZE_ABUSE,
        2,
        `${keyPrefix}abuse:client:${clientIdentity}`,
        `${keyPrefix}abuse:global-search`,
        now,
        clientLimit,
        globalLimit,
        windowMs,
      ).then(authorization)
    },
  }
}
