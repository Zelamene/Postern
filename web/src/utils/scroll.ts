export function scrollToSection(sectionId: string): void {
  if (typeof document === 'undefined') {
    return
  }

  const target = document.getElementById(sectionId)
  if (!target) {
    return
  }

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  target.focus({ preventScroll: true })
}
