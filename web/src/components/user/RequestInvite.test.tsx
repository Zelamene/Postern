import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RequestInvite } from './RequestInvite'
import { server } from '../../test/server'

const originalShowModal = HTMLDialogElement.prototype.showModal
const originalClose = HTMLDialogElement.prototype.close

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

afterAll(() => {
  HTMLDialogElement.prototype.showModal = originalShowModal
  HTMLDialogElement.prototype.close = originalClose
})

describe('RequestInvite', () => {
  it('opens a dialog and submits the email invite request', async () => {
    const user = userEvent.setup()
    let requestedEmail = ''

    server.use(
      http.post('*/api/admin/invites', async ({ request }) => {
        const body = (await request.json()) as { email: string }
        requestedEmail = body.email
        return HttpResponse.json(
          {
            id: 'invite-1',
            expiresAt: '2026-11-05T00:00:00Z',
            inviteUrl: '/invite/invite-1',
          },
          { status: 201 },
        )
      }),
    )

    render(<RequestInvite />)

    await user.click(screen.getByRole('button', { name: 'Request an invite' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('open')

    await user.type(screen.getByLabelText('Email address'), 'person@example.com')
    await user.click(screen.getByRole('button', { name: 'Send request' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your invite request has been sent.',
    )
    expect(requestedEmail).toBe('person@example.com')

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(dialog).not.toHaveAttribute('open')
  })

  it('shows an error when the request cannot be sent', async () => {
    server.use(
      http.post('*/api/admin/invites', () =>
        HttpResponse.json({ error: 'Invite requests are closed.' }, { status: 403 }),
      ),
    )

    render(<RequestInvite />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Request an invite' }))
    await user.type(screen.getByLabelText('Email address'), 'person@example.com')
    await user.click(screen.getByRole('button', { name: 'Send request' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invite requests are closed.')
  })
})
