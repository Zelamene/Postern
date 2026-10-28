import { expect, test } from '@playwright/test'

test('loads the Postern app and reports API availability', async ({ page }) => {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    })
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Your inbox, on your terms.' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('API is available')
})
