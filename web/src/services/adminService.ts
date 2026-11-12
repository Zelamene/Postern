import type {
  AdminAnalytics,
  AdminLoginResult,
  AdminTotpSetup,
  Blocklist,
  InviteDashboard,
  InviteRequest,
  KvSyncResult,
} from '../types'
import { apiUrl } from './apiBase'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export class AdminApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Admin API returned ${status}.`)
    this.name = 'AdminApiError'
    this.status = status
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    cache: 'no-store',
    ...init,
  })

  if (!response.ok) {
    throw new AdminApiError(response.status)
  }

  return (await response.json()) as T
}

async function requestEmpty(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    cache: 'no-store',
    ...init,
  })

  if (!response.ok) {
    throw new AdminApiError(response.status)
  }
}

export function fetchInviteDashboard(): Promise<InviteDashboard> {
  return requestJson<InviteDashboard>('/api/admin/invites')
}

export function fetchInviteRequests(): Promise<InviteRequest[]> {
  return requestJson<{ requests: InviteRequest[] }>('/api/admin/invite-requests')
    .then((body) => body.requests)
}

export function getDashboardData(): Promise<[InviteDashboard, InviteRequest[]]> {
  return Promise.all([fetchInviteDashboard(), fetchInviteRequests()])
}

export function signInAdmin(email: string, password: string): Promise<AdminLoginResult> {
  return requestJson<AdminLoginResult>('/api/auth/login', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password }),
  })
}

export function startAdminTotpSetup(): Promise<AdminTotpSetup> {
  return requestJson<AdminTotpSetup>('/api/auth/admin-mfa/setup', { method: 'POST' })
}

export function enableAdminTotp(code: string): Promise<void> {
  return requestEmpty('/api/auth/admin-mfa/enable', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code }),
  })
}

export function verifyAdminTotp(code: string): Promise<void> {
  return requestEmpty('/api/auth/admin-mfa/verify', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code }),
  })
}

export function signOutAdmin(): Promise<void> {
  return requestEmpty('/api/auth/logout', { method: 'POST' })
}

export function approveInviteRequest(requestId: string): Promise<void> {
  return requestEmpty(`/api/admin/invite-requests/${requestId}/approve`, { method: 'POST' })
}

export function rejectInviteRequest(requestId: string): Promise<void> {
  return requestEmpty(`/api/admin/invite-requests/${requestId}/reject`, { method: 'POST' })
}

export function resendInvite(inviteId: string): Promise<void> {
  return requestEmpty(`/api/admin/invites/${inviteId}/resend`, { method: 'POST' })
}

export function revokeInvite(inviteId: string): Promise<void> {
  return requestEmpty(`/api/admin/invites/${inviteId}/revoke`, { method: 'POST' })
}

export function fetchAdminAnalytics(windowHours: number): Promise<AdminAnalytics> {
  return requestJson<AdminAnalytics>(`/api/admin/analytics?windowHours=${windowHours}`)
}

export function fetchBlocklist(): Promise<Blocklist> {
  return requestJson<Blocklist>('/api/admin/global-blocklist')
}

export function addBlockedDomain(domain: string, reason: string): Promise<void> {
  return requestEmpty('/api/admin/global-blocklist', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ domain, reason }),
  })
}

export function removeBlockedDomain(domain: string): Promise<void> {
  return requestEmpty(`/api/admin/global-blocklist/${encodeURIComponent(domain)}`, {
    method: 'DELETE',
  })
}

export function syncAdminKv(): Promise<KvSyncResult> {
  return requestJson<KvSyncResult>('/api/admin/kv-sync', { method: 'POST' })
}
