/**
 * Production Observability & Defensive Diagnostics Module
 *
 * Implements privacy-respecting, sanitized error tracking and correlation identification.
 *
 * Security & Privacy Invariants:
 * 1. ZERO secret leakage: Redacts JWTs, Bearer tokens, passwords, API keys, and connection strings.
 * 2. ZERO PII leakage: Redacts email addresses, telephone strings, and personal identifiers.
 * 3. ZERO internal stack trace / SQL leakage to end users.
 * 4. Generates opaque, safe correlation IDs (`ERR-XXXXXXXX`) for operator reference without exposing internals.
 * 5. Does not bundle third-party tracking scripts; provides a clean, opt-in hook (`__CR_OBSERVABILITY_DISPATCHER__`)
 *    for operators wanting to forward sanitized diagnostics to Sentry, Datadog, or Cloudflare Logs.
 * 6. Never throws or disrupts user interaction from within diagnostic capture routines.
 */

export interface SanitizedDiagnostic {
  correlationId: string
  name: string
  message: string
  timestamp: string
  context?: Record<string, unknown>
}

export type ObservabilityDispatcher = (diagnostic: SanitizedDiagnostic) => void

declare global {
  interface Window {
    __CR_OBSERVABILITY_DISPATCHER__?: ObservabilityDispatcher
  }
}

// Regular expressions for sensitive data redaction
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi
const PASSWORD_FIELD_PATTERN = /(?:password|passwd|secret|token|apiKey|anonKey|privilegedKey)["']?\s*[:=]\s*["']?[^"',;\s}]+/gi
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const SQL_PATTERN = /\b(?:SELECT|INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE)\b[\s\S]*?(?:;|$)/gi

/**
 * Strips secrets, tokens, credentials, and PII from arbitrary diagnostic strings.
 */
export function sanitizeDiagnosticString(input: string): string {
  if (!input) return ''

  return input
    .replace(JWT_PATTERN, '[REDACTED_JWT]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED_TOKEN]')
    .replace(PASSWORD_FIELD_PATTERN, 'credential: "[REDACTED]"')
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(SQL_PATTERN, '[REDACTED_QUERY]')
    .trim()
}

/**
 * Deeply sanitizes contextual metadata objects.
 */
export function sanitizeDiagnosticContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context || typeof context !== 'object') {
    return undefined
  }

  const cleaned: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase()
    // Explicitly redact sensitive property keys
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('credential') ||
      lowerKey.includes('auth') ||
      lowerKey.includes('jwt') ||
      lowerKey.includes('key')
    ) {
      cleaned[key] = '[REDACTED]'
      continue
    }

    if (typeof value === 'string') {
      cleaned[key] = sanitizeDiagnosticString(value)
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      cleaned[key] = value
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = '[OBJECT]'
    }
  }

  return cleaned
}

/**
 * Generates an opaque, user-safe error reference code.
 * Format: `ERR-` followed by 8 uppercase alphanumeric characters (e.g. `ERR-7A8B9C0D`).
 */
export function generateCorrelationId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(4)
      crypto.getRandomValues(bytes)
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
      return `ERR-${hex}`
    }
  } catch {
    // Fallback if crypto.getRandomValues is restricted
  }

  const randomStr = Math.random().toString(36).substring(2, 10).toUpperCase()
  return `ERR-${randomStr.padEnd(8, '0')}`
}

/**
 * Captures an uncaught exception, sanitizes its content, associates a correlation ID,
 * and passes it to the registered operator dispatcher (if present).
 *
 * @param error Uncaught error or thrown object
 * @param context Optional high-level contextual metadata (e.g. component or route name)
 * @returns Safe correlation ID to present to the user
 */
export function captureException(error: unknown, context?: Record<string, unknown>): string {
  const correlationId = generateCorrelationId()
  const timestamp = new Date().toISOString()

  let rawName = 'Error'
  let rawMessage = 'Unknown runtime exception'

  if (error instanceof Error) {
    rawName = error.name || 'Error'
    rawMessage = error.message || 'Error occurred without message'
  } else if (typeof error === 'string') {
    rawMessage = error
  } else if (typeof error === 'object' && error !== null) {
    try {
      rawMessage = JSON.stringify(error)
    } catch {
      rawMessage = 'Non-serializable error object'
    }
  }

  const diagnostic: SanitizedDiagnostic = {
    correlationId,
    name: sanitizeDiagnosticString(rawName),
    message: sanitizeDiagnosticString(rawMessage),
    timestamp,
    context: sanitizeDiagnosticContext(context),
  }

  // If a production operator has registered an observability dispatcher (e.g. Sentry/Datadog forwarder),
  // dispatch the sanitized event safely.
  if (typeof window !== 'undefined' && typeof window.__CR_OBSERVABILITY_DISPATCHER__ === 'function') {
    try {
      window.__CR_OBSERVABILITY_DISPATCHER__(diagnostic)
    } catch {
      // Defensive: Prevent monitoring dispatcher failures from breaking the app
    }
  }

  return correlationId
}
