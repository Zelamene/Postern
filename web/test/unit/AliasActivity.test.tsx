import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AliasActivity } from '../../src/components/app/AliasActivity'
import { ToastContext } from '../../src/components/common/toast'
import type { ActivityFeed, Alias, MailMessage } from '../../src/types'
import { server } from '../server'

const exportAliasActivityCsv = vi.fn()
const clipboard = vi.hoisted(() => ({ copyText: vi.fn(), selectText: vi.fn() }))

vi.mock('../../src/services/activityExport', () => ({
  exportAliasActivityCsv: (...args: unknown[]) => exportAliasActivityCsv(...args),
}))

vi.mock('../../src/services/clipboard', () => clipboard)

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

function renderWithToast(message: MailMessage, alias: Alias = ALIAS) {
  const toast = { success: vi.fn(), error: vi.fn() }
  const onAliasReplaced = vi.fn()
  render(
    <ToastContext.Provider value={toast}>
      <AliasActivity alias={alias} feed={feedWith(message)} onAliasReplaced={onAliasReplaced} />
    </ToastContext.Provider>,
  )
  return { toast, onAliasReplaced }
}

beforeEach(() => {
  exportAliasActivityCsv.mockReset()
  clipboard.copyText.mockReset()
  clipboard.selectText.mockReset()
})

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

  it('warns before blocking every address at a public email provider', async () => {
    const user = userEvent.setup()
    const blocked: string[] = []
    server.use(
      http.post('*/api/aliases/:aliasId/block-sender', ({ request }) => {
        blocked.push(new URL(request.url).pathname)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderActivity({
      ...FLAGGED,
      fromHeader: 'Spammer <spammer@gmail.com>',
      envelopeSender: 'spammer@gmail.com',
    })

    await user.click(screen.getByRole('button', { name: 'Block gmail.com' }))

    expect(blocked).toEqual([])
    expect(screen.getByText(/public email provider/i)).toBeVisible()
    expect(screen.getByText(/every other address at @gmail.com/i)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Block @gmail.com' }))

    await waitFor(() =>
      expect(blocked).toEqual([`/api/aliases/${ALIAS.id}/block-sender`]),
    )
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

describe('AliasActivity leak detection', () => {
  it('shows three severity levels for flagged messages', () => {
    render(
      <AliasActivity
        alias={ALIAS}
        feed={{
          items: [
            { ...FLAGGED, id: 'high', flagReason: 'fail' },
            { ...FLAGGED, id: 'medium', flagReason: 'unexpected_pass' },
            { ...FLAGGED, id: 'low', flagReason: 'unexpected_none' },
          ],
          status: 'ready',
          error: null,
          hasMore: false,
          isLoadingMore: false,
          loadMore: async () => undefined,
        }}
        onAliasReplaced={vi.fn()}
      />,
    )

    expect(screen.getByText(/High severity/i)).toBeVisible()
    expect(screen.getByText(/Medium severity/i)).toBeVisible()
    expect(screen.getByText(/Low severity/i)).toBeVisible()
  })

  it('shows Mark as expected, Replace alias, and Block sender for a flagged message', async () => {
    const user = userEvent.setup()
    renderActivity(FLAGGED)

    expect(screen.getByRole('button', { name: 'Mark shop.example as expected' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Replace this alias' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Block shop.example' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Replace this alias' }))
    expect(await screen.findByRole('list', { name: 'Replacement checklist' })).toBeVisible()
  })
})

describe('AliasActivity export', () => {
  it('exports the activity and confirms it', async () => {
    const user = userEvent.setup()
    exportAliasActivityCsv.mockResolvedValue({ rowCount: 3, limited: false })
    const { toast } = renderWithToast(FLAGGED)

    await user.click(screen.getByRole('button', { name: /export csv/i }))

    await waitFor(() => expect(exportAliasActivityCsv).toHaveBeenCalledWith(ALIAS.id, 'shop'))
    expect(toast.success).toHaveBeenCalledWith('Activity exported.')
    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /export csv/i })).toBeEnabled()
  })

  it('explains when the export is capped', async () => {
    const user = userEvent.setup()
    exportAliasActivityCsv.mockResolvedValue({ rowCount: 5_000, limited: true })
    const { toast } = renderWithToast(FLAGGED)

    await user.click(screen.getByRole('button', { name: /export csv/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Export limited to the first 5,000 messages.'),
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('reports a failed export and recovers the button', async () => {
    const user = userEvent.setup()
    exportAliasActivityCsv.mockRejectedValue(new Error('network down'))
    const { toast } = renderWithToast(FLAGGED)

    await user.click(screen.getByRole('button', { name: /export csv/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('The export could not be completed. Try again.'),
    )
    expect(screen.getByRole('button', { name: /export csv/i })).toBeEnabled()
  })

  it('stays quiet when the export is aborted', async () => {
    const user = userEvent.setup()
    exportAliasActivityCsv.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    const { toast } = renderWithToast(FLAGGED)

    await user.click(screen.getByRole('button', { name: /export csv/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /export csv/i })).toBeEnabled())
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('AliasActivity feed states', () => {
  function feed(overrides: Partial<ActivityFeed<MailMessage>>): ActivityFeed<MailMessage> {
    return {
      items: [],
      status: 'ready',
      error: null,
      hasMore: false,
      isLoadingMore: false,
      loadMore: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    }
  }

  it('shows a loading skeleton while the feed is pending', () => {
    render(
      <AliasActivity alias={ALIAS} feed={feed({ status: 'loading' })} onAliasReplaced={vi.fn()} />,
    )

    expect(screen.getByLabelText('Loading messages')).toBeInTheDocument()
  })

  it('shows the feed error, falling back to generic copy', () => {
    const { rerender } = render(
      <AliasActivity
        alias={ALIAS}
        feed={feed({ status: 'error', error: 'That alias could not be found.' })}
        onAliasReplaced={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('That alias could not be found.')

    rerender(
      <AliasActivity
        alias={ALIAS}
        feed={feed({ status: 'error', error: null })}
        onAliasReplaced={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('This activity could not be loaded.')
  })

  it('shows the empty state before any mail arrives', () => {
    render(<AliasActivity alias={ALIAS} feed={feed({})} onAliasReplaced={vi.fn()} />)

    expect(screen.getByText('No mail yet')).toBeInTheDocument()
  })

  it('loads older messages and reflects the busy state', async () => {
    const user = userEvent.setup()
    const loadMore = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <AliasActivity
        alias={ALIAS}
        feed={feed({ items: [FLAGGED], hasMore: true, loadMore })}
        onAliasReplaced={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Load older messages' }))
    expect(loadMore).toHaveBeenCalledOnce()

    rerender(
      <AliasActivity
        alias={ALIAS}
        feed={feed({ items: [FLAGGED], hasMore: true, isLoadingMore: true, loadMore })}
        onAliasReplaced={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled()
  })

  it('renders without an alias and without alias-only controls', () => {
    render(
      <AliasActivity alias={null} feed={feed({ items: [FLAGGED] })} onAliasReplaced={vi.fn()} />,
    )

    expect(screen.getByRole('heading', { name: 'Alias activity' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /export csv/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Replace address' })).toBeNull()
  })

  it('falls back for missing senders, subjects, and authentication results', () => {
    renderActivity({
      ...FLAGGED,
      fromHeader: '',
      envelopeSender: '',
      subject: '   ',
      authenticationResult: '',
      flagReason: 'unknown',
    })

    expect(screen.getByText('No subject')).toBeInTheDocument()
    expect(screen.getByText('unknown authentication')).toBeInTheDocument()
    expect(screen.getByText(/Low severity/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /as expected/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Block / })).toBeNull()
    expect(screen.getByRole('button', { name: 'Replace this alias' })).toBeInTheDocument()
  })

  it('uses warning styling for authentication results it does not recognise', () => {
    renderActivity({ ...FLAGGED, authenticationResult: 'softfail' })

    expect(screen.getByText('softfail authentication')).toBeInTheDocument()
  })
})

describe('AliasActivity sender failures', () => {
  it('reports a server failure generically and clears the pending state', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/aliases/:aliasId/block-sender', () =>
        HttpResponse.json({ title: 'error' }, { status: 500 }),
      ),
    )

    renderActivity(FLAGGED)
    await user.click(screen.getByRole('button', { name: 'Block shop.example' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The sender could not be updated. Check your connection and try again.',
    )
    expect(screen.getByRole('button', { name: 'Block shop.example' })).toBeEnabled()
  })

  it('explains when the alias no longer exists', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/aliases/:aliasId/block-sender', () =>
        HttpResponse.json({ title: 'missing' }, { status: 404 }),
      ),
    )

    renderActivity(FLAGGED)
    await user.click(screen.getByRole('button', { name: 'Block shop.example' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That alias no longer exists. Refresh the list and try again.',
    )
  })

  it('asks the visitor to sign in again when the session has ended', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/aliases/:aliasId/mark-expected', () =>
        HttpResponse.json({ title: 'unauthorized' }, { status: 401 }),
      ),
    )

    renderActivity(FLAGGED)
    await user.click(screen.getByRole('button', { name: 'Mark shop.example as expected' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session has ended. Sign in again to manage aliases.',
    )
  })
})

describe('AliasActivity replacement', () => {
  const REPLACEMENT = {
    id: 'replacement-1',
    userId: ALIAS.userId,
    label: 'shop',
    randomSuffix: 'abcd',
    fullAddress: 'shop.abcd@postern.local',
    purposeMetadata: null,
    category: 'shopping',
    status: 0,
    replacedByAliasId: null,
    kvDirty: false,
    createdAt: '2026-02-02T10:00:00Z',
    deletedAt: null,
  }

  it('reserves, copies, and links a replacement address', async () => {
    const user = userEvent.setup()
    clipboard.copyText.mockResolvedValue(true)
    let linkedPath = ''
    server.use(
      http.post('*/api/aliases', () => HttpResponse.json(REPLACEMENT)),
      http.patch('*/api/aliases/:aliasId/replace/:replacementId', ({ request }) => {
        linkedPath = new URL(request.url).pathname
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { toast, onAliasReplaced } = renderWithToast(FLAGGED)

    await user.click(screen.getByRole('button', { name: 'Replace address' }))
    await user.click(await screen.findByRole('button', { name: 'Reserve new address' }))

    expect(await screen.findByText('shop.abcd@postern.local')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(clipboard.copyText).toHaveBeenCalledWith('shop.abcd@postern.local')
    expect(toast.success).toHaveBeenCalledWith('New address copied.')

    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Confirm replacement' }))

    await waitFor(() =>
      expect(linkedPath).toBe(`/api/aliases/${ALIAS.id}/replace/replacement-1`),
    )
    expect(onAliasReplaced).toHaveBeenCalledWith(
      ALIAS.id,
      expect.objectContaining({ id: 'replacement-1', status: 'Active' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/the new address is live/i)
  })

  it('offers manual copy when the clipboard is unavailable', async () => {
    const user = userEvent.setup()
    clipboard.copyText.mockResolvedValue(false)
    server.use(http.post('*/api/aliases', () => HttpResponse.json(REPLACEMENT)))

    const { toast } = renderWithToast(FLAGGED)

    await user.click(screen.getByRole('button', { name: 'Replace address' }))
    await user.click(await screen.findByRole('button', { name: 'Reserve new address' }))
    await user.click(await screen.findByRole('button', { name: 'Copy address' }))

    expect(clipboard.selectText).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      'Could not copy automatically. The address is selected for manual copy.',
    )
    expect(screen.getByText(/use your keyboard to copy it/i)).toBeInTheDocument()
  })

  it('reports a reservation failure and keeps the dialog open', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/aliases', () =>
        HttpResponse.json({ title: 'conflict' }, { status: 409 }),
      ),
    )

    renderWithToast(FLAGGED)

    await user.click(screen.getByRole('button', { name: 'Replace address' }))
    await user.click(await screen.findByRole('button', { name: 'Reserve new address' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The new address could not be created. Try again.',
    )
    expect(screen.getByRole('button', { name: 'Reserve new address' })).toBeEnabled()
  })
})

