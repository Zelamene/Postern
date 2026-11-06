import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/services/apiClient'
import { useAccountSession } from '../../src/hooks/useAccountSession'

const fetchCurrentAccount = vi.fn()

vi.mock('../../src/services/accountService', () => ({
  fetchCurrentAccount: (...args: unknown[]) => fetchCurrentAccount(...args),
}))

function Probe() {
  const { session, retry } = useAccountSession()
  return (
    <div>
      <span data-testid="status">{session.status}</span>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </div>
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetchCurrentAccount.mockReset()
  sessionStorage.clear()
})

describe('useAccountSession', () => {
  it('moves to a friendly slow state after three seconds while still pending', async () => {
    vi.useFakeTimers()
    fetchCurrentAccount.mockReturnValue(new Promise(() => undefined))

    render(<Probe />)
    expect(screen.getByTestId('status')).toHaveTextContent('checking')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })

    expect(screen.getByTestId('status')).toHaveTextContent('slow')
  })

  it('becomes unavailable after a failed fetch and retries without reloading or losing session state', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })
    sessionStorage.setItem('postern.pendingRecoveryKey', 'saved-key')
    fetchCurrentAccount
      .mockRejectedValueOnce(new ApiError(503))
      .mockResolvedValueOnce({ userId: 'u1', email: 'a@b.com', forwardingAddress: 'a@b.com' })

    render(<Probe />)
    expect(await screen.findByText('unavailable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(fetchCurrentAccount).toHaveBeenCalledTimes(2)
    expect(reload).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('postern.pendingRecoveryKey')).toBe('saved-key')
  })
})
