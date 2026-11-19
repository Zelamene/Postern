import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { scrollToSection } from '../../utils/scroll'

interface SectionLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  sectionId: string
  children: ReactNode
}

export function SectionLink({
  sectionId,
  onClick,
  children,
  ...props
}: Readonly<SectionLinkProps>) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }

    event.preventDefault()
    scrollToSection(sectionId)
  }

  return (
    <a href="/" onClick={handleClick} {...props}>
      {children}
    </a>
  )
}
