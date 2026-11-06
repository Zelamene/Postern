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
})
