import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { server } from '../server'

vi.mock('../../src/hooks/useAdminRealtime', () => ({
  useAdminRealtime: () => undefined,
}))

function renderAt(pathname: string) {
  window.history.pushState({}, '', pathname)
  return render(<App />)
}

afterEach(() => {
  window.history.pushState({}, '', '/')
  window.sessionStorage.clear()
  localStorage.removeItem('postern-theme')
})

describe('Admin invite management flow', () => {
  const dashboard = {
    invites: [
      {
        id: 'invite-1',
        email: 'invitee@example.test',
        status: 'pending',
        createdAt: '2026-11-01T12:00:00Z',
        expiresAt: '2026-11-08T12:00:00Z',
        canResend: true,
        canRevoke: true,
      },
    ],
    seatsFree: 196,
    outstandingInvites: 1,
  }

  it('signs an administrator in, loads invite requests, and approves one', async () => {
    const user = userEvent.setup()
    let invitesRequests = 0
    let approveRequests = 0
    let pendingRequests = [
      { id: 'request-1', email: 'invitee@example.test', requestedAt: '2026-11-01T12:00:00Z' },
    ]

    server.use(
      http.get('*/api/admin/invites', () => {
        invitesRequests += 1
        return invitesRequests === 1
          ? HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
          : HttpResponse.json(dashboard)
      }),
      http.get('*/api/admin/invite-requests', () => HttpResponse.json({ requests: pendingRequests })),
      http.post('*/api/auth/login', async ({ request }) => {
        expect(await request.json()).toEqual({
          email: 'admin@example.test',
          password: 'secure-admin-password',
        })
        return HttpResponse.json({
          userId: 'admin-id',
          email: 'admin@example.test',
          recoveryKey: 'one-time-admin-recovery-key',
        })
      }),
      http.post('*/api/admin/invite-requests/request-1/approve', () => {
        approveRequests += 1
        pendingRequests = []
        return new HttpResponse(null, { status: 202 })
      }),
    )

    renderAt('/admin')

    await user.type(await screen.findByLabelText('Email address'), 'admin@example.test')
    await user.type(screen.getByLabelText('Password'), 'secure-admin-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
    expect(screen.getAllByText('invitee@example.test').length).toBeGreaterThan(0)
    expect(screen.getByText('one-time-admin-recovery-key')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(approveRequests).toBe(1))
    await waitFor(() => expect(screen.getByText('No pending invite requests.')).toBeVisible())
  })

  it('denies admin dashboard access to a non-administrator account', async () => {
    const user = userEvent.setup()
    let invitesRequests = 0
    server.use(
      http.get('*/api/admin/invites', () => {
        invitesRequests += 1
        return invitesRequests === 1
          ? HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
          : HttpResponse.json({ error: 'forbidden' }, { status: 403 })
      }),
      http.get('*/api/admin/invite-requests', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ userId: 'user-id', email: 'user@example.test' }),
      ),
    )

    renderAt('/admin')

    await user.type(await screen.findByLabelText('Email address'), 'user@example.test')
    await user.type(screen.getByLabelText('Password'), 'user-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Admin access required' })).toBeVisible()
  })
})
