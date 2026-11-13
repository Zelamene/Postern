import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotifications } from '../../src/hooks/useNotifications'
import { server } from '../server'

const NOTIFICATIONS = [
  {
    id: 'notification-1',
    kind: 'message_received' as const,
    title: 'New mail arrived',
    body: 'shop@example.test',
    link: null,
    createdAt: '2026-11-02T10:00:00Z',
    readAt: null,
  },
  {
    id: 'notification-2',
    kind: 'alias_created' as const,
    title: 'Alias created',
    body: 'news.p9x1@postern.local',
    link: null,
    createdAt: '2026-11-01T10:00:00Z',
    readAt: '2026-11-01T11:00:00Z',
  },
]

function inbox(unreadCount = 1) {
  return { unreadCount, notifications: NOTIFICATIONS }
}

describe('useNotifications', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  beforeEach(() => {
    errorSpy.mockClear()
  })

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
  })

  it('loads the inbox for the requested audience', async () => {
    const audiences: string[] = []
    server.use(
      http.get('*/api/admin/notifications', ({ request }) => {
        audiences.push(new URL(request.url).pathname)
        return HttpResponse.json(inbox(3))
      }),
    )

    const { result } = renderHook(() => useNotifications(true, 'admin'))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.notifications).toHaveLength(2)
    expect(result.current.unreadCount).toBe(3)
    expect(result.current.error).toBeNull()
    expect(audiences).toEqual(['/api/admin/notifications'])
  })

  it('stays idle and skips requests while disabled', async () => {
    let requests = 0
    server.use(
      http.get('*/api/notifications', () => {
        requests += 1
        return HttpResponse.json(inbox())
      }),
    )

    const { result } = renderHook(() => useNotifications(false, 'user'))

    expect(result.current.status).toBe('loading')
    await act(async () => {
      await result.current.refresh()
    })

    expect(requests).toBe(0)
    expect(result.current.notifications).toEqual([])
  })

  it('asks the visitor to sign in when the session has ended', async () => {
    server.use(
      http.get('*/api/notifications', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    )

    const { result } = renderHook(() => useNotifications(true, 'user'))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatch(/session has ended/i)
  })

  it('reports a generic message when the inbox cannot be loaded', async () => {
    server.use(
      http.get('*/api/notifications', () =>
        HttpResponse.json({ error: 'unavailable' }, { status: 500 }),
      ),
    )

    const { result } = renderHook(() => useNotifications(true, 'user'))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatch(/could not be loaded/i)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('marks one notification as read and decrements the unread count', async () => {
    let readRequests = 0
    let inboxRequests = 0
    server.use(
      http.get('*/api/notifications', () => {
        inboxRequests += 1
        return HttpResponse.json(inbox(1))
      }),
      http.post('*/api/notifications/:notificationId/read', () => {
        readRequests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(() => useNotifications(true, 'user'))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.markRead('notification-1')
    })

    expect(readRequests).toBe(1)
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.notifications[0]?.readAt).toBeTruthy()

    await act(async () => {
      await result.current.markRead('notification-1')
    })

    expect(readRequests).toBe(1)
    expect(result.current.unreadCount).toBe(0)
    expect(inboxRequests).toBe(1)
  })

  it('ignores unknown notifications and already-read ones', async () => {
    let readRequests = 0
    server.use(
      http.get('*/api/notifications', () => HttpResponse.json(inbox(1))),
      http.post('*/api/notifications/:notificationId/read', () => {
        readRequests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(() => useNotifications(true, 'user'))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.markRead('does-not-exist')
      await result.current.markRead('notification-2')
    })

    expect(readRequests).toBe(0)
    expect(result.current.unreadCount).toBe(1)
  })

  it('keeps the optimistic state when the API reports the notification is gone', async () => {
    let inboxRequests = 0
    server.use(
      http.get('*/api/notifications', () => {
        inboxRequests += 1
        return HttpResponse.json(inbox(1))
      }),
      http.post('*/api/notifications/:notificationId/read', () =>
        new HttpResponse(null, { status: 404 }),
      ),
    )

    const { result } = renderHook(() => useNotifications(true, 'user'))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.markRead('notification-1')
    })

    expect(result.current.unreadCount).toBe(0)
    expect(inboxRequests).toBe(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('reloads the inbox when marking read fails for another reason', async () => {
    let inboxRequests = 0
    server.use(
      http.get('*/api/notifications', () => {
        inboxRequests += 1
        return HttpResponse.json(inbox(2))
      }),
      http.post('*/api/notifications/:notificationId/read', () =>
        new HttpResponse(null, { status: 500 }),
      ),
    )

    const { result } = renderHook(() => useNotifications(true, 'user'))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.markRead('notification-1')
    })

    expect(inboxRequests).toBe(2)
    expect(result.current.unreadCount).toBe(2)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('marks every notification as read', async () => {
    let markAllRequests = 0
    server.use(
      http.post('*/api/notifications/read-all', () => {
        markAllRequests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(() => useNotifications(true, 'user'))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.markAllRead()
    })

    expect(markAllRequests).toBe(1)
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.isMarkingAll).toBe(false)
    expect(result.current.notifications.every((item) => item.readAt)).toBe(true)
  })

  it('refreshes the inbox after a failed mark-all so state matches the server', async () => {
    let inboxRequests = 0
    server.use(
      http.get('*/api/notifications', () => {
        inboxRequests += 1
        return HttpResponse.json(inbox(1))
      }),
      http.post('*/api/notifications/read-all', () =>
        new HttpResponse(null, { status: 500 }),
      ),
    )

    const { result } = renderHook(() => useNotifications(true, 'user'))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.markAllRead()
    })

    expect(inboxRequests).toBe(2)
    expect(result.current.unreadCount).toBe(1)
    expect(result.current.isMarkingAll).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('refreshes on demand and keeps the current inbox when refreshing fails', async () => {
    let inboxRequests = 0
    server.use(
      http.get('*/api/notifications', () => {
        inboxRequests += 1
        return inboxRequests === 1
          ? HttpResponse.json(inbox(1))
          : HttpResponse.json({ error: 'down' }, { status: 500 })
      }),
    )

    const { result } = renderHook(() => useNotifications(true, 'user'))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.refresh()
    })

    expect(inboxRequests).toBe(2)
    expect(result.current.status).toBe('ready')
    expect(result.current.notifications).toHaveLength(2)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('refetches when the tab becomes visible again', async () => {
    let inboxRequests = 0
    server.use(
      http.get('*/api/notifications', () => {
        inboxRequests += 1
        return HttpResponse.json(inbox(1))
      }),
    )

    let visibility: DocumentVisibilityState = 'hidden'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    })

    const { result } = renderHook(() => useNotifications(true, 'user'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(inboxRequests).toBe(1)

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(inboxRequests).toBe(1)

    visibility = 'visible'
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(inboxRequests).toBe(2))
  })
})
