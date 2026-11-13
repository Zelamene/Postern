import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Reveal } from '../../src/components/common/Reveal'

type ObserverCallback = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  readonly callback: ObserverCallback
  readonly options: IntersectionObserverInit | undefined
  readonly observe = vi.fn()
  readonly unobserve = vi.fn()
  readonly disconnect = vi.fn()

  constructor(callback: ObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    MockIntersectionObserver.instances.push(this)
  }
}

const originalMatchMedia = window.matchMedia
const originalObserver = window.IntersectionObserver

function setReducedMotion(matches: boolean) {
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

function enableIntersectionObserver() {
  MockIntersectionObserver.instances = []
  window.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof window.IntersectionObserver
}

beforeEach(() => {
  setReducedMotion(false)
  enableIntersectionObserver()
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
  window.IntersectionObserver = originalObserver
  MockIntersectionObserver.instances = []
})

describe('Reveal', () => {
  it('shows its content immediately when reduced motion is requested', () => {
    setReducedMotion(true)

    render(
      <Reveal className="hero">
        <p>Reduced</p>
      </Reveal>,
    )

    const wrapper = screen.getByText('Reduced').parentElement
    expect(wrapper?.className).toContain('opacity-100')
    expect(wrapper?.className).toContain('hero')
    expect(MockIntersectionObserver.instances).toHaveLength(0)
  })

  it('shows its content immediately when IntersectionObserver is unavailable', () => {
    window.IntersectionObserver = undefined as unknown as typeof window.IntersectionObserver

    render(
      <Reveal>
        <p>Fallback</p>
      </Reveal>,
    )

    expect(screen.getByText('Fallback').parentElement?.className).toContain('opacity-100')
  })

  it('starts hidden and reveals once the element intersects the viewport', () => {
    render(
      <Reveal direction="down" delayMs={150}>
        <p>Observed</p>
      </Reveal>,
    )

    const wrapper = screen.getByText('Observed').parentElement as HTMLDivElement
    expect(wrapper.className).toContain('opacity-0')
    expect(wrapper.className).toContain('-translate-y-6')
    expect(wrapper.style.transitionDelay).toBe('150ms')

    expect(MockIntersectionObserver.instances).toHaveLength(1)
    const observer = MockIntersectionObserver.instances[0]!
    expect(observer.observe).toHaveBeenCalledWith(wrapper)
    expect(observer.options).toEqual({ threshold: 0.1, rootMargin: '0px 0px -40px 0px' })

    act(() => {
      observer.callback([{ isIntersecting: false, target: wrapper }])
    })
    expect(wrapper.className).toContain('opacity-0')

    act(() => {
      observer.callback([{ isIntersecting: true, target: wrapper }])
    })

    expect(wrapper.className).toContain('opacity-100')
    expect(observer.unobserve).toHaveBeenCalledWith(wrapper)
  })

  it('disconnects the observer when unmounted', () => {
    const { unmount } = render(
      <Reveal>
        <p>Unmount</p>
      </Reveal>,
    )

    const observer = MockIntersectionObserver.instances[0]!
    unmount()

    expect(observer.disconnect).toHaveBeenCalledOnce()
  })

  it('applies no translate class for the none direction', () => {
    render(
      <Reveal direction="none" delayMs={0}>
        <p>Static</p>
      </Reveal>,
    )

    const wrapper = screen.getByText('Static').parentElement as HTMLDivElement
    expect(wrapper.className).toContain('opacity-0')
    expect(wrapper.className).not.toContain('translate-y-6')
    expect(wrapper.className).not.toContain('-translate-y-6')
    expect(wrapper.style.transitionDelay).toBe('0ms')
  })

  it('uses the upward translate class by default', () => {
    render(
      <Reveal>
        <p>Default</p>
      </Reveal>,
    )

    expect(screen.getByText('Default').parentElement?.className).toContain('translate-y-6')
  })
})
