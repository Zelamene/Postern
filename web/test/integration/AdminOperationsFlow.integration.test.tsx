import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { server } from '../server'

vi.mock('../../src/hooks/useAdminRealtime', () => ({
  useAdminRealtime: () => undefined,
}))

const originalShowModal = HTMLDialogElement.prototype.showModal
const originalClose = HTMLDialogElement.prototype.close

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

afterAll(() => {
  HTMLDialogElement.prototype.showModal = originalShowModal
  HTMLDialogElement.prototype.close = originalClose
})

function renderAt(pathname: string) {
  window.history.pushState({}, '', pathname)
  return render(<App />)
}

afterEach(() => {
  window.history.pushState({}, '', '/')
  window.sessionStorage.clear()
  localStorage.removeItem('postern-theme')
})

const dashboard = {
  invites: [],
  seatsFree: 196,
  outstandingInvites: 0,
}

function analyticsBody(windowHours: number) {
  return {
    generatedAt: '2026-11-02T12:00:00Z',
    windowHours,
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
      hour: new Date(Date.UTC(2026, 10, 1, index)).toISOString(),
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
        createdAt: '2026-11-02T11:00:00Z',
      },
    ],
  }
}

describe('Admin operations flow', () => {
  it('reviews analytics, manages the global blocklist, and runs a KV sync', async () => {
    const user = userEvent.setup()
    let analyticsRequests = 0
    let lastWindowHours = 24
    let blockRequests = 0
    let unblockRequests = 0
    let syncRequests = 0
    let entries: Array<{ domain: string; reason: string; createdAt: string }> = []

    server.use(
      http.get('*/api/admin/invites', () => HttpResponse.json(dashboard)),
      http.get('*/api/admin/invite-requests', () => HttpResponse.json({ requests: [] })),
      http.get('*/api/admin/analytics', ({ request }) => {
        analyticsRequests += 1
        lastWindowHours = Number(new URL(request.url).searchParams.get('windowHours')) || 24
        return HttpResponse.json(analyticsBody(lastWindowHours))
      }),
      http.get('*/api/admin/global-blocklist', () =>
        HttpResponse.json({
          domains: entries.map((entry) => entry.domain),
          entries,
        }),
      ),
      http.post('*/api/admin/global-blocklist', async ({ request }) => {
        const body = (await request.json()) as { domain: string; reason: string }
        blockRequests += 1
        entries = [
          ...entries,
          {
            domain: body.domain,
            reason: body.reason || 'administrator',
            createdAt: '2026-11-02T12:00:00Z',
          },
        ]
        return new HttpResponse(null, { status: 204 })
      }),
      http.delete('*/api/admin/global-blocklist/*', ({ request }) => {
        const domain = decodeURIComponent(new URL(request.url).pathname.split('/').pop() ?? '')
        unblockRequests += 1
        entries = entries.filter((entry) => entry.domain !== domain)
        return new HttpResponse(null, { status: 204 })
      }),
      http.post('*/api/admin/kv-sync', () => {
        syncRequests += 1
        return HttpResponse.json({
          aliasesSynced: 3,
          aliasesFailed: 0,
          remainingDirtyAliases: 0,
          globalBlocklistRebuilt: true,
          suspendedUsersRebuilt: true,
        })
      }),
    )

    renderAt('/admin')

    expect(await screen.findByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
    expect(await screen.findByRole('heading', { name: 'Operational health' })).toBeVisible()
    expect(await screen.findByText(/hidden to protect sender privacy/)).toBeVisible()
    expect(await screen.findByText('global_blocklist.add')).toBeVisible()
    expect(analyticsRequests).toBe(1)

    await user.click(screen.getByRole('button', { name: '7 days' }))
    await waitFor(() => expect(lastWindowHours).toBe(168))
    expect((await screen.findAllByText(/last 7 days/)).length).toBeGreaterThan(0)

    const blocklist = screen.getByRole('region', { name: 'Global blocklist' })
    expect(within(blocklist).getByText('No domains are blocked yet.')).toBeVisible()

    await user.type(within(blocklist).getByLabelText('Domain'), 'spam.example')
    await user.type(within(blocklist).getByLabelText('Reason'), 'reported')
    await user.click(within(blocklist).getByRole('button', { name: 'Block domain' }))

    await waitFor(() => expect(blockRequests).toBe(1))
    expect(await within(blocklist).findByText('spam.example')).toBeVisible()
    expect(within(blocklist).getByText('reported')).toBeVisible()

    await user.click(within(blocklist).getByRole('button', { name: 'Unblock' }))
    await user.click(screen.getByRole('button', { name: 'Unblock domain' }))

    await waitFor(() => expect(unblockRequests).toBe(1))
    await waitFor(() =>
      expect(within(blocklist).getByText('No domains are blocked yet.')).toBeVisible(),
    )

    const sync = screen.getByRole('region', { name: 'Key-value sync' })
    await user.click(within(sync).getByRole('button', { name: 'Sync now' }))

    await waitFor(() => expect(syncRequests).toBe(1))
    expect(await within(sync).findByText(/Synced 3 aliases/)).toBeVisible()
    expect(within(sync).getByText(/Every alias is in sync/)).toBeVisible()
    expect(within(sync).getByText(/Global blocklist rebuilt/)).toBeVisible()
  }, 15_000)
})
