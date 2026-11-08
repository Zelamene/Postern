import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { createAliasViaUi } from '../support/aliases'

test('deletes the account, retires aliases, and rejects subsequent sign-in', async ({ page }) => {
  const authDirectory = process.env.POSTERN_E2E_AUTH_DIR
  if (!authDirectory) {
    throw new Error('The E2E auth directory was not configured by the test runner.')
  }
  const { email, password } = JSON.parse(
    await readFile(path.join(authDirectory, 'account-deletion-credentials.json'), 'utf8'),
  ) as { email: string; password: string }

  const alias = await createAliasViaUi(page, 'account-deletion-check')
  await page.goto('/app/account')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  const dialog = page.locator('dialog[open]')
  await expect(dialog.getByRole('button', { name: 'Delete account' })).toBeDisabled()
  await dialog.getByLabel(`Type ${email} to confirm`).fill(email)
  await dialog.getByRole('button', { name: 'Delete account' }).click()

  await expect(page).toHaveURL(/\/login$/)
  await page.context().clearCookies()
  const aliasesResponse = await page.request.get('/api/aliases')
  expect(aliasesResponse.status()).toBe(401)

  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.')

  const accountResponse = await page.request.post('/api/auth/login', {
    data: { email, password },
  })
  expect(accountResponse.status()).toBe(401)
  const retiredAliasResponse = await page.request.get(`/api/aliases/${alias.id}/messages`)
  expect(retiredAliasResponse.status()).toBe(401)
})
