/**
 * Cancel Event Modal Component (Phase 10 — Subtask 3)
 */

import { useState, useEffect, type FormEvent } from 'react'
import type { CommunityEvent } from '../types'
import { AlertCircle, X, Loader2 } from 'lucide-react'

interface CancelEventModalProps {
  event: CommunityEvent | null
  isOpen: boolean
  onClose: () => void
  onConfirm: (eventId: string, reason: string) => Promise<void>
}

export function CancelEventModal({
  event,
  isOpen,
  onClose,
  onConfirm,
}: CancelEventModalProps) {
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !event) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      await onConfirm(event.id, reason)
      onClose()
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to cancel the event.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-event-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
            <h2 id="cancel-event-title" className="text-lg font-semibold text-foreground">
              Cancel Community Event
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Are you sure you want to cancel <strong className="text-foreground">{event.title}</strong>? All registered attendees will see that the event has been called off.
        </p>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="cancellation-reason" className="text-xs font-medium text-foreground">
                Reason for cancellation (optional):
              </label>
              <span className="text-[11px] text-muted-foreground">{reason.length}/1000</span>
            </div>
            <textarea
              id="cancellation-reason"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Due to unforeseen weather conditions, the outdoor sports meet is cancelled..."
              className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Keep Event
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm Cancellation
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
