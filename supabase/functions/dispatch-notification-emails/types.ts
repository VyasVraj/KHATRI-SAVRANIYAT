/**
 * Types for Dispatch Notification Emails Edge Function
 *
 * Phase 12 — Subtask 4: Notification Preferences UI & Email Dispatch Infrastructure
 */

export interface ClaimedOutboxRow {
  outbox_id: string
  notification_id: string
  recipient_id: string
  channel: 'EMAIL' | 'IN_APP'
  attempts: number
  recipient_email: string | null
  recipient_name: string | null
  title: string
  body: string
  action_url: string | null
  category: string
  notification_type: string
}

export interface EmailRecipient {
  email: string
  name?: string | null
}

export interface EmailMessage {
  to: EmailRecipient
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  isTerminal?: boolean
  error?: string
  statusCode?: number
}

export interface IEmailProvider {
  name: string
  isConfigured(): boolean
  sendEmail(message: EmailMessage): Promise<SendEmailResult>
}

export interface DispatchOptions {
  batchSize?: number
  maxAttempts?: number
  retryDelaySeconds?: number
  defaultBaseUrl?: string
  supportEmail?: string
}

export interface DispatchSummary {
  claimed: number
  sent: number
  transientFailures: number
  terminalFailures: number
  deadLettered: number
  skipped: number
  durationMs: number
  provider: string
}

export interface DispatchWorkerResponse {
  ok: boolean
  summary: DispatchSummary
  error?: string
}
