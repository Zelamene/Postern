import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import App from '../../src/App'
import { server } from '../server'

const UserId = '00000000-0000-0000-0000-000000000001'
const AliasId = '00000000-0000-0000-0000-000000000202'
const AliasAddress = 'newsletter-def67890@alias.postern.test'

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

function alias() {
  return {
    id: AliasId,
    userId: UserId,
    label: 'Newsletter',
    randomSuffix: 'def67890',
    fullAddress: AliasAddress,
    purposeMetadata: null,
    category: 'newsletter',
    status: 'Active',
    replacedByAliasId: null,
    kvDirty: false,
    createdAt: '2026-11-01T10:00:00Z',
    deletedAt: null,
  }
}

function renderDashboard() {
  server.use(
    http.get('*/api/auth/me', () =>
      HttpResponse.json({
        userId: UserId,
        email: 'person@example.test',
        forwardingAddress: 'forward@example.test',
      }),
    ),
    http.get('*/api/aliases', () => HttpResponse.json([alias()])),
  )

  window.history.pushState({}, '', '/app')
  return render(<App />)
}

afterEach(() => {
  window.history.pushState({}, '', '/')
  window.sessionStorage.clear()
  localStorage.removeItem('postern-theme')
})

describe('Alias lifecycle flow', () => {
  it('disables and then deletes an alias with the required confirmation', async () => {
    const user = userEvent.setup()
    const requests: string[] = []
    server.use(
      http.patch(`*/api/aliases/${AliasId}/disable`, () => {
        requests.push('disable')
        return new HttpResponse(null, { status: 204 })
      }),
      http.delete(`*/api/aliases/${AliasId}`, () => {
        requests.push('delete')
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderDashboard()

    expect(await screen.findByRole('heading', { name: 'Your aliases' })).toBeDefined()
    const aliasRow = (await screen.findByText(AliasAddress)).closest('li')
    expect(aliasRow).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Disable' }))
    expect(screen.getByRole('heading', { name: 'Disable this alias?' })).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Disable alias' }))

    expect(requests).toEqual(['disable'])
    expect(await screen.findByText('Disabled')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('heading', { name: 'Delete this alias?' })).toBeDefined()
    const deleteAliasButton = screen.getByRole('button', { name: 'Delete alias' })
    expect(deleteAliasButton).toBeDisabled()

    await user.type(screen.getByLabelText(`Type ${AliasAddress} to confirm`), AliasAddress)
    expect(deleteAliasButton).toBeEnabled()
    await user.click(deleteAliasButton)

    expect(requests).toEqual(['disable', 'delete'])
    expect(await screen.findByText('Deleted')).toBeDefined()
  })
})
