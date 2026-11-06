import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ToastProvider } from '../../src/components/common/ToastProvider'
import { useToast } from '../../src/components/common/toast'

function Probe() {
  const toast = useToast()
  return (
    <div>
      <button type="button" onClick={() => toast.success('Saved.')}>
        Success
      </button>
      <button type="button" onClick={() => toast.error('Failed.')}>
        Error
      </button>
    </div>
  )
}

describe('ToastProvider', () => {
  it('shows success and error toasts in the shared viewport', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Success' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')

    await user.click(screen.getByRole('button', { name: 'Error' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed.')
  })
})
