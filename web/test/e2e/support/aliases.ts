import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export interface E2EAlias {
  id: string
  label: string
  fullAddress: string
  category: string
  status: string
}

export async function createAliasViaUi(
  page: Page,
  label: string,
  options: { category?: string; expectedSender?: string } = {},
): Promise<E2EAlias> {
  await page.goto('/app')
  await page.getByLabel('Label', { exact: true }).fill(label)
  await page.getByLabel('Category', { exact: true }).selectOption(options.category ?? 'shopping')
  if (options.expectedSender) {
    await page.getByLabel(/Expected sender/).fill(options.expectedSender)
  }
  await page.getByRole('button', { name: 'Create alias' }).click()

  const aliasRow = page.getByRole('listitem').filter({
    has: page.getByText(label, { exact: true }),
  })
  await expect(aliasRow).toContainText('Active')
  const response = await page.request.get('/api/aliases')
  expect(response.ok()).toBeTruthy()
  const aliases = (await response.json()) as E2EAlias[]
  const alias = aliases.find((item) => item.label === label)
  if (!alias) {
    throw new Error(`The API did not return the alias created through the UI: ${label}`)
  }

  return alias
}
