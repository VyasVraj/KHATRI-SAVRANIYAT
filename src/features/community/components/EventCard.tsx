/**
 * Event Card Component (Phase 10 — Subtask 3)
 */

import { useState } from 'react'
import type { CommunityEvent, EventRsvpStatus } from '../types'
import { EventTypeBadge } from './EventTypeBadge'
import { EventStatusBadge } from './EventStatusBadge'
import { RsvpButtonGroup } from './RsvpButtonGroup'
import { useLanguage } from '@/features/i18n'
import {
  Pin,
  MapPin,
  Clock,
  Users,
  Globe,
  MoreVertical,
  Edit,
  AlertCircle,
  Archive,
  Trash2,
  ExternalLink,
} from 'lucide-react'

interface EventCardProps {
  event: CommunityEvent
  onView: (event: CommunityEvent) => void
  onEdit?: (event: CommunityEvent) => void
  onCancel?: (event: CommunityEvent) => void
  onArchive?: (id: string) => void
  onDelete?: (id: string) => void
  onRsvp?: (status: EventRsvpStatus, guestCount: number, notes?: string) => Promise<void>
}

export function EventCard({
  event,
  onView,
  onEdit,
  onCancel,
  onArchive,
  onDelete,
  onRsvp,
}: EventCardProps) {
  const { t } = useLanguage()
  const [menuOpen, setMenuOpen] = useState(false)

  const startDate = new Date(event.start_time)
  const isPast = startDate.getTime() <= Date.now()
  const isCancelled = event.status === 'CANCELLED'

  const formattedMonth = startDate.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()
  const formattedDay = startDate.getDate()
  const formattedTime = startDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  let timeString = `${startDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} at ${formattedTime}`

  if (event.end_time) {
    const endDate = new Date(event.end_time)
    const endFormatted = endDate.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
    timeString += ` - ${endFormatted}`
  }

  const capacityPercent =
    event.capacity && event.capacity > 0
      ? Math.min(100, Math.round((event.rsvp_count_going / event.capacity) * 100))
      : 0

  return (
    <div
      onClick={() => onView(event)}
      className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-md ${
        event.is_pinned
          ? 'border-amber-300 bg-amber-50/20 dark:border-amber-700/50 dark:bg-amber-950/10'
          : 'border-border'
      }`}
    >
      <div className="space-y-4">
        {/* Top bar: Pin, EventType, Scope, Status, and Manager Menu */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {event.is_pinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                <Pin className="h-3 w-3 fill-amber-600 dark:fill-amber-400" />
                {t('community.pinned_badge', 'Pinned')}
              </span>
            )}
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

          {event.can_manage && (
            <div
              className="relative"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(!menuOpen)
              }}
            >
              <button
                type="button"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none"
                aria-label="Organizer options"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 z-20 mt-1 w-36 rounded-md border border-border bg-popover p-1 shadow-md text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onEdit(event)
                      }}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit Event
                    </button>
                  )}
                  {onCancel && !isCancelled && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onCancel(event)
                      }}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      Cancel Event
                    </button>
                  )}
                  {onArchive && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onArchive(event.id)
                      }}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onDelete(event.id)
                      }}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date block + Title + Metadata */}
        <div className="flex items-start gap-4">
          {/* Calendar Day Block */}
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 px-3 py-2 text-center min-w-[54px] shrink-0">
            <span className="text-[10px] font-bold text-primary tracking-wider">{formattedMonth}</span>
            <span className="text-xl font-extrabold text-foreground leading-none mt-0.5">{formattedDay}</span>
          </div>

          <div className="space-y-1.5 min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {event.title}
            </h3>

            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{timeString}</span>
              </span>

              {event.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{event.location}</span>
                  {event.location_url && (
                    <a
                      href={event.location_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline ml-1 inline-flex items-center"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Description snippet */}
        {event.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {event.description}
          </p>
        )}

        {/* Cancellation Notice Banner */}
        {isCancelled && event.cancellation_reason && (
          <div className="rounded-md border border-red-200 bg-red-50/50 p-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
            <span className="font-semibold">Reason for cancellation:</span> {event.cancellation_reason}
          </div>
        )}

        {/* Capacity / Attendance Summary */}
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-medium text-foreground">
              {event.rsvp_count_going} attending
              {event.rsvp_count_maybe > 0 && ` • ${event.rsvp_count_maybe} maybe`}
            </span>
            {event.capacity ? (
              <span className={capacityPercent >= 100 ? 'font-bold text-red-600' : ''}>
                {event.rsvp_count_going} / {event.capacity} seats ({capacityPercent}%)
              </span>
            ) : (
              <span>{t('community.capacity_open', 'Open capacity')}</span>
            )}
          </div>

          {event.capacity && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${
                  capacityPercent >= 100
                    ? 'bg-red-500'
                    : capacityPercent >= 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${capacityPercent}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer: RSVP quick actions */}
      <div
        className="mt-4 pt-3 border-t border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {onRsvp ? (
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
        ) : (
          <div className="text-xs text-muted-foreground text-right">
            Click to view event details & RSVP →
          </div>
        )}
      </div>
    </div>
  )
}
