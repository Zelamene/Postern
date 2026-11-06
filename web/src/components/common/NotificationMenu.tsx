import { useEffect, useId, useRef, useState } from 'react'
import type { NotificationsController } from '../../hooks/useNotifications'
import { formatDateTime } from '../../services/formatters'
import { navigate } from '../../services/navigation'
import type { NotificationItem } from '../../services/notificationService'
import { IconBell } from './Icons'

interface NotificationMenuProps {
  controller: NotificationsController
}

const TRIGGER_CLASS =
  'relative flex size-9 items-center justify-center rounded-full border border-hairline/80 bg-surface-sunken/60 text-text-secondary transition-colors hover:border-primary/40 hover:text-primary'

export function NotificationMenu({ controller }: Readonly<NotificationMenuProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const { refresh } = controller

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    panelRef.current?.focus()
    void refresh()
  }, [isOpen, refresh])

  const triggerLabel =
    controller.unreadCount > 0
      ? `Notifications, ${controller.unreadCount} unread`
      : 'Notifications'

  function handleSelect(notification: NotificationItem) {
    void controller.markRead(notification.id)
    setIsOpen(false)
    if (notification.link) {
      navigate(notification.link)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className={TRIGGER_CLASS}
        onClick={() => setIsOpen((current) => !current)}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
      >
        <IconBell size={16} />
        {controller.unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-bold leading-4 text-primary-on-inverse"
          >
            {controller.unreadCount > 9 ? '9+' : controller.unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          tabIndex={-1}
          className="absolute right-0 top-full z-[var(--z-dropdown)] mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-hairline bg-surface p-3 shadow-lg outline-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-hairline pb-2">
            <h2 className="text-sm font-bold text-text">Notifications</h2>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void controller.markAllRead()}
              disabled={controller.unreadCount === 0 || controller.isMarkingAll}
            >
              {controller.isMarkingAll ? 'Marking…' : 'Mark all read'}
            </button>
          </div>

          <div className="mt-2 max-h-80 overflow-y-auto">
            {controller.status === 'loading' && (
              <p role="status" className="px-1 py-4 text-sm text-text-muted">
                Loading notifications…
              </p>
            )}

            {controller.status === 'error' && (
              <p role="alert" className="px-1 py-4 text-sm text-danger-on-surface">
                {controller.error ?? 'Notifications could not be loaded. Please try again.'}
              </p>
            )}

            {controller.status === 'ready' && controller.notifications.length === 0 && (
              <p className="px-1 py-4 text-sm text-text-muted">You’re all caught up.</p>
            )}

            {controller.notifications.length > 0 && (
              <ul className="space-y-1">
                {controller.notifications.map((notification) => {
                  const isUnread = notification.readAt === null
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(notification)}
                        className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-sunken"
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 size-2 flex-none rounded-full ${
                            isUnread ? 'bg-primary' : 'bg-transparent'
                          }`}
                        />
                        <span className="min-w-0">
                          {isUnread && <span className="sr-only">Unread: </span>}
                          <span
                            className={`block truncate text-sm ${
                              isUnread ? 'font-semibold text-text' : 'font-medium text-text-secondary'
                            }`}
                          >
                            {notification.title}
                          </span>
                          {notification.body && (
                            <span className="mt-0.5 block truncate text-xs text-text-muted">
                              {notification.body}
                            </span>
                          )}
                          <span className="mt-0.5 block text-xs text-text-muted">
                            {formatDateTime(notification.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
