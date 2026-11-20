import { expect, test } from '@playwright/test'

const DELAYED_RESPONSE_MS = 6_000

test('shows the waking state while the delayed account response is pending', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, DELAYED_RESPONSE_MS))
    await route.continue()
  })

  await page.goto('/app', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Getting things ready. This can take a moment.')).toBeVisible({
    timeout: 5_000,
  })

  await expect(page.getByRole('heading', { name: 'All aliases' })).toBeVisible({
    timeout: 15_000,
  })
})
