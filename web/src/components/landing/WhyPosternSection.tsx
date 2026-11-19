import { EditorialReveal } from './EditorialReveal'

const CARDS = [
  {
    number: '01',
    title: 'A different address for every service',
    description:
      "If an alias starts receiving unwanted mail, you'll know exactly which service it belongs to.",
    note: 'netflix.k7q2@3xyz.uk • amazon.k7q2@3xyz.uk',
    noteAccent: false,
  },
  {
    number: '02',
    title: 'See unexpected senders',
    description:
      "When a new sender uses an alias, Postern highlights it for review so you can decide if it's legitimate.",
    note: 'Instantly surfaces unknown domains',
    noteAccent: true,
  },
  {
    number: '03',
    title: 'Replace or retire aliases',
    description:
      'Create a replacement address, disable forwarding, or permanently retire an alias whenever you want.',
    note: 'Never recycled or assigned to anyone else',
    noteAccent: false,
  },
] as const

export function WhyPosternSection() {
  return (
    <section
      id="why-postern"
      aria-labelledby="why-postern-heading"
      tabIndex={-1}
      className="scroll-mt-20 bg-surface-container-low py-20 lg:py-28 focus:outline-none"
    >
      <div className="editorial-shell">
        <EditorialReveal className="mb-14 max-w-2xl lg:mb-18">
          <h2 id="why-postern-heading" className="editorial-section-title">
            Built for clarity, privacy, and quiet control.
          </h2>
        </EditorialReveal>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 lg:gap-10">
          {CARDS.map((card, index) => (
            <EditorialReveal key={card.number} delayMs={80 * (index + 1)}>
              <div className="editorial-card flex h-full cursor-default flex-col justify-between p-8 lg:p-10">
                <div>
                  <span className="mb-4 block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    {card.number}
                  </span>
                  <h3 className="mb-3 font-display text-2xl font-normal text-primary">
                    {card.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-on-surface-variant">
                    {card.description}
                  </p>
                </div>
                <div
                  className={`mt-8 border-t border-hairline pt-5 font-mono text-xs ${
                    card.noteAccent ? 'text-accent' : 'text-on-surface-variant'
                  }`}
                >
                  {card.note}
                </div>
              </div>
            </EditorialReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
