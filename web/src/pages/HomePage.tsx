import { SectionLink } from '../components/common/SectionLink'
import { ActivitySection } from '../components/landing/ActivitySection'
import { ControlSection } from '../components/landing/ControlSection'
import { EditorialFooter } from '../components/landing/EditorialFooter'
import { EditorialHero } from '../components/landing/EditorialHero'
import { EditorialNavbar } from '../components/landing/EditorialNavbar'
import { InviteSection } from '../components/landing/InviteSection'
import { WhyPosternSection } from '../components/landing/WhyPosternSection'
import type { ThemeMode } from '../types'

interface HomePageProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

export function HomePage({ theme, onThemeChange }: Readonly<HomePageProps>) {
  return (
    <div className="min-h-screen bg-bg text-text antialiased">
      <SectionLink
        sectionId="main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[var(--z-toast)] focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-on-inverse"
      >
        Skip to main content
      </SectionLink>

      <EditorialNavbar theme={theme} onThemeChange={onThemeChange} />

      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        <EditorialHero />
        <WhyPosternSection />
        <ActivitySection />
        <ControlSection />
        <InviteSection />
      </main>

      <EditorialFooter />
    </div>
  )
}
