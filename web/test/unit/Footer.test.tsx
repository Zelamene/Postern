import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from '../../src/components/common/Footer'

describe('Footer', () => {
  it('links to the legal pages, licence notices, and brand guide', () => {
    render(<Footer />)

    const nav = screen.getByRole('navigation', { name: 'Footer navigation' })

    expect(nav.querySelector('a[href="/privacy"]')).toHaveTextContent('Privacy')
    expect(nav.querySelector('a[href="/terms"]')).toHaveTextContent('Terms')
    expect(nav.querySelector('a[href="/cookies"]')).toHaveTextContent('Cookies')
    expect(nav.querySelector('a[href="/THIRD-PARTY-NOTICES.txt"]')).toHaveTextContent('Licences')
    expect(nav.querySelector('a[href="/brand/"]')).toHaveTextContent('Brand Style Guide')
  })

  it('does not expose dead controls', () => {
    render(<Footer />)

    expect(screen.queryByText('Help Centre')).not.toBeInTheDocument()
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
  })
})
