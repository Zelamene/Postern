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
    <div className="bg-bg p-7 transition-colors duration-150 hover:bg-surface">
      <div
        data-testid="card-icon"
        className="mb-5 flex size-11 items-center justify-center bg-primary text-text-on-primary"
      >
        {icon}
      </div>
      <h3 className="text-h4 text-text">{title}</h3>
      <p className="mt-2 text-sm text-text-secondary">{description}</p>
    </div>
  )
}

export function SolutionSection() {
  return (
    <section
      id="solution"
      aria-labelledby="solution-heading"
      className="scroll-mt-20 bg-surface py-14 sm:py-16 lg:py-20"
    >
      <div className="shell">
        <Reveal>
          <div className="mx-auto mb-8 max-w-[38rem] text-center sm:mb-10">
            <span className="chip chip--primary chip--sm mb-3">The solution</span>
            <h2 id="solution-heading" className="text-h2 text-text">
              An address for every service
            </h2>
            <p className="mt-4 text-body text-text-secondary">
              Postern sits between the web and your mailbox. Real mail reaches you. Everything else stops at the gate.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Reveal delayMs={60}>
            <SolutionCard
              icon={<IconShield size={22} />}
              title="Your own address for each site"
              description="Create an address like netflix.k7q2@3xyz.uk. The site never sees your real email."
            />
          </Reveal>
          <Reveal delayMs={120}>
            <SolutionCard
              icon={<IconZap size={22} />}
              title="Mail goes straight through"
              description="Valid mail is forwarded from the edge to your existing inbox. Delivery time depends on the sender and your mail provider."
            />
          </Reveal>
          <Reveal delayMs={180}>
            <SolutionCard
              icon={<IconSparkles size={22} />}
              title="Spot the leak"
              description="An unexpected message tells you exactly which service shared your address."
            />
          </Reveal>
          <Reveal delayMs={240}>
            <SolutionCard
              icon={<IconTrash2 size={22} />}
              title="Close the gate"
              description="Turn off an address with one click. Later mail is discarded, not bounced."
            />
          </Reveal>
          <Reveal delayMs={300}>
            <SolutionCard
              icon={<IconLock size={22} />}
              title="No stored content"
              description="Postern does not save email bodies or attachments. Forwarding happens at the edge, and content is discarded."
            />
          </Reveal>
          <Reveal delayMs={360}>
            <SolutionCard
              icon={<IconCheckCircle size={22} />}
              title="Gone for good"
              description="Deleted addresses are retired permanently. They are never given to someone else."
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
