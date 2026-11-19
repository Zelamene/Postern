import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Hero } from '../../src/components/landing/Hero'

describe('Hero', () => {
  it('renders the headline, invite action, trust points, and sample route', () => {
    render(<Hero />)

    expect(
      screen.getByRole('heading', { level: 1, name: /Your inbox,\s*on your terms\./ }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute(
      'href',
      '#how-it-works',
    )
    expect(screen.getByRole('button', { name: 'Request an invite' })).toBeVisible()

    for (const trust of ['No message bodies stored', 'No central inbox', 'One-click block']) {
      expect(screen.getByText(trust)).toBeVisible()
    }

    expect(screen.getByText('offers@shopify.com')).toBeVisible()
    expect(screen.getByText('to netflix.k7q2@3xyz.uk')).toBeVisible()
    expect(screen.getByText('netflix.k7q2@3xyz.uk')).toBeVisible()
    expect(screen.getByText('Delivered to your inbox')).toBeVisible()
  })
})
