import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Postern app integration', () => {
  it('shows the API status returned by the mocked health endpoint', async () => {
    render(<App />)

    expect(await screen.findByRole('status')).toHaveTextContent('API is available')
  })
})
