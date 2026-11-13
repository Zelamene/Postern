import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InteractiveDemo } from '../../src/components/landing/InteractiveDemo'
import { ToastContext } from '../../src/components/common/toast'

const copyText = vi.fn()

vi.mock('../../src/services/clipboard', () => ({
  copyText: (...args: unknown[]) => copyText(...args),
  selectText: vi.fn(),
}))

function renderDemo() {
  const toast = { success: vi.fn(), error: vi.fn() }
  render(
    <ToastContext.Provider value={toast}>
      <InteractiveDemo />
    </ToastContext.Provider>,
  )
  return { toast }
}

function addressInput(): HTMLInputElement {
  return screen.getByLabelText(/your single-purpose address/i) as HTMLInputElement
}

beforeEach(() => {
  copyText.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('InteractiveDemo', () => {
  it('renders the default alias and updates it from the service name', async () => {
    const user = userEvent.setup()
    renderDemo()

    expect(addressInput().value).toBe('netflix.k7q2@3xyz.uk')

    const label = screen.getByLabelText(/service name/i)
    await user.clear(label)
    await user.type(label, ' Net!Flix 99 ')

    expect(addressInput().value).toBe('netflix99.k7q2@3xyz.uk')
  })

  it('falls back to "service" when the label has no usable characters', async () => {
    const user = userEvent.setup()
    renderDemo()

    const label = screen.getByLabelText(/service name/i)
    await user.clear(label)
    await user.type(label, '!!!')

    expect(addressInput().value).toBe('service.k7q2@3xyz.uk')
  })

  it('changes category without changing the alias', async () => {
    const user = userEvent.setup()
    renderDemo()

    await user.selectOptions(screen.getByLabelText(/category/i), 'Financial')

    expect((screen.getByLabelText(/category/i) as HTMLSelectElement).value).toBe('Financial')
    expect(addressInput().value).toBe('netflix.k7q2@3xyz.uk')
  })

  it('generates a fresh suffix and clears the previous simulation', async () => {
    const user = userEvent.setup()
    vi.spyOn(Math, 'random').mockReturnValue(0.123456)
    renderDemo()

    await user.click(screen.getByRole('button', { name: /simulate incoming email/i }))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    })
    expect(screen.getByText(/email routed successfully/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /new suffix/i }))

    const value = addressInput().value
    expect(value).not.toBe('netflix.k7q2@3xyz.uk')
    expect(value).toMatch(/^netflix\.[a-z0-9]{4}@3xyz\.uk$/)
    expect(screen.queryByText(/email routed successfully/i)).not.toBeInTheDocument()
    expect(screen.getByText(/no mail received yet/i)).toBeInTheDocument()
  })

  it('copies the address, confirms it, and resets the label after a moment', async () => {
    vi.useFakeTimers()
    copyText.mockResolvedValue(true)
    const { toast } = renderDemo()

    fireEvent.click(screen.getByRole('button', { name: /copy address/i }))
    await act(async () => undefined)

    expect(copyText).toHaveBeenCalledWith('netflix.k7q2@3xyz.uk')
    expect(toast.success).toHaveBeenCalledWith('Address copied to clipboard.')
    expect(screen.getByRole('button', { name: /copied to clipboard/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/address copied to clipboard/i)

    act(() => {
      vi.advanceTimersByTime(2400)
    })

    expect(screen.getByRole('button', { name: /copy address/i })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('explains when the clipboard is unavailable', async () => {
    copyText.mockResolvedValue(false)
    const user = userEvent.setup()
    const { toast } = renderDemo()

    await user.click(screen.getByRole('button', { name: /copy address/i }))

    expect(toast.error).toHaveBeenCalledWith(
      'Could not copy automatically. Copy the address manually.',
    )
    expect(toast.success).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('simulates an inbound email after the routing delay', async () => {
    vi.useFakeTimers()
    renderDemo()

    expect(screen.getByText(/no mail received yet/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /simulate incoming email/i }))

    const routing = screen.getByRole('button', { name: /routing via edge/i })
    expect(routing).toBeDisabled()

    act(() => {
      vi.advanceTimersByTime(450)
    })

    expect(screen.getByText(/simulated: email routed successfully/i)).toBeInTheDocument()
    expect(screen.getAllByText('netflix.k7q2@3xyz.uk').length).toBeGreaterThan(0)
    expect(screen.getByText('netflix.com')).toBeInTheDocument()
    expect(screen.getByText(/your receipt for netflix subscription/i)).toBeInTheDocument()
    expect(screen.queryByText(/no mail received yet/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /simulate incoming email/i })).toBeEnabled()
  })

  it('walks through every leak response and resets the scenario', async () => {
    const user = userEvent.setup()
    renderDemo()

    expect(screen.getByText(/choose an action above/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset scenario/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /mark as expected/i }))
    expect(screen.getByText('Sender marked as expected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /replace alias/i }))
    expect(screen.getByText(/new clean alias created for netflix/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /block sender domain/i }))
    expect(screen.getByText('Sender domain permanently blocked')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /reset scenario/i }))
    expect(screen.getByText(/choose an action above/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset scenario/i })).not.toBeInTheDocument()
  })

  it('sanitises the alias shown in the leak explanation', async () => {
    const user = userEvent.setup()
    renderDemo()

    const label = screen.getByLabelText(/service name/i)
    await user.clear(label)
    await user.type(label, 'Acme Mail!')

    expect(screen.getByText('acmemail.k7q2@3xyz.uk')).toBeInTheDocument()
    expect(screen.getByText(/acmemail\.com/i)).toBeInTheDocument()
  })
})
