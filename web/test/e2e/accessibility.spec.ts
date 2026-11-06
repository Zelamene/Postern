import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze()
  expect(results.violations).toEqual([])
}

test.describe('page accessibility', () => {
  test('home page has no WCAG 2.2 AA violations', async ({ page }) => {
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' }),
      })
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: /Your inbox, on your terms\./ })).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test('home page has no WCAG 2.2 AA violations in dark brand theme', async ({ page }) => {
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' }),
      })
    })

    await page.goto('/')
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'
      localStorage.setItem('postern-theme', 'dark')
    })
    await expect(page.getByRole('heading', { level: 1, name: /Your inbox, on your terms\./ })).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test('sign-in page has no WCAG 2.2 AA violations', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in to Postern' })).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test('invite registration page has no WCAG 2.2 AA violations', async ({ page }) => {
    await page.route('**/api/auth/invite-details', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ email: 'person@example.test' }),
      })
    })

    await page.goto('/invite/postern_invite_example')
    await expect(page.getByRole('heading', { name: 'Create your Postern account' })).toBeVisible()
    await expect(page.getByLabel('Invited email address')).toHaveValue('person@example.test')
    await expectNoA11yViolations(page)
  })

  test('invalid invitation page has no WCAG 2.2 AA violations', async ({ page }) => {
    await page.route('**/api/auth/invite-details', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_invite' }),
      })
    })

    await page.goto('/invite/expired_invite_example')
    await expect(page.getByRole('alert')).toContainText('We could not verify this invitation.')
    await expectNoA11yViolations(page)
  })

  test('admin sign-in page has no WCAG 2.2 AA violations', async ({ page }) => {
    await page.route('**/api/admin/invites', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      })
    })
    await page.route('**/api/admin/invite-requests', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      })
    })

    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test('admin dashboard has no WCAG 2.2 AA violations', async ({ page }) => {
    const dashboard = {
      invites: [
        {
          id: 'invite-1',
          email: 'invitee@example.test',
          status: 'pending',
          createdAt: '2026-11-01T12:00:00Z',
          expiresAt: '2026-11-08T12:00:00Z',
          canResend: true,
          canRevoke: true,
        },
      ],
      seatsFree: 196,
      outstandingInvites: 1,
    }

    await page.route('**/api/admin/invites', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(dashboard),
      })
    })
    await page.route('**/api/admin/invite-requests', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ requests: [] }),
      })
    })
    await page.route('**/api/admin/events/**', async (route) => {
      await route.fulfill({ status: 204 })
    })

    await page.goto('/admin')

    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
    await expect(page.getByText('invitee@example.test').first()).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test('authenticated alias dashboard has no WCAG 2.2 AA violations', async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: '00000000-0000-0000-0000-000000000001',
          email: 'person@example.test',
          forwardingAddress: 'forward@example.test',
        }),
      })
    })
    await page.route('**/api/aliases', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: '00000000-0000-0000-0000-000000000101',
            userId: '00000000-0000-0000-0000-000000000001',
            label: 'Shop',
            randomSuffix: 'abc12345',
            fullAddress: 'shop-abc12345@alias.postern.test',
            purposeMetadata: null,
            category: 'shopping',
            status: 'Active',
            replacedByAliasId: null,
            kvDirty: false,
            createdAt: '2026-11-01T10:00:00Z',
            deletedAt: null,
          },
        ]),
      })
    })

    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Your aliases' })).toBeVisible()
    await expect(page.getByText('shop-abc12345@alias.postern.test')).toBeVisible()
    await expectNoA11yViolations(page)
  })
})
