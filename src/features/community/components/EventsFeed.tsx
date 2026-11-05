/**
 * Events Feed Component (Phase 10 — Subtask 3)
 */

import React, { useState } from 'react'
import { Plus, Calendar, AlertCircle, RefreshCw } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useLanguage } from '@/features/i18n'
import {
  useEvents,
  useCreateEvent,
  useUpdateEvent,
  useCancelEvent,
  useArchiveEvent,
  useDeleteEvent,
  useSetEventRsvp,
} from '../hooks/useEvents'
import { useGroups } from '../hooks/useGroups'
import { EventCard } from './EventCard'
import { EventFiltersBar } from './EventFiltersBar'
import { EventDetailModal } from './EventDetailModal'
import { CreateEventModal } from './CreateEventModal'
import { EditEventModal } from './EditEventModal'
import { CancelEventModal } from './CancelEventModal'
import type {
  CommunityEvent,
  EventFilters,
  CreateEventInput,
  UpdateEventInput,
  EventRsvpStatus,
} from '../types'

export const EventsFeed: React.FC = () => {
  const { user, isAuthenticated } = useAuthContext()
  const { t } = useLanguage()

  const [filters, setFilters] = useState<EventFilters>({
    search: '',
    event_type: 'ALL',
    scope: 'ALL',
    timeframe: 'UPCOMING',
  })

  // Modals state
  const [selectedEventForDetail, setSelectedEventForDetail] =
    useState<CommunityEvent | null>(null)
  const [selectedEventForEdit, setSelectedEventForEdit] =
    useState<CommunityEvent | null>(null)
  const [selectedEventForCancel, setSelectedEventForCancel] =
    useState<CommunityEvent | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // Status feedback
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // Fetch events
  const {
    data: events,
    isLoading,
    isError,
    error,
    refetch,
  } = useEvents(filters)

  // Fetch groups where user has membership / admin access for creation dialog
  const { data: myGroups = [] } = useGroups(
    isAuthenticated ? { membership_filter: 'MY_GROUPS' } : undefined
  )

  const userManagedGroups = myGroups
    .filter(
      (g) => g.caller_role === 'ADMIN' || g.caller_role === 'MODERATOR'
    )
    .map((g) => ({ id: g.id, name: g.name }))

  // Check if current user is global moderator
  const isGlobalModerator =
    user?.role === 'admin' || user?.role === 'moderator'

  // Mutations
  const createMutation = useCreateEvent()
  const updateMutation = useUpdateEvent()
  const cancelMutation = useCancelEvent()
  const archiveMutation = useArchiveEvent()
  const deleteMutation = useDeleteEvent()
  const rsvpMutation = useSetEventRsvp()

  const handleCreateSubmit = async (input: CreateEventInput) => {
    setFeedbackMessage(null)
    try {
      await createMutation.mutateAsync(input)
      setIsCreateModalOpen(false)
      setFeedbackMessage({
        type: 'success',
        text: 'Event created and scheduled successfully.',
      })
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create event.',
      })
      throw err
    }
  }

  const handleEditSubmit = async (input: UpdateEventInput) => {
    setFeedbackMessage(null)
    try {
      await updateMutation.mutateAsync(input)
      setSelectedEventForEdit(null)
      if (selectedEventForDetail?.id === input.id) {
        setSelectedEventForDetail((prev) =>
          prev
            ? {
                ...prev,
                title: input.title,
                description: input.description ?? null,
                event_type: input.event_type,
                location: input.location ?? null,
                location_url: input.location_url ?? null,
                capacity: input.capacity ?? null,
                start_time: input.start_time,
                end_time: input.end_time ?? null,
              }
            : null
        )
      }
      setFeedbackMessage({
        type: 'success',
        text: 'Event details updated successfully.',
      })
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update event.',
      })
      throw err
    }
  }

  const handleCancelSubmit = async (eventId: string, cancellationReason: string) => {
    setFeedbackMessage(null)
    try {
      await cancelMutation.mutateAsync({
        id: eventId,
        cancellation_reason: cancellationReason,
      })
      setSelectedEventForCancel(null)
      if (selectedEventForDetail?.id === eventId) {
        setSelectedEventForDetail((prev) =>
          prev
            ? {
                ...prev,
                status: 'CANCELLED',
                cancellation_reason: cancellationReason,
              }
            : null
        )
      }
      setFeedbackMessage({
        type: 'success',
        text: 'Event has been cancelled.',
      })
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to cancel event.',
      })
      throw err
    }
  }

  const handleArchive = async (id: string) => {
    setFeedbackMessage(null)
    try {
      await archiveMutation.mutateAsync(id)
      setFeedbackMessage({
        type: 'success',
        text: 'Event moved to archive.',
      })
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to archive event.',
      })
    }
  }

  const handleDelete = async (id: string) => {
    setFeedbackMessage(null)
    try {
      await deleteMutation.mutateAsync(id)
      setFeedbackMessage({
        type: 'success',
        text: 'Event permanently deleted.',
      })
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete event.',
      })
    }
  }

  const handleRsvp = async (
    eventId: string,
    status: EventRsvpStatus,
    guestCount = 0,
    notes?: string
  ) => {
    setFeedbackMessage(null)
    try {
      await rsvpMutation.mutateAsync({
        event_id: eventId,
        status,
        guest_count: guestCount,
        notes,
      })
      setFeedbackMessage({
        type: 'success',
        text: `Your RSVP was updated to ${status}.`,
      })
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update RSVP.',
      })
    }
  }

  const canManageEvent = (item: CommunityEvent): boolean => {
    if (!isAuthenticated || !user) return false
    if (isGlobalModerator) return true
    if (item.creator_id === user.id) return true
    if (item.group_id) {
      const groupMatch = myGroups.find((g) => g.id === item.group_id)
      if (
        groupMatch?.caller_role === 'ADMIN' ||
        groupMatch?.caller_role === 'MODERATOR'
      ) {
        return true
      }
    }
    return false
  }

  return (
    <div className="space-y-6">
      {/* Feed Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Community Events & Calendar
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Gatherings, celebrations, seminars, workshops, and community meetings.
          </p>
        </div>

        {isAuthenticated && (isGlobalModerator || userManagedGroups.length > 0) && (
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-brand-700 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>{t('community.create_event', 'Create Event')}</span>
          </button>
        )}
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          role="alert"
          className={`flex items-center justify-between rounded-lg p-3 text-sm ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-xs font-semibold underline hover:opacity-80 min-h-[44px] flex items-center px-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <EventFiltersBar
        filters={filters}
        onChange={setFilters}
        onReset={() =>
          setFilters({
            search: '',
            event_type: 'ALL',
            scope: 'ALL',
            timeframe: 'UPCOMING',
          })
        }
      />

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, idx) => (
            <div
              key={idx}
              className="h-56 rounded-xl border border-slate-200 bg-white p-5 shadow-xs animate-pulse"
            >
              <div className="h-4 w-24 bg-slate-200 rounded-full mb-3" />
              <div className="h-5 w-3/4 bg-slate-200 rounded mb-2" />
              <div className="h-3 w-full bg-slate-100 rounded mb-1" />
              <div className="h-3 w-5/6 bg-slate-100 rounded mb-4" />
              <div className="h-3 w-1/3 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-500 mb-2" />
          <h3 className="text-base font-semibold">Failed to load events</h3>
          <p className="mt-1 text-sm text-rose-600">
            {error instanceof Error
              ? error.message
              : 'An unexpected error occurred while loading community events.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && events && events.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-900">
            {t('community.empty_events', 'No events found')}
          </h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            {filters.search || filters.event_type !== 'ALL' || filters.scope !== 'ALL' || filters.timeframe !== 'ALL'
              ? 'No events match your search or filter criteria. Try adjusting your filters.'
              : t('community.empty_events_desc', 'There are currently no events scheduled on the community calendar.')}
          </p>
        </div>
      )}

      {/* Grid of Events */}
      {!isLoading && !isError && events && events.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((item) => {
            const manageable = canManageEvent(item)
            return (
              <EventCard
                key={item.id}
                event={item}
                onView={(ev) => setSelectedEventForDetail(ev)}
                onEdit={manageable ? (ev) => setSelectedEventForEdit(ev) : undefined}
                onCancel={manageable ? (ev) => setSelectedEventForCancel(ev) : undefined}
                onArchive={manageable ? handleArchive : undefined}
                onDelete={manageable ? handleDelete : undefined}
                onRsvp={(status, guestCount, notes) =>
                  handleRsvp(item.id, status, guestCount, notes)
                }
              />
            )
          })}
        </div>
      )}

      {/* Detail Modal */}
      <EventDetailModal
        event={selectedEventForDetail}
        isOpen={Boolean(selectedEventForDetail)}
        onClose={() => setSelectedEventForDetail(null)}
        onRsvp={
          selectedEventForDetail
            ? (status, guestCount, notes) =>
                handleRsvp(selectedEventForDetail.id, status, guestCount, notes)
            : undefined
        }
      />

      {/* Create Modal */}
      <CreateEventModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        userManagedGroups={userManagedGroups}
        isGlobalModerator={isGlobalModerator}
        onSubmit={handleCreateSubmit}
        isLoading={createMutation.isPending}
      />

      {/* Edit Modal */}
      <EditEventModal
        event={selectedEventForEdit}
        isOpen={Boolean(selectedEventForEdit)}
        onClose={() => setSelectedEventForEdit(null)}
        onSubmit={handleEditSubmit}
        isLoading={updateMutation.isPending}
      />

      {/* Cancel Modal */}
      <CancelEventModal
        event={selectedEventForCancel}
        isOpen={Boolean(selectedEventForCancel)}
        onClose={() => setSelectedEventForCancel(null)}
        onConfirm={handleCancelSubmit}
      />
    </div>
  )
}
