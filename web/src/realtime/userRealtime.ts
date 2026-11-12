import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { apiUrl } from '../services/apiBase'

export const userRealtimeEvents = {
  aliasesChanged: 'AliasesChanged',
  messageReceived: 'MessageReceived',
  blockedMessageReceived: 'BlockedMessageReceived',
  accountChanged: 'AccountChanged',
} as const

export function createUserRealtimeConnection() {
  return new HubConnectionBuilder()
    .withUrl(apiUrl('/api/user/events'), { withCredentials: true })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()
}
