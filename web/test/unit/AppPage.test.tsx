import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { AppPage } from '../../src/pages/AppPage'
import { server } from '../server'

const ACCOUNT = {
  userId: '6f1c9f1e-0d7f-4a63-9a44-4d5f6f2c6f11',
  email: 'person@example.test',
  forwardingAddress: 'person@example.test',
}

function signedIn() {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(ACCOUNT)),
  )
}

function renderApp(pathname = '/app') {
  return render(<AppPage pathname={pathname} theme="light" onThemeChange={() => undefined} />)
}

afterEach(() => {
  window.history.pushState({}, '', '/')
  window.sessionStorage.clear()
})

describe('AppPage', () => {
  it('opens on a first-run prompt when the account has no aliases', async () => {
    signedIn()
    server.use(http.get('*/api/aliases', () => HttpResponse.json([])))

    renderApp()

    expect(
      await screen.findByRole('heading', { name: 'Start with one address' }),
    ).toBeVisible()
    expect(screen.getByText('No aliases yet')).toBeVisible()
    expect(screen.getByLabelText('Label')).toBeVisible()
  })

  it('lists an existing alias and creates a new one', async () => {
    const user = userEvent.setup()
    signedIn()
    const created: string[] = []
    server.use(
      http.get('*/api/aliases', () =>
        HttpResponse.json([
          {
            id: '0d1f7c62-0a3f-4f0e-9c8f-2f6f0a9d7c11',
            userId: ACCOUNT.userId,
            label: 'shop',
            randomSuffix: 'k4m2',
            fullAddress: 'shop.k4m2@postern.local',
            purposeMetadata: null,
            category: 'personal',
            status: 0,
            replacedByAliasId: null,
            kvDirty: false,
            createdAt: '2026-02-01T10:00:00Z',
            deletedAt: null,
          },
        ]),
      ),
      http.post('*/api/aliases', async ({ request }) => {
        const body = (await request.json()) as { label: string }
        created.push(body.label)
        return HttpResponse.json(
          {
            id: '5a2b8d44-6c1e-4f2a-8e3b-9c7d5a1f0b22',
            userId: ACCOUNT.userId,
            label: body.label,
            randomSuffix: 'p9x1',
            fullAddress: `${body.label}.p9x1@postern.local`,
            purposeMetadata: null,
            category: 'personal',
            status: 0,
            replacedByAliasId: null,
            kvDirty: false,
            createdAt: '2026-02-02T10:00:00Z',
            deletedAt: null,
          },
          { status: 201 },
        )
      }),
    )

    renderApp()

    expect(await screen.findByText('shop.k4m2@postern.local')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Your aliases' })).toBeVisible()

    await user.type(screen.getByLabelText('Label'), 'Newsletter')
    await user.click(screen.getByRole('button', { name: 'Create alias' }))

    await waitFor(() => expect(created).toEqual(['newsletter']))
    expect(await screen.findByText('newsletter.p9x1@postern.local')).toBeVisible()
  })

  it('records the category and expected sender with a new alias', async () => {
    const user = userEvent.setup()
    signedIn()
    const created: { label: string; category: string }[] = []
    const senders: { senderEtld1: string }[] = []
    server.use(
      http.get('*/api/aliases', () => HttpResponse.json([])),
      http.post('*/api/aliases', async ({ request }) => {
        const body = (await request.json()) as { label: string; category: string }
        created.push(body)
        return HttpResponse.json(
          {
            id: '5a2b8d44-6c1e-4f2a-8e3b-9c7d5a1f0b22',
            userId: ACCOUNT.userId,
            label: body.label,
            randomSuffix: 'p9x1',
            fullAddress: `${body.label}.p9x1@postern.local`,
            purposeMetadata: null,
            category: body.category,
            status: 0,
            replacedByAliasId: null,
            kvDirty: false,
            createdAt: '2026-02-02T10:00:00Z',
            deletedAt: null,
          },
          { status: 201 },
        )
      }),
      http.post('*/api/aliases/:aliasId/expected-senders', async ({ request }) => {
        senders.push((await request.json()) as { senderEtld1: string })
        return new HttpResponse(null, { status: 201 })
      }),
    )

    renderApp()

    await user.type(await screen.findByLabelText('Label'), 'Bank')
    await user.selectOptions(screen.getByLabelText('Category'), 'finance')
    await user.type(screen.getByLabelText(/Expected sender/), 'alerts@bank.example')
    await user.click(screen.getByRole('button', { name: 'Create alias' }))

    await waitFor(() =>
      expect(senders).toEqual([{ senderEtld1: 'alerts@bank.example' }]),
    )
    expect(created).toEqual([{ label: 'bank', category: 'finance' }])
    expect(await screen.findByText('bank.p9x1@postern.local')).toBeVisible()
  })

  it('keeps the alias when the expected sender cannot be saved', async () => {
    const user = userEvent.setup()
    signedIn()
    server.use(
      http.get('*/api/aliases', () => HttpResponse.json([])),
      http.post('*/api/aliases', () =>
        HttpResponse.json(
          {
            id: '5a2b8d44-6c1e-4f2a-8e3b-9c7d5a1f0b22',
            userId: ACCOUNT.userId,
            label: 'bank',
            randomSuffix: 'p9x1',
            fullAddress: 'bank.p9x1@postern.local',
            purposeMetadata: null,
            category: 'finance',
            status: 0,
            replacedByAliasId: null,
            kvDirty: false,
            createdAt: '2026-02-02T10:00:00Z',
            deletedAt: null,
          },
          { status: 201 },
        ),
      ),
      http.post('*/api/aliases/:aliasId/expected-senders', () =>
        new HttpResponse(null, { status: 500 }),
      ),
    )

    renderApp()

    await user.type(await screen.findByLabelText('Label'), 'bank')
    await user.type(screen.getByLabelText(/Expected sender/), 'alerts@bank.example')
    await user.click(screen.getByRole('button', { name: 'Create alias' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'was not saved as an expected sender',
    )
    expect(screen.getByText('bank.p9x1@postern.local')).toBeVisible()
  })

  it('shows the unread count and opens the fetched notification inbox', async () => {
    const user = userEvent.setup()
    signedIn()
    let notificationRequests = 0
    server.use(
      http.get('*/api/aliases', () => HttpResponse.json([])),
      http.get('*/api/notifications', () => {
        notificationRequests += 1
        return HttpResponse.json({
          unreadCount: 2,
          notifications: [
            {
              id: 'notification-1',
              kind: 'message_received',
              title: 'New mail arrived',
              body: 'shop@example.test',
              link: null,
              createdAt: '2026-11-02T10:00:00Z',
              readAt: null,
            },
            {
              id: 'notification-2',
              kind: 'alias_created',
              title: 'Alias created',
              body: 'news.p9x1@postern.local',
              link: null,
              createdAt: '2026-11-01T10:00:00Z',
              readAt: '2026-11-01T11:00:00Z',
            },
          ],
        })
      }),
    )

    renderApp()

    const triggers = await screen.findAllByRole('button', {
      name: 'Notifications, 2 unread',
    })
    const initialRequests = notificationRequests

    await user.click(triggers[0])

    expect(await screen.findByRole('dialog', { name: 'Notifications' })).toBeVisible()
    expect(screen.getByText('New mail arrived')).toBeVisible()
    expect(screen.getByText('Alias created')).toBeVisible()
    expect(notificationRequests).toBeGreaterThan(initialRequests)
  })

  it('sends anonymous visitors to sign in', async () => {
    renderApp()

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
  })

  it('offers a retry when the account cannot be reached', async () => {
    const user = userEvent.setup()
    let attempts = 0
    server.use(
      http.get('*/api/auth/me', () => {
        attempts += 1
        return attempts === 1
          ? HttpResponse.json({ error: 'down' }, { status: 500 })
          : HttpResponse.json(ACCOUNT)
      }),
      http.get('*/api/aliases', () => HttpResponse.json([])),
    )

    renderApp()

    expect(
      await screen.findByRole('heading', { name: /couldn’t connect right now/i }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute(
      'href',
      '/login',
    )

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('heading', { name: 'Start with one address' }),
    ).toBeVisible()
    expect(attempts).toBe(2)
  })

  it('signs out and returns to the login page', async () => {
    const user = userEvent.setup()
    signedIn()
    let logoutRequests = 0
    server.use(
      http.get('*/api/aliases', () => HttpResponse.json([])),
      http.post('*/api/auth/logout', () => {
        logoutRequests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderApp()

    const buttons = await screen.findAllByRole('button', { name: 'Sign out' })
    await user.click(buttons[0]!)

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(logoutRequests).toBe(1)
  })

  it('keeps the visitor signed in when sign out fails', async () => {
    const user = userEvent.setup()
    signedIn()
    server.use(
      http.get('*/api/aliases', () => HttpResponse.json([])),
      http.post('*/api/auth/logout', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    )

    renderApp()

    const buttons = await screen.findAllByRole('button', { name: 'Sign out' })
    await user.click(buttons[0]!)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign out failed. Please try again.',
    )
    expect(window.location.pathname).not.toBe('/login')
    expect(screen.getAllByRole('button', { name: 'Sign out' }).length).toBeGreaterThan(0)
  })

  it('shows the recovery key once and lets it be dismissed', async () => {
    const user = userEvent.setup()
    signedIn()
    server.use(http.get('*/api/aliases', () => HttpResponse.json([])))
    window.sessionStorage.setItem('postern-pending-recovery-key', 'RECOVERY-KEY-1234')

    renderApp()

    expect(
      await screen.findByRole('heading', { name: 'Save your recovery key' }),
    ).toBeVisible()
    expect(screen.getByText('RECOVERY-KEY-1234')).toBeVisible()
    expect(window.sessionStorage.getItem('postern-pending-recovery-key')).toBeNull()

    await user.click(screen.getByRole('button', { name: /saved it/i }))
    expect(screen.queryByRole('heading', { name: 'Save your recovery key' })).toBeNull()
  })

  it('explains when the requested alias no longer exists', async () => {
    signedIn()
    server.use(
      http.get('*/api/aliases', () =>
        HttpResponse.json([
          {
            id: '0d1f7c62-0a3f-4f0e-9c8f-2f6f0a9d7c11',
            userId: ACCOUNT.userId,
            label: 'shop',
            randomSuffix: 'k4m2',
            fullAddress: 'shop.k4m2@postern.local',
            purposeMetadata: null,
            category: 'personal',
            status: 0,
            replacedByAliasId: null,
            kvDirty: false,
            createdAt: '2026-02-01T10:00:00Z',
            deletedAt: null,
          },
        ]),
      ),
    )

    renderApp('/app/aliases/does-not-exist')

    expect(await screen.findByRole('heading', { name: 'Alias not found' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to aliases' })).toHaveAttribute('href', '/app')
  })

  it('opens the activity feed for a selected alias', async () => {
    signedIn()
    const aliasId = '0d1f7c62-0a3f-4f0e-9c8f-2f6f0a9d7c11'
    const messageRequests: string[] = []
    server.use(
      http.get('*/api/aliases', () =>
        HttpResponse.json([
          {
            id: aliasId,
            userId: ACCOUNT.userId,
            label: 'shop',
            randomSuffix: 'k4m2',
            fullAddress: 'shop.k4m2@postern.local',
            purposeMetadata: null,
            category: 'personal',
            status: 0,
            replacedByAliasId: null,
            kvDirty: false,
            createdAt: '2026-02-01T10:00:00Z',
            deletedAt: null,
          },
        ]),
      ),
      http.get('*/api/aliases/:aliasId/messages', ({ request }) => {
        messageRequests.push(new URL(request.url).pathname)
        return HttpResponse.json({
          items: [
            {
              id: 'message-1',
              aliasId,
              fromHeader: 'Shop <info@shop.example>',
              envelopeSender: 'info@shop.example',
              subject: 'Your order',
              receivedAt: '2026-02-01T10:00:00Z',
              authenticationResult: 'pass',
              isFlagged: false,
              flagReason: null,
            },
          ],
          nextCursor: null,
        })
      }),
    )

    renderApp(`/app/aliases/${aliasId}`)

    expect(await screen.findByRole('heading', { name: 'shop' })).toBeVisible()
    expect(await screen.findByText('Your order')).toBeVisible()
    expect(messageRequests).toEqual([`/api/aliases/${aliasId}/messages`])
  })

  it('shows blocked messages on the blocked route', async () => {
    signedIn()
    server.use(
      http.get('*/api/aliases', () => HttpResponse.json([])),
      http.get('*/api/messages/blocked', () =>
        HttpResponse.json({ items: [], nextCursor: null }),
      ),
    )

    renderApp('/app/blocked')

    expect(await screen.findByRole('heading', { name: 'Blocked messages' })).toBeVisible()
    expect(await screen.findByText('Nothing blocked')).toBeVisible()
  })

  it('shows account settings with the forwarding destination', async () => {
    signedIn()
    server.use(http.get('*/api/aliases', () => HttpResponse.json([])))

    renderApp('/app/account')

    expect(
      await screen.findByRole('heading', { name: 'Account settings' }),
    ).toBeVisible()
    expect(screen.getByLabelText('Destination address')).toHaveValue(ACCOUNT.forwardingAddress)
  })
})
