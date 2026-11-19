import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createAliasViaUi } from '../support/aliases'
import { ingestMessage } from '../support/mail'
import { createServerTimingCollector, timedCoreTask, timedStep } from '../support/serverTiming'

test('QR2.3 core tasks (user): create alias and review activity stay within step/task budgets with server timing', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const serverTiming = createServerTimingCollector(page)

  await timedCoreTask('create alias', async () => {
    const label = `timing-${randomUUID().slice(0, 8)}`

    await page.goto('/app')
    await expect(page.getByRole('button', { name: 'Create an alias' })).toBeVisible({ timeout: 15_000 })

    await timedStep('create alias', async () => {
      await page.getByRole('button', { name: 'Create an alias' }).click()
      await page.getByLabel('Label', { exact: true }).fill(label)
      await page.getByLabel('Category', { exact: true }).selectOption('shopping')
      await page.getByRole('button', { name: 'Create alias', exact: true }).click()

      const aliasRow = page.getByRole('listitem').filter({
        has: page.getByText(label, { exact: true }),
      })
      await expect(aliasRow).toContainText('Active')
      await expect(aliasRow.locator('code')).toContainText('@alias.postern.test')
    }, {
      serverTiming: () => serverTiming.latestMatching((url) => url.endsWith('/api/aliases')),
    })

    const createTiming = serverTiming.latestMatching((url) => url.endsWith('/api/aliases'))
    expect(createTiming?.serverTiming, 'create alias response should include Server-Timing').toBeTruthy()
  })

  const label = `review-${randomUUID().slice(0, 8)}`
  const alias = await createAliasViaUi(page, label, { expectedSender: 'mail.example' })

  // Fixture setup is not part of the user task being timed.
  for (let index = 0; index < 26; index += 1) {
    const response = await ingestMessage(page, alias.fullAddress, {
      sender: `sender-${index}@mail.example`,
      subject: `Timing activity ${index}`,
    })
    expect(response.status(), `Message ${index} should be persisted`).toBe(202)
  }

  await timedCoreTask('review activity', async () => {
    await timedStep('open alias activity feed', async () => {
      await page.goto(`/app/aliases/${alias.id}`)
      const feed = page.getByRole('region', { name: `Messages received by ${label}` })
      await expect(feed.getByText('Timing activity 25')).toBeVisible({ timeout: 10_000 })
    }, {
      serverTiming: () => serverTiming.latestMatching((url) => url.includes(`/api/aliases/${alias.id}/messages`)),
    })

    const feed = page.getByRole('region', { name: `Messages received by ${label}` })
    await timedStep('load older messages', async () => {
      await expect(feed.getByRole('listitem')).toHaveCount(25)
      await feed.getByRole('button', { name: 'Load older messages' }).click()
      await expect(feed.getByRole('listitem')).toHaveCount(26)
    }, {
      serverTiming: () => serverTiming.latestMatching((url) => url.includes(`/api/aliases/${alias.id}/messages?`)),
    })

    await timedStep('export activity CSV', async () => {
      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Export CSV' }).click()
      const download = await downloadPromise
      expect(download.suggestedFilename()).toMatch(/^postern-.+\.csv$/)
    })
  })
})
