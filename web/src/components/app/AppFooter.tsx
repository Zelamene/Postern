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
        <div className="ea-footer__identity">
          <span className="ea-footer__brand">Postern</span>
          <span className="ea-footer__copyright">© {COPYRIGHT_YEAR}</span>
        </div>

        <nav aria-label="Footer navigation" className="ea-footer__nav">
          {FOOTER_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
