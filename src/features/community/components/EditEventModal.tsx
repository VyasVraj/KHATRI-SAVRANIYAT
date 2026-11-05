/**
 * Edit Event Modal Component (Phase 10 — Subtask 3)
 */

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  updateEventSchema,
  EVENT_TYPES,
  EVENT_STATUSES,
  type UpdateEventFormData,
} from '../schemas/event.schemas'
import type { CommunityEvent, UpdateEventInput } from '../types'
import { X, Calendar, Loader2 } from 'lucide-react'

interface EditEventModalProps {
  event: CommunityEvent | null
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: UpdateEventInput) => Promise<void>
  isLoading?: boolean
}

function toLocalDatetimeString(isoString: string | null | undefined): string {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EditEventModal({
  event,
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}: EditEventModalProps) {
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateEventFormData>({
    resolver: zodResolver(updateEventSchema),
  })

  useEffect(() => {
    if (isOpen && event) {
      reset({
        id: event.id,
        title: event.title,
        description: event.description || '',
        event_type: event.event_type,
        start_time: toLocalDatetimeString(event.start_time),
        end_time: toLocalDatetimeString(event.end_time) || null,
        location: event.location || '',
        location_url: event.location_url || null,
        capacity: event.capacity,
        status: event.status,
        is_pinned: event.is_pinned,
      })
      setFormError(null)
    }
  }, [isOpen, event, reset])

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

  const handleFormSubmit = async (data: UpdateEventFormData) => {
    setFormError(null)
    try {
      await onSubmit({
        ...data,
        start_time: new Date(data.start_time).toISOString(),
        end_time: data.end_time ? new Date(data.end_time).toISOString() : null,
        capacity: data.capacity ? Number(data.capacity) : null,
      })
      onClose()
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to update community event.'
      )
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-event-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h2 id="edit-event-modal-title" className="text-lg font-semibold text-foreground">
              Edit Community Event
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 text-xs">
          {/* Title */}
          <div>
            <label htmlFor="edit-event-title" className="font-medium text-foreground block mb-1">
              Event Title <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-event-title"
              type="text"
              disabled={isLoading}
              {...register('title')}
              className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {errors.title && (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Event Type & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-event-type" className="font-medium text-foreground block mb-1">
                Event Type <span className="text-red-500">*</span>
              </label>
              <select
                id="edit-event-type"
                disabled={isLoading}
                {...register('event_type')}
                className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0) + type.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-event-status" className="font-medium text-foreground block mb-1">
                Status <span className="text-red-500">*</span>
              </label>
              <select
                id="edit-event-status"
                disabled={isLoading}
                {...register('status')}
                className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {EVENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Start Time & End Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-event-start-time" className="font-medium text-foreground block mb-1">
                Start Date & Time <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-event-start-time"
                type="datetime-local"
                disabled={isLoading}
                {...register('start_time')}
                className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {errors.start_time && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                  {errors.start_time.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="edit-event-end-time" className="font-medium text-foreground block mb-1">
                End Date & Time (Optional)
              </label>
              <input
                id="edit-event-end-time"
                type="datetime-local"
                disabled={isLoading}
                {...register('end_time')}
                className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {errors.end_time && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                  {errors.end_time.message}
                </p>
              )}
            </div>
          </div>

          {/* Venue Location & Location URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-event-location" className="font-medium text-foreground block mb-1">
                Venue Location (Optional)
              </label>
              <input
                id="edit-event-location"
                type="text"
                disabled={isLoading}
                {...register('location')}
                className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="edit-event-location-url" className="font-medium text-foreground block mb-1">
                Map Link or Virtual URL (Optional)
              </label>
              <input
                id="edit-event-location-url"
                type="url"
                disabled={isLoading}
                {...register('location_url')}
                className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>

          {/* Capacity */}
          <div>
            <label htmlFor="edit-event-capacity" className="font-medium text-foreground block mb-1">
              Attendee Capacity (Optional)
            </label>
            <input
              id="edit-event-capacity"
              type="number"
              min={1}
              disabled={isLoading}
              placeholder="Leave blank for unlimited capacity"
              {...register('capacity', {
                setValueAs: (v) => (v === '' ? null : Number(v)),
              })}
              className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {errors.capacity && (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                {errors.capacity.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="edit-event-description" className="font-medium text-foreground block mb-1">
              Detailed Description (Optional)
            </label>
            <textarea
              id="edit-event-description"
              rows={4}
              disabled={isLoading}
              {...register('description')}
              className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {/* Pinned Checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit-event-is-pinned"
              disabled={isLoading}
              {...register('is_pinned')}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <label htmlFor="edit-event-is-pinned" className="font-medium text-foreground cursor-pointer">
              Pin event to top of feed & calendar
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
