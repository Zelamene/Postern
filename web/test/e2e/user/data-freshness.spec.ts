import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { createAliasViaUi } from '../support/aliases'
import { EXPECTED_BEST_EFFORT, EXPECTED_PROPAGATION } from '../support/freshnessCopy'

async function expectFreshnessCopy(page: Page) {
  await expect(page.getByText(EXPECTED_PROPAGATION)).toBeVisible()
  await expect(page.getByText(EXPECTED_BEST_EFFORT)).toBeVisible()
}

test('user stale-data surfaces state propagation delay and best-effort logging', async ({
  page,
}) => {
  await page.goto('/app')
  await expectFreshnessCopy(page)

  await page.goto('/app/blocked')
  await expectFreshnessCopy(page)

  const label = `freshness-${randomUUID().slice(0, 8)}`
  const alias = await createAliasViaUi(page, label)
  await page.goto(`/app/aliases/${alias.id}`)
  await expectFreshnessCopy(page)
})
