import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { signInAsAdmin } from '../support/accounts'

test('administrator enrolls MFA, signs out, and completes MFA sign-in', async ({ page }) => {
  const authDirectory = process.env.POSTERN_E2E_AUTH_DIR
  if (!authDirectory) {
    throw new Error('The E2E auth directory was not configured by the test runner.')
  }
  const admin = JSON.parse(
    await readFile(path.join(authDirectory, 'admin-credentials.json'), 'utf8'),
  ) as { email: string; password: string; totpSecret: string }
  expect(admin.totpSecret).toMatch(/^[A-Z2-7]{32}$/)

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible()

  await signInAsAdmin(page, admin.email, admin.password, admin.totpSecret)
  await expect(page.getByRole('heading', { name: 'Global blocklist' })).toBeVisible()
})
