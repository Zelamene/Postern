import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

export const adminRealtimeEvents = {
  inviteRequestReceived: 'InviteRequestReceived',
  invitationAccepted: 'InvitationAccepted',
  invitesChanged: 'InvitesChanged',
  operationsChanged: 'OperationsChanged',
} as const

export function createAdminRealtimeConnection() {
  return new HubConnectionBuilder()
    .withUrl('/api/admin/events', { withCredentials: true })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()
}
