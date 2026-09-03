import { describe, expect, it } from 'vitest'
import {
  contestDeploymentUsesIsolatedShell,
  contestDeploymentAllowsDynamicPath,
  contestSurfaceBypassesProductionProxy,
  productionRedirectsShouldLoad,
  productionBackgroundWorkersShouldStart,
  productionDatabaseAccessAllowed,
} from './isolation'

describe('contest deployment isolation', () => {
  it('bypasses production-backed proxy services only for exact contest surfaces', () => {
    expect(contestSurfaceBypassesProductionProxy('/webmcp-challenge')).toBe(true)
    expect(contestSurfaceBypassesProductionProxy('/webmcp-challenge/')).toBe(true)
    expect(contestSurfaceBypassesProductionProxy('/api/webmcp/contest/search')).toBe(true)
    expect(contestSurfaceBypassesProductionProxy('/webmcp-challenge-admin')).toBe(false)
    expect(contestSurfaceBypassesProductionProxy('/api/webmcp/contest/customer')).toBe(false)
    expect(contestSurfaceBypassesProductionProxy('/account')).toBe(false)
  })

  it('disables production redirect loading for every contest build', () => {
    expect(productionRedirectsShouldLoad({
      NODE_ENV: 'production',
      WEBMCP_DEPLOYMENT: 'contest',
    })).toBe(false)
    expect(productionRedirectsShouldLoad({ NODE_ENV: 'development' })).toBe(false)
    expect(productionRedirectsShouldLoad({ NODE_ENV: 'production' })).toBe(true)
    expect(productionRedirectsShouldLoad({
      NODE_ENV: 'production',
      WEBMCP_DEPLOYMENT: 'invalid',
    })).toBe(false)
  })

  it('selects the isolated root shell from deployment config, not a URL or input', () => {
    expect(contestDeploymentUsesIsolatedShell({ WEBMCP_DEPLOYMENT: 'contest' })).toBe(true)
    expect(contestDeploymentUsesIsolatedShell({ WEBMCP_DEPLOYMENT: 'production' })).toBe(false)
    expect(contestDeploymentUsesIsolatedShell({ CONTEST_MODE: 'true' })).toBe(false)
  })

  it('denies every non-contest dynamic route in a contest deployment', () => {
    const contest = { WEBMCP_DEPLOYMENT: 'contest' }

    expect(contestDeploymentAllowsDynamicPath(contest, '/webmcp-challenge')).toBe(true)
    expect(contestDeploymentAllowsDynamicPath(contest, '/api/webmcp/contest/search')).toBe(true)
    expect(contestDeploymentAllowsDynamicPath(contest, '/')).toBe(false)
    expect(contestDeploymentAllowsDynamicPath(contest, '/account')).toBe(false)
    expect(contestDeploymentAllowsDynamicPath(contest, '/api/auth/session')).toBe(false)
    expect(contestDeploymentAllowsDynamicPath({}, '/account')).toBe(true)
    expect(contestDeploymentAllowsDynamicPath({ WEBMCP_DEPLOYMENT: 'invalid' }, '/account')).toBe(false)
  })

  it('never starts production monitoring or AI workers in a contest process', () => {
    expect(productionBackgroundWorkersShouldStart({
      NEXT_RUNTIME: 'nodejs',
      WEBMCP_DEPLOYMENT: 'contest',
    })).toBe(false)
    expect(productionBackgroundWorkersShouldStart({
      NEXT_RUNTIME: 'nodejs',
      WEBMCP_DEPLOYMENT: 'production',
    })).toBe(true)
    expect(productionBackgroundWorkersShouldStart({
      WEBMCP_DEPLOYMENT: 'production',
    })).toBe(false)
    expect(productionBackgroundWorkersShouldStart({
      NEXT_RUNTIME: 'nodejs',
      WEBMCP_DEPLOYMENT: 'invalid',
    })).toBe(false)
  })

  it('denies production database access even if a contest process receives a URL', () => {
    expect(productionDatabaseAccessAllowed({
      WEBMCP_DEPLOYMENT: 'contest',
      DATABASE_URL: 'postgresql://production.example/private',
    })).toBe(false)
    expect(productionDatabaseAccessAllowed({
      WEBMCP_DEPLOYMENT: 'production',
      DATABASE_URL: 'postgresql://production.example/private',
    })).toBe(true)
    expect(productionDatabaseAccessAllowed({ WEBMCP_DEPLOYMENT: 'invalid' })).toBe(false)
  })
})
