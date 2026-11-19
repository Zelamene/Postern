import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('visitor submits an invite request to the live API', async ({ page }) => {
  const email = `invite-request-${randomUUID()}@example.test`
  await page.goto('/')
  await page.getByRole('button', { name: 'Request an invite' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Email address').fill(email)

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/invite-requests') &&
      response.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Send request' }).click()
  const response = await responsePromise

  expect(response.status()).toBe(202)
  await expect(page.getByRole('status')).toContainText('Your request has been recorded')
})
