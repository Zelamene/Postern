import { expect, test } from '@playwright/test'
import { createServerTimingCollector, timedCoreTask, timedStep } from '../support/serverTiming'

test('QR2.3 core task (admin): sync KV stays within step/task budgets with server timing', async ({
  page,
}) => {
  const serverTiming = createServerTimingCollector(page)

  await timedCoreTask('sync KV', async () => {
    await timedStep('open admin operations', async () => {
      await page.goto('/admin')
      await expect(page.getByRole('region', { name: 'Key-value sync' })).toBeVisible()
    }, {
      serverTiming: () => serverTiming.latestMatching((url) => url.includes('/api/admin')),
    })

    const syncPanel = page.getByRole('region', { name: 'Key-value sync' })
    await timedStep('trigger KV sync', async () => {
      await syncPanel.getByRole('button', { name: 'Sync now' }).click()
      await expect(syncPanel.getByText(/Synced \d+ aliases\./)).toBeVisible()
      await expect(syncPanel).toContainText('Global blocklist rebuilt.')
      await expect(syncPanel).toContainText('Suspended-user map rebuilt.')
    }, {
      serverTiming: () => serverTiming.latestMatching((url) => url.includes('/api/admin') && url.includes('sync')),
    })
  })
})
