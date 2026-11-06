import { describe, expect, it, vi } from 'vitest'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../src/services/notificationService'

const requestJson = vi.fn()
const requestEmpty = vi.fn()

vi.mock('../../src/services/apiClient', () => ({
  requestJson: (...args: unknown[]) => requestJson(...args),
  requestEmpty: (...args: unknown[]) => requestEmpty(...args),
}))

describe('notificationService', () => {
  it('uses the user inbox endpoints', async () => {
    requestJson.mockResolvedValue({ unreadCount: 0, notifications: [] })
    requestEmpty.mockResolvedValue(undefined)
    const controller = new AbortController()

    await fetchNotifications('user', controller.signal)
    await markNotificationRead('user', 'notification-1')
    await markAllNotificationsRead('user')

    expect(requestJson).toHaveBeenCalledWith('/api/notifications', {
      signal: controller.signal,
    })
    expect(requestEmpty).toHaveBeenCalledWith('/api/notifications/notification-1/read', {
      method: 'POST',
    })
    expect(requestEmpty).toHaveBeenCalledWith('/api/notifications/read-all', {
      method: 'POST',
    })
  })

  it('uses the admin inbox endpoints', async () => {
    requestJson.mockResolvedValue({ unreadCount: 0, notifications: [] })
    requestEmpty.mockResolvedValue(undefined)

    await fetchNotifications('admin')
    await markNotificationRead('admin', 'notification-2')
    await markAllNotificationsRead('admin')

    expect(requestJson).toHaveBeenCalledWith('/api/admin/notifications', {
      signal: undefined,
    })
    expect(requestEmpty).toHaveBeenCalledWith(
      '/api/admin/notifications/notification-2/read',
      { method: 'POST' },
    )
    expect(requestEmpty).toHaveBeenCalledWith('/api/admin/notifications/read-all', {
      method: 'POST',
    })
  })
})
