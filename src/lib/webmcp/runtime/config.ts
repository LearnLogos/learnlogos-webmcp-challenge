import { z } from 'zod'

const deploymentSchema = z.enum(['production', 'contest']).default('production')
const booleanFlagSchema = z.enum(['true', 'false']).default('false')

export interface WebMcpCapabilities {
  enabled: boolean
  publicTools: boolean
  authenticatedTools: boolean
  transactionalTools: boolean
  publicPreviews: boolean
}

export interface WebMcpRuntime {
  deployment: 'production' | 'contest'
  contestHost: string | null
  capabilities: WebMcpCapabilities
}

type RuntimeEnvironment = Record<string, string | undefined>

function enabledFlag(value: string | undefined): boolean {
  return booleanFlagSchema.parse(value) === 'true'
}

function resolveCapabilities(env: RuntimeEnvironment): WebMcpCapabilities {
  const enabled = enabledFlag(env.WEBMCP_ENABLED)
  const authenticatedTools = enabled && enabledFlag(env.WEBMCP_AUTHENTICATED_TOOLS_ENABLED)

  return {
    enabled,
    publicTools: enabled && enabledFlag(env.WEBMCP_PUBLIC_TOOLS_ENABLED),
    authenticatedTools,
    transactionalTools: authenticatedTools && enabledFlag(env.WEBMCP_TRANSACTIONAL_TOOLS_ENABLED),
    publicPreviews: enabled && enabledFlag(env.WEBMCP_PUBLIC_PREVIEWS_ENABLED),
  }
}

function resolveContestHost(env: RuntimeEnvironment, deployment: WebMcpRuntime['deployment']): string | null {
  const host = env.WEBMCP_CONTEST_HOST?.trim().toLowerCase() || null
  if (deployment === 'contest' && !host) {
    throw new Error('WEBMCP_CONTEST_HOST is required for a contest deployment')
  }
  return host
}

export function resolveWebMcpRuntime(env: RuntimeEnvironment): WebMcpRuntime {
  const deployment = deploymentSchema.parse(env.WEBMCP_DEPLOYMENT)

  return {
    deployment,
    contestHost: resolveContestHost(env, deployment),
    capabilities: resolveCapabilities(env),
  }
}

function normalizeRequestHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
}

export function webMcpRequestIsEnabled(runtime: WebMcpRuntime, requestHost: string): boolean {
  if (!runtime.capabilities.enabled) return false
  if (runtime.deployment !== 'contest') return false
  return normalizeRequestHost(requestHost) === runtime.contestHost
}

export function contestWebMcpRequestIsEnabled(
  runtime: WebMcpRuntime,
  requestHost: string,
): boolean {
  if (runtime.deployment !== 'contest') return false
  if (!runtime.capabilities.enabled || !runtime.capabilities.publicTools) return false
  return normalizeRequestHost(requestHost) === runtime.contestHost
}
