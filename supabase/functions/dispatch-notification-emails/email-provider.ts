/**
 * Email Provider Abstraction & Implementations
 *
 * Phase 12 — Subtask 4: Notification Preferences UI & Email Dispatch Infrastructure
 *
 * Implements:
 * - ResendEmailProvider: Production transactional provider
 * - MockEmailProvider: In-memory simulation for unit & integration testing
 * - UnconfiguredEmailProvider: Graceful, safe fallback when credentials are not configured
 */

import type { IEmailProvider, EmailMessage, SendEmailResult } from './types.ts'

export class ResendEmailProvider implements IEmailProvider {
  name = 'resend'
  private apiKey: string
  private fromAddress: string

  constructor(apiKey: string, fromAddress = 'Community Roots <notifications@community-roots.app>') {
    this.apiKey = apiKey
    this.fromAddress = fromAddress
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0)
  }

  async sendEmail(message: EmailMessage): Promise<SendEmailResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        isTerminal: false,
        error: 'Resend API key is missing or empty',
      }
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: message.to.name ? `${message.to.name} <${message.to.email}>` : message.to.email,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: message.headers,
        }),
      })

      const status = response.status
      let data: Record<string, unknown> = {}
      try {
        data = await response.json()
      } catch {
        // Non-JSON response
      }

      if (response.ok) {
        return {
          success: true,
          messageId: typeof data.id === 'string' ? data.id : undefined,
          statusCode: status,
        }
      }

      // Determine whether error is terminal or transient
      // 4xx errors (client errors like 400 Bad Request, 422 Unprocessable Entity) are generally terminal
      // 429 Too Many Requests and 5xx Server Errors are transient
      const isTerminal = status >= 400 && status < 500 && status !== 429
      const errorMessage = typeof data.message === 'string' ? data.message : `HTTP ${status}: ${response.statusText}`

      return {
        success: false,
        isTerminal,
        error: errorMessage,
        statusCode: status,
      }
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Network failure during email dispatch'
      return {
        success: false,
        isTerminal: false, // Network exceptions are transient
        error: errMessage,
      }
    }
  }
}

export class MockEmailProvider implements IEmailProvider {
  name = 'mock'
  sentMessages: EmailMessage[] = []
  private simulateFailure: boolean
  private simulateTerminal: boolean
  private failureMessage: string

  constructor(options?: {
    simulateFailure?: boolean
    simulateTerminal?: boolean
    failureMessage?: string
  }) {
    this.simulateFailure = options?.simulateFailure ?? false
    this.simulateTerminal = options?.simulateTerminal ?? false
    this.failureMessage = options?.failureMessage ?? 'Simulated dispatch failure'
  }

  isConfigured(): boolean {
    return true
  }

  async sendEmail(message: EmailMessage): Promise<SendEmailResult> {
    if (this.simulateFailure) {
      return {
        success: false,
        isTerminal: this.simulateTerminal,
        error: this.failureMessage,
        statusCode: this.simulateTerminal ? 400 : 500,
      }
    }

    this.sentMessages.push(message)
    return {
      success: true,
      messageId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      statusCode: 200,
    }
  }

  clear(): void {
    this.sentMessages = []
  }
}

export class UnconfiguredEmailProvider implements IEmailProvider {
  name = 'unconfigured'

  isConfigured(): boolean {
    return false
  }

  async sendEmail(_message: EmailMessage): Promise<SendEmailResult> {
    return {
      success: false,
      isTerminal: false,
      error: 'Email delivery provider is unconfigured. Set RESEND_API_KEY in environment to enable email delivery.',
    }
  }
}

export function createEmailProvider(env: Record<string, string | undefined>): IEmailProvider {
  const resendApiKey = env.RESEND_API_KEY
  const fromEmail = env.NOTIFICATION_FROM_EMAIL || 'Community Roots <notifications@community-roots.app>'

  if (resendApiKey && resendApiKey.trim().length > 0) {
    return new ResendEmailProvider(resendApiKey, fromEmail)
  }

  return new UnconfiguredEmailProvider()
}
