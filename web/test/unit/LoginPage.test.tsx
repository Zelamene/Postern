import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { LoginPage } from '../../src/pages/LoginPage'
import { server } from '../server'

describe('LoginPage', () => {
  it('signs in an active invited user and displays a one-time recovery key', async () => {
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
    )

    render(<LoginPage />)
    await user.type(screen.getByLabelText('Email address'), 'person@example.test')
    await user.type(screen.getByLabelText('Password'), 'a long secure password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'You’re signed in.' })).toBeVisible()
    expect(screen.getByText('one-time-recovery-key')).toBeVisible()
    expect(submitted).toEqual({
      email: 'person@example.test',
      password: 'a long secure password',
    })
  })

  it('explains that pending accounts must be verified before sign-in', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ error: 'verification_required' }, { status: 403 }),
      ),
    )

    render(<LoginPage />)
    await user.type(screen.getByLabelText('Email address'), 'person@example.test')
    await user.type(screen.getByLabelText('Password'), 'a long secure password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your account needs destination verification before it can be activated.',
    )
  })

  it('directs an administrator to the separate admin sign-in flow', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ mfaRequired: true }),
      ),
    )

    render(<LoginPage />)
    await user.type(screen.getByLabelText('Email address'), 'admin@example.test')
    await user.type(screen.getByLabelText('Password'), 'a long secure password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('link', { name: 'Go to admin sign in' })).toHaveAttribute(
      'href',
      '/admin',
    )
  })

  it('shows a generic authentication error for invalid credentials', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/auth/login', () => new HttpResponse(null, { status: 401 })),
    )

    render(<LoginPage />)
    await user.type(screen.getByLabelText('Email address'), 'person@example.test')
    await user.type(screen.getByLabelText('Password'), 'incorrect password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect.',
    )
  })
})
