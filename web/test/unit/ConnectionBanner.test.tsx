import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConnectionBanner } from '../../src/components/common/ConnectionBanner'

const originalOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')

afterEach(() => {
  if (originalOnLine) {
    Object.defineProperty(Navigator.prototype, 'onLine', originalOnLine)
  }
})

describe('ConnectionBanner', () => {
  it('shows a warning when the browser is offline', () => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => false,
    })

    render(<ConnectionBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(/you’re offline/i)
  })

  it('renders nothing when the browser is online', () => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => true,
    })

    render(<ConnectionBanner />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
