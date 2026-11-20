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
    <div className="bg-bg p-7 transition-colors duration-150 hover:bg-surface">
      <div className="flex items-center justify-between">
        <div
          data-testid="card-icon"
          className="flex size-11 items-center justify-center bg-danger-surface text-danger"
        >
          {icon}
        </div>
        <span className="font-mono text-xs tracking-wider text-text-muted">{index}</span>
      </div>
      <h3 className="mt-5 text-h4 text-text">{title}</h3>
      <p className="mt-2 text-sm text-text-secondary">{description}</p>
    </div>
  )
}

export function ProblemSection() {
  return (
    <section
      id="problem"
      aria-labelledby="problem-heading"
      className="scroll-mt-20 bg-surface-sunken py-14 sm:py-16 lg:py-20"
    >
      <div className="shell">
        <Reveal>
          <div className="mx-auto mb-8 max-w-[38rem] text-center sm:mb-10">
            <span className="chip chip--danger chip--sm mb-3">The problem</span>
            <h2 id="problem-heading" className="text-h2 text-text">
              One email address everywhere is a privacy risk
            </h2>
            <p className="mt-4 text-body text-text-secondary">
              One weak service can expose the address you use everywhere. And when spam arrives, you cannot tell who shared it.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          <Reveal delayMs={80}>
            <ProblemCard
              index="01"
              icon={<IconMail size={22} />}
              title="One address, everywhere"
              description="You give the same email to hundreds of sites. A leak at one puts them all at risk."
            />
          </Reveal>
          <Reveal delayMs={160}>
            <ProblemCard
              index="02"
              icon={<IconAlertTriangle size={22} />}
              title="Hidden leaks"
              description="Companies sell lists and lose databases. Spam arrives with no clear source."
            />
          </Reveal>
          <Reveal delayMs={240}>
            <ProblemCard
              index="03"
              icon={<IconEyeOff size={22} />}
              title="Unsubscribe doesn’t help"
              description="It often just confirms your address is live. Then the spam grows."
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
