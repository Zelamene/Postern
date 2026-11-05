import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../src/App'
import { server } from '../server'

afterEach(() => {
  window.history.pushState({}, '', '/')
})

describe('Postern app shell', () => {
  it('renders the product heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible()
  })

  it('keeps the invite request beside the how-it-works link', () => {
    render(<App />)
    const requestInvite = screen.getByRole('button', { name: 'Request an invite' })
    const howItWorks = screen.getByRole('link', { name: 'See how it works' })

    expect(requestInvite.parentElement).toBe(howItWorks.parentElement)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: 'Admin sign-in' })).not.toBeInTheDocument()
  })

  it('routes regular users to the invite-only sign-in page', async () => {
    window.history.pushState({}, '', '/login')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Sign in to Postern' })).toBeVisible()
    expect(screen.getByText(/invite-only platform/i)).toBeVisible()
  })

  it('routes administrators to the admin sign-in screen', async () => {
    server.use(
      http.get('*/api/admin/invites', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
      http.get('*/api/admin/invite-requests', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    )
    window.history.pushState({}, '', '/admin')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Admin sign in' })).toBeVisible()
  })
})
