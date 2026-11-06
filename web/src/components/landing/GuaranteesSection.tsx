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
            <span className="chip chip--primary chip--sm mb-3">Our Guarantees</span>
            <h2 id="guarantees-heading" className="text-h2 font-bold tracking-tight text-text">
              Guarantees enforced by architecture, not promises
            </h2>
            <p className="mt-4 text-body text-text-secondary">
              Postern is engineered with strict cryptographic and operational boundaries so your
              privacy is preserved by default.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          <Reveal delayMs={80}>
            <GuaranteeCard
              title="Zero Email Storage"
              description="Email bodies and attachments are never stored on any server or database. Once forwarded, message content is immediately discarded."
            />
          </Reveal>
          <Reveal delayMs={160}>
            <GuaranteeCard
              title="Lightning Fast Delivery"
              description="Our edge workers resolve routing in under 15ms, ensuring your verification codes and urgent receipts arrive without lag."
            />
          </Reveal>
          <Reveal delayMs={240}>
            <GuaranteeCard
              title="No Bounce Backscatter"
              description="Disabled and deleted aliases silently drop incoming spam. Spammers get zero feedback and your domain reputation stays pristine."
            />
          </Reveal>
          <Reveal delayMs={320}>
            <GuaranteeCard
              title="Permanent Non-Recycling"
              description="Once an alias is deleted, it is permanently retired. We will never re-issue your previous alias to any other user."
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
