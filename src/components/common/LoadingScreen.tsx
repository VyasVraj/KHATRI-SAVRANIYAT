/**
 * Full-screen loading screen
 * Used during initial auth state resolution and page transitions.
 */

import { Loader2 } from 'lucide-react'
import { BrandLogo } from './BrandLogo'

interface LoadingScreenProps {
  message?: string
}

export function LoadingScreen({ message = 'Loading…' }: LoadingScreenProps) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-navy-950 text-white"
      role="status"
      aria-label={message}
    >
      <div className="mb-5 flex flex-col items-center gap-3 animate-in fade-in duration-300">
        <BrandLogo size="lg" priority />
        <span className="text-xl font-bold tracking-tight text-white">KHATRI SARVANIYAT</span>
      </div>
      <Loader2 className="h-7 w-7 animate-spin text-brand-400" />
      <p className="mt-3 text-sm text-navy-300">{message}</p>
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
