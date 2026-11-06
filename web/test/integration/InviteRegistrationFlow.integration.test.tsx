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

describe('Invite registration flow', () => {
  it('resolves invite details and completes registration through /invite/:code', async () => {
    const user = userEvent.setup()
    let submitted: Record<string, unknown> | undefined
    server.use(
      http.post('*/api/auth/invite-details', async ({ request }) => {
        expect(await request.json()).toEqual({ inviteCode: 'postern_invite_secret' })
        return HttpResponse.json({ email: 'person@example.test' })
      }),
      http.post('*/api/auth/register', async ({ request }) => {
        submitted = (await request.json()) as Record<string, unknown>
        return new HttpResponse(null, { status: 202 })
      }),
    )

    renderAt('/invite/postern_invite_secret')

    expect(await screen.findByLabelText('Invited email address')).toHaveValue(
      'person@example.test',
    )
    await user.type(screen.getByLabelText('Password'), 'a long secure password')
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Your account is ready')
    expect(screen.getByRole('link', { name: 'Go to login' })).toHaveAttribute('href', '/login')
    expect(submitted).toEqual({
      password: 'a long secure password',
      inviteCode: 'postern_invite_secret',
    })
  })
})
