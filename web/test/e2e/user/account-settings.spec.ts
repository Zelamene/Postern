import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('updates and reloads the forwarding destination', async ({ page }) => {
  const forwardingAddress = `forward-${randomUUID()}@example.test`
  await page.goto('/app/account')
  await page.getByLabel('Destination address').fill(forwardingAddress)
  await page.getByRole('button', { name: 'Update destination' }).click()
  await expect(page.getByText('Forwarding address updated. New mail is delivered there.')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Destination address')).toHaveValue(forwardingAddress)
  const accountResponse = await page.request.get('/api/auth/me')
  expect(accountResponse.status()).toBe(200)
  expect((await accountResponse.json()).forwardingAddress).toBe(forwardingAddress)
})

test('signs out and loses access to authenticated API routes', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in to Postern' })).toBeVisible()
  expect((await page.request.get('/api/auth/me')).status()).toBe(401)
  expect((await page.request.get('/api/aliases')).status()).toBe(401)
})
