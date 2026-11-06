import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze()
  expect(results.violations).toEqual([])
}

const adminDashboard = {
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

function adminAnalytics() {
  const start = Date.UTC(2026, 10, 1, 0, 0, 0)
  return {
    generatedAt: new Date(start + 23 * 3_600_000).toISOString(),
    windowHours: 24,
    minimumDomainVolume: 3,
    totals: {
      registeredUsers: 12,
      pendingInviteRequests: 2,
      aliases: 40,
      activeAliases: 31,
      forwardedMessages: 28,
      blockedMessages: 2,
      unexpectedSenderMessages: 2,
      blocklistedDomains: 1,
      kvDirtyAliases: 3,
    },
    hourlyIngestion: Array.from({ length: 24 }, (_, index) => ({
      hour: new Date(start + index * 3_600_000).toISOString(),
      forwarded: index === 12 ? 5 : 1,
      blocked: index === 18 ? 2 : 0,
    })),
    aliasStatuses: [
      { key: 'active', count: 31 },
      { key: 'disabled', count: 4 },
      { key: 'replaced', count: 2 },
      { key: 'deleted', count: 3 },
    ],
    authenticationResults: [
      { key: 'pass', count: 26 },
      { key: 'none', count: 2 },
      { key: 'fail', count: 1 },
      { key: 'unknown', count: 1 },
    ],
    senderDomains: [{ domain: 'shop.example', count: 12 }],
    hiddenSenderDomains: 1,
    blockedReasons: [{ reason: 'unexpected_sender', count: 2 }],
    recentAudit: [
      {
        id: 'audit-1',
        action: 'global_blocklist.add',
        targetId: 'spam.example',
        metadata: '{"reason":"reported"}',
        createdAt: new Date(start + 22 * 3_600_000).toISOString(),
      },
    ],
  }
}

async function routeAdminDashboard(page: Page) {
  await page.route('**/api/admin/invites', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(adminDashboard),
    })
  })
  await page.route('**/api/admin/invite-requests', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ requests: [] }),
    })
  })
  await page.route('**/api/admin/analytics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(adminAnalytics()),
    })
  })
  await page.route('**/api/admin/global-blocklist**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        domains: ['spam.example'],
        entries: [
          { domain: 'spam.example', reason: 'reported', createdAt: '2026-11-02T12:00:00Z' },
        ],
      }),
    })
  })
  await page.route('**/api/admin/kv-sync**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        aliasesSynced: 3,
        aliasesFailed: 0,
        remainingDirtyAliases: 0,
        globalBlocklistRebuilt: true,
        suspendedUsersRebuilt: true,
      }),
    })
  })
  await page.route('**/api/admin/events/**', async (route) => {
    await route.fulfill({ status: 204 })
  })
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
    await routeAdminDashboard(page)

    await page.goto('/admin')

    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
    await expect(page.getByText('invitee@example.test').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Operational health' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Global blocklist' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Key-value sync' })).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test('admin operations dashboard has no WCAG 2.2 AA violations in dark brand theme', async ({
    page,
  }) => {
    await routeAdminDashboard(page)

    await page.goto('/admin')
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'
      localStorage.setItem('postern-theme', 'dark')
    })

    await expect(page.getByRole('heading', { name: 'Operational health' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Global blocklist' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Key-value sync' })).toBeVisible()
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
