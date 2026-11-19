const FOOTER_LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/brand/', label: 'Brand style guide' },
] as const

const COPYRIGHT_YEAR = new Date().getFullYear()

export function AppFooter() {
  return (
    <footer className="ea-footer">
      <div className="ea-footer__inner">
        <span className="ea-footer__brand">Postern</span>

        <nav aria-label="Footer navigation" className="ea-footer__nav">
          {FOOTER_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <span className="ea-footer__copyright">© {COPYRIGHT_YEAR} Postern</span>
      </div>
    </footer>
  )
}
