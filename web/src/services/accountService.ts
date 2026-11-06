import { requestEmpty, requestJson } from './apiClient'

export interface CurrentAccount {
  userId: string
  email: string
  forwardingAddress: string
}

export function fetchCurrentAccount(signal?: AbortSignal): Promise<CurrentAccount> {
  return requestJson<CurrentAccount>('/api/auth/me', { signal })
}

export function signOut(): Promise<void> {
  return requestEmpty('/api/auth/logout', { method: 'POST' })
}

export function changeForwardingAddress(newForwardingAddress: string): Promise<void> {
  return requestEmpty('/api/users/change-forwarding-address', {
    method: 'POST',
    body: { newForwardingAddress },
  })
}

export function deleteAccount(): Promise<void> {
  return requestEmpty('/api/users/me', { method: 'DELETE' })
}
