import { afterEach, describe, expect, it, vi } from 'vitest'
import { stashRecoveryKey, takeRecoveryKey } from '../../src/services/pendingRecoveryKey'

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('pendingRecoveryKey', () => {
  it('stores and consumes the recovery key once', () => {
    stashRecoveryKey('secret-key')
    expect(takeRecoveryKey()).toBe('secret-key')
    expect(takeRecoveryKey()).toBeNull()
  })

  it('handles storage failures safely', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => stashRecoveryKey('secret-key')).not.toThrow()
    expect(takeRecoveryKey()).toBeNull()
  })
})
