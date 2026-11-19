import type { ReactNode } from 'react'
import type { ThemeMode } from '../../types'
import { LEGAL_CONTACT_EMAIL, LEGAL_LAST_UPDATED } from '../../content/legal'
import { Footer } from '../common/Footer'
import { EditorialNavbar } from '../landing/EditorialNavbar'

const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/cookies', label: 'Cookie Policy' },
] as const


function stripTrailingSlashes(pathname: string): string {
  let end = pathname.length
  while (end > 0 && pathname[end - 1] === '/') {
    end -= 1
  }
  return pathname.slice(0, end)
}

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
  const currentPath = stripTrailingSlashes(window.location.pathname)

  return (
    <div className="min-h-screen bg-bg text-text antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[var(--z-toast)] focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-on-inverse"
      >
        Skip to main content
      </a>

      <EditorialNavbar theme={theme} onThemeChange={onThemeChange} useHomeLinks />

      <main id="main-content" className="shell py-12 sm:py-16">
        <div className="mx-auto max-w-[var(--container-prose)]">
          <header>
            <span className="chip chip--primary chip--sm">Legal</span>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-h1 font-normal tracking-tight text-text">{title}</h1>
            <p className="mt-3 text-sm text-text-muted">Last updated {LEGAL_LAST_UPDATED}</p>
            <p className="mt-4 text-body leading-relaxed text-text-secondary">{summary}</p>
          </header>

          <nav
            aria-label="Legal documents"
            className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-y border-hairline py-3 text-sm font-medium"
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
                      ? 'text-text no-underline'
                      : 'text-text-secondary no-underline transition-colors duration-150 hover:text-text'
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
            className="mt-12 bg-surface-sunken p-5"
          >
            <h2 id="legal-contact-heading" className="text-h4 font-medium text-text">
              Contact
            </h2>
            {LEGAL_CONTACT_EMAIL ? (
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Email{' '}
                <a
                  className="font-medium text-link"
                  href={`mailto:${LEGAL_CONTACT_EMAIL}`}
                >
                  {LEGAL_CONTACT_EMAIL}
                </a>
                .
              </p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                If you have privacy or legal questions, contact the administrator who invited you.
                You can delete your account and data at any time from{' '}
                <strong className="font-medium text-text">Account settings</strong> in the app.
              </p>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
