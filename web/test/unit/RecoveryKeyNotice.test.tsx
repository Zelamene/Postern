import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecoveryKeyNotice } from '../../src/components/common/RecoveryKeyNotice'
import { ToastProvider } from '../../src/components/common/ToastProvider'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  } else {
    Reflect.deleteProperty(navigator, 'clipboard')
  }
})

function renderNotice() {
  return render(
    <ToastProvider>
      <RecoveryKeyNotice recoveryKey="postern_recovery_key" />
    </ToastProvider>,
  )
}

describe('RecoveryKeyNotice', () => {
  it('explains recovery use and confirms when the key is copied', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    renderNotice()

    expect(screen.getByText(/only way to recover your account/i)).toBeVisible()
    expect(screen.getByText(/you can create a new key later/i)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Copy recovery key' }))

    expect(writeText).toHaveBeenCalledWith('postern_recovery_key')
    expect(await screen.findByText('Recovery key copied to clipboard.')).toBeVisible()
  })

  it('offers manual copy guidance when clipboard copying fails', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard unavailable')) },
    })

    renderNotice()
    await user.click(screen.getByRole('button', { name: 'Copy recovery key' }))

    expect(
      await screen.findByText(/could not copy automatically/i),
    ).toBeVisible()
  })
})
