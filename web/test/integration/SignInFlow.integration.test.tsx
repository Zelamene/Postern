import { render, screen, waitFor } from '@testing-library/react'
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

describe('Sign-in flow', () => {
  it('signs in through /login and reaches the authenticated app', async () => {
    const user = userEvent.setup()
    let submitted: Record<string, unknown> | undefined
    server.use(
      http.post('*/api/auth/login', async ({ request }) => {
        submitted = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          email: 'person@example.test',
          recoveryKey: 'one-time-recovery-key',
        })
      }),
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          userId: '00000000-0000-0000-0000-000000000001',
          email: 'person@example.test',
          forwardingAddress: 'forward@example.test',
        }),
      ),
      http.get('*/api/aliases', () => HttpResponse.json([])),
    )

    renderAt('/login')

    expect(screen.getByRole('heading', { name: 'Sign in to Postern' })).toBeDefined()
    await user.type(screen.getByLabelText('Email address'), 'person@example.test')
    await user.type(screen.getByLabelText('Password'), 'a long secure password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(window.location.pathname).toBe('/app'), { timeout: 3000 })
    expect(submitted).toEqual({
      email: 'person@example.test',
      password: 'a long secure password',
    })
    expect(await screen.findByText(/one-time-recovery-key/)).toBeDefined()
  })

  it('shows feedback for invalid credentials and stays on /login', async () => {
    const user = userEvent.setup()
    server.use(http.post('*/api/auth/login', () => new HttpResponse(null, { status: 401 })))

    renderAt('/login')
    await user.type(screen.getByLabelText('Email address'), 'person@example.test')
    await user.type(screen.getByLabelText('Password'), 'incorrect password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect.',
    )
    expect(window.location.pathname).toBe('/login')
  })
})
