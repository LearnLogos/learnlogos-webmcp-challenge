import Redis from 'ioredis'
import type { ContestRedisEvalClient } from './redis-state'

function authenticatedTlsUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'rediss:' || !url.password) {
    throw new Error('Contest Redis requires an authenticated TLS URL')
  }
  return value
}

export function createContestRedisClient(redisUrl: string): ContestRedisEvalClient {
  const client = new Redis(authenticatedTlsUrl(redisUrl), {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
  })
  let pendingConnection: Promise<void> | null = null

  async function connect(): Promise<void> {
    if (client.status === 'ready') return
    pendingConnection ??= client.connect().finally(() => { pendingConnection = null })
    await pendingConnection
  }

  return {
    async eval(script, numberOfKeys, ...args) {
      await connect()
      return client.eval(script, numberOfKeys, ...args)
    },
  }
}
