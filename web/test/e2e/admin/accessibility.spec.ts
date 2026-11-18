import { expect, test } from '@playwright/test'
import { analyzePage } from '../support/a11y'
import { EXPECTED_BEST_EFFORT, EXPECTED_PROPAGATION } from '../support/freshnessCopy'

test('signed-in admin dashboard has no WCAG 2.2 AA violations', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByText(EXPECTED_PROPAGATION)).toBeVisible()

  const results = await analyzePage(page)
  expect(results.violations).toEqual([])
})

test('admin stale-data surfaces state propagation delay and best-effort logging', async ({
  page,
}) => {
  await page.goto('/admin')
  await expect(page.getByText(EXPECTED_PROPAGATION)).toBeVisible()
  await expect(page.getByText(EXPECTED_BEST_EFFORT)).toBeVisible()
})
