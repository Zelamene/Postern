import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { InviteRegistrationPage } from '../../src/pages/InviteRegistrationPage'
import { server } from '../server'

describe('InviteRegistrationPage', () => {
  it('resolves the invite email and submits it with the password', async () => {
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

    render(<InviteRegistrationPage inviteCode="postern_invite_secret" />)
    expect(await screen.findByLabelText('Invited email address')).toHaveValue('person@example.test')
    expect(screen.getByLabelText('Invited email address')).toHaveAttribute('readonly')
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms',
    )
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
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

  it('explains when an invitation is no longer valid', async () => {
    server.use(
      http.post('*/api/auth/invite-details', () =>
        HttpResponse.json({ error: 'invalid_invite' }, { status: 404 }),
      ),
      http.post('*/api/auth/register', () =>
        HttpResponse.json({ error: 'invalid_invite' }, { status: 400 }),
      ),
    )
    render(<InviteRegistrationPage inviteCode="expired-code" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not verify this invitation.',
    )
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })
})
