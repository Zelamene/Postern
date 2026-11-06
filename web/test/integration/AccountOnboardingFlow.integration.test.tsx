import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../src/App'
import { server } from '../server'

function renderAt(pathname: string) {
  window.history.pushState({}, '', pathname)
  return render(<App />)
}

afterEach(() => {
  window.history.pushState({}, '', '/')
  window.sessionStorage.clear()
  localStorage.removeItem('postern-theme')
})

describe('Account onboarding flow', () => {
  it('completes invite registration, signs in, and reaches the alias dashboard', async () => {
    const user = userEvent.setup()
    let registered: Record<string, unknown> | undefined
    let login: Record<string, unknown> | undefined
    server.use(
      http.post('*/api/auth/invite-details', async ({ request }) => {
        expect(await request.json()).toEqual({ inviteCode: 'postern_invite_onboarding' })
        return HttpResponse.json({ email: 'newuser@example.test' })
      }),
      http.post('*/api/auth/register', async ({ request }) => {
        registered = (await request.json()) as Record<string, unknown>
        return new HttpResponse(null, { status: 202 })
      }),
      http.post('*/api/auth/login', async ({ request }) => {
        login = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ email: 'newuser@example.test', recoveryKey: null })
      }),
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          userId: '00000000-0000-0000-0000-000000000201',
          email: 'newuser@example.test',
          forwardingAddress: 'newuser-inbox@example.test',
        }),
      ),
      http.get('*/api/aliases', () => HttpResponse.json([])),
    )

    renderAt('/invite/postern_invite_onboarding')

    expect(await screen.findByLabelText('Invited email address')).toHaveValue(
      'newuser@example.test',
    )
    await user.type(screen.getByLabelText('Password'), 'onboarding-secure-password')
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Your account is ready')

    window.history.pushState({}, '', '/login')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await user.type(await screen.findByLabelText('Email address'), 'newuser@example.test')
    await user.type(screen.getByLabelText('Password'), 'onboarding-secure-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Your aliases' })).toBeDefined()
    expect(screen.getByText(/newuser-inbox@example\.test/)).toBeDefined()
    expect(registered).toEqual({
      password: 'onboarding-secure-password',
      inviteCode: 'postern_invite_onboarding',
    })
    expect(login).toEqual({
      email: 'newuser@example.test',
      password: 'onboarding-secure-password',
    })
  })
})
