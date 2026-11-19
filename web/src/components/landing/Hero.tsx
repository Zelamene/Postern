import { IconCheck, IconInbox, IconMail, IconPosternLogo } from '../common/Icons'
import { RequestInvite } from '../user/RequestInvite'

const TRUST = [
  'No message bodies stored',
  'No central inbox',
  'One-click block',
] as const

function Metric({ value, label }: Readonly<{ value: string; label: string }>) {
  return (
    <div>
      <p className="font-mono text-sm text-text">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-text-muted">{label}</p>
    </div>
  )
}

function Connector() {
  return <div className="ml-7 h-8 w-px bg-hairline" aria-hidden="true" />
}

function HeroRoute() {
  return (
    <div className="mx-auto w-full max-w-[26rem] select-none" aria-hidden="true">
      <div className="bg-surface p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center bg-danger-surface text-danger">
            <IconMail size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs text-text">offers@shopify.com</p>
            <p className="mt-0.5 text-[11px] text-text-muted">to netflix.k7q2@3xyz.uk</p>
          </div>
        </div>
      </div>

      <Connector />

      <div className="bg-surface-container-low p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center bg-primary text-text-on-primary">
            <IconPosternLogo size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.08em] text-text-muted">Your gate</p>
            <p className="mt-0.5 truncate font-mono text-xs text-text">netflix.k7q2@3xyz.uk</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 bg-success-surface px-2 py-1 text-[10px] font-medium text-success-on-surface">
            <IconCheck size={11} />
            ON
          </span>
        </div>

        <div className="mt-4 flex items-start justify-between gap-2 border-t border-hairline pt-4">
          <Metric value="3" label="forwarded" />
          <Metric value="0" label="stored" />
          <Metric value="1" label="blocked" />
        </div>
      </div>

      <Connector />

      <div className="bg-surface p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center bg-success-surface text-success">
            <IconInbox size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs text-text">you@gmail.com</p>
            <p className="mt-0.5 text-[11px] text-text-muted">Delivered to your inbox</p>
          </div>
          <span className="shrink-0 bg-surface-sunken px-2 py-0.5 font-mono text-[10px] text-text-muted">
            inbox
          </span>
        </div>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="bg-surface">
      <div className="shell grid items-center gap-12 py-14 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-20">
        <div className="max-w-xl">
          <span className="chip chip--primary chip--sm">A quieter inbox</span>
          <h1 id="hero-title" className="mt-5 text-display text-text">
            Your inbox,
            <br />
            on your terms.
          </h1>

          <p className="mt-6 max-w-[46ch] text-body-lg text-text-secondary">
            Postern gives every service its own address. When one leaks your data, you know who did it — and you can cut it off.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <RequestInvite />
            <a href="#how-it-works" className="btn btn--secondary btn--lg">
              See how it works
            </a>
          </div>

          <ul className="m-0 mt-8 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-caption text-text-muted">
            {TRUST.map((item) => (
              <li key={item} className="flex items-center gap-2">
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
