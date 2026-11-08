import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createAliasViaUi } from '../support/aliases'

test('replaces an alias only after copying and confirming the service update', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const label = `replace-${randomUUID().slice(0, 8)}`
  const original = await createAliasViaUi(page, label, {
    expectedSender: 'billing@vendor.example',
  })

  await page.goto(`/app/aliases/${original.id}`)
  await page.getByRole('button', { name: 'Replace address' }).click()
  const dialog = page.locator('dialog[open]')
  await dialog.getByRole('button', { name: 'Reserve new address' }).click()
  await expect(dialog.getByRole('button', { name: 'Copy address' })).toBeVisible()
  const confirmButton = dialog.getByRole('button', { name: 'Confirm replacement' })
  await expect(confirmButton).toBeDisabled()

  const listedAliases = (await (await page.request.get('/api/aliases')).json()) as Array<{
    id: string
    label: string
    fullAddress: string
    status: string
  }>
  const replacement = listedAliases.find(
    (item) => item.label === label && item.id !== original.id,
  )
  if (!replacement) {
    throw new Error('The replacement address was not persisted by the API.')
  }

  await dialog.getByRole('button', { name: 'Copy address' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(replacement.fullAddress)
  const serviceUpdated = dialog.getByLabel(
    'I’ve updated the service and saved the new address where needed.',
  )
  await serviceUpdated.check()
  await expect(confirmButton).toBeEnabled()
  await confirmButton.click()

  await expect(page.getByText('The new address is live.', { exact: false })).toBeVisible()
  const expectedSenders = await page.request.get(
    `/api/aliases/${replacement.id}/expected-senders`,
  )
  expect(
    (await expectedSenders.json()).map((sender: { senderEtld1: string }) => sender.senderEtld1),
  ).toContain('vendor.example')

  await page.reload()
  const aliases = (await (await page.request.get('/api/aliases')).json()) as typeof listedAliases
  expect(aliases.find((item) => item.id === original.id)?.status).toBe(2)
  expect(aliases.find((item) => item.id === replacement.id)?.status).toBe(0)
})
