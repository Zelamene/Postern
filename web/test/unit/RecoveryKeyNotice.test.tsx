import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecoveryKeyNotice } from '../../src/components/common/RecoveryKeyNotice'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  } else {
    Reflect.deleteProperty(navigator, 'clipboard')
  }
})

describe('RecoveryKeyNotice', () => {
  it('explains recovery use and confirms when the key is copied', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<RecoveryKeyNotice recoveryKey="postern_recovery_key" />)

    expect(screen.getByText(/reset your password if you forget it/i)).toBeVisible()
    expect(screen.getByText(/if you lose this key and forget your password/i)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Copy recovery key' }))

    expect(writeText).toHaveBeenCalledWith('postern_recovery_key')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Recovery key copied to clipboard.',
    )
  })

  it('explains when clipboard copying fails', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard unavailable')) },
    })

    render(<RecoveryKeyNotice recoveryKey="postern_recovery_key" />)
    await user.click(screen.getByRole('button', { name: 'Copy recovery key' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not copy the key. Select and copy it manually.',
    )
  })
})
