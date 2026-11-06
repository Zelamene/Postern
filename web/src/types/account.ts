export interface CurrentAccount {
  userId: string
  email: string
  forwardingAddress: string
}

export type AccountSession =
  | { status: 'checking' }
  | { status: 'slow' }
  | { status: 'ready'; account: CurrentAccount }
  | { status: 'anonymous' }
  | { status: 'unavailable' }

export interface AccountSessionState {
  session: AccountSession
  retry: () => void
  refresh: () => Promise<void>
}
