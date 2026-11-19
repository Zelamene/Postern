import { useState, type AnchorHTMLAttributes } from 'react'
import { useIsSignedIn } from '../../hooks/useIsSignedIn'
import type { ThemeMode } from '../../types'
import { IconMoon, IconSun } from '../common/Icons'
import { SectionLink } from '../common/SectionLink'
import { EditorialLogo } from './EditorialLogo'

const LINKS = [
  { sectionId: 'why-postern', label: 'Why Postern' },
  { sectionId: 'activity', label: 'Sender Activity' },
  { sectionId: 'actions', label: 'How You Control It' },
] as const

interface EditorialNavbarProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
  /** Standalone pages link back to home sections instead of scrolling in place. */
  useHomeLinks?: boolean
}

interface HomeLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  sectionId: string
  useHomeLinks: boolean
}

function HomeLink({ sectionId, useHomeLinks, children, ...props }: Readonly<HomeLinkProps>) {
  if (useHomeLinks) {
    return (
      <a href={`/#${sectionId}`} {...props}>
        {children}
      </a>
    )
  }

  return (
    <SectionLink sectionId={sectionId} {...props}>
      {children}
    </SectionLink>
  )
}

export function EditorialNavbar({
  theme,
  onThemeChange,
  useHomeLinks = false,
}: Readonly<EditorialNavbarProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const isSignedIn = useIsSignedIn()
  const isDark = theme === 'dark'
  const signInHref = isSignedIn ? '/app' : '/login'
  const signInLabel = isSignedIn ? 'Open app' : 'Sign in'
  const closeMenu = () => setIsOpen(false)

  return (
    <header className="editorial-header sticky top-0 z-[var(--z-sticky)] transition-all duration-[250ms]">
      <div className="editorial-shell flex items-center justify-between gap-4 py-5">
        <SectionLink
          sectionId="main-content"
          className="flex items-center gap-3 text-primary no-underline transition-opacity duration-150 hover:opacity-85"
          onClick={closeMenu}
        >
          <EditorialLogo size={32} className="shrink-0" />
          <span className="font-display text-2xl font-normal tracking-tight lg:text-3xl">
            Postern
          </span>
        </SectionLink>

        <nav aria-label="Primary navigation" className="hidden items-center gap-6 lg:flex lg:gap-8">
          {LINKS.map((link) => (
            <HomeLink
              key={link.sectionId}
              sectionId={link.sectionId}
              useHomeLinks={useHomeLinks}
              className="text-[13px] font-semibold leading-[18px] tracking-[0.02em] text-on-surface no-underline transition-colors duration-150 hover:text-primary"
            >
              {link.label}
            </HomeLink>
          ))}

          <div className="flex items-center gap-4 border-l border-outline-variant/30 pl-2">
            <button
              type="button"
              onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex size-9 items-center justify-center bg-transparent text-on-surface transition-colors duration-150 hover:bg-surface-container-low hover:text-primary"
            >
              {isDark ? <IconSun size={20} /> : <IconMoon size={20} />}
            </button>

            <a
              href={signInHref}
              className="px-2 py-1.5 text-[13px] font-semibold leading-[18px] tracking-[0.02em] text-primary no-underline transition-opacity duration-150 hover:opacity-75"
            >
              {signInLabel}
            </a>

            <HomeLink
              sectionId="request-invite"
              useHomeLinks={useHomeLinks}
              className="editorial-button editorial-button--primary !min-h-0 !px-5 !py-2.5 !text-[13px]"
            >
              Request an invite
            </HomeLink>
          </div>
        </nav>

        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex size-9 items-center justify-center bg-transparent text-on-surface transition-colors duration-150 hover:bg-surface-container-low hover:text-primary"
          >
            {isDark ? <IconSun size={20} /> : <IconMoon size={20} />}
          </button>
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            className="flex size-9 items-center justify-center bg-transparent text-on-surface transition-colors duration-150 hover:bg-surface-container-low hover:text-primary"
            aria-expanded={isOpen}
            aria-controls="editorial-primary-menu"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              {isOpen ? (
                <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" />
              ) : (
                <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {isOpen ? (
        <nav
          id="editorial-primary-menu"
          aria-label="Primary navigation"
          className="editorial-shell pb-5 lg:hidden"
        >
          <div className="flex flex-col border-t border-outline-variant/20 pt-3">
            {LINKS.map((link) => (
              <HomeLink
                key={link.sectionId}
                sectionId={link.sectionId}
                useHomeLinks={useHomeLinks}
                onClick={closeMenu}
                className="py-3 text-[13px] font-semibold text-on-surface no-underline hover:text-primary"
              >
                {link.label}
              </HomeLink>
            ))}
            <a
              href={signInHref}
              onClick={closeMenu}
              className="py-3 text-[13px] font-semibold text-on-surface no-underline hover:text-primary"
            >
              {signInLabel}
            </a>
            <HomeLink
              sectionId="request-invite"
              useHomeLinks={useHomeLinks}
              onClick={closeMenu}
              className="editorial-button editorial-button--primary mt-2 w-full"
            >
              Request an invite
            </HomeLink>
          </div>
        </nav>
      ) : null}
    </header>
  )
}
