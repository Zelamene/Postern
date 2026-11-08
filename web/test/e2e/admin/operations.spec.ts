import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('reviews analytics, manages the global blocklist, syncs operations, and reads alerts', async ({
  page,
}) => {
  await page.goto('/admin')
  const analytics = page.getByRole('region', { name: 'Operational health' })
  await expect(analytics.getByText('24 hours', { exact: true })).toBeVisible()
  await analytics.getByRole('button', { name: '7 days' }).click()
  await expect(analytics).toContainText('for the last 7 days')
  await analytics.getByRole('button', { name: '24 hours' }).click()
  await expect(analytics).toContainText('for the last 24 hours')
  await expect(analytics.getByText('Registered users')).toBeVisible()

  const domain = `e2e-${randomUUID().slice(0, 8)}.example`
  const reason = 'E2E global blocklist policy'
  const blocklist = page.getByRole('region', { name: 'Global blocklist' })
  await blocklist.getByLabel('Domain').fill(domain)
  await blocklist.getByLabel('Reason').fill(reason)
  await blocklist.getByRole('button', { name: 'Block domain' }).click()
  await expect(blocklist.getByRole('cell', { name: domain })).toBeVisible()
  await expect(blocklist.getByRole('cell', { name: reason })).toBeVisible()

  const adminNotifications = await page.request.get('/api/admin/notifications')
  const notificationInbox = await adminNotifications.json()
  const blockNotification = notificationInbox.notifications.find(
    (item: { title: string; readAt: string | null; body: string | null }) =>
      item.title === 'Domain added to the global blocklist' &&
      item.body === domain &&
      item.readAt === null,
  )
  expect(blockNotification).toBeTruthy()
  await page.getByRole('button', { name: /Notifications/ }).click()
  await page
    .getByRole('dialog', { name: 'Notifications' })
    .getByRole('button', { name: /Domain added to the global blocklist/ })
    .click()
  const readInbox = await (await page.request.get('/api/admin/notifications')).json()
  expect(
    readInbox.notifications.find(
      (item: { id: string }) => item.id === blockNotification.id,
    )?.readAt,
  ).not.toBeNull()

  await blocklist.getByRole('button', { name: 'Unblock' }).click()
  await page
    .locator('dialog[open]')
    .getByRole('button', { name: 'Unblock domain' })
    .click()
  await expect(blocklist.getByRole('cell', { name: domain })).toHaveCount(0)

  const syncPanel = page.getByRole('region', { name: 'Key-value sync' })
  await syncPanel.getByRole('button', { name: 'Sync now' }).click()
  await expect(syncPanel.getByText(/Synced \d+ aliases\./)).toBeVisible()
  await expect(syncPanel).toContainText('Global blocklist rebuilt.')
  await expect(syncPanel).toContainText('Suspended-user map rebuilt.')
  await expect(
    page.getByRole('region', { name: 'Recent administrator activity' }).getByText('kv.sync'),
  ).toBeVisible()

  await page.getByRole('button', { name: /Notifications/ }).click()
  const menu = page.getByRole('dialog', { name: 'Notifications' })
  const markAllRead = menu.getByRole('button', { name: 'Mark all read' })
  if (await markAllRead.isEnabled()) {
    await markAllRead.click()
  }
  await expect
    .poll(async () => (await (await page.request.get('/api/admin/notifications')).json()).unreadCount)
    .toBe(0)
})
