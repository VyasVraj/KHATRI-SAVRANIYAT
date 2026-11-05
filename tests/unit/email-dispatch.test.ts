/**
 * Unit Tests: Email Templates, Providers & Outbox Dispatcher
 *
 * Phase 12 — Subtask 4: Notification Preferences UI & Email Dispatch Infrastructure
 */

import { describe, it, expect, vi } from 'vitest'
import {
  renderNotificationEmail,
} from '../../supabase/functions/dispatch-notification-emails/email-templates'
import {
  MockEmailProvider,
  UnconfiguredEmailProvider,
  ResendEmailProvider,
  createEmailProvider,
} from '../../supabase/functions/dispatch-notification-emails/email-provider'
import {
  dispatchNotificationBatch,
  type ISupabaseRpcClient,
} from '../../supabase/functions/dispatch-notification-emails/dispatcher'
import {
  handleRequest,
} from '../../supabase/functions/dispatch-notification-emails/index'
import type { ClaimedOutboxRow } from '../../supabase/functions/dispatch-notification-emails/types'

describe('Email Templates & Data Minimization', () => {
  const sampleRow: ClaimedOutboxRow = {
    outbox_id: 'outbox-1',
    notification_id: 'notif-1',
    recipient_id: 'user-1',
    channel: 'EMAIL',
    attempts: 0,
    recipient_email: 'aarav.sharma@example.com',
    recipient_name: 'Aarav Sharma',
    title: 'New Connection Request',
    body: 'Priya Patel requested to connect with your family profile.',
    action_url: '/connections',
    category: 'CONNECTION',
    notification_type: 'connection_request',
  }

  it('renders transactional email with proper escaping and greeting', () => {
    const rendered = renderNotificationEmail(sampleRow, {
      baseUrl: 'https://community-roots.app',
      supportEmail: 'support@community-roots.app',
    })

    expect(rendered.subject).toBe('[Community Roots] New Connection Request')
    expect(rendered.html).toContain('Hello Aarav Sharma,')
    expect(rendered.html).toContain('New Connection Request')
    expect(rendered.html).toContain('Priya Patel requested to connect')
    expect(rendered.html).toContain('https://community-roots.app/connections')
    expect(rendered.html).toContain('https://community-roots.app/settings/notifications')
  })

  it('escapes special characters to prevent HTML injection', () => {
    const maliciousRow: ClaimedOutboxRow = {
      ...sampleRow,
      title: '<script>alert("xss")</script>',
      body: 'Hello <b>World</b> & <friends>',
      recipient_name: 'Bob <Admin>',
    }

    const rendered = renderNotificationEmail(maliciousRow)
    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    expect(rendered.html).toContain('Bob &lt;Admin&gt;')
    expect(rendered.html).toContain('&amp; &lt;friends&gt;')
  })

  it('generates consistent plain text representation', () => {
    const rendered = renderNotificationEmail(sampleRow)
    expect(rendered.text).toContain('COMMUNITY ROOTS')
    expect(rendered.text).toContain('Hello Aarav Sharma,')
    expect(rendered.text).toContain('New Connection Request')
    expect(rendered.text).toContain('/connections')
    expect(rendered.text).toContain('/settings/notifications')
  })

  it('preserves absolute URLs and handles missing action URLs cleanly', () => {
    const noAction = renderNotificationEmail({ ...sampleRow, action_url: null })
    expect(noAction.html).not.toContain('View in Community Roots')
    expect(noAction.text).not.toContain('View details:')

    const absoluteAction = renderNotificationEmail({
      ...sampleRow,
      action_url: 'https://external.community-roots.app/special-page',
    })
    expect(absoluteAction.html).toContain('https://external.community-roots.app/special-page')
  })
})

