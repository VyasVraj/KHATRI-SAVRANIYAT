/**
 * Unit tests for Observability and Error Sanitization Module (Phase 16 Subtask 5)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  sanitizeDiagnosticString,
  sanitizeDiagnosticContext,
  generateCorrelationId,
  captureException,
} from '@/lib/observability'

describe('Observability Module & Defensive Sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete window.__CR_OBSERVABILITY_DISPATCHER__
  })

  afterEach(() => {
    delete window.__CR_OBSERVABILITY_DISPATCHER__
  })

  describe('sanitizeDiagnosticString', () => {
    it('redacts JWT tokens', () => {
      const raw = 'Authorization failed for token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature'
      const sanitized = sanitizeDiagnosticString(raw)

      expect(sanitized).not.toContain('eyJhbGci')
      expect(sanitized).not.toContain('doNotLeakThisSignature')
      expect(sanitized).toContain('[REDACTED_JWT]')
    })

    it('redacts Bearer tokens', () => {
      const raw = 'Request header contained Bearer secret-token-xyz-1234567890'
      const sanitized = sanitizeDiagnosticString(raw)

      expect(sanitized).not.toContain('secret-token-xyz')
      expect(sanitized).toContain('Bearer [REDACTED_TOKEN]')
    })

    it('redacts credentials and passwords', () => {
      const raw = 'Connection error with password="SuperSecretPassword123!" and token: "abc-987"'
      const sanitized = sanitizeDiagnosticString(raw)

      expect(sanitized).not.toContain('SuperSecretPassword123!')
      expect(sanitized).toContain('credential: "[REDACTED]"')
    })

    it('redacts email addresses', () => {
      const raw = 'Failed to invite user test.user@communityroots.org to family'
      const sanitized = sanitizeDiagnosticString(raw)

      expect(sanitized).not.toContain('test.user@communityroots.org')
      expect(sanitized).toContain('[REDACTED_EMAIL]')
    })

    it('redacts raw SQL queries', () => {
      const raw = 'Query failed: SELECT id, full_name, private_notes FROM persons WHERE family_id = 42;'
      const sanitized = sanitizeDiagnosticString(raw)

      expect(sanitized).not.toContain('SELECT id, full_name')
      expect(sanitized).not.toContain('private_notes')
      expect(sanitized).toContain('[REDACTED_QUERY]')
    })

    it('handles empty or non-sensitive input safely', () => {
      expect(sanitizeDiagnosticString('')).toBe('')
      expect(sanitizeDiagnosticString('Network connection reset by peer')).toBe('Network connection reset by peer')
    })
  })

  describe('sanitizeDiagnosticContext', () => {
    it('redacts sensitive object keys completely', () => {
      const context = {
        component: 'PersonDetailPage',
        authToken: 'sensitive_jwt_token',
        userPassword: 'password123',
        retryCount: 3,
        isOnline: true,
      }

      const cleaned = sanitizeDiagnosticContext(context)

      expect(cleaned?.['component']).toBe('PersonDetailPage')
      expect(cleaned?.['authToken']).toBe('[REDACTED]')
      expect(cleaned?.['userPassword']).toBe('[REDACTED]')
      expect(cleaned?.['retryCount']).toBe(3)
      expect(cleaned?.['isOnline']).toBe(true)
    })

    it('handles undefined or invalid context', () => {
      expect(sanitizeDiagnosticContext(undefined)).toBeUndefined()
    })
  })

  describe('generateCorrelationId', () => {
    it('generates a valid, non-sensitive ERR- prefixed correlation ID', () => {
      const id1 = generateCorrelationId()
      const id2 = generateCorrelationId()

      expect(id1).toMatch(/^ERR-[A-Z0-9]{8}$/)
      expect(id2).toMatch(/^ERR-[A-Z0-9]{8}$/)
      expect(id1).not.toBe(id2)
    })
  })

  describe('captureException', () => {
    it('returns an opaque correlation ID and does not throw', () => {
      const error = new Error('Unexpected display layout crash')
      const correlationId = captureException(error, { view: 'FamilyTreeCanvas' })

      expect(correlationId).toMatch(/^ERR-[A-Z0-9]{8}$/)
    })

    it('dispatches sanitized diagnostic to registered operator dispatcher', () => {
      const dispatcherMock = vi.fn()
      window.__CR_OBSERVABILITY_DISPATCHER__ = dispatcherMock

      const sensitiveError = new Error('Failed to fetch user john.doe@example.com with Bearer secret-tok-123')
      const refId = captureException(sensitiveError, { component: 'ProfilePage', token: 'secret' })

      expect(dispatcherMock).toHaveBeenCalledTimes(1)
      const callArg = dispatcherMock.mock.calls[0]![0]

      expect(callArg.correlationId).toBe(refId)
      expect(callArg.message).toContain('[REDACTED_EMAIL]')
      expect(callArg.message).toContain('Bearer [REDACTED_TOKEN]')
      expect(callArg.message).not.toContain('john.doe@example.com')
      expect(callArg.message).not.toContain('secret-tok-123')
      expect(callArg.context.component).toBe('ProfilePage')
      expect(callArg.context.token).toBe('[REDACTED]')
    })

    it('safely catches errors thrown by operator dispatcher without crashing caller', () => {
      window.__CR_OBSERVABILITY_DISPATCHER__ = () => {
        throw new Error('Sentry network error')
      }

      expect(() => {
        const id = captureException(new Error('Simple error'))
        expect(id).toMatch(/^ERR-/)
      }).not.toThrow()
    })
  })
})
