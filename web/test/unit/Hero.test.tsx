import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Hero } from '../../src/components/landing/Hero'

describe('Hero', () => {
  it('renders the headline, invite action, and sample route', () => {
    render(<Hero />)

    expect(
      screen.getByRole('heading', { level: 1, name: /Your inbox,\s*on your terms\./ }),
    ).toBeVisible()
    expect(screen.getByText(/Postern gives every service its own address/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute(
      'href',
      '#why-postern',
    )
    expect(screen.getByRole('button', { name: 'Request an invite' })).toBeVisible()

    expect(screen.getByText('netflix.k7q2@xyz.uk')).toBeVisible()
    expect(screen.getByText('spotify.f9m3@xyz.uk')).toBeVisible()
    expect(screen.getByText('From Netflix (via alias)')).toBeVisible()
    expect(screen.getByText('Your real address is hidden')).toBeVisible()
  })
})