describe('Email Providers', () => {
  it('MockEmailProvider records sent messages and returns success', async () => {
    const mock = new MockEmailProvider()
    expect(mock.isConfigured()).toBe(true)

    const result = await mock.sendEmail({
      to: { email: 'test@example.com', name: 'Test User' },
      subject: 'Test Subject',
      html: '<p>Test</p>',
      text: 'Test',
    })

    expect(result.success).toBe(true)
    expect(result.messageId).toBeDefined()
    expect(mock.sentMessages).toHaveLength(1)
    expect(mock.sentMessages[0].to.email).toBe('test@example.com')
  })

  it('MockEmailProvider simulates transient vs terminal errors correctly', async () => {
    const transientMock = new MockEmailProvider({
      simulateFailure: true,
      simulateTerminal: false,
      failureMessage: 'Temporary rate limit',
    })
    const resTransient = await transientMock.sendEmail({
      to: { email: 'test@example.com' },
      subject: 'Test',
      html: '',
      text: '',
    })
    expect(resTransient.success).toBe(false)
    expect(resTransient.isTerminal).toBe(false)
    expect(resTransient.statusCode).toBe(500)

    const terminalMock = new MockEmailProvider({
      simulateFailure: true,
      simulateTerminal: true,
      failureMessage: 'Email address does not exist',
    })
    const resTerminal = await terminalMock.sendEmail({
      to: { email: 'test@example.com' },
      subject: 'Test',
      html: '',
      text: '',
    })
    expect(resTerminal.success).toBe(false)
    expect(resTerminal.isTerminal).toBe(true)
    expect(resTerminal.statusCode).toBe(400)
  })

  it('UnconfiguredEmailProvider flags unconfigured status gracefully', async () => {
    const unconfigured = new UnconfiguredEmailProvider()
    expect(unconfigured.isConfigured()).toBe(false)

    const res = await unconfigured.sendEmail({
      to: { email: 'test@example.com' },
      subject: 'Test',
      html: '',
      text: '',
    })
    expect(res.success).toBe(false)
    expect(res.isTerminal).toBe(false)
    expect(res.error).toContain('unconfigured')
  })

  it('createEmailProvider factory selects proper implementation based on environment', () => {
    const emptyProvider = createEmailProvider({})
    expect(emptyProvider.name).toBe('unconfigured')

    const resendProvider = createEmailProvider({ RESEND_API_KEY: 're_test_key_123' })
    expect(resendProvider.name).toBe('resend')
    expect(resendProvider.isConfigured()).toBe(true)
  })

  it('ResendEmailProvider classifies 200, 400, 429, and 500 correctly', async () => {
    const originalFetch = globalThis.fetch

    try {
      // 1. Success 200
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'resend_msg_123' }),
      } as Response)

      const provider = new ResendEmailProvider('re_key_123')
      const successRes = await provider.sendEmail({
        to: { email: 'user@example.com' },
        subject: 'Sub',
        html: '',
        text: '',
      })
      expect(successRes.success).toBe(true)
      expect(successRes.messageId).toBe('resend_msg_123')

      // 2. Terminal 422 Unprocessable (e.g. invalid domain)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ message: 'Domain not verified' }),
      } as Response)
      const terminalRes = await provider.sendEmail({
        to: { email: 'user@example.com' },
        subject: 'Sub',
        html: '',
        text: '',
      })
      expect(terminalRes.success).toBe(false)
      expect(terminalRes.isTerminal).toBe(true)

      // 3. Transient 429 Rate Limited
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ message: 'Too many requests' }),
      } as Response)
      const rateLimitRes = await provider.sendEmail({
        to: { email: 'user@example.com' },
        subject: 'Sub',
        html: '',
        text: '',
      })
      expect(rateLimitRes.success).toBe(false)
      expect(rateLimitRes.isTerminal).toBe(false)

      // 4. Network error
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('DNS resolution timeout'))
      const networkRes = await provider.sendEmail({
        to: { email: 'user@example.com' },
        subject: 'Sub',
        html: '',
        text: '',
      })
      expect(networkRes.success).toBe(false)
      expect(networkRes.isTerminal).toBe(false)
      expect(networkRes.error).toContain('DNS resolution timeout')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('Outbox Dispatcher Orchestration', () => {
  it('returns claimed: 0 when outbox has no pending items', async () => {
    const mockRpc: ISupabaseRpcClient = {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const provider = new MockEmailProvider()

    const summary = await dispatchNotificationBatch({
      supabase: mockRpc,
      provider,
    })

    expect(summary.claimed).toBe(0)
    expect(summary.sent).toBe(0)
    expect(mockRpc.rpc).toHaveBeenCalledWith('claim_notification_outbox_batch', {
      p_batch_size: 10,
      p_max_attempts: 3,
    })
  })

  it('validates recipient emails and fails invalid addresses with terminal flag', async () => {
    const rpcMock = vi.fn().mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (fn === 'claim_notification_outbox_batch') {
        return Promise.resolve({
          data: [
            {
              outbox_id: 'bad-1',
              notification_id: 'n-1',
              recipient_id: 'u-1',
              channel: 'EMAIL',
              attempts: 0,
              recipient_email: 'not-an-email',
              recipient_name: 'Bad Email',
              title: 'Title',
              body: 'Body',
              action_url: null,
              category: 'COMMUNITY',
              notification_type: 'announcement',
            },
            {
              outbox_id: 'bad-2',
              notification_id: 'n-2',
              recipient_id: 'u-2',
              channel: 'EMAIL',
              attempts: 2,
              recipient_email: null, // completely missing
              recipient_name: 'Missing Email',
              title: 'Title',
              body: 'Body',
              action_url: null,
              category: 'COMMUNITY',
              notification_type: 'announcement',
            },
          ],
          error: null,
        })
      }
      if (fn === 'fail_notification_outbox_delivery') {
        const isDeadLetter = args.p_outbox_id === 'bad-2'
        return Promise.resolve({
          data: isDeadLetter ? 'DEAD_LETTER' : 'FAILED',
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    const mockRpc: ISupabaseRpcClient = { rpc: rpcMock }
    const provider = new MockEmailProvider()

    const summary = await dispatchNotificationBatch({
      supabase: mockRpc,
      provider,
    })

    expect(summary.claimed).toBe(2)
    expect(summary.terminalFailures).toBe(2)
    expect(summary.deadLettered).toBe(1)
    expect(provider.sentMessages).toHaveLength(0) // No emails sent for invalid addresses
  })

  it('dispatches valid messages, calls complete RPC on success and tracks metrics', async () => {
    const rpcMock = vi.fn().mockImplementation((fn: string) => {
      if (fn === 'claim_notification_outbox_batch') {
        return Promise.resolve({
          data: [
            {
              outbox_id: 'good-1',
              notification_id: 'n-1',
              recipient_id: 'u-1',
              channel: 'EMAIL',
              attempts: 0,
              recipient_email: 'valid.user@example.com',
              recipient_name: 'Valid User',
              title: 'Welcome',
              body: 'Welcome to the platform.',
              action_url: '/community',
              category: 'COMMUNITY',
              notification_type: 'announcement',
            },
          ],
          error: null,
        })
      }
      if (fn === 'complete_notification_outbox_delivery') {
        return Promise.resolve({ data: true, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })

    const mockRpc: ISupabaseRpcClient = { rpc: rpcMock }
    const provider = new MockEmailProvider()

    const summary = await dispatchNotificationBatch({
      supabase: mockRpc,
      provider,
    })

    expect(summary.claimed).toBe(1)
    expect(summary.sent).toBe(1)
    expect(summary.transientFailures).toBe(0)
    expect(summary.terminalFailures).toBe(0)
    expect(provider.sentMessages).toHaveLength(1)
    expect(provider.sentMessages[0].to.email).toBe('valid.user@example.com')
    expect(rpcMock).toHaveBeenCalledWith('complete_notification_outbox_delivery', {
      p_outbox_id: 'good-1',
    })
  })

  it('handles provider failures and routes to fail_notification_outbox_delivery', async () => {
    const rpcMock = vi.fn().mockImplementation((fn: string) => {
      if (fn === 'claim_notification_outbox_batch') {
        return Promise.resolve({
          data: [
            {
              outbox_id: 'fail-1',
              notification_id: 'n-1',
              recipient_id: 'u-1',
              channel: 'EMAIL',
              attempts: 1,
              recipient_email: 'user@example.com',
              recipient_name: 'User',
              title: 'Event Update',
              body: 'Event location has changed.',
              action_url: '/community',
              category: 'EVENT',
              notification_type: 'event_updated',
            },
          ],
          error: null,
        })
      }
      if (fn === 'fail_notification_outbox_delivery') {
        return Promise.resolve({ data: 'FAILED', error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })

    const mockRpc: ISupabaseRpcClient = { rpc: rpcMock }
    const failingProvider = new MockEmailProvider({
      simulateFailure: true,
      simulateTerminal: false,
      failureMessage: 'Connection reset by peer',
    })

    const summary = await dispatchNotificationBatch({
      supabase: mockRpc,
      provider: failingProvider,
    })

    expect(summary.claimed).toBe(1)
    expect(summary.sent).toBe(0)
    expect(summary.transientFailures).toBe(1)
    expect(rpcMock).toHaveBeenCalledWith('fail_notification_outbox_delivery', {
      p_outbox_id: 'fail-1',
      p_error_message: 'Connection reset by peer',
      p_is_terminal: false,
      p_retry_delay_seconds: 300,
      p_max_attempts: 3,
    })
  })
})

describe('Edge Function Request Handler', () => {
  it('handles OPTIONS preflight with CORS headers', async () => {
    const req = new Request('https://edge.supabase.com/functions/v1/dispatch-notification-emails', {
      method: 'OPTIONS',
    })

    const res = await handleRequest(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('rejects unauthorized requests with 401', async () => {
    const req = new Request('https://edge.supabase.com/functions/v1/dispatch-notification-emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid_token',
      },
    })

    const res = await handleRequest(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toContain('Unauthorized')
  })
})
