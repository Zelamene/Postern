import { expect, test } from '@playwright/test'

test('rejects invalid credentials and protects signed-in API routes', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email address').fill('missing-user@example.test')
  await page.getByLabel('Password').fill('not a valid password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.')

  expect((await page.request.get('/api/auth/me')).status()).toBe(401)
  expect((await page.request.get('/api/aliases')).status()).toBe(401)
})
