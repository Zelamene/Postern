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

describe('App access flow', () => {
  it('redirects anonymous users from /app to sign in', async () => {
    server.use(http.get('*/api/auth/me', () => new HttpResponse(null, { status: 401 })))

    renderAt('/app')

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(screen.getByRole('heading', { name: 'Sign in to Postern' })).toBeDefined()
  })

  it('shows the unavailable state when the session cannot load and retries on request', async () => {
    const user = userEvent.setup()
    let attempts = 0
    server.use(
      http.get('*/api/auth/me', () => {
        attempts += 1
        return HttpResponse.json({ error: 'unavailable' }, { status: 500 })
      }),
      http.get('*/api/aliases', () => HttpResponse.json([])),
    )

    renderAt('/app')

    expect(
      await screen.findByRole('heading', { name: 'We couldn’t connect right now' }),
    ).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(attempts).toBeGreaterThan(1))
  })
})
