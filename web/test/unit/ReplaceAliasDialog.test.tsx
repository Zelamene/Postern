import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReplaceAliasDialog } from '../../src/components/app/ReplaceAliasDialog'
import type { Alias } from '../../src/types'
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

const RESERVED: Alias = {
  ...ALIAS,
  id: '5a2b8d44-6c1e-4f2a-8e3b-9c7d5a1f0b22',
  randomSuffix: 'ab12',
  fullAddress: 'shop.ab12@postern.local',
  createdAt: '2026-02-02T10:00:00Z',
}

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
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

function stubClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

function renderDialog() {
  const onClose = vi.fn()
  const onReplaced = vi.fn()

  render(
    <ReplaceAliasDialog
      open
      alias={ALIAS}
      onClose={onClose}
      onReplaced={onReplaced}
    />,
  )

  return { onClose, onReplaced }
}

beforeEach(() => {
  stubClipboard()
  server.use(
    http.post('*/api/aliases', () => HttpResponse.json(RESERVED, { status: 201 })),
    // Absorbs the cleanup delete an unconfirmed reservation triggers on unmount.
    http.delete('*/api/aliases/:aliasId', () => new HttpResponse(null, { status: 204 })),
  )
})

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  } else {
    Reflect.deleteProperty(navigator, 'clipboard')
  }
})

describe('ReplaceAliasDialog', () => {
  it('shows a replacement checklist and only allows confirming after required steps', async () => {
    const user = userEvent.setup()
    const links: string[] = []
    const { onReplaced } = renderDialog()
    server.use(
      http.patch('*/api/aliases/:aliasId/replace/:replacementId', ({ request }) => {
        links.push(new URL(request.url).pathname)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    expect(
      screen.getByRole('dialog', { name: 'Kill the leak, keep the service' }),
    ).toBeVisible()
    expect(screen.getByRole('list', { name: 'Replacement checklist' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Reserve new address' }))
    expect(await screen.findByText('shop.ab12@postern.local')).toBeVisible()

    const confirm = screen.getByRole('button', { name: 'Confirm replacement' })
    const serviceUpdated = screen.getByRole('checkbox', {
      name: /updated the service and saved the new address/i,
    })
    expect(confirm).toBeDisabled()
    expect(serviceUpdated).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(confirm).toBeDisabled()

    await user.click(serviceUpdated)
    expect(confirm).toBeEnabled()

    await user.click(confirm)

    await waitFor(() =>
      expect(onReplaced).toHaveBeenCalledWith(expect.objectContaining({ id: RESERVED.id })),
    )
    expect(links[0]).toContain(`/api/aliases/${ALIAS.id}/replace/${RESERVED.id}`)
  })

  it('keeps the dialog open when the swap fails', async () => {
    const user = userEvent.setup()
    const { onReplaced } = renderDialog()
    server.use(
      http.patch('*/api/aliases/:aliasId/replace/:replacementId', () =>
        new HttpResponse(null, { status: 404 }),
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Reserve new address' }))
    await user.click(await screen.findByRole('button', { name: 'Copy address' }))
    await user.click(
      screen.getByRole('checkbox', { name: /updated the service and saved the new address/i }),
    )
    await user.click(screen.getByRole('button', { name: 'Confirm replacement' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That alias no longer exists')
    expect(onReplaced).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm replacement' })).toBeEnabled()
  })

  it('discards the reservation when cancelled', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDialog()
    const deleted: string[] = []
    server.use(
      http.delete('*/api/aliases/:aliasId', ({ request }) => {
        deleted.push(new URL(request.url).pathname)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Reserve new address' }))
    await screen.findByText('shop.ab12@postern.local')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
    await waitFor(() => expect(deleted).toContain(`/api/aliases/${RESERVED.id}`))
  })
})
