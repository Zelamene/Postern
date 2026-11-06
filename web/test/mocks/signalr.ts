class MockHubConnection {
  on(): void {
    return undefined
  }

  off(): void {
    return undefined
  }

  onclose(): void {
    return undefined
  }

  onreconnecting(): void {
    return undefined
  }

  onreconnected(): void {
    return undefined
  }

  async start(): Promise<void> {
    return undefined
  }

  async stop(): Promise<void> {
    return undefined
  }
}

export class HubConnectionBuilder {
  withUrl(): this {
    return this
  }

  withAutomaticReconnect(): this {
    return this
  }

  configureLogging(): this {
    return this
  }

  build(): MockHubConnection {
    return new MockHubConnection()
  }
}

export const LogLevel = {
  Trace: 0,
  Debug: 1,
  Information: 2,
  Warning: 3,
  Error: 4,
  Critical: 5,
  None: 6,
} as const
