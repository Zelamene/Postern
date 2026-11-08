import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createAliasViaUi } from '../support/aliases'

test('creates aliases, configures expected senders, copies addresses, and retires aliases', async ({
  page,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const label = `shopping-${randomUUID().slice(0, 8)}`
  const alias = await createAliasViaUi(page, label, {
    category: 'shopping',
    expectedSender: 'orders@shop.example',
  })

  expect(alias.category).toBe('shopping')
  expect(alias.fullAddress).toMatch(/@alias\.postern\.test$/)
  const expectedSendersResponse = await page.request.get(
    `/api/aliases/${alias.id}/expected-senders`,
  )
  expect(expectedSendersResponse.status()).toBe(200)
  expect(
    (await expectedSendersResponse.json()).map((sender: { senderEtld1: string }) => sender.senderEtld1),
  ).toContain('shop.example')

  const row = page.getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) })
  await row.getByRole('button', { name: `Copy address for ${label}` }).click()
  await expect(page.getByText('Alias address copied.')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(alias.fullAddress)

  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(row.locator('code')).toHaveText(alias.fullAddress)
  await row.getByRole('button', { name: 'Disable' }).click()
  const dialog = page.locator('dialog[open]')
  await dialog.getByRole('button', { name: 'Keep alias' }).click()
  await expect(row).toContainText('Active')
  await row.getByRole('button', { name: 'Disable' }).click()
  await page
    .locator('dialog[open]')
    .getByRole('button', { name: 'Disable alias' })
    .click()
  await expect(row).toContainText('Disabled')

  const deleteLabel = `retire-${randomUUID().slice(0, 8)}`
  const deleteAlias = await createAliasViaUi(page, deleteLabel)
  const deleteRow = page
    .getByRole('listitem')
    .filter({ has: page.getByText(deleteLabel, { exact: true }) })
  await deleteRow.getByRole('button', { name: 'Delete' }).click()
  const deleteDialog = page.locator('dialog[open]')
  const confirmButton = deleteDialog.getByRole('button', { name: 'Delete alias' })
  await expect(confirmButton).toBeDisabled()
  await deleteDialog
    .getByLabel(`Type ${deleteAlias.fullAddress} to confirm`)
    .fill(deleteAlias.fullAddress)
  const deletionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/aliases/${deleteAlias.id}`) &&
      response.request().method() === 'DELETE',
  )
  await confirmButton.click()
  expect((await deletionResponse).status()).toBe(204)
  await expect(deleteRow).toHaveCount(0)

  const persistedAliases = (await (await page.request.get('/api/aliases')).json()) as Array<{
    id: string
    status: number
  }>
  expect(persistedAliases.find((item) => item.id === alias.id)?.status).toBe(1)
  expect(persistedAliases.some((item) => item.id === deleteAlias.id)).toBe(false)
})
