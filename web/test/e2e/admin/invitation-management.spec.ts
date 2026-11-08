import { randomBytes, randomUUID } from 'node:crypto'
import { expect, test, type Browser } from '@playwright/test'

async function submitRequest(browser: Browser, baseURL: string, email: string) {
  const context = await browser.newContext({ baseURL })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'Request an invite' }).click()
    await page.getByLabel('Email address').fill(email)
    const request = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/invite-requests') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Send request' }).click()
    expect((await request).status()).toBe(202)
    await expect(page.getByRole('status')).toContainText('Your request has been recorded')
  } finally {
    await context.close()
  }
}

test('reviews requests and approves, resends, revokes, and rejects invitations', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const approvedEmail = `approved-${randomUUID()}@example.test`
  const rejectedEmail = `rejected-${randomUUID()}@example.test`
  const revokedEmail = `revoked-${randomUUID()}@example.test`
  await submitRequest(browser, baseURL!, approvedEmail)
  await submitRequest(browser, baseURL!, rejectedEmail)
  await submitRequest(browser, baseURL!, revokedEmail)

  await page.goto('/admin')
  await page.getByRole('button', { name: 'Refresh' }).click()
  const approvedRequest = page
    .getByRole('listitem')
    .filter({ hasText: approvedEmail })
  await expect(approvedRequest).toBeVisible()
  await approvedRequest.getByRole('button', { name: 'Approve' }).click()
  await expect(approvedRequest).toHaveCount(0)

  const apiUrl = process.env.POSTERN_E2E_API_URL
  if (!apiUrl) {
    throw new Error('The E2E API URL was not configured by the test runner.')
  }
  const developmentInvites = await (
    await page.request.get(`${apiUrl}/api/dev/invites`)
  ).json()
  const invite = developmentInvites.invites.find(
    (item: { email: string; code: string }) => item.email === approvedEmail,
  )
  expect(invite?.code).toBeTruthy()
  const inviteContext = await browser.newContext({ baseURL })
  try {
    const invitee = await inviteContext.newPage()
    await inviteContext.grantPermissions(['clipboard-read', 'clipboard-write'])
    await invitee.goto(`/invite/${invite.code}`)
    await expect(invitee.getByLabel('Invited email address')).toHaveValue(approvedEmail)
    const password = randomBytes(32).toString('base64url')
    await invitee.getByLabel('Password').fill(password)
    const registrationPromise = invitee.waitForResponse(
      (response) =>
        response.url().endsWith('/api/auth/register') &&
        response.request().method() === 'POST',
    )
    await invitee.getByRole('button', { name: 'Accept invitation' }).click()
    expect((await registrationPromise).status()).toBe(202)
    await expect(invitee.getByRole('status')).toContainText('ready for email verification')
    await invitee.goto('/login')
    await invitee.getByLabel('Email address').fill(approvedEmail)
    await invitee.getByLabel('Password').fill(password)
    await invitee.getByRole('button', { name: 'Sign in' }).click()
    await expect(invitee.getByRole('alert')).toContainText('destination verification')
    expect(
      (
        await invitee.request.post(
          `${apiUrl}/api/dev/destinations/${encodeURIComponent(approvedEmail)}/verify`,
        )
      ).status(),
    ).toBe(204)
    const verifiedLogin = invitee.waitForResponse(
      (response) =>
        response.url().endsWith('/api/auth/login') &&
        response.request().method() === 'POST',
    )
    await invitee.getByRole('button', { name: 'Sign in' }).click()
    const loginResponse = await verifiedLogin
    expect(
      loginResponse.status(),
      `Verified sign-in failed: ${await loginResponse.text()}`,
    ).toBe(200)
    await expect(invitee).toHaveURL(/\/app$/)
    await expect(invitee.getByRole('heading', { name: 'Start with one address' })).toBeVisible()
    await expect(invitee.getByRole('heading', { name: 'Save your recovery key' })).toBeVisible()
    await invitee.getByRole('button', { name: 'Copy recovery key' }).click()
    await expect(invitee.getByText('Recovery key copied to clipboard.')).toBeVisible()
    expect(
      (await (await invitee.request.get(`${apiUrl}/api/auth/me`)).json()).email,
    ).toBe(approvedEmail)
  } finally {
    await inviteContext.close()
  }

  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByRole('row').filter({ hasText: approvedEmail })).toContainText(/accepted/i)

  const revokedRequest = page.getByRole('listitem').filter({ hasText: revokedEmail })
  await expect(revokedRequest).toBeVisible()
  await revokedRequest.getByRole('button', { name: 'Approve' }).click()
  await expect(revokedRequest).toHaveCount(0)
  const inviteRow = page.getByRole('row').filter({ hasText: revokedEmail })
  await expect(inviteRow).toContainText(/pending/i)
  await inviteRow.getByRole('button', { name: 'Resend' }).click()
  await expect(inviteRow).toContainText(/pending/i)
  page.once('dialog', (dialog) => dialog.accept())
  await inviteRow.getByRole('button', { name: 'Revoke' }).click()
  await expect(inviteRow).toContainText(/revoked/i)
  await expect(inviteRow.getByRole('button', { name: 'Resend' })).toHaveCount(0)

  const rejectedRequest = page.getByRole('listitem').filter({ hasText: rejectedEmail })
  await expect(rejectedRequest).toBeVisible()
  await rejectedRequest.getByRole('button', { name: 'Reject' }).click()
  const confirmation = page.locator('dialog[open]')
  await expect(confirmation.getByRole('heading', { name: 'Reject this invite request?' })).toBeVisible()
  await confirmation.getByRole('button', { name: 'Reject invite request' }).click()
  await expect(rejectedRequest).toHaveCount(0)
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByRole('row').filter({ hasText: approvedEmail })).toContainText(/accepted/i)
  await expect(page.getByRole('row').filter({ hasText: revokedEmail })).toContainText(/revoked/i)
})
