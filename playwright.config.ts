import { defineConfig, devices } from '@playwright/test'

const origin = process.env.WEBMCP_LIVE_ORIGIN
if (!origin) throw new Error('WEBMCP_LIVE_ORIGIN is required')
const url = new URL(origin)
if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') {
  throw new Error('WEBMCP_LIVE_ORIGIN must be a credential-free HTTPS origin')
}

export default defineConfig({
  testDir: './e2e',
  retries: 0,
  workers: 1,
  use: { baseURL: url.origin, trace: 'retain-on-failure' },
  projects: [{ name: 'supported-chrome', use: { ...devices['Desktop Chrome'] } }],
})
