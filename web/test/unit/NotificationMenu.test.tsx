import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationMenu } from '../../src/components/common/NotificationMenu'
import type { NotificationsController } from '../../src/hooks/useNotifications'
import type { NotificationItem } from '../../src/services/notificationService'

function aNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'notification-1',
    kind: 'message_received',
    title: 'New mail arrived',
    body: 'shop@example.test',
    link: '/app/aliases/alias-1',
    createdAt: '2026-11-02T10:00:00Z',
    readAt: null,
    ...overrides,
  }
}

function aController(
  overrides: Partial<NotificationsController> = {},
): NotificationsController {
  return {
    notifications: [],
    unreadCount: 0,
    status: 'ready',
    error: null,
    isMarkingAll: false,
    refresh: vi.fn().mockResolvedValue(undefined),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

afterEach(() => {
  window.history.pushState({}, '', '/')
})

describe('NotificationMenu', () => {
  it('opens the inbox, refreshes it, and marks a notification read', async () => {
    const user = userEvent.setup()
    const controller = aController({
      notifications: [aNotification()],
      unreadCount: 1,
    })

    render(<NotificationMenu controller={controller} />)

    const trigger = screen.getByRole('button', { name: 'Notifications, 1 unread' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' })
    expect(dialog).toBeVisible()
    expect(controller.refresh).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /New mail arrived/ }))

    expect(controller.markRead).toHaveBeenCalledWith('notification-1')
    expect(window.location.pathname).toBe('/app/aliases/alias-1')
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument()
  })

  it('marks every notification read from the panel', async () => {
    const user = userEvent.setup()
    const controller = aController({
      notifications: [aNotification()],
      unreadCount: 1,
    })

    render(<NotificationMenu controller={controller} />)
    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }))
    await user.click(screen.getByRole('button', { name: 'Mark all read' }))

    expect(controller.markAllRead).toHaveBeenCalledTimes(1)
  })

  it('shows an empty inbox message', async () => {
    const user = userEvent.setup()

    render(<NotificationMenu controller={aController()} />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(screen.getByText('You’re all caught up.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled()
  })

  it('surfaces a load error inside the panel', async () => {
    const user = userEvent.setup()

    render(
      <NotificationMenu
        controller={aController({
          status: 'error',
          error: 'Notifications could not be loaded. Please try again.',
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Notifications could not be loaded. Please try again.',
    )
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()

    render(<NotificationMenu controller={aController()} />)
    const trigger = screen.getByRole('button', { name: 'Notifications' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeVisible()

    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument(),
    )
    expect(trigger).toHaveFocus()
  })
})
