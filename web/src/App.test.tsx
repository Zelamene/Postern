import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Postern app shell', () => {
  it('renders the product heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible()
  })

  it('keeps the invite request beside the how-it-works link', () => {
    render(<App />)
    const requestInvite = screen.getByRole('button', { name: 'Request an invite' })
    const howItWorks = screen.getByRole('link', { name: 'See how it works' })

    expect(requestInvite.parentElement).toBe(howItWorks.parentElement)
  })
})
