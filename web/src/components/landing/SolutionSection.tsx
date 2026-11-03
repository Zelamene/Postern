import type { ReactNode } from 'react'
import {
  IconCheckCircle,
  IconLock,
  IconShield,
  IconSparkles,
  IconTrash2,
  IconZap,
} from '../common/Icons'
import { Reveal } from '../common/Reveal'

interface SolutionCardProps {
  icon: ReactNode
  title: string
  description: string
}

export function SolutionCard({ icon, title, description }: Readonly<SolutionCardProps>) {
  return (
    <div className="group rounded-2xl border border-hairline/80 bg-surface p-7 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md">
      <div
        data-testid="card-icon"
        className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary text-text-on-primary shadow-2xs transition-transform duration-300 group-hover:scale-105"
      >
        {icon}
      </div>
      <h3 className="text-h4 font-bold text-text transition-colors group-hover:text-primary">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
    </div>
  )
}

export function SolutionSection() {
  return (
    <section
      id="solution"
      aria-labelledby="solution-heading"
      className="scroll-mt-20 border-b border-hairline/70 bg-surface py-14 sm:py-16 lg:py-20"
    >
      <div className="shell">
        <Reveal>
          <div className="mx-auto mb-8 max-w-[38rem] sm:mb-10 text-center">
            <span className="chip chip--primary chip--sm mb-3">The Solution</span>
            <h2 id="solution-heading" className="text-h2 font-bold tracking-tight text-text">
              Give each website its own dedicated gate
            </h2>
            <p className="mt-4 text-body text-text-secondary">
              Postern sits between the public web and your private mailbox. You receive all
              legitimate messages seamlessly, while keeping full control over who can talk to you.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Reveal delayMs={60}>
            <SolutionCard
              icon={<IconShield size={22} />}
              title="Dedicated Disposable Aliases"
              description="Create custom addresses like netflix.k7q2@3xyz.uk. Your real primary email address is never disclosed to any external website."
            />
          </Reveal>
          <Reveal delayMs={120}>
            <SolutionCard
              icon={<IconZap size={22} />}
              title="Instant Edge Forwarding"
              description="Incoming emails are forwarded to your personal Gmail, Outlook, or Proton address in under 15ms without delay."
            />
          </Reveal>
          <Reveal delayMs={180}>
            <SolutionCard
              icon={<IconSparkles size={22} />}
              title="Automatic Leak Identification"
              description="Because each service has a unique alias, any unsolicited marketing email immediately reveals exactly who sold your information."
            />
          </Reveal>
          <Reveal delayMs={240}>
            <SolutionCard
              icon={<IconTrash2 size={22} />}
              title="One-Click Gate Closing"
              description="Turn off an alias at any time with a single tap. Subsequent messages sent to that address are dropped silently with zero backscatter."
            />
          </Reveal>
          <Reveal delayMs={300}>
            <SolutionCard
              icon={<IconLock size={22} />}
              title="Zero Message Body Storage"
              description="Postern never saves your email bodies or attachments. Forwarding happens on edge servers and content is immediately discarded."
            />
          </Reveal>
          <Reveal delayMs={360}>
            <SolutionCard
              icon={<IconCheckCircle size={22} />}
              title="Permanent Retirement Guarantee"
              description="Deleted aliases are cryptographically tombstoned. They will never be recycled or assigned to anyone else in the future."
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
