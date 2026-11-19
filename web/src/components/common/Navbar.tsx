import { useState } from 'react'
import { useIsSignedIn } from '../../hooks/useIsSignedIn'
import type { ThemeMode } from '../../types'
import { IconMoon, IconPosternLogo, IconSun } from './Icons'

const LINKS = [
  { href: '#problem', label: 'The Problem' },
  { href: '#solution', label: 'The Solution' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#demo', label: 'Interactive Demo' },
  { href: '#who-its-for', label: 'Who It’s For' },
] as const

interface NavbarProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

export function Navbar({ theme, onThemeChange }: Readonly<NavbarProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const isSignedIn = useIsSignedIn()
  const isDark = theme === 'dark'
  const closeMenu = () => setIsOpen(false)

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] bg-bg/95 backdrop-blur-sm">
      <div className="shell flex items-center justify-between gap-4 py-4">
        <a
          href="#main-content"
          className="group flex items-center gap-3 text-text no-underline"
          onClick={closeMenu}
        >
          <span className="flex size-9 items-center justify-center bg-surface-container-lowest text-primary">
            <IconPosternLogo size={20} />
          </span>
          <span className="font-[family-name:var(--font-display)] text-xl tracking-tight text-text">Postern</span>
        </a>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-6 md:flex"
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-text-secondary no-underline transition-colors duration-150 hover:text-text"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a href={isSignedIn ? '/app' : '/login'} className="btn btn--ghost btn--sm hidden sm:inline-flex">
            {isSignedIn ? 'Open app' : 'Sign in'}
          </a>
          <button
            type="button"
            onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
            className="flex size-9 items-center justify-center bg-transparent text-text-secondary transition-colors duration-150 hover:bg-surface-sunken hover:text-text"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>

          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            className="flex size-9 items-center justify-center bg-transparent text-text-secondary transition-colors duration-150 hover:bg-surface-sunken hover:text-text md:hidden"
            aria-expanded={isOpen}
            aria-controls="primary-menu"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              {isOpen ? (
                <path
                  d="M3.5 3.5l9 9m0-9l-9 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M2 4.5h12M2 8h12M2 11.5h12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {isOpen ? (
        <nav id="primary-menu" aria-label="Primary navigation" className="shell pb-4 md:hidden">
          <ul className="m-0 flex list-none flex-col gap-1 border-t border-hairline p-0 pt-3">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={closeMenu}
                  className="block px-2 py-2.5 text-sm font-medium text-text-secondary no-underline transition-colors duration-150 hover:bg-surface-sunken hover:text-text"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={isSignedIn ? '/app' : '/login'}
                onClick={closeMenu}
                className="block px-2 py-2.5 text-sm font-medium text-text-secondary no-underline transition-colors duration-150 hover:bg-surface-sunken hover:text-text"
              >
                {isSignedIn ? 'Open app' : 'Sign in'}
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  )
}
