import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { InviteRegistrationPage } from './InviteRegistrationPage'
import { server } from '../test/server'

describe('InviteRegistrationPage', () => {
  it('submits the invitation code with the account registration details', async () => {
    const user = userEvent.setup()
    let submitted: Record<string, unknown> | undefined
    server.use(
      http.post('*/api/auth/register', async ({ request }) => {
        submitted = (await request.json()) as Record<string, unknown>
        return new HttpResponse(null, { status: 202 })
      }),
    )

    render(<InviteRegistrationPage inviteCode="postern_invite_secret" />)
    await user.type(screen.getByLabelText('Email address'), 'person@example.test')
    await user.type(screen.getByLabelText('Password'), 'a long secure password')
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Your account is ready')
    expect(submitted).toEqual({
      email: 'person@example.test',
      password: 'a long secure password',
      inviteCode: 'postern_invite_secret',
    })
  })

  it('explains when an invitation is no longer valid', async () => {
    server.use(
      http.post('*/api/auth/register', () =>
        HttpResponse.json({ error: 'invalid_invite' }, { status: 400 }),
      ),
    )
    const user = userEvent.setup()

    render(<InviteRegistrationPage inviteCode="expired-code" />)
    await user.type(screen.getByLabelText('Email address'), 'person@example.test')
    await user.type(screen.getByLabelText('Password'), 'a long secure password')
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid, expired, or has already been used')
  })
})
