import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CookiePolicyPage } from '../../src/pages/CookiePolicyPage'
import { PrivacyPolicyPage } from '../../src/pages/PrivacyPolicyPage'
import { TermsPage } from '../../src/pages/TermsPage'

const noop = () => {}

afterEach(() => {
  window.history.pushState({}, '', '/')
})

describe('legal pages', () => {
  it('publishes a privacy policy covering retention, processors, and deletion', () => {
    window.history.pushState({}, '', '/privacy')

    render(<PrivacyPolicyPage theme="light" onThemeChange={noop} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible()
    expect(
      screen.getByRole('heading', { level: 2, name: '6. How long we keep it' }),
    ).toBeVisible()
    expect(screen.getByText(/Up to 90 days/)).toBeVisible()
    expect(screen.getByRole('cell', { name: 'Cloudflare' })).toBeVisible()
    expect(screen.getByRole('cell', { name: 'Resend' })).toBeVisible()
    expect(screen.getByText(/Account settings → Delete account/)).toBeVisible()

    const legalNav = within(screen.getByRole('navigation', { name: 'Legal documents' }))
    expect(legalNav.getByRole('link', { name: 'Cookie Policy' })).toHaveAttribute(
      'href',
      '/cookies',
    )
    expect(legalNav.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('publishes terms with acceptable use and consumer protections', () => {
    window.history.pushState({}, '', '/terms')

    render(<TermsPage theme="light" onThemeChange={noop} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: '5. Acceptable use' })).toBeVisible()
    expect(
      screen.getByRole('heading', { level: 2, name: '13. Limitation of liability' }),
    ).toBeVisible()
    expect(screen.getByText(/at least 16 years old/)).toBeVisible()

    const legalNav = within(screen.getByRole('navigation', { name: 'Legal documents' }))
    expect(legalNav.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    )
    expect(legalNav.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('publishes a cookie policy listing every storage item', () => {
    window.history.pushState({}, '', '/cookies')

    render(<CookiePolicyPage theme="light" onThemeChange={noop} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Cookie Policy' })).toBeVisible()

    const storageTable = within(screen.getByRole('table'))
    expect(storageTable.getByText('Postern.Auth')).toBeVisible()
    expect(storageTable.getByText('Postern.AdminMfa')).toBeVisible()
    expect(storageTable.getByText('postern-theme')).toBeVisible()
    expect(storageTable.getByText('postern-pending-recovery-key')).toBeVisible()
    expect(screen.getByRole('link', { name: 'third-party notices' })).toHaveAttribute(
      'href',
      '/THIRD-PARTY-NOTICES.txt',
    )

    const legalNav = within(screen.getByRole('navigation', { name: 'Legal documents' }))
    expect(legalNav.getByRole('link', { name: 'Cookie Policy' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
