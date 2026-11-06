import { afterEach, describe, expect, it, vi } from 'vitest'
import { navigate, readAppRoute } from '../../src/services/navigation'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('navigation', () => {
  it('parses app routes', () => {
    expect(readAppRoute('/app')).toEqual({ view: 'aliases', aliasId: null })
    expect(readAppRoute('/app/blocked')).toEqual({ view: 'blocked', aliasId: null })
    expect(readAppRoute('/app/account')).toEqual({ view: 'account', aliasId: null })
    expect(readAppRoute('/app/aliases/abc%201')).toEqual({ view: 'messages', aliasId: 'abc 1' })
  })

  it('navigates with push and replace history', () => {
    const push = vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined)
    const replace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined)
    const dispatch = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)

    navigate('/app')
    navigate('/login', { replace: true })

    expect(push).toHaveBeenCalled()
    expect(replace).toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(2)
  })
})
