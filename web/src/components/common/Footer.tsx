import { IconPosternLogo } from './Icons'

export function Footer() {
  return (
    <footer className="border-t border-hairline/70 bg-surface py-12 text-sm text-text-secondary">
      <div className="shell flex flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <IconPosternLogo size={20} className="text-primary" />
          </div>
          <span className="font-bold text-text">Postern</span>
          <span className="text-hairline/80">·</span>
          <span className="text-text-muted">Southern Cross Solutions</span>
        </div>

        <nav aria-label="Footer navigation" className="flex items-center gap-6">
          <a
            href="/brand/"
            className="font-medium text-text-secondary no-underline transition-colors hover:text-text"
          >
            Brand Style Guide
          </a>
          <a
            href="#"
            aria-disabled="true"
            className="cursor-not-allowed font-medium text-text-muted no-underline"
            title="Coming soon"
          >
            Help Centre
          </a>
        </nav>

        <p className="text-caption text-text-muted">COS 301 Capstone 2026</p>
      </div>
    </footer>
  )
}
