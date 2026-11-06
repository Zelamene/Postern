import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

function defaultAnalytics() {
  const start = Date.UTC(2026, 10, 1, 0, 0, 0)
  const hourlyIngestion = Array.from({ length: 24 }, (_, index) => ({
    hour: new Date(start + index * 3_600_000).toISOString(),
    forwarded: index === 12 ? 5 : 1,
    blocked: index === 18 ? 2 : 0,
  }))

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
    hourlyIngestion,
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
    senderDomains: [
      { domain: 'shop.example', count: 12 },
      { domain: 'bank.example', count: 5 },
    ],
    hiddenSenderDomains: 2,
    blockedReasons: [
      { reason: 'unexpected_sender', count: 2 },
    ],
    recentAudit: [
      {
        id: '00000000-0000-0000-0000-000000000901',
        action: 'kv.sync',
        targetId: null,
        metadata: '{"aliasesSynced":1,"aliasesFailed":0}',
        createdAt: new Date(start + 22 * 3_600_000).toISOString(),
      },
    ],
  }
}

export const server = setupServer(
  http.get('*/health', () => HttpResponse.json({ status: 'ok' })),
  http.get('*/api/auth/me', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })),
  http.get('*/api/notifications', () =>
    HttpResponse.json({ unreadCount: 0, notifications: [] }),
  ),
  http.post('*/api/notifications/:notificationId/read', () =>
    new HttpResponse(null, { status: 204 }),
  ),
  http.post('*/api/notifications/read-all', () => new HttpResponse(null, { status: 204 })),
  http.get('*/api/admin/notifications', () =>
    HttpResponse.json({ unreadCount: 0, notifications: [] }),
  ),
  http.post('*/api/admin/notifications/:notificationId/read', () =>
    new HttpResponse(null, { status: 204 }),
  ),
  http.post('*/api/admin/notifications/read-all', () =>
    new HttpResponse(null, { status: 204 }),
  ),
  http.get('*/api/admin/analytics', () => HttpResponse.json(defaultAnalytics())),
  http.get('*/api/admin/global-blocklist', () =>
    HttpResponse.json({ domains: [], entries: [] }),
  ),
  http.post('*/api/admin/kv-sync', () =>
    HttpResponse.json({
      aliasesSynced: 0,
      aliasesFailed: 0,
      remainingDirtyAliases: 0,
      globalBlocklistRebuilt: true,
      suspendedUsersRebuilt: true,
    }),
  ),
)
