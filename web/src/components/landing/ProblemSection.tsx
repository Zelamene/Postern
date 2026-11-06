import type { ReactNode } from 'react'
import { IconAlertTriangle, IconEyeOff, IconMail } from '../common/Icons'
import { Reveal } from '../common/Reveal'

interface ProblemCardProps {
  index: string
  icon: ReactNode
  title: string
  description: string
}

export function ProblemCard({ index, icon, title, description }: Readonly<ProblemCardProps>) {
  return (
    <div className="group relative rounded-2xl border border-hairline/80 bg-surface p-7 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:border-danger/40 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div
          data-testid="card-icon"
          className="flex size-11 items-center justify-center rounded-xl border border-danger/20 bg-danger-surface text-danger transition-transform duration-300 group-hover:scale-105"
        >
          {icon}
        </div>
        <span className="font-mono text-xs font-semibold tracking-wider text-text-muted">{index}</span>
      </div>
      <h3 className="mt-5 text-h4 font-bold text-text transition-colors group-hover:text-danger-on-surface">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
    </div>
  )
}

export function ProblemSection() {
  return (
    <section
      id="problem"
      aria-labelledby="problem-heading"
      className="scroll-mt-20 border-b border-hairline/70 bg-surface-sunken/40 py-14 sm:py-16 lg:py-20"
    >
      <div className="shell">
        <Reveal>
          <div className="mx-auto mb-8 max-w-[38rem] sm:mb-10 text-center">
            <span className="chip chip--danger chip--sm mb-3">The Problem</span>
            <h2 id="problem-heading" className="text-h2 font-bold tracking-tight text-text">
              Giving away your primary email is a permanent privacy trap
            </h2>
            <p className="mt-4 text-body text-text-secondary">
              Every digital service demands an email address before you can view a menu, buy a
              ticket, or read an article. Once your real address is handed over, your identity is
              exposed forever.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          <Reveal delayMs={80}>
            <ProblemCard
              index="01"
              icon={<IconMail size={22} />}
              title="The One-Address Vulnerability"
              description="You give the same real email address to hundreds of apps and online shops. A single weak service compromises your identity everywhere."
            />
          </Reveal>
          <Reveal delayMs={160}>
            <ProblemCard
              index="02"
              icon={<IconAlertTriangle size={22} />}
              title="Data Brokers & Silent Breaches"
              description="Companies sell email lists behind closed doors or lose customer databases. When spam floods your inbox, you have no way to prove who leaked your data."
            />
          </Reveal>
          <Reveal delayMs={240}>
            <ProblemCard
              index="03"
              icon={<IconEyeOff size={22} />}
              title="Unsubscribe Buttons Don't Work"
              description="Clicking 'unsubscribe' often just confirms your address is active. Spammers pass your address to other lists, leaving you helpless against unwanted mail."
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
