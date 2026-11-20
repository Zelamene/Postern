import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrollToSection } from '../../src/utils/scroll'

const originalMatchMedia = window.matchMedia

function setReducedMotion(matches: boolean | 'missing') {
  if (matches === 'missing') {
    window.matchMedia = undefined as unknown as typeof window.matchMedia
    return
  }

  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function addSection(id: string, withScrollIntoView = true) {
  const target = document.createElement('section')
  target.id = id
  target.scrollIntoView = withScrollIntoView
    ? (vi.fn() as typeof target.scrollIntoView)
    : (undefined as unknown as typeof target.scrollIntoView)
  vi.spyOn(target, 'focus').mockImplementation(() => undefined)
  document.body.append(target)
  return target
}

afterEach(() => {
  window.matchMedia = originalMatchMedia
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('scrollToSection', () => {
  it('returns when there is no document', () => {
    vi.stubGlobal('document', undefined)

    expect(() => scrollToSection('missing')).not.toThrow()

    vi.unstubAllGlobals()
  })

  it('returns when the section does not exist', () => {
    expect(() => scrollToSection('does-not-exist')).not.toThrow()
  })

  it('scrolls smoothly and focuses a found section by default', () => {
    setReducedMotion(false)
    const target = addSection('top')

    scrollToSection('top')

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('uses instant scrolling when reduced motion is requested', () => {
    setReducedMotion(true)
    const target = addSection('reduced')

    scrollToSection('reduced')

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })

  it('still focuses when matchMedia and scrollIntoView are unavailable', () => {
    setReducedMotion('missing')
    const target = addSection('legacy', false)

    scrollToSection('legacy')

    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true })
  })
})
