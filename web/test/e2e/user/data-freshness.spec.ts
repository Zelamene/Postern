import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { createAliasViaUi } from '../support/aliases'
import { EXPECTED_BEST_EFFORT, EXPECTED_PROPAGATION } from '../support/freshnessCopy'

async function expectNoFreshnessBanner(page: Page) {
  await expect(page.getByText(EXPECTED_PROPAGATION)).toHaveCount(0)
  await expect(page.getByText(EXPECTED_BEST_EFFORT)).toHaveCount(0)
}

test('user app surfaces omit the data-freshness banner', async ({ page }) => {
  await page.goto('/app')
  await expectNoFreshnessBanner(page)

  await page.goto('/app/blocked')
  await expectNoFreshnessBanner(page)

  const label = `freshness-${randomUUID().slice(0, 8)}`
  const alias = await createAliasViaUi(page, label)
  await page.goto(`/app/aliases/${alias.id}`)
  await expectNoFreshnessBanner(page)
})
