export interface AdminRealtimeHandlers {
  onDashboardChanged: () => void | Promise<void>
  onOperationsChanged: () => void | Promise<void>
}

export interface UserRealtimeHandlers {
  onAliasesChanged: () => void | Promise<void>
  onMessageReceived: (aliasId: string) => void | Promise<void>
  onBlockedMessageReceived: (aliasId: string) => void | Promise<void>
  onAccountChanged: () => void | Promise<void>
}
