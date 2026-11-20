import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorialReveal } from '../../src/components/landing/EditorialReveal'

type ObserverCallback = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  readonly callback: ObserverCallback
  readonly options: IntersectionObserverInit | undefined
  readonly observe = vi.fn()
  readonly disconnect = vi.fn()

  constructor(callback: ObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    MockIntersectionObserver.instances.push(this)
  }
}

const originalObserver = window.IntersectionObserver

beforeEach(() => {
  MockIntersectionObserver.instances = []
  window.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof window.IntersectionObserver
})

afterEach(() => {
  window.IntersectionObserver = originalObserver
  MockIntersectionObserver.instances = []
})

describe('EditorialReveal', () => {
  it('starts visible when IntersectionObserver is unavailable', () => {
    window.IntersectionObserver = undefined as unknown as typeof window.IntersectionObserver

    render(
      <EditorialReveal>
        <p>Fallback</p>
      </EditorialReveal>,
    )

    expect(screen.getByText('Fallback').parentElement?.className).toContain('is-visible')
    expect(MockIntersectionObserver.instances).toHaveLength(0)
  })

  it('reveals on intersection, applies the delay, and disconnects', () => {
    render(
      <EditorialReveal className="feature" delayMs={120}>
        <p>Observed</p>
      </EditorialReveal>,
    )

    const wrapper = screen.getByText('Observed').parentElement as HTMLDivElement
    expect(wrapper.className).toContain('editorial-reveal')
    expect(wrapper.className).not.toContain('is-visible')
    expect(wrapper.className).toContain('feature')
    expect(wrapper.style.transitionDelay).toBe('120ms')

    const observer = MockIntersectionObserver.instances[0]!
    expect(observer.options).toEqual({ threshold: 0.05 })
    expect(observer.observe).toHaveBeenCalledWith(wrapper)

    act(() => {
      observer.callback([{ isIntersecting: false, target: wrapper }])
    })
    expect(wrapper.className).not.toContain('is-visible')

    act(() => {
      observer.callback([{ isIntersecting: true, target: wrapper }])
    })
    expect(wrapper.className).toContain('is-visible')
    expect(observer.disconnect).toHaveBeenCalledOnce()
  })

  it('omits the delay when none is supplied and disconnects on unmount', () => {
    const { unmount } = render(
      <EditorialReveal>
        <p>Plain</p>
      </EditorialReveal>,
    )

    const wrapper = screen.getByText('Plain').parentElement as HTMLDivElement
    expect(wrapper.style.transitionDelay).toBe('')

    const observer = MockIntersectionObserver.instances[0]!
    unmount()

    expect(observer.disconnect).toHaveBeenCalledOnce()
  })
})
