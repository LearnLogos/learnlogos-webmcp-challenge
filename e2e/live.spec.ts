import { expect, test } from '@playwright/test'

test('live contest origin exposes only the intended experience', async ({ page, request }) => {
  const response = await page.goto('/webmcp-challenge')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', {
    name: 'Ask a question. Watch the exact lesson.',
  })).toBeVisible()
  await expect(page.getByTestId('webmcp-status')).toContainText(/registered|unsupported/)

  const denied = await request.get('/api/auth/session')
  expect(denied.status()).toBe(404)
  await expect(page.getByRole('button', { name: 'Search training' })).toBeVisible()
})
