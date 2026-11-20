import { EditorialLogo } from './EditorialLogo'

const FOOTER_LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/brand/', label: 'Brand style guide' },
] as const

export function EditorialFooter() {
  return (
    <footer className="bg-surface-container-low py-16 px-8 lg:px-16">
      <div className="editorial-shell grid grid-cols-1 gap-10 font-body text-sm lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="mb-3 flex items-center gap-3">
            <EditorialLogo size={28} className="shrink-0" />
            <span className="block font-display text-3xl font-light tracking-tight text-primary">
              Postern
            </span>
          </div>

          <p className="mb-4 hidden max-w-sm leading-relaxed text-on-surface-variant lg:block">
            A private email alias and forwarding platform. Keep your real email address private and
            know who reaches your inbox.
          </p>

          <div className="mb-4 hidden text-[11px] font-semibold leading-4 tracking-[0.08em] text-on-surface-variant lg:block">
            © Postern. Private by design.
          </div>

          <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-4 text-xs">
            {FOOTER_LINKS.map((link, index) => (
              <span key={link.href} className="flex items-center gap-4">
                {index > 0 ? (
                  <span className="text-outline-variant" aria-hidden="true">
                    •
                  </span>
                ) : null}
                <a
                  href={link.href}
                  className="text-on-surface-variant no-underline transition-all hover:text-primary hover:underline hover:decoration-1 hover:underline-offset-4"
                >
                  {link.label}
                </a>
              </span>
            ))}
          </nav>
        </div>

        <div className="hidden space-y-2 lg:col-span-3 lg:block">
          <span className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
            How it works
          </span>
          <div className="text-on-surface-variant">• Every service gets its own alias</div>
          <div className="text-on-surface-variant">• Messages forward to your inbox</div>
          <div className="text-on-surface-variant">• Sender activity is monitored</div>
          <div className="text-on-surface-variant">• No email content is stored</div>
        </div>

        <div className="hidden flex-col justify-between lg:col-span-4 lg:flex lg:items-end">
          <div className="space-y-1 text-left lg:text-right">
            <span className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
              Postern Platform
            </span>
            <div className="text-success">• Invite-only release</div>
            <div className="text-on-surface-variant">• Safe address replacement</div>
            <div className="text-on-surface-variant">• Export activity anytime</div>
          </div>
          <div className="mt-6 font-medium text-accent lg:mt-0">Your inbox, on your terms.</div>
        </div>
      </div>
    </footer>
  )
}
