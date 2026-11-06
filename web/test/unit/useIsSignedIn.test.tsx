import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useIsSignedIn } from '../../src/hooks/useIsSignedIn'

const fetchCurrentAccount = vi.fn()

vi.mock('../../src/services/accountService', () => ({
  fetchCurrentAccount: (...args: unknown[]) => fetchCurrentAccount(...args),
}))

function Probe() {
  const signedIn = useIsSignedIn()
  return <span>{signedIn === null ? 'loading' : signedIn ? 'yes' : 'no'}</span>
}

describe('useIsSignedIn', () => {
  it('reports a signed-in account', async () => {
    fetchCurrentAccount.mockResolvedValueOnce({ userId: 'u1' })
    render(<Probe />)
    await waitFor(() => expect(screen.getByText('yes')).toBeInTheDocument())
  })

  it('treats failures as anonymous', async () => {
    fetchCurrentAccount.mockRejectedValueOnce(new Error('nope'))
    render(<Probe />)
    await waitFor(() => expect(screen.getByText('no')).toBeInTheDocument())
  })
})
