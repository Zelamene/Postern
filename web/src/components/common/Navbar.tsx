import { useState } from 'react'
import { IconMoon, IconPosternLogo, IconSun } from './Icons'

export type ThemeMode = 'light' | 'dark'

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
  const isDark = theme === 'dark'
  const closeMenu = () => setIsOpen(false)

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-hairline/70 bg-bg/85 backdrop-blur-md">
      <div className="shell flex items-center justify-between gap-4 py-3">
        <a
          href="#main-content"
          className="group flex items-center gap-2.5 text-text no-underline"
          onClick={closeMenu}
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-on-inverse transition-transform duration-200 group-hover:scale-105">
            <IconPosternLogo size={20} />
          </span>
          <span className="text-lg font-extrabold tracking-tight">Postern</span>
        </a>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-0.5 rounded-full border border-hairline/60 bg-surface-sunken/70 p-1 md:flex"
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-text-secondary no-underline transition-colors hover:bg-surface hover:text-text"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
            className="flex size-9 items-center justify-center rounded-full border border-hairline/80 bg-surface-sunken/60 text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>

          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            className="flex size-9 items-center justify-center rounded-full border border-hairline/80 bg-surface-sunken/60 text-text-secondary transition-colors hover:border-primary/40 hover:text-primary md:hidden"
            aria-expanded={isOpen}
            aria-controls="primary-menu"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              {isOpen ? (
                <path
                  d="M3.5 3.5l9 9m0-9l-9 9"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M2 4.5h12M2 8h12M2 11.5h12"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {isOpen ? (
        <nav id="primary-menu" aria-label="Primary navigation" className="shell pb-3 md:hidden">
          <ul className="m-0 flex list-none flex-col gap-0.5 border-t border-hairline/60 p-0 pt-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={closeMenu}
                  className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-text-secondary no-underline transition-colors hover:bg-surface-sunken hover:text-text"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  )
}
