import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { AdminPage } from '../../src/pages/AdminPage'
import { server } from '../server'

const dashboard = {
  invites: [
    {
      id: 'invite-1',
      email: 'person@example.test',
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

describe('AdminPage', () => {
  it('requires authenticator enrollment before granting an admin session', async () => {
    const user = userEvent.setup()
    let inviteDashboardRequests = 0
    let enableRequests = 0

    server.use(
      http.get('*/api/admin/invites', () => {
        inviteDashboardRequests += 1
        return inviteDashboardRequests === 1
          ? HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
          : HttpResponse.json(dashboard)
      }),
      http.get('*/api/admin/invite-requests', () =>
        HttpResponse.json({ requests: [] }),
      ),
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ mfaSetupRequired: true }),
      ),
      http.post('*/api/auth/admin-mfa/setup', () =>
        HttpResponse.json({
          secret: 'JBSWY3DPEHPK3PXP',
          authenticatorUri: 'otpauth://totp/Postern%3Aadmin%40example.test?secret=JBSWY3DPEHPK3PXP',
        }),
      ),
      http.post('*/api/auth/admin-mfa/enable', async ({ request }) => {
        expect(await request.json()).toEqual({ code: '123456' })
        enableRequests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<AdminPage theme="light" onThemeChange={() => undefined} />)

    await user.type(await screen.findByLabelText('Email address'), 'admin@example.test')
    await user.type(screen.getByLabelText('Password'), 'secure-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeVisible()
    await user.type(screen.getByLabelText('Authenticator code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Enable and continue' }))

    expect(await screen.findByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
    expect(enableRequests).toBe(1)
  })

  it('signs in, shows the admin invite dashboard, and resends an invite', async () => {
    const user = userEvent.setup()
    let inviteDashboardRequests = 0
    let resendRequests = 0

    server.use(
      http.get('*/api/admin/invites', () => {
        inviteDashboardRequests += 1
        return inviteDashboardRequests === 1
          ? HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
          : HttpResponse.json(dashboard)
      }),
      http.get('*/api/admin/invite-requests', () =>
        HttpResponse.json({ requests: [] }),
      ),
      http.post('*/api/auth/login', async ({ request }) => {
        expect(await request.json()).toEqual({
          email: 'admin@example.test',
          password: 'secure-password',
        })
        return HttpResponse.json({
          userId: 'admin-id',
          email: 'admin@example.test',
          recoveryKey: 'one-time-admin-recovery-key',
        })
      }),
      http.post('*/api/admin/invites/invite-1/resend', () => {
        resendRequests += 1
        return new HttpResponse(null, { status: 202 })
      }),
    )

    render(<AdminPage theme="light" onThemeChange={() => undefined} />)

    await user.type(await screen.findByLabelText('Email address'), 'admin@example.test')
    await user.type(screen.getByLabelText('Password'), 'secure-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
    expect(screen.getByText('196')).toBeVisible()
    expect(screen.getByText('person@example.test')).toBeVisible()
    expect(screen.getByText('pending')).toBeVisible()
    expect(screen.getByText('one-time-admin-recovery-key')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Resend' }))

    await waitFor(() => {
      expect(resendRequests).toBe(1)
      expect(inviteDashboardRequests).toBe(3)
    })
  })

  it('does not open the dashboard for a non-admin account', async () => {
    const user = userEvent.setup()
    let inviteDashboardRequests = 0
    server.use(
      http.get('*/api/admin/invites', () => {
        inviteDashboardRequests += 1
        return inviteDashboardRequests === 1
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

    render(<AdminPage theme="light" onThemeChange={() => undefined} />)
    await user.type(await screen.findByLabelText('Email address'), 'user@example.test')
    await user.type(screen.getByLabelText('Password'), 'password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Admin access required' })).toBeVisible()
  })
})
