import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createAliasViaUi } from '../support/aliases'

test('opens, follows, and marks user notifications read', async ({ page }) => {
  const firstLabel = `notification-${randomUUID().slice(0, 8)}`
  const firstAlias = await createAliasViaUi(page, firstLabel)

  let inbox = await page.request.get('/api/notifications')
  let state = await inbox.json()
  const notification = state.notifications.find(
    (item: { title: string; readAt: string | null }) =>
      item.title === 'Alias created' && item.readAt === null,
  )
  expect(notification).toBeTruthy()
  expect(state.unreadCount).toBeGreaterThan(0)

  await page.getByRole('button', { name: /Notifications/ }).click()
  const menu = page.getByRole('dialog', { name: 'Notifications' })
  await menu.getByRole('button').filter({ hasText: firstAlias.fullAddress }).click()
  await expect(page).toHaveURL(/\/app$/)

  inbox = await page.request.get('/api/notifications')
  state = await inbox.json()
  expect(
    state.notifications.find((item: { id: string }) => item.id === notification.id)?.readAt,
  ).not.toBeNull()

  await createAliasViaUi(page, `notification-${randomUUID().slice(0, 8)}`)
  await page.getByRole('button', { name: /Notifications/ }).click()
  const reopenedMenu = page.getByRole('dialog', { name: 'Notifications' })
  await reopenedMenu.getByRole('button', { name: 'Mark all read' }).click()
  await expect.poll(async () => (await (await page.request.get('/api/notifications')).json()).unreadCount)
    .toBe(0)
})
