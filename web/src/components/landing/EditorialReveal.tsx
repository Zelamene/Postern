import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface EditorialRevealProps {
  children: ReactNode
  className?: string
  delayMs?: number
}

export function EditorialReveal({
  children,
  className = '',
  delayMs = 0,
}: Readonly<EditorialRevealProps>) {
  const elementRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      return
    }

    const element = elementRef.current
    if (!element) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.05 },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={elementRef}
      className={`editorial-reveal ${isVisible ? 'is-visible' : ''} ${className}`.trim()}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  )
}
