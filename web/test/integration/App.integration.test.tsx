import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'

describe('Postern app integration', () => {
  it('renders the main navigation landmark', () => {
    render(<App />)
    expect(screen.getByRole('main')).toBeDefined()
  })
})
