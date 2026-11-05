/**
 * Create Event Modal Component (Phase 10 — Subtask 3)
 */

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createEventSchema,
  EVENT_TYPES,
  type CreateEventFormData,
} from '../schemas/event.schemas'
import type { CreateEventInput } from '../types'
import { X, AlertCircle, Calendar, Loader2 } from 'lucide-react'

interface CreateEventModalProps {
  isOpen: boolean
  onClose: () => void
  userManagedGroups?: Array<{ id: string; name: string }>
  isGlobalModerator?: boolean
  defaultGroupId?: string | null
  onSubmit: (input: CreateEventInput) => Promise<void>
  isLoading?: boolean
}

export function CreateEventModal({
  isOpen,
  onClose,
  userManagedGroups = [],
  isGlobalModerator = false,
  defaultGroupId = null,
  onSubmit,
  isLoading = false,
}: CreateEventModalProps) {
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateEventFormData>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      title: '',
      description: '',
      event_type: 'GENERAL',
      start_time: '',
      end_time: null,
      location: '',
      location_url: null,
      group_id: defaultGroupId,
      capacity: null,
      status: 'PUBLISHED',
      is_pinned: false,
    },
  })

  useEffect(() => {
    if (isOpen) {
      reset({
        title: '',
        description: '',
        event_type: 'GENERAL',
        start_time: '',
        end_time: null,
        location: '',
        location_url: null,
        group_id: defaultGroupId,
        capacity: null,
        status: 'PUBLISHED',
        is_pinned: false,
      })
      setFormError(null)
    }
  }, [isOpen, defaultGroupId, reset])

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

  if (!isOpen) return null

  const canPostEvents = isGlobalModerator || userManagedGroups.length > 0

  const handleFormSubmit = async (data: CreateEventFormData) => {
    setFormError(null)
    try {
      await onSubmit({
        ...data,
        start_time: new Date(data.start_time).toISOString(),
        end_time: data.end_time ? new Date(data.end_time).toISOString() : null,
        group_id: data.group_id || null,
        capacity: data.capacity ? Number(data.capacity) : null,
      })
      onClose()
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to create community event.'
      )
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-event-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h2 id="create-event-modal-title" className="text-lg font-semibold text-foreground">
              Create Community Event
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

        {/* Permission warning if user has no posting authority */}
        {!canPostEvents && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold">Event Creation Restricted</p>
              <p className="mt-0.5">
                Only community moderators or administrators of active community groups can create events. You are currently not an administrator or moderator of any group.
              </p>
            </div>
          </div>
        )}

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 text-xs">
          {/* Title */}
          <div>
            <label htmlFor="event-title" className="font-medium text-foreground block mb-1">
              Event Title <span className="text-red-500">*</span>
            </label>
            <input
              id="event-title"
              type="text"
              disabled={!canPostEvents || isLoading}
              placeholder="e.g. Diwali Sneh Milan 2026 or Youth Career Workshop"
              {...register('title')}
              className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {errors.title && (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Event Type & Target Scope */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="event-type" className="font-medium text-foreground block mb-1">
                Event Type <span className="text-red-500">*</span>
              </label>
              <select
                id="event-type"
                disabled={!canPostEvents || isLoading}
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
              <label htmlFor="event-group" className="font-medium text-foreground block mb-1">
                Event Scope <span className="text-red-500">*</span>
              </label>
              <select
                id="event-group"
                disabled={!canPostEvents || isLoading}
                {...register('group_id')}
                className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {isGlobalModerator && (
                  <option value="">Community-Wide (All Members)</option>
                )}
                {userManagedGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    Group: {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Start Time & End Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="event-start-time" className="font-medium text-foreground block mb-1">
                Start Date & Time <span className="text-red-500">*</span>
              </label>
              <input
                id="event-start-time"
                type="datetime-local"
                disabled={!canPostEvents || isLoading}
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
              <label htmlFor="event-end-time" className="font-medium text-foreground block mb-1">
                End Date & Time (Optional)
              </label>
              <input
                id="event-end-time"
                type="datetime-local"
                disabled={!canPostEvents || isLoading}
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
              <label htmlFor="event-location" className="font-medium text-foreground block mb-1">
                Venue Location (Optional)
              </label>
              <input
                id="event-location"
                type="text"
                disabled={!canPostEvents || isLoading}
                placeholder="e.g. Community Center Hall or Ground B"
                {...register('location')}
                className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="event-location-url" className="font-medium text-foreground block mb-1">
                Map Link or Virtual URL (Optional)
              </label>
              <input
                id="event-location-url"
                type="url"
                disabled={!canPostEvents || isLoading}
                placeholder="https://maps.google.com/?q=..."
                {...register('location_url')}
                className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>

          {/* Capacity */}
          <div>
            <label htmlFor="event-capacity" className="font-medium text-foreground block mb-1">
              Attendee Capacity (Optional)
            </label>
            <input
              id="event-capacity"
              type="number"
              min={1}
              disabled={!canPostEvents || isLoading}
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
            <label htmlFor="event-description" className="font-medium text-foreground block mb-1">
              Detailed Description (Optional)
            </label>
            <textarea
              id="event-description"
              rows={4}
              disabled={!canPostEvents || isLoading}
              placeholder="Provide program agenda, special instructions, schedule, or contact details..."
              {...register('description')}
              className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {/* Pinned Checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="event-is-pinned"
              disabled={!canPostEvents || isLoading}
              {...register('is_pinned')}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <label htmlFor="event-is-pinned" className="font-medium text-foreground cursor-pointer">
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
              disabled={!canPostEvents || isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Publish Event
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
