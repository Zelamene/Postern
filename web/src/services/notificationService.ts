import type {
  NotificationAudience,
  NotificationInbox,
} from '../types'
import { requestEmpty, requestJson } from './apiClient'

function inboxPath(audience: NotificationAudience): string {
  return audience === 'admin' ? '/api/admin/notifications' : '/api/notifications'
}

export function fetchNotifications(
  audience: NotificationAudience,
  signal?: AbortSignal,
): Promise<NotificationInbox> {
  return requestJson<NotificationInbox>(inboxPath(audience), { signal })
}

export function markNotificationRead(
  audience: NotificationAudience,
  notificationId: string,
): Promise<void> {
  return requestEmpty(`${inboxPath(audience)}/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST',
  })
}

export function markAllNotificationsRead(audience: NotificationAudience): Promise<void> {
  return requestEmpty(`${inboxPath(audience)}/read-all`, { method: 'POST' })
}
