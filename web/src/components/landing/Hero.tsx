import { IconCheck, IconInbox, IconMail, IconPosternLogo } from '../common/Icons'
import { RequestInvite } from '../user/RequestInvite'

const TRUST = [
  'No message bodies stored',
  '15 ms edge forwarding',
  'One-click block',
] as const

function Metric({ value, label }: Readonly<{ value: string; label: string }>) {
  return (
    <div>
      <p className="font-mono text-sm font-bold text-text">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</p>
    </div>
  )
}

function Connector() {
  return (
    <div className="relative ml-7 h-8 border-l-2 border-dashed border-hairline" aria-hidden="true">
      <span className="absolute top-1.5 -left-[5px] size-2 animate-ping rounded-full bg-primary/50" />
      <span className="absolute -left-[3px] top-1/2 size-1.5 rounded-full bg-primary" />
    </div>
  )
}

function HeroRoute() {
  return (
    <div className="relative mx-auto w-full max-w-[26rem] select-none" aria-hidden="true">
      <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-primary/[0.05] blur-2xl" />

      <div className="relative flex items-center gap-3 rounded-2xl border border-hairline/80 bg-surface p-3.5 shadow-2xs">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger-surface text-danger">
          <IconMail size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] font-semibold text-text">
            offers@shopify.com
          </p>
          <p className="text-[10px] text-text-muted">to netflix.k7q2@3xyz.uk</p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-text-muted">09:41</span>
      </div>

      <Connector />

      <div className="relative rounded-2xl border-2 border-primary/25 bg-surface p-4 shadow-md">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-on-inverse">
            <IconPosternLogo size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Your gate
            </p>
            <p className="truncate font-mono text-xs font-semibold text-text">
              netflix.k7q2@3xyz.uk
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-success-surface px-2 py-1 text-[10px] font-bold text-success-on-surface">
            <IconCheck size={11} />
            ON
          </span>
        </div>

        <div className="mt-3 flex items-start justify-between gap-2 border-t border-hairline/60 pt-3">
          <Metric value="3" label="forwarded" />
          <Metric value="0" label="stored" />
          <Metric value="1" label="blocked" />
        </div>
      </div>

      <Connector />

      <div className="relative flex items-center gap-3 rounded-2xl border border-hairline/80 bg-surface p-3.5 shadow-2xs">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-surface text-success">
          <IconInbox size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] font-semibold text-text">you@gmail.com</p>
          <p className="text-[10px] text-text-muted">Delivered in 12 ms</p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-[10px] text-text-muted">
          inbox
        </span>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden border-b border-hairline/70 bg-surface"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 right-[-10%] size-[26rem] rounded-full bg-primary/[0.06] blur-3xl" />
        <div className="absolute bottom-[-8rem] left-[-6rem] size-72 rounded-full bg-primary/[0.04] blur-3xl" />
      </div>

      <div className="shell grid items-center gap-12 py-12 sm:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-16">
        <div className="max-w-xl">
          <h1 id="hero-title" className="mt-5 text-display font-black text-text">
            Your inbox,
            <br />
            on your terms.
          </h1>

          <p className="mt-6 max-w-[46ch] text-body-lg leading-[1.7] text-text-secondary">
            A postern is the side gate of a castle — the quiet entrance so the main gate never has
            to open. Postern gives every service its own disposable address. When a company leaks
            your data, you catch them instantly and cut them off with one click.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <RequestInvite />
            <a href="#how-it-works" className="btn btn--secondary btn--lg">
              See how it works
            </a>
          </div>

          <ul className="m-0 mt-8 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-caption text-text-muted">
            {TRUST.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <IconCheck size={13} className="text-success" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <HeroRoute />
      </div>
    </section>
  )
}
