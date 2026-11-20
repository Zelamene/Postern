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
    <footer className="bg-surface-sunken py-14 text-sm text-text-secondary">
      <div className="shell flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center bg-surface text-text">
            <IconPosternLogo size={18} className="text-text" />
          </div>
          <span className="font-[family-name:var(--font-display)] text-lg text-text">Postern</span>
        </div>

        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap items-center gap-x-6 gap-y-3"
        >
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-text-secondary no-underline transition-colors duration-150 hover:text-text"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="shell mt-8 border-t border-hairline pt-6">
        <p className="text-caption text-text-muted">
          © {COPYRIGHT_YEAR} Postern. A simple, private email alias service.
        </p>
      </div>
    </footer>
  )
}
