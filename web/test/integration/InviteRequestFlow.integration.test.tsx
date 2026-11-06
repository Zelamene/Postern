import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import App from '../../src/App'
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

function renderAt(pathname: string) {
  window.history.pushState({}, '', pathname)
  return render(<App />)
}

afterEach(() => {
  window.history.pushState({}, '', '/')
  window.sessionStorage.clear()
  localStorage.removeItem('postern-theme')
})

describe('Invite request flow', () => {
  it('submits an invitation request from the home page and shows confirmation', async () => {
    const user = userEvent.setup()
    let requestedEmail = ''
    server.use(
      http.post('*/api/invite-requests', async ({ request }) => {
        requestedEmail = ((await request.json()) as { email: string }).email
        return HttpResponse.json(
          { message: 'If eligible, your request has been recorded for review.' },
          { status: 202 },
        )
      }),
    )

    renderAt('/')

    await user.click(screen.getByRole('button', { name: 'Request an invite' }))
    await user.type(screen.getByLabelText('Email address'), 'requester@example.test')
    await user.click(screen.getByRole('button', { name: 'Send request' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your request has been recorded.',
    )
    expect(requestedEmail).toBe('requester@example.test')
  })
})
