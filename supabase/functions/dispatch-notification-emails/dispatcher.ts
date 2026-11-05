/**
 * Outbox Dispatcher Orchestration Engine
 *
 * Phase 12 — Subtask 4: Notification Preferences UI & Email Dispatch Infrastructure
 *
 * Responsibilities:
 * - Atomic queue claims via PostgreSQL `FOR UPDATE SKIP LOCKED`
 * - Recipient address validation and data-minimized email rendering
 * - Provider dispatch with transparent terminal vs transient retry classification
 * - Safe transition to SENT or DEAD_LETTER with exponential backoff
 */

import type {
  ClaimedOutboxRow,
  IEmailProvider,
  DispatchOptions,
  DispatchSummary,
} from './types.ts'
import { renderNotificationEmail } from './email-templates.ts'

// Minimal typing interface for Supabase client RPC interactions
export interface ISupabaseRpcClient {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string; details?: string } | null }>
}

function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export async function dispatchNotificationBatch(params: {
  supabase: ISupabaseRpcClient
  provider: IEmailProvider
  options?: DispatchOptions
}): Promise<DispatchSummary> {
  const startTime = Date.now()
  const { supabase, provider, options } = params

  const batchSize = options?.batchSize ?? 10
  const maxAttempts = options?.maxAttempts ?? 3
  const retryDelaySeconds = options?.retryDelaySeconds ?? 300
  const defaultBaseUrl = options?.defaultBaseUrl ?? 'https://community-roots.app'
  const supportEmail = options?.supportEmail ?? 'support@community-roots.app'

  const summary: DispatchSummary = {
    claimed: 0,
    sent: 0,
    transientFailures: 0,
    terminalFailures: 0,
    deadLettered: 0,
    skipped: 0,
    durationMs: 0,
    provider: provider.name,
  }

  // 1. Atomic claim via server-authoritative RPC
  const { data, error: claimError } = await supabase.rpc('claim_notification_outbox_batch', {
    p_batch_size: batchSize,
    p_max_attempts: maxAttempts,
  })

  if (claimError) {
    throw new Error(`Failed to claim notification outbox batch: ${claimError.message}`)
  }

  const rows = (Array.isArray(data) ? data : []) as ClaimedOutboxRow[]
  summary.claimed = rows.length

  if (rows.length === 0) {
    summary.durationMs = Date.now() - startTime
    return summary
  }

  // 2. Process each claimed item sequentially to respect rate limits and order
  for (const row of rows) {
    const rawEmail = row.recipient_email?.trim()

    // 2a. Validate recipient email address
    if (!rawEmail || !isValidEmail(rawEmail)) {
      summary.terminalFailures++
      const { data: newStatus } = await supabase.rpc('fail_notification_outbox_delivery', {
        p_outbox_id: row.outbox_id,
        p_error_message: !rawEmail
          ? 'Missing recipient email address'
          : `Invalid recipient email format: ${rawEmail.slice(0, 30)}`,
        p_is_terminal: true,
        p_retry_delay_seconds: retryDelaySeconds,
        p_max_attempts: maxAttempts,
      })
      if (newStatus === 'DEAD_LETTER') {
        summary.deadLettered++
      }
      continue
    }

    // 2b. Render data-minimized transactional notification email
    const rendered = renderNotificationEmail(row, {
      baseUrl: defaultBaseUrl,
      supportEmail,
    })

    // 2c. Send via configured provider
    const sendResult = await provider.sendEmail({
      to: {
        email: rawEmail,
        name: row.recipient_name,
      },
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {
        'X-Notification-ID': row.notification_id,
        'X-Outbox-ID': row.outbox_id,
        'X-Category': row.category,
      },
    })

    // 2d. Complete or Fail outbox item
    if (sendResult.success) {
      await supabase.rpc('complete_notification_outbox_delivery', {
        p_outbox_id: row.outbox_id,
      })
      summary.sent++
    } else {
      const isTerminal = Boolean(sendResult.isTerminal)
      if (isTerminal) {
        summary.terminalFailures++
      } else {
        summary.transientFailures++
      }

      const { data: newStatus } = await supabase.rpc('fail_notification_outbox_delivery', {
        p_outbox_id: row.outbox_id,
        p_error_message: sendResult.error || 'Provider dispatch failed',
        p_is_terminal: isTerminal,
        p_retry_delay_seconds: retryDelaySeconds,
        p_max_attempts: maxAttempts,
      })

      if (newStatus === 'DEAD_LETTER') {
        summary.deadLettered++
      }
    }
  }

  summary.durationMs = Date.now() - startTime
  return summary
}
