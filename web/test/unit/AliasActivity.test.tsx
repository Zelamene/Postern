import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { AliasActivity } from '../../src/components/app/AliasActivity'
import type { Alias } from '../../src/services/aliasService'
import type { MailMessage } from '../../src/services/activityService'
import type { ActivityFeed } from '../../src/hooks/useActivity'
import { server } from '../server'

const ALIAS: Alias = {
  id: '0d1f7c62-0a3f-4f0e-9c8f-2f6f0a9d7c11',
  userId: '6f1c9f1e-0d7f-4a63-9a44-4d5f6f2c6f11',
  label: 'shop',
  randomSuffix: 'k4m2',
  fullAddress: 'shop.k4m2@postern.local',
  purposeMetadata: null,
  category: 'shopping',
  status: 'Active',
  replacedByAliasId: null,
  kvDirty: false,
  createdAt: '2026-02-01T10:00:00Z',
  deletedAt: null,
}

const FLAGGED: MailMessage = {
  id: 'b0a1d6f4-3c2e-4b7a-9d1f-0e2c3b4a5d6e',
  aliasId: ALIAS.id,
  fromHeader: 'Shop <info@shop.example>',
  envelopeSender: 'info@shop.example',
  subject: 'Your order',
  receivedAt: '2026-02-01T10:00:00Z',
  authenticationResult: 'pass',
  isFlagged: true,
  flagReason: 'unknown_sender',
}

function feedWith(message: MailMessage): ActivityFeed<MailMessage> {
  return {
    items: [message],
    status: 'ready',
    error: null,
    hasMore: false,
    isLoadingMore: false,
    loadMore: async () => undefined,
  }
}

function renderActivity(message: MailMessage, alias: Alias = ALIAS) {
  render(<AliasActivity alias={alias} feed={feedWith(message)} onAliasReplaced={vi.fn()} />)
}

describe('AliasActivity sender actions', () => {
  it('marks a flagged sender as expected', async () => {
    const user = userEvent.setup()
    const marked: string[] = []
    server.use(
      http.post('*/api/aliases/:aliasId/mark-expected', ({ request }) => {
        marked.push(new URL(request.url).pathname)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderActivity(FLAGGED)
    await user.click(screen.getByRole('button', { name: 'Mark shop.example as expected' }))

    await waitFor(() =>
      expect(marked).toEqual([`/api/aliases/${ALIAS.id}/mark-expected`]),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Sender marked as expected')
  })

  it('blocks a flagged sender', async () => {
    const user = userEvent.setup()
    const blocked: string[] = []
    server.use(
      http.post('*/api/aliases/:aliasId/block-sender', ({ request }) => {
        blocked.push(new URL(request.url).pathname)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderActivity(FLAGGED)
    await user.click(screen.getByRole('button', { name: 'Block shop.example' }))

    await waitFor(() =>
      expect(blocked).toEqual([`/api/aliases/${ALIAS.id}/block-sender`]),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Sender blocked')
  })

  it('reports a sender the API rejects', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/aliases/:aliasId/block-sender', () =>
        HttpResponse.json({ title: 'invalid' }, { status: 400 }),
      ),
    )

    renderActivity(FLAGGED)
    await user.click(screen.getByRole('button', { name: 'Block shop.example' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That sender address cannot be used',
    )
  })

  it('hides sender actions for unflagged mail and retired aliases', () => {
    renderActivity({ ...FLAGGED, isFlagged: false })
    expect(screen.queryByRole('button', { name: /as expected/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Block / })).toBeNull()
  })

  it('hides sender actions when the alias is no longer active', () => {
    renderActivity(FLAGGED, { ...ALIAS, status: 'Disabled' })
    expect(screen.queryByRole('button', { name: /as expected/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Replace address' })).toBeNull()
  })
})
