import { IconCheck, IconLock, IconMail, IconShield, IconUsers } from '../common/Icons'
import { Reveal } from '../common/Reveal'

interface PersonaCardProps {
  title: string
  subtitle: string
  benefits: string[]
  icon: typeof IconUsers
}

function PersonaCard({ title, subtitle, benefits, icon: IconComponent }: Readonly<PersonaCardProps>) {
  return (
    <div className="group rounded-2xl border border-hairline/80 bg-surface p-7 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md">
      <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-surface-sunken text-primary shadow-2xs transition-transform duration-300 group-hover:scale-105">
        <IconComponent size={22} />
      </div>
      <h3 className="text-h4 font-bold text-text transition-colors group-hover:text-primary">
        {title}
      </h3>
      <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
      <ul className="mt-5 space-y-2.5 text-sm text-text-secondary">
        {benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0 text-success">
              <IconCheck size={15} />
            </span>
            <span>{benefit}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function WhoItsForSection() {
  return (
    <section
      id="who-its-for"
      aria-labelledby="audience-heading"
      className="scroll-mt-20 border-b border-hairline/70 bg-surface py-14 sm:py-16 lg:py-20"
    >
      <div className="shell">
        <Reveal>
          <div className="mx-auto mb-8 max-w-[38rem] sm:mb-10 text-center">
            <span className="chip chip--primary chip--sm mb-3">Who It&apos;s For</span>
            <h2 id="audience-heading" className="text-h2 font-bold tracking-tight text-text">
              Designed for anyone who values peace of mind
            </h2>
            <p className="mt-4 text-body text-text-secondary">
              Whether you shop online, register for event tickets, or manage freelance clients,
              Postern ensures your real email address stays protected and quiet.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          <Reveal delayMs={80}>
            <PersonaCard
              icon={IconMail}
              title="Online Shoppers"
              subtitle="For one-time and occasional store signups"
              benefits={[
                'Receive order confirmations and delivery tracking',
                'Stop promotional spam from cluttering your primary inbox',
                'Turn off marketing notifications with a single click',
              ]}
            />
          </Reveal>
          <Reveal delayMs={160}>
            <PersonaCard
              icon={IconShield}
              title="Privacy Seekers"
              subtitle="For people who reject digital tracking"
              benefits={[
                'Prevent data brokers from linking your accounts',
                'Shield your true email from third-party analytics',
                'Detect unauthorized data sharing immediately',
              ]}
            />
          </Reveal>
          <Reveal delayMs={240}>
            <PersonaCard
              icon={IconUsers}
              title="Freelancers & Job Seekers"
              subtitle="For temporary and project-based inquiries"
              benefits={[
                'Create professional aliases for each client or job board',
                'Retire project addresses once contracts complete',
                'Keep your personal communications separated',
              ]}
            />
          </Reveal>
          <Reveal delayMs={320}>
            <PersonaCard
              icon={IconLock}
              title="Security Enthusiasts"
              subtitle="For proactive identity defense"
              benefits={[
                'Identify exactly which database suffered a breach',
                'Eliminate credential stuffing vectors',
                'Permanent tombstones prevent alias recycling',
              ]}
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
