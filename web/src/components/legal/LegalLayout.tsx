import type { ReactNode } from 'react'
import type { ThemeMode } from '../../types'
import { LEGAL_CONTACT_EMAIL, LEGAL_LAST_UPDATED } from '../../content/legal'
import { Footer } from '../common/Footer'
import { Navbar } from '../common/Navbar'

const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/cookies', label: 'Cookie Policy' },
] as const

interface LegalLayoutProps {
  title: string
  summary: string
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
  children: ReactNode
}

export function LegalLayout({
  title,
  summary,
  theme,
  onThemeChange,
  children,
}: Readonly<LegalLayoutProps>) {
  const currentPath = window.location.pathname.replace(/\/+$/, '')

  return (
    <div className="min-h-screen bg-bg text-text antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[var(--z-toast)] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-on-inverse focus:shadow-md"
      >
        Skip to main content
      </a>

      <Navbar theme={theme} onThemeChange={onThemeChange} />

      <main id="main-content" className="shell py-12 sm:py-16">
        <div className="mx-auto max-w-[var(--container-prose)]">
          <header>
            <span className="chip chip--primary chip--sm">Legal</span>
            <h1 className="mt-4 text-h1 font-bold tracking-tight text-text">{title}</h1>
            <p className="mt-3 text-sm text-text-muted">Last updated {LEGAL_LAST_UPDATED}</p>
            <p className="mt-4 text-body leading-relaxed text-text-secondary">{summary}</p>
          </header>

          <nav
            aria-label="Legal documents"
            className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-y border-hairline/70 py-3 text-sm font-semibold"
          >
            {LEGAL_LINKS.map((link) => {
              const isCurrent = currentPath === link.href
              return (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={
                    isCurrent
                      ? 'text-primary no-underline'
                      : 'text-text-secondary no-underline transition-colors hover:text-text'
                  }
                >
                  {link.label}
                </a>
              )
            })}
          </nav>

          <div className="legal-prose mt-8">{children}</div>

          <section
            aria-labelledby="legal-contact-heading"
            className="mt-12 rounded-xl border border-hairline/80 bg-surface-sunken/60 p-5"
          >
            <h2 id="legal-contact-heading" className="text-h4 font-bold text-text">
              Contact
            </h2>
            {LEGAL_CONTACT_EMAIL ? (
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Email{' '}
                <a
                  className="font-semibold text-link"
                  href={`mailto:${LEGAL_CONTACT_EMAIL}`}
                >
                  {LEGAL_CONTACT_EMAIL}
                </a>
                .
              </p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Account holders can raise privacy or legal questions with the administrator who
                invited them. You can delete your account and its data at any time from{' '}
                <strong className="font-semibold text-text">Account settings</strong> in the app.
              </p>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
