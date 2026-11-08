import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createAliasViaUi } from '../support/aliases'
import { ingestMessage } from '../support/mail'

test('reviews persisted message activity, loads older messages, and exports CSV', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const label = `activity-${randomUUID().slice(0, 8)}`
  const alias = await createAliasViaUi(page, label, { expectedSender: 'mail.example' })

  for (let index = 0; index < 26; index += 1) {
    const response = await ingestMessage(page, alias.fullAddress, {
      sender: `sender-${index}@mail.example`,
      subject: `E2E activity message ${index}`,
    })
    expect(response.status(), `Message ${index} should be persisted`).toBe(202)
  }

  await page.goto(`/app/aliases/${alias.id}`)
  const feed = page.getByRole('region', { name: `Messages received by ${label}` })
  await expect(feed.getByText('E2E activity message 25')).toBeVisible()
  await expect(feed.getByRole('listitem')).toHaveCount(25)
  await feed.getByRole('button', { name: 'Load older messages' }).click()
  await expect(feed.getByRole('listitem')).toHaveCount(26)
  await expect(feed.getByText('E2E activity message 0')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^postern-activity-/)
  const stream = await download.createReadStream()
  if (!stream) {
    throw new Error('The activity export did not produce a downloadable CSV.')
  }
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  const csv = Buffer.concat(chunks).toString('utf8')
  expect(csv).toContain('sender,subject,received-at,authentication result,flagged')
  expect(csv).toContain('E2E activity message 25')
  expect(csv.split(/\r?\n/)).toHaveLength(28)
})
