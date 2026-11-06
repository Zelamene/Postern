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

export type NotificationStatus = 'loading' | 'ready' | 'error'

export interface NotificationsController {
  notifications: NotificationItem[]
  unreadCount: number
  status: NotificationStatus
  error: string | null
  isMarkingAll: boolean
  refresh: () => Promise<void>
  markRead: (notificationId: string) => Promise<void>
  markAllRead: () => Promise<void>
}
