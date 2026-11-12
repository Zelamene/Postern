import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSettings } from '../../src/components/app/AccountSettings'
import { ApiError } from '../../src/services/apiClient'

const changeForwardingAddress = vi.fn()
const deleteAccount = vi.fn()

vi.mock('../../src/services/accountService', () => ({
  changeForwardingAddress: (...args: unknown[]) => changeForwardingAddress(...args),
  deleteAccount: (...args: unknown[]) => deleteAccount(...args),
}))

beforeEach(() => {
  changeForwardingAddress.mockReset()
  deleteAccount.mockReset()
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function close(this: HTMLDialogElement) {
      this.removeAttribute('open')
    },
  })
})

const account = { userId: 'u1', email: 'user@example.com', forwardingAddress: 'old@example.com' }

describe('AccountSettings', () => {
  it('updates the forwarding address', async () => {
    const user = userEvent.setup()
    const onForwardingAddressChange = vi.fn()
    changeForwardingAddress.mockResolvedValue(undefined)

    render(
      <AccountSettings
        account={account}
        onForwardingAddressChange={onForwardingAddressChange}
        onAccountDeleted={vi.fn()}
      />,
    )

    const input = screen.getByLabelText(/destination address/i)
    await user.clear(input)
    await user.type(input, 'new@example.com')
    await user.click(screen.getByRole('button', { name: /update destination/i }))

    await waitFor(() => expect(changeForwardingAddress).toHaveBeenCalledWith('new@example.com'))
    expect(onForwardingAddressChange).toHaveBeenCalledWith('new@example.com')
    expect(await screen.findByText(/forwarding address updated/i)).toBeInTheDocument()
  })

  it('explains that the new destination needs verification first', async () => {
    const user = userEvent.setup()
    const onForwardingAddressChange = vi.fn()
    changeForwardingAddress.mockRejectedValue(new ApiError(409))

    render(
      <AccountSettings
        account={account}
        onForwardingAddressChange={onForwardingAddressChange}
        onAccountDeleted={vi.fn()}
      />,
    )

    const input = screen.getByLabelText(/destination address/i)
    await user.clear(input)
    await user.type(input, 'new@example.com')
    await user.click(screen.getByRole('button', { name: /update destination/i }))

    expect(
      await screen.findByText(/confirm the new destination from the verification email/i),
    ).toBeInTheDocument()
    expect(onForwardingAddressChange).not.toHaveBeenCalled()
  })

  it('requires typed confirmation before deleting the account', async () => {
    const user = userEvent.setup()
    const onAccountDeleted = vi.fn()
    deleteAccount.mockResolvedValue(undefined)

    render(
      <AccountSettings
        account={account}
        onForwardingAddressChange={vi.fn()}
        onAccountDeleted={onAccountDeleted}
      />,
    )

    await user.click(screen.getByRole('button', { name: /delete my account/i }))
    const confirm = screen.getByRole('button', { name: 'Delete account' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText(new RegExp(account.email)), account.email)
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    await waitFor(() => expect(deleteAccount).toHaveBeenCalled())
    expect(onAccountDeleted).toHaveBeenCalled()
  })
})
