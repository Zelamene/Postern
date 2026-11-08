import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'

export async function ingestMessage(
  page: Page,
  recipientAddress: string,
  options: {
    sender?: string
    subject?: string
    authenticationResult?: 'pass' | 'fail' | 'none'
    blocked?: boolean
    reason?: string
  } = {},
) {
  const secret = process.env.POSTERN_E2E_INGEST_SECRET
  if (!secret) {
    throw new Error('The ingest secret was not configured by the E2E runner.')
  }

  const sender = options.sender ?? `sender-${randomUUID().slice(0, 8)}@mail.example`
  return page.request.post('/api/ingest', {
    headers: { 'X-Postern-Ingest-Secret': secret },
    data: {
      recipientAddress,
      envelopeSender: sender,
      fromHeader: sender,
      subject: options.subject ?? `E2E message ${randomUUID()}`,
      authenticationResult: options.authenticationResult ?? 'pass',
      blocked: options.blocked ?? false,
      reason: options.reason,
      messageId: `<${randomUUID()}@e2e.postern.test>`,
    },
  })
}
