import { Footer } from '../components/common/Footer'
import { Navbar, type ThemeMode } from '../components/common/Navbar'
import { GuaranteesSection } from '../components/landing/GuaranteesSection'
import { Hero } from '../components/landing/Hero'
import { HowItWorksSection } from '../components/landing/HowItWorksSection'
import { InteractiveDemo } from '../components/landing/InteractiveDemo'
import { ProblemSection } from '../components/landing/ProblemSection'
import { SolutionSection } from '../components/landing/SolutionSection'
import { WhoItsForSection } from '../components/landing/WhoItsForSection'

interface HomePageProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

export function HomePage({ theme, onThemeChange }: Readonly<HomePageProps>) {
  return (
    <div className="min-h-screen bg-bg text-text antialiased selection:bg-primary-surface selection:text-primary">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[var(--z-toast)] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-on-inverse focus:shadow-md"
      >
        Skip to main content
      </a>

      <Navbar theme={theme} onThemeChange={onThemeChange} />

      <main id="main-content">
        <Hero />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <InteractiveDemo />
        <WhoItsForSection />
        <GuaranteesSection />
      </main>

      <Footer />
    </div>
  )
}
