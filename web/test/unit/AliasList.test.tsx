import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { AliasList } from '../../src/components/app/AliasList'
import type { Alias } from '../../src/services/aliasService'

beforeAll(() => {
  if (typeof HTMLDialogElement !== 'undefined') {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open')
    }
  }
})

const ALIAS: Alias = {
  id: 'a1',
  userId: 'u1',
  label: 'shop',
  randomSuffix: '1a2b',
  fullAddress: 'shop.1a2b@postern.local',
  purposeMetadata: null,
  category: 'shopping',
  status: 'Active',
  replacedByAliasId: null,
  kvDirty: false,
  createdAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
}

function renderList(overrides: Partial<Parameters<typeof AliasList>[0]> = {}) {
  const props = {
    aliases: [ALIAS],
    status: 'ready' as const,
    loadError: null,
    actionError: null,
    pendingAliasId: null,
    onReload: vi.fn(),
    onDisable: vi.fn().mockResolvedValue(true),
    onDelete: vi.fn().mockResolvedValue(true),
    onDismissError: vi.fn(),
    ...overrides,
  }
  render(<AliasList {...props} />)
  return props
}

describe('AliasList', () => {
  it('requires a typed match before deleting an alias', async () => {
    const user = userEvent.setup()
    const { onDelete } = renderList()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const confirm = screen.getByRole('button', { name: 'Delete alias' })
    expect(confirm).toBeDisabled()
    expect(screen.getByText(/stops forwarding and the address is retired permanently/i)).toBeVisible()

    await user.type(
      screen.getByLabelText(/type shop\.1a2b@postern\.local to confirm/i),
      'shop.1a2b@postern.local',
    )
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    expect(onDelete).toHaveBeenCalledWith('a1')
  })

  it('cancels delete without calling the API', async () => {
    const user = userEvent.setup()
    const { onDelete } = renderList()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Keep alias' }))

    expect(onDelete).not.toHaveBeenCalled()
  })
})
