/**
 * RSVP Button Group Component (Phase 10 — Subtask 3)
 *
 * Interactive attendance declaration with guest count and capacity awareness.
 */

import React, { useState } from 'react'
import type { EventRsvpStatus } from '../types'
import { Check, HelpCircle, X, Users, Loader2 } from 'lucide-react'
import { useLanguage } from '@/features/i18n'

interface RsvpButtonGroupProps {
  currentStatus: EventRsvpStatus | null
  currentGuestCount?: number
  currentNotes?: string | null
  capacity: number | null
  bookedSeats: number
  isEventPast: boolean
  isCancelled: boolean
  isLoading?: boolean
  onRsvp: (status: EventRsvpStatus, guestCount: number, notes?: string) => Promise<void>
}

export function RsvpButtonGroup({
  currentStatus,
  currentGuestCount = 0,
  currentNotes = null,
  capacity,
  bookedSeats,
  isEventPast,
  isCancelled,
  isLoading = false,
  onRsvp,
}: RsvpButtonGroupProps) {
  const { t } = useLanguage()
  const [showOptions, setShowOptions] = useState(false)
  const [guestCount, setGuestCount] = useState<number>(currentGuestCount)
  const [notes, setNotes] = useState<string>(currentNotes || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isFull = capacity !== null && bookedSeats >= capacity && currentStatus !== 'GOING'
  const isDisabled = isEventPast || isCancelled || isLoading || isSubmitting

  const handleStatusClick = async (status: EventRsvpStatus) => {
    if (isDisabled) return

    if (status === 'GOING') {
      setShowOptions(true)
    } else {
      setShowOptions(false)
      setIsSubmitting(true)
      try {
        await onRsvp(status, 0, undefined)
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const handleConfirmGoing = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isDisabled) return

    setIsSubmitting(true)
    try {
      await onRsvp('GOING', guestCount, notes.trim() || undefined)
      setShowOptions(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* 3-way toggle button group */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="RSVP declaration">
        <button
          type="button"
          disabled={isDisabled || isFull}
          onClick={() => handleStatusClick('GOING')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 ${
            currentStatus === 'GOING'
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500'
              : 'border border-border bg-background text-foreground hover:bg-muted'
          }`}
        >
          <Check className="h-3.5 w-3.5" />
          <span>
            {t('community.rsvp_going', 'Going')}
            {currentStatus === 'GOING' && currentGuestCount > 0 ? ` (+${currentGuestCount})` : ''}
          </span>
        </button>

        <button
          type="button"
          disabled={isDisabled}
          onClick={() => handleStatusClick('MAYBE')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${
            currentStatus === 'MAYBE'
              ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500'
              : 'border border-border bg-background text-foreground hover:bg-muted'
          }`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span>{t('community.rsvp_maybe', 'Maybe')}</span>
        </button>

        <button
          type="button"
          disabled={isDisabled}
          onClick={() => handleStatusClick('NOT_GOING')}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50 ${
            currentStatus === 'NOT_GOING'
              ? 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500'
              : 'border border-border bg-background text-foreground hover:bg-muted'
          }`}
        >
          <X className="h-3.5 w-3.5" />
          <span>{t('community.rsvp_not_going', "Can't Go")}</span>
        </button>

        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Guest count and notes options panel when "Going" is active or being edited */}
      {(showOptions || (currentStatus === 'GOING' && !isEventPast && !isCancelled)) && (
        <form
          onSubmit={handleConfirmGoing}
          className="rounded-lg border border-border bg-muted/40 p-3 space-y-3 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="rsvp-guest-count" className="font-medium text-foreground flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              {t('community.rsvp_additional_guests', 'Additional Guests (Family/Friends):')}
            </label>
            <select
              id="rsvp-guest-count"
              disabled={isDisabled}
              value={guestCount}
              onChange={(e) => setGuestCount(Number(e.target.value))}
              className="min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'None (Just me)' : `+${n} guest${n > 1 ? 's' : ''}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <input
              type="text"
              id="rsvp-notes"
              disabled={isDisabled}
              placeholder="Special notes for organizers (optional, e.g. dietary or seating)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
              className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {showOptions && (
              <button
                type="button"
                onClick={() => setShowOptions(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isDisabled}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save RSVP
            </button>
          </div>
        </form>
      )}

      {/* Descriptive status messages */}
      {isCancelled && (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">
          This event has been cancelled. Registrations are closed.
        </p>
      )}
      {isEventPast && !isCancelled && (
        <p className="text-xs text-muted-foreground">
          This event has concluded. Registrations are closed.
        </p>
      )}
      {isFull && !isEventPast && !isCancelled && (
        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
          Capacity is full for this event.
        </p>
      )}
    </div>
  )
}
