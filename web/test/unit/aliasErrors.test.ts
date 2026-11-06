import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/services/apiClient'
import { describeAliasError } from '../../src/services/aliasErrors'

describe('describeAliasError', () => {
  it('maps session and missing alias errors', () => {
    expect(describeAliasError(new ApiError(401), 'fallback')).toMatch(/session has ended/i)
    expect(describeAliasError(new ApiError(404), 'fallback')).toMatch(/no longer exists/i)
  })

  it('uses the fallback for other errors', () => {
    expect(describeAliasError(new ApiError(500), 'fallback')).toBe('fallback')
    expect(describeAliasError(new Error('x'), 'fallback')).toBe('fallback')
  })
})
