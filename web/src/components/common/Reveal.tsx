import { useEffect, useRef, useState, type ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  className?: string
  delayMs?: number
  direction?: 'up' | 'down' | 'none'
}

export function Reveal({
  children,
  className = '',
  delayMs = 0,
  direction = 'up',
}: Readonly<RevealProps>) {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === 'undefined') {
      return true
    }
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return true
    }
    if (typeof window.IntersectionObserver !== 'function') {
      return true
    }
    return false
  })

  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || isVisible) {
      return
    }

    if (typeof window.IntersectionObserver !== 'function') {
      return
    }

    const node = ref.current
    if (!node) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(entry.target)
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px',
      },
    )

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [isVisible])

  const transformStyle = direction === 'none'
    ? ''
    : direction === 'down'
      ? '-translate-y-6'
      : 'translate-y-6'

  return (
    <div
      ref={ref}
      style={{
        transitionDelay: `${delayMs}ms`,
      }}
      className={`transition-all duration-700 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : `opacity-0 ${transformStyle}`
      } ${className}`}
    >
      {children}
    </div>
  )
}
