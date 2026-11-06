import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ConfirmationDialog } from '../../src/components/common/ConfirmationDialog'

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

describe('ConfirmationDialog', () => {
  it('requires an exact typed match before confirming', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <ConfirmationDialog
        open
        title="Delete alias?"
        description="This retires the address."
        confirmLabel="Delete alias"
        cancelLabel="Keep alias"
        confirmMatch={{
          label: 'Type shop.1a2b@postern.local to confirm',
          expected: 'shop.1a2b@postern.local',
        }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    const confirm = screen.getByRole('button', { name: 'Delete alias' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText(/type shop\.1a2b@postern\.local to confirm/i), 'shop')
    expect(confirm).toBeDisabled()

    await user.clear(screen.getByLabelText(/type shop\.1a2b@postern\.local to confirm/i))
    await user.type(
      screen.getByLabelText(/type shop\.1a2b@postern\.local to confirm/i),
      'shop.1a2b@postern.local',
    )
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls cancel without confirming when cancelled', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    render(
      <ConfirmationDialog
        open
        title="Delete alias?"
        description="This retires the address."
        confirmLabel="Delete alias"
        cancelLabel="Keep alias"
        confirmMatch={{ label: 'Type DELETE to confirm', expected: 'DELETE' }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Keep alias' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
