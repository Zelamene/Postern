import { IconPosternLogo } from './Icons'

const FOOTER_LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/THIRD-PARTY-NOTICES.txt', label: 'Licences' },
  { href: '/brand/', label: 'Brand Style Guide' },
] as const

const COPYRIGHT_YEAR = new Date().getFullYear()

export function Footer() {
  return (
    <footer className="border-t border-hairline/70 bg-surface py-12 text-sm text-text-secondary">
      <div className="shell flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <IconPosternLogo size={20} className="text-primary" />
          </div>
          <span className="font-bold text-text">Postern</span>
        </div>

        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap items-center gap-x-6 gap-y-3"
        >
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-medium text-text-secondary no-underline transition-colors hover:text-text"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="shell mt-6 border-t border-hairline/50 pt-6">
        <p className="text-caption text-text-muted">
          © {COPYRIGHT_YEAR} Postern. An invite-only, single-purpose email alias service.
        </p>
      </div>
    </footer>
  )
}
