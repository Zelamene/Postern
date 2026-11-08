import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createAliasViaUi } from '../support/aliases'
import { ingestMessage } from '../support/mail'

test('marks senders as expected, blocks a sender, and reviews blocked mail', async ({ page }) => {
  const label = `senders-${randomUUID().slice(0, 8)}`
  const alias = await createAliasViaUi(page, label, { expectedSender: 'trusted.example' })

  const expectedSubject = 'Unexpected sender to trust'
  expect(
    (
      await ingestMessage(page, alias.fullAddress, {
        sender: 'security@unexpected.example',
        subject: expectedSubject,
        authenticationResult: 'fail',
      })
    ).status(),
  ).toBe(202)
  await page.goto(`/app/aliases/${alias.id}`)
  const expectedMessage = page.getByRole('listitem').filter({ hasText: expectedSubject })
  await expect(expectedMessage.getByText('High severity')).toBeVisible()
  const markExpectedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/aliases/${alias.id}/mark-expected`) &&
      response.request().method() === 'POST',
  )
  await expectedMessage
    .getByRole('button', { name: 'Mark unexpected.example as expected' })
    .click()
  expect((await markExpectedResponse).status()).toBe(204)
  await expect(page.getByRole('status')).toContainText('Sender marked as expected')

  const sendersResponse = await page.request.get(
    `/api/aliases/${alias.id}/expected-senders`,
  )
  expect(
    (await sendersResponse.json()).map((sender: { senderEtld1: string }) => sender.senderEtld1),
  ).toContain('unexpected.example')

  const blockedSubject = 'Sender blocked by user'
  expect(
    (
      await ingestMessage(page, alias.fullAddress, {
        sender: 'tracker@tracking.example',
        subject: blockedSubject,
        authenticationResult: 'fail',
      })
    ).status(),
  ).toBe(202)
  await page.reload()
  const blockedCandidate = page.getByRole('listitem').filter({ hasText: blockedSubject })
  const blockSenderResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/aliases/${alias.id}/block-sender`) &&
      response.request().method() === 'POST',
  )
  await blockedCandidate
    .getByRole('button', { name: 'Block tracking.example' })
    .click()
  expect((await blockSenderResponse).status()).toBe(204)
  await expect(page.getByRole('status')).toContainText('Sender blocked')

  const aliasesResponse = await page.request.get('/api/aliases')
  const persistedAlias = (await aliasesResponse.json()).find(
    (item: { id: string }) => item.id === alias.id,
  )
  expect(persistedAlias.kvDirty).toBe(true)

  const blockedMailSubject = 'Blocked message in the activity feed'
  const blockedResponse = await ingestMessage(page, alias.fullAddress, {
    sender: 'spam@source.example',
    subject: blockedMailSubject,
    blocked: true,
    reason: 'policy',
  })
  expect(blockedResponse.status()).toBe(200)
  await page.goto('/app/blocked')
  const blockedMail = page.getByRole('listitem').filter({ hasText: blockedMailSubject })
  await expect(blockedMail).toContainText('policy')
  await expect(blockedMail).toContainText(label)
})
