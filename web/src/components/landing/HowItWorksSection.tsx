import { Reveal } from '../common/Reveal'

interface StepCardProps {
  step: string
  title: string
  description: string
}

function StepCard({ step, title, description }: Readonly<StepCardProps>) {
  return (
    <div className="bg-bg p-7 transition-colors duration-150 hover:bg-surface">
      <span className="mb-5 block font-mono text-3xl text-text-muted">{step}</span>
      <h3 className="text-h4 text-text">{title}</h3>
      <p className="mt-2 text-sm text-text-secondary">{description}</p>
    </div>
  )
}

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="steps-heading"
      className="scroll-mt-20 bg-surface-sunken py-14 sm:py-16 lg:py-20"
    >
      <div className="shell">
        <Reveal>
          <div className="mx-auto mb-8 max-w-[38rem] text-center sm:mb-10">
            <span className="chip chip--info chip--sm mb-3">Simple process</span>
            <h2 id="steps-heading" className="text-h2 text-text">
              Four steps. No new inbox.
            </h2>
            <p className="mt-4 text-body text-text-secondary">
              Keep using the email app you already have. Postern works in the background.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <Reveal delayMs={80}>
            <StepCard
              step="01"
              title="Create an address"
              description="Enter a name like netflix. Postern adds a short, unique suffix."
            />
          </Reveal>
          <Reveal delayMs={160}>
            <StepCard
              step="02"
              title="Use it on the site"
              description="Paste the address into a signup form. Your real email stays private."
            />
          </Reveal>
          <Reveal delayMs={240}>
            <StepCard
              step="03"
              title="Read mail as usual"
              description="Codes, receipts, and notices arrive in your normal inbox."
            />
          </Reveal>
          <Reveal delayMs={320}>
            <StepCard
              step="04"
              title="Stop the noise"
              description="If a service sends spam, switch the address off in one click."
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
