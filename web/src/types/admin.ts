export interface AdminInvite {
  id: string
  email: string
  status: string
  createdAt: string
  expiresAt: string | null
  canResend: boolean
  canRevoke: boolean
}

export interface InviteDashboard {
  invites: AdminInvite[]
  seatsFree: number
  outstandingInvites: number
}

export interface InviteRequest {
  id: string
  email: string
  requestedAt: string
}

export interface AdminTotpSetup {
  secret: string
  authenticatorUri: string
}

export interface AdminLoginResult {
  userId?: string
  email?: string
  recoveryKey?: string | null
  mfaRequired?: boolean
  mfaSetupRequired?: boolean
}

export interface AdminAnalyticsTotals {
  registeredUsers: number
  pendingInviteRequests: number
  aliases: number
  activeAliases: number
  forwardedMessages: number
  blockedMessages: number
  unexpectedSenderMessages: number
  blocklistedDomains: number
  kvDirtyAliases: number
}

export interface AdminHourlyIngestion {
  hour: string
  forwarded: number
  blocked: number
}

export interface AdminDistributionItem {
  key: string
  count: number
}

export interface AdminSenderDomain {
  domain: string
  count: number
}

export interface AdminBlockReason {
  reason: string
  count: number
}

export interface AdminAuditEntry {
  id: string
  action: string
  targetId: string | null
  metadata: string | null
  createdAt: string
}

export interface AdminAnalytics {
  generatedAt: string
  windowHours: number
  minimumDomainVolume: number
  totals: AdminAnalyticsTotals
  hourlyIngestion: AdminHourlyIngestion[]
  aliasStatuses: AdminDistributionItem[]
  authenticationResults: AdminDistributionItem[]
  senderDomains: AdminSenderDomain[]
  hiddenSenderDomains: number
  blockedReasons: AdminBlockReason[]
  recentAudit: AdminAuditEntry[]
}

export interface BlocklistEntry {
  domain: string
  reason: string
  createdAt: string
}

export interface Blocklist {
  domains: string[]
  entries: BlocklistEntry[]
}

export interface KvSyncResult {
  aliasesSynced: number
  aliasesFailed: number
  remainingDirtyAliases: number
  globalBlocklistRebuilt: boolean
  suspendedUsersRebuilt: boolean
}

export interface AdminOperations {
  windowHours: number
  setWindowHours: (hours: number) => void
  analytics: AdminAnalytics | null
  analyticsError: string | null
  isAnalyticsLoading: boolean
  blocklist: Blocklist | null
  blocklistError: string | null
  isBlocklistLoading: boolean
  blocklistBusy: string | null
  kvResult: KvSyncResult | null
  kvError: string | null
  isSyncingKv: boolean
  reload: () => Promise<void>
  refresh: () => Promise<void>
  addDomain: (domain: string, reason: string) => Promise<boolean>
  removeDomain: (domain: string) => Promise<boolean>
  syncKv: () => Promise<void>
}
