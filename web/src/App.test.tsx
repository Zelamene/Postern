import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('Postern app shell', () => {
  it('renders the product heading and checks the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Your inbox, on your terms.' })).toBeVisible()
    expect(await screen.findByRole('status')).toHaveTextContent('API is available')

    vi.unstubAllGlobals()
  })
})
