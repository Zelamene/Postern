import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/apiClient'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService'
import type {
  NotificationAudience,
  NotificationItem,
  NotificationStatus,
  NotificationsController,
} from '../types'

function describeLoadError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return 'Your session has ended. Sign in again to view notifications.'
  }

  return 'Notifications could not be loaded. Please try again.'
}

export function useNotifications(
  enabled: boolean,
  audience: NotificationAudience,
): NotificationsController {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [status, setStatus] = useState<NotificationStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [isMarkingAll, setIsMarkingAll] = useState(false)

  const notificationsRef = useRef<NotificationItem[]>([])

  useEffect(() => {
    notificationsRef.current = notifications
  }, [notifications])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let active = true

    fetchNotifications(audience)
      .then((inbox) => {
        if (!active) {
          return
        }

        setNotifications(inbox.notifications)
        setUnreadCount(inbox.unreadCount)
        setError(null)
        setStatus('ready')
      })
      .catch((loadError: unknown) => {
        if (!active) {
          return
        }

        console.error('Unable to load notifications', loadError)
        setError(describeLoadError(loadError))
        setStatus('error')
      })

    return () => {
      active = false
    }
  }, [enabled, audience])

  const refresh = useCallback(async () => {
    if (!enabled) {
      return
    }

    try {
      const inbox = await fetchNotifications(audience)
      setNotifications(inbox.notifications)
      setUnreadCount(inbox.unreadCount)
      setError(null)
      setStatus('ready')
    } catch (refreshError) {
      console.error('Unable to refresh notifications', refreshError)
    }
  }, [enabled, audience])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [enabled, refresh])

  const markRead = useCallback(
    async (notificationId: string) => {
      const target = notificationsRef.current.find(
        (notification) => notification.id === notificationId,
      )
      if (!target || target.readAt) {
        return
      }

      const readAt = new Date().toISOString()
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId ? { ...notification, readAt } : notification,
        ),
      )
      setUnreadCount((current) => Math.max(0, current - 1))

      try {
        await markNotificationRead(audience, notificationId)
      } catch (markError) {
        if (!(markError instanceof ApiError && markError.status === 404)) {
          console.error('Unable to mark the notification as read', markError)
          await refresh()
        }
      }
    },
    [audience, refresh],
  )

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString()
    setNotifications((current) =>
      current.map((notification) =>
        notification.readAt ? notification : { ...notification, readAt },
      ),
    )
    setUnreadCount(0)
    setIsMarkingAll(true)

    try {
      await markAllNotificationsRead(audience)
    } catch (markError) {
      console.error('Unable to mark all notifications as read', markError)
      await refresh()
    } finally {
      setIsMarkingAll(false)
    }
  }, [audience, refresh])

  return {
    notifications,
    unreadCount,
    status,
    error,
    isMarkingAll,
    refresh,
    markRead,
    markAllRead,
  }
}
