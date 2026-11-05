/**
 * Full-screen loading screen
 * Used during initial auth state resolution and page transitions.
 */

import { Loader2 } from 'lucide-react'

interface LoadingScreenProps {
  message?: string
}

export function LoadingScreen({ message = 'Loading…' }: LoadingScreenProps) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-white"
      role="status"
      aria-label={message}
    >
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      <p className="mt-3 text-sm text-navy-500">{message}</p>
    </div>
  )
}

/**
 * Inline spinner — for use inside components (e.g., data loading states)
 */
export function InlineSpinner({ className = '' }: { className?: string }) {
  return (
    <span role="status" aria-label="Loading">
      <Loader2 className={`animate-spin ${className || 'h-4 w-4 text-brand-600'}`} />
    </span>
  )
}
