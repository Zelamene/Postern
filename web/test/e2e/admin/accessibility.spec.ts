import { expect, test } from '@playwright/test'
import { analyzePage } from '../support/a11y'
import { EXPECTED_BEST_EFFORT, EXPECTED_PROPAGATION } from '../support/freshnessCopy'

test('signed-in admin dashboard has no WCAG 2.2 AA violations', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()

  const results = await analyzePage(page)
  expect(results.violations).toEqual([])
})

test('admin dashboard omits the data-freshness banner', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByText(EXPECTED_PROPAGATION)).toHaveCount(0)
  await expect(page.getByText(EXPECTED_BEST_EFFORT)).toHaveCount(0)
})
