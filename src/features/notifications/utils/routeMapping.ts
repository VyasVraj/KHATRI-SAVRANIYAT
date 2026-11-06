/**
 * Safely resolves notification action URLs to existing frontend routes.
 *
 * Prevents 404 Page Not Found errors when notifications point to legacy
 * or administrative paths (such as /claims -> /admin/claims).
 */

export function resolveNotificationRoute(actionUrl: string | null | undefined): string | null {
  if (!actionUrl) return null
  const trimmed = actionUrl.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return null
  }

  // Admin claims review queue
  if (trimmed === '/claims' || trimmed.startsWith('/claims/')) {
    return '/admin/claims'
  }

  // Admin verifications review queue
  if (
    trimmed === '/verification' ||
    trimmed.startsWith('/verification/') ||
    trimmed === '/verifications' ||
    trimmed.startsWith('/verifications/')
  ) {
    return '/admin/verifications'
  }

  // Community groups & events
  if (trimmed.startsWith('/community/groups')) {
    return '/community'
  }
  if (trimmed.startsWith('/community/events')) {
    return '/community?tab=events'
  }

  // Family media and history
  if (trimmed.startsWith('/family/media') || trimmed.startsWith('/family/history')) {
    return '/families'
  }

  return trimmed
}
