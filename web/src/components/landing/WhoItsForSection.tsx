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
    <div className="bg-bg p-7 transition-colors duration-150 hover:bg-surface">
      <div className="mb-5 flex size-11 items-center justify-center bg-surface-sunken text-primary">
        <IconComponent size={22} />
      </div>
      <h3 className="text-h4 text-text">{title}</h3>
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
      className="scroll-mt-20 bg-surface-sunken py-14 sm:py-16 lg:py-20"
    >
      <div className="shell">
        <Reveal>
          <div className="mx-auto mb-8 max-w-[38rem] text-center sm:mb-10">
            <span className="chip chip--primary chip--sm mb-3">Who it&apos;s for</span>
            <h2 id="audience-heading" className="text-h2 text-text">
              For anyone who wants a quieter inbox
            </h2>
            <p className="mt-4 text-body text-text-secondary">
              Shop online, buy tickets, or work with clients. Your real email stays private.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <Reveal delayMs={80}>
            <PersonaCard
              icon={IconMail}
              title="Online shoppers"
              subtitle="For store signups"
              benefits={[
                'Get order updates and tracking',
                'Stop marketing mail',
                'Turn off an address with one click',
              ]}
            />
          </Reveal>
          <Reveal delayMs={160}>
            <PersonaCard
              icon={IconShield}
              title="Privacy seekers"
              subtitle="For people who dislike tracking"
              benefits={[
                'Keep accounts from being linked',
                'Hide your real email from trackers',
                'See when a service shares your address',
              ]}
            />
          </Reveal>
          <Reveal delayMs={240}>
            <PersonaCard
              icon={IconUsers}
              title="Freelancers & job seekers"
              subtitle="For project-based work"
              benefits={[
                'Use one address per client or job board',
                'Retire an address when work ends',
                'Keep work and personal mail apart',
              ]}
            />
          </Reveal>
          <Reveal delayMs={320}>
            <PersonaCard
              icon={IconLock}
              title="Security enthusiasts"
              subtitle="For extra protection"
              benefits={[
                'See which database leaked your address',
                'Cut down on credential-stuffing attempts',
                'Retired addresses are never reused',
              ]}
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
