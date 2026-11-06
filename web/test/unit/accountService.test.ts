import { describe, expect, it, vi } from 'vitest'
import { changeForwardingAddress, deleteAccount, fetchCurrentAccount, signOut } from '../../src/services/accountService'

const requestJson = vi.fn()
const requestEmpty = vi.fn()

vi.mock('../../src/services/apiClient', () => ({
  requestJson: (...args: unknown[]) => requestJson(...args),
  requestEmpty: (...args: unknown[]) => requestEmpty(...args),
}))

describe('accountService', () => {
  it('calls the expected account endpoints', async () => {
    requestJson.mockResolvedValue({})
    requestEmpty.mockResolvedValue(undefined)

    await fetchCurrentAccount()
    await signOut()
    await changeForwardingAddress('next@example.com')
    await deleteAccount()

    expect(requestJson).toHaveBeenCalledWith('/api/auth/me', { signal: undefined })
    expect(requestEmpty).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(requestEmpty).toHaveBeenCalledWith('/api/users/change-forwarding-address', {
      method: 'POST',
      body: { newForwardingAddress: 'next@example.com' },
    })
    expect(requestEmpty).toHaveBeenCalledWith('/api/users/me', { method: 'DELETE' })
  })
})
