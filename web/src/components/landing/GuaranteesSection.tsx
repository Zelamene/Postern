import { Reveal } from '../common/Reveal'

interface GuaranteeCardProps {
  title: string
  description: string
}

function GuaranteeCard({ title, description }: Readonly<GuaranteeCardProps>) {
  return (
    <div className="group rounded-2xl border border-hairline/80 bg-surface p-7 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md">
      <h3 className="text-h4 font-bold text-text transition-colors group-hover:text-primary">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
    </div>
  )
}

export function GuaranteesSection() {
  return (
    <section
      id="guarantees"
      aria-labelledby="guarantees-heading"
      className="scroll-mt-20 bg-surface-sunken/40 py-14 sm:py-16 lg:py-20"
    >
      <div className="shell">
        <Reveal>
          <div className="mx-auto mb-8 max-w-[38rem] sm:mb-10 text-center">
            <span className="chip chip--primary chip--sm mb-3">Privacy by design</span>
            <h2 id="guarantees-heading" className="text-h2 font-bold tracking-tight text-text">
              Protections built into how Postern works
            </h2>
            <p className="mt-4 text-body text-text-secondary">
              Postern is built so that services see your alias, not your primary address. These are
              properties of the design, not marketing promises.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          <Reveal delayMs={80}>
            <GuaranteeCard
              title="No Message Bodies Stored"
              description="Email bodies and attachments are relayed, never written to our database. Once a message is forwarded, its content is discarded. We do keep headers — sender, subject, and delivery results — for up to 90 days so you can see activity."
            />
          </Reveal>
          <Reveal delayMs={160}>
            <GuaranteeCard
              title="Edge-First Routing"
              description="Incoming mail is resolved at Cloudflare’s edge and forwarded straight to your destination, with no central inbox in between. Actual delivery time depends on the sender and your mail provider."
            />
          </Reveal>
          <Reveal delayMs={240}>
            <GuaranteeCard
              title="No Bounce Backscatter"
              description="Mail sent to a disabled, blocked, or deleted alias is discarded rather than bounced, so Postern does not generate backscatter. Filtering and sender reputation depend on many factors outside our control."
            />
          </Reveal>
          <Reveal delayMs={320}>
            <GuaranteeCard
              title="Permanent Non-Recycling"
              description="When you delete an alias it is retired for good. Postern does not reissue a retired address to another account."
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
