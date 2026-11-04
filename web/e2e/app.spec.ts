import { expect, test } from '@playwright/test'

test('renders the Postern homepage', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: /Your inbox, on your terms\./ })).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Try the live demo' })).toBeVisible()
})

test('selected text keeps a high-contrast foreground in both themes', async ({ page }) => {
  await page.goto('/')

  const selectedColors = () =>
    page.locator('#hero-title + p').evaluate((element) => {
      const selection = getComputedStyle(element, '::selection')
      return { background: selection.backgroundColor, foreground: selection.color }
    })

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light'
  })
  expect(await selectedColors()).toEqual({
    background: 'rgb(116, 23, 42)',
    foreground: 'rgb(255, 255, 255)',
  })

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
  })
  expect(await selectedColors()).toEqual({
    background: 'rgb(176, 69, 84)',
    foreground: 'rgb(255, 255, 255)',
  })
})

test('invite link opens branded registration and submits the invite code', async ({ page }) => {
  let registrationBody: { password: string; inviteCode: string } | undefined
  await page.route('**/api/auth/invite-details', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'person@example.test' }),
    })
  })
  await page.route('**/api/auth/register', async (route) => {
    registrationBody = route.request().postDataJSON()
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{"status":"pending_verification"}' })
  })

  await page.goto('/invite/postern_invite_example')
  await expect(page.getByRole('heading', { name: 'Create your Postern account' })).toBeVisible()
  await expect(page.getByLabel('Invited email address')).toHaveValue('person@example.test')
  await expect(page.getByLabel('Invited email address')).toHaveAttribute('readonly')
  await page.getByLabel('Password').fill('a long secure password')
  await page.getByRole('button', { name: 'Accept invitation' }).click()

  await expect(page.getByRole('status')).toContainText('Your account is ready')
  expect(registrationBody).toEqual({
    password: 'a long secure password',
    inviteCode: 'postern_invite_example',
  })
})

test('invite pages suppress referrers so codes are not leaked to other sites', async ({ page }) => {
  await page.route('**/api/auth/invite-details', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'person@example.test' }),
    })
  })
  await page.goto('/invite/postern_invite_example')

  await expect(page.getByRole('heading', { name: 'Create your Postern account' })).toBeVisible()
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
})

test('keeps the header reachable while scrolling', async ({ page }) => {
  await page.goto('/')
  await page.mouse.wheel(0, 2400)

  const header = page.getByRole('banner')
  const box = await header.boundingBox()

  expect(box?.y).toBe(0)
})
