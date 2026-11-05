import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RequestInvite } from '../../src/components/user/RequestInvite'
import { server } from '../server'

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
      http.post('*/api/invite-requests', async ({ request }) => {
        const body = (await request.json()) as { email: string }
        requestedEmail = body.email
        return HttpResponse.json(
          { message: 'If eligible, your request has been recorded for review.' },
          { status: 202 },
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
      'Your request has been recorded.',
    )
    expect(requestedEmail).toBe('person@example.com')

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(dialog).not.toHaveAttribute('open')
  })

  it('submits internationalized email addresses for backend validation', async () => {
    const user = userEvent.setup()
    let requestedEmail = ''

    server.use(
      http.post('*/api/invite-requests', async ({ request }) => {
        const body = (await request.json()) as { email: string }
        requestedEmail = body.email
        return HttpResponse.json({ message: 'Recorded.' }, { status: 202 })
      }),
    )

    render(<RequestInvite />)
    await user.click(screen.getByRole('button', { name: 'Request an invite' }))
    const emailInput = screen.getByLabelText('Email address')
    expect(emailInput).toHaveAttribute('type', 'text')
    await user.type(emailInput, 'δοκιμή@παράδειγμα.ελ')
    await user.click(screen.getByRole('button', { name: 'Send request' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your request has been recorded.',
    )
    expect(requestedEmail).toBe('δοκιμή@παράδειγμα.ελ')
  })

  it('shows an error when the request cannot be sent', async () => {
    server.use(
      http.post('*/api/invite-requests', () =>
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
