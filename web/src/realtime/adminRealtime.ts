import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { apiUrl } from '../services/apiBase'

export const adminRealtimeEvents = {
  inviteRequestReceived: 'InviteRequestReceived',
  invitationAccepted: 'InvitationAccepted',
  invitesChanged: 'InvitesChanged',
  operationsChanged: 'OperationsChanged',
} as const

export function createAdminRealtimeConnection() {
  return new HubConnectionBuilder()
    .withUrl(apiUrl('/api/admin/events'), { withCredentials: true })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()
}
