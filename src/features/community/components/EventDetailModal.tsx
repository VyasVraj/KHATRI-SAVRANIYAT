/**
 * Event Detail Modal Component (Phase 10 — Subtask 3)
 */

import { useState, useEffect } from 'react'
import type { CommunityEvent, EventRsvpStatus } from '../types'
import { EventTypeBadge } from './EventTypeBadge'
import { EventStatusBadge } from './EventStatusBadge'
import { RsvpButtonGroup } from './RsvpButtonGroup'
import { useEventRsvps } from '../hooks/useEvents'
import {
  X,
  Clock,
  MapPin,
  ExternalLink,
  Users,
  Globe,
  User as UserIcon,
  ShieldAlert,
  Loader2,
} from 'lucide-react'

interface EventDetailModalProps {
  event: CommunityEvent | null
  isOpen: boolean
  onClose: () => void
  onRsvp?: (status: EventRsvpStatus, guestCount: number, notes?: string) => Promise<void>
}

export function EventDetailModal({
  event,
  isOpen,
  onClose,
  onRsvp,
}: EventDetailModalProps) {
  const [showRoster, setShowRoster] = useState(false)

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

  // Fetch roster strictly if organizer toggles it
  const { data: rsvps, isLoading: rosterLoading } = useEventRsvps(
    event?.can_manage && showRoster ? event.id : undefined
  )

  if (!isOpen || !event) return null

  const startDate = new Date(event.start_time)
  const isPast = startDate.getTime() <= Date.now()
  const isCancelled = event.status === 'CANCELLED'

  const formattedStart = startDate.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const formattedStartTime = startDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  let timeString = `${formattedStart} at ${formattedStartTime}`
  if (event.end_time) {
    const endDate = new Date(event.end_time)
    timeString += ` - ${endDate.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })}`
  }

  const capacityPercent =
    event.capacity && event.capacity > 0
      ? Math.min(100, Math.round((event.rsvp_count_going / event.capacity) * 100))
      : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl space-y-5">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <EventTypeBadge type={event.event_type} />
              <EventStatusBadge status={event.status} />
              {event.group_name ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {event.group_name}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  Community-wide
                </span>
              )}
            </div>

            <h2 id="event-detail-title" className="text-xl font-bold text-foreground">
              {event.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cancellation Notice Banner */}
        {isCancelled && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <ShieldAlert className="h-4 w-4" />
              This event has been cancelled by organizers.
            </div>
            {event.cancellation_reason && (
              <p>
                <span className="font-medium">Reason:</span> {event.cancellation_reason}
              </p>
            )}
          </div>
        )}

        {/* Key Event Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-foreground">Date & Time</span>
                <span className="text-muted-foreground">{timeString}</span>
              </div>
            </div>

            {event.location && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-foreground">Venue</span>
                  <span className="text-muted-foreground">{event.location}</span>
                  {event.location_url && (
                    <a
                      href={event.location_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline ml-1 inline-flex items-center gap-0.5"
                    >
                      <span>Open Map/Link</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Users className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-foreground">Capacity & Attendance</span>
                <span className="text-muted-foreground">
                  {event.rsvp_count_going} confirmed attending
                  {event.rsvp_count_maybe > 0 && ` (${event.rsvp_count_maybe} tentative)`}
                </span>
                {event.capacity && (
                  <div className="mt-1">
                    <span className="text-muted-foreground">
                      {event.rsvp_count_going} of {event.capacity} seats filled ({capacityPercent}%)
                    </span>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted mt-1">
                      <div
                        className={`h-full ${
                          capacityPercent >= 100
                            ? 'bg-red-500'
                            : capacityPercent >= 80
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${capacityPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {event.creator_name && (
              <div className="flex items-start gap-2">
                <UserIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-foreground">Organizer</span>
                  <span className="text-muted-foreground">{event.creator_name}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Full Description */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            About This Event
          </h4>
          <div className="rounded-lg border border-border bg-background p-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {event.description || (
              <span className="italic text-muted-foreground">No detailed description provided.</span>
            )}
          </div>
        </div>

        {/* Interactive RSVP Area */}
        {onRsvp && (
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your Attendance Declaration
            </h4>
            <RsvpButtonGroup
              currentStatus={event.my_rsvp_status}
              currentGuestCount={event.my_guest_count}
              currentNotes={event.my_notes}
              capacity={event.capacity}
              bookedSeats={event.rsvp_count_going}
              isEventPast={isPast}
              isCancelled={isCancelled}
              onRsvp={onRsvp}
            />
          </div>
        )}

        {/* Organizer-Only Attendee Roster Inspection */}
        {event.can_manage && (
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">
                Organizer Controls: Attendee Roster
              </h4>
              <button
                type="button"
                onClick={() => setShowRoster(!showRoster)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {showRoster ? 'Hide Roster' : 'View Full Attendee Roster'}
              </button>
            </div>

            {showRoster && (
              <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-3">
                {rosterLoading ? (
                  <div className="flex items-center justify-center p-4 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading attendee declarations...
                  </div>
                ) : (rsvps || []).length === 0 ? (
                  <p className="text-muted-foreground italic text-center py-2">
                    No attendees registered yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border max-h-48 overflow-y-auto">
                    {(rsvps || []).map((r) => (
                      <div key={r.id} className="py-2 flex items-start justify-between gap-2">
                        <div>
                          <span className="font-semibold text-foreground">
                            {r.user_display_name || r.user_email || 'Community Member'}
                          </span>
                          {r.guest_count > 0 && (
                            <span className="text-muted-foreground ml-1">
                              (+{r.guest_count} guest{r.guest_count > 1 ? 's' : ''})
                            </span>
                          )}
                          {r.notes && (
                            <p className="text-muted-foreground italic text-[11px] mt-0.5">
                              &ldquo;{r.notes}&rdquo;
                            </p>
                          )}
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            r.status === 'GOING'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : r.status === 'MAYBE'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal Footer Close Button */}
        <div className="flex justify-end pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-secondary px-5 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
