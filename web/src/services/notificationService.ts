import { requestEmpty, requestJson } from './apiClient'

export type NotificationAudience = 'user' | 'admin'

export interface NotificationItem {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  createdAt: string
  readAt: string | null
}

export interface NotificationInbox {
  unreadCount: number
  notifications: NotificationItem[]
}

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
