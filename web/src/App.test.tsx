import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Postern app shell', () => {
  it('renders the product heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
