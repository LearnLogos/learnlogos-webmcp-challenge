type RuntimeEnvironment = Record<string, string | undefined>
type DeploymentKind = 'production' | 'contest' | 'invalid'

const CONTEST_SURFACES = new Set([
  '/webmcp-challenge',
  '/webmcp-challenge/',
  '/api/webmcp/contest/search',
])

function deploymentKind(env: RuntimeEnvironment): DeploymentKind {
  const value = env.WEBMCP_DEPLOYMENT
  if (value === undefined || value === 'production') return 'production'
  return value === 'contest' ? 'contest' : 'invalid'
}

export function contestSurfaceBypassesProductionProxy(pathname: string): boolean {
  return CONTEST_SURFACES.has(pathname)
}

export function productionRedirectsShouldLoad(env: RuntimeEnvironment): boolean {
  return env.NODE_ENV !== 'development' && deploymentKind(env) === 'production'
}

export function contestDeploymentUsesIsolatedShell(env: RuntimeEnvironment): boolean {
  return deploymentKind(env) === 'contest'
}

export function contestDeploymentAllowsDynamicPath(
  env: RuntimeEnvironment,
  pathname: string,
): boolean {
  const deployment = deploymentKind(env)
  if (deployment === 'production') return true
  return deployment === 'contest' && contestSurfaceBypassesProductionProxy(pathname)
}

export function productionBackgroundWorkersShouldStart(env: RuntimeEnvironment): boolean {
  return env.NEXT_RUNTIME === 'nodejs' && deploymentKind(env) === 'production'
}

export function productionDatabaseAccessAllowed(env: RuntimeEnvironment): boolean {
  return deploymentKind(env) === 'production'
}
