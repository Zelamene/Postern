import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '../../src/services/clipboard'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  } else {
    Reflect.deleteProperty(navigator, 'clipboard')
  }
})

describe('copyText', () => {
  it('returns true when the clipboard write succeeds', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })

    await expect(copyText('hello')).resolves.toBe(true)
  })

  it('returns false when the clipboard API is unavailable', async () => {
    Reflect.deleteProperty(navigator, 'clipboard')
    await expect(copyText('hello')).resolves.toBe(false)
  })

  it('returns false when the clipboard write is rejected', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })

    await expect(copyText('hello')).resolves.toBe(false)
  })
})
