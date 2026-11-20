import { RequestInvite } from '../user/RequestInvite'
import { HeroVisual } from './HeroVisual'

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden border-b border-hairline/70 bg-[#fbf3f9] dark:bg-[#0f090d]"
    >
      <div className="shell grid items-center gap-8 pt-10 pb-10 sm:gap-10 sm:pt-12 sm:pb-12 lg:min-h-[36rem] lg:py-16">
        <div className="relative z-10 max-w-xl">
          <h1 id="hero-title" className="mt-5 text-display font-black text-text">
            Your inbox,
            <br />
            on your terms.
          </h1>

          <p className="mt-6 max-w-[46ch] text-body-lg text-text-secondary">
            Postern gives every service its own address. When one leaks your data, you know who did it — and you can cut it off.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <RequestInvite />
            <a href="#why-postern" className="btn btn--secondary btn--lg">
              See how it works
            </a>
          </div>
        </div>

        <HeroVisual />
      </div>
    </section>
  )
}
