import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppLink } from '../../src/components/app/AppLink'

const navigate = vi.fn()
vi.mock('../../src/services/navigation', () => ({
  navigate: (...args: unknown[]) => navigate(...args),
}))

describe('AppLink', () => {
  it('navigates on a plain click', async () => {
    const user = userEvent.setup()
    render(<AppLink to="/app">Open</AppLink>)

    await user.click(screen.getByRole('link', { name: 'Open' }))

    expect(navigate).toHaveBeenCalledWith('/app')
  })

  it('allows modified clicks to use browser behavior', async () => {
    const user = userEvent.setup()
    render(<AppLink to="/app">Open</AppLink>)

    await user.keyboard('{Control>}')
    await user.click(screen.getByRole('link', { name: 'Open' }))
    await user.keyboard('{/Control}')

    expect(navigate).not.toHaveBeenCalled()
  })
})
