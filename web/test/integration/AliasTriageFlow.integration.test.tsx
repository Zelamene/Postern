import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../src/App'
import { server } from '../server'

const UserId = '00000000-0000-0000-0000-000000000001'
const AliasId = '00000000-0000-0000-0000-000000000201'
const AliasAddress = 'shop-abc12345@alias.postern.test'

function alias() {
  return {
    id: AliasId,
    userId: UserId,
    label: 'Shop',
    randomSuffix: 'abc12345',
    fullAddress: AliasAddress,
    purposeMetadata: null,
    category: 'shopping',
    status: 'Active',
    replacedByAliasId: null,
    kvDirty: false,
    createdAt: '2026-11-01T10:00:00Z',
    deletedAt: null,
  }
}

function flaggedMessage() {
  return {
    id: '00000000-0000-0000-0000-000000000301',
    aliasId: AliasId,
    fromHeader: 'Billing <billing@unknown.example>',
    envelopeSender: 'billing@unknown.example',
    subject: 'Invoice attached',
    receivedAt: '2026-11-05T09:30:00Z',
    authenticationResult: 'fail',
    isFlagged: true,
    flagReason: 'fail',
  }
}

function useSignedInAlias() {
  server.use(
    http.get('*/api/auth/me', () =>
      HttpResponse.json({
        userId: UserId,
        email: 'person@example.test',
        forwardingAddress: 'forward@example.test',
      }),
    ),
    http.get('*/api/aliases', () => HttpResponse.json([alias()])),
    http.get(`*/api/aliases/${AliasId}/messages`, () =>
      HttpResponse.json({ items: [flaggedMessage()], nextCursor: null }),
    ),
  )
}

function renderActivity() {
  window.history.pushState({}, '', `/app/aliases/${AliasId}`)
  return render(<App />)
}

afterEach(() => {
  window.history.pushState({}, '', '/')
  window.sessionStorage.clear()
  localStorage.removeItem('postern-theme')
})

describe('Alias triage flow', () => {
  it('marks a flagged sender as expected from the activity feed', async () => {
    const user = userEvent.setup()
    let markedSender: unknown
    useSignedInAlias()
    server.use(
      http.post(`*/api/aliases/${AliasId}/mark-expected`, async ({ request }) => {
        markedSender = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderActivity()

    expect(await screen.findByRole('heading', { name: 'Shop' })).toBeDefined()
    expect(await screen.findByText('High severity · Failed authentication')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Mark unknown.example as expected' }))

    expect(markedSender).toEqual({ senderEtld1: 'unknown.example' })
    expect(
      await screen.findByText('Sender marked as expected. Its mail is no longer flagged.'),
    ).toBeDefined()
  })

  it('blocks a flagged sender from the activity feed', async () => {
    const user = userEvent.setup()
    let blockedSender: unknown
    useSignedInAlias()
    server.use(
      http.post(`*/api/aliases/${AliasId}/block-sender`, async ({ request }) => {
        blockedSender = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderActivity()

    expect(await screen.findByRole('heading', { name: 'Shop' })).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Block unknown.example' }))

    expect(blockedSender).toEqual({ senderEtld1: 'unknown.example' })
    expect(
      await screen.findByText(
        'Sender blocked. New mail from unknown.example is dropped for this alias.',
      ),
    ).toBeDefined()
  })

  it('keeps the flag actions for active aliases only', async () => {
    useSignedInAlias()
    server.use(
      http.get('*/api/aliases', () =>
        HttpResponse.json([{ ...alias(), status: 'Disabled' }]),
      ),
    )

    renderActivity()

    expect(await screen.findByRole('heading', { name: 'Shop' })).toBeDefined()
    expect(screen.getByText('High severity · Failed authentication')).toBeDefined()
    expect(screen.queryByRole('button', { name: /Mark .* as expected/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Block / })).toBeNull()
  })
})
