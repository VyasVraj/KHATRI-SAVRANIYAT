/**
 * General utility functions
 *
 * Only pure, reusable utilities belong here.
 * Domain-specific utilities belong in their feature directory.
 */

/**
 * Format a date as a relative string ("3 days ago", "just now")
 * Uses date-fns for consistency
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Generate initials from a name (e.g. "John Doe" → "JD")
 */
export function getInitials(name: string, maxChars = 2): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, maxChars)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Convert an object to URLSearchParams for query strings
 */
export function toSearchParams(params: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      sp.set(key, String(value))
    }
  }
  return sp
}

/**
 * Safe JSON parse — returns null on failure instead of throwing
 */
export function safeJsonParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}
