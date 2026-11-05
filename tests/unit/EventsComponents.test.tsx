/**
 * Unit Tests: Community Events UI Components (Phase 10 — Subtask 3)
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EventTypeBadge } from '@/features/community/components/EventTypeBadge'
import { EventStatusBadge } from '@/features/community/components/EventStatusBadge'
import { RsvpButtonGroup } from '@/features/community/components/RsvpButtonGroup'
import { EventCard } from '@/features/community/components/EventCard'
import { EventFiltersBar } from '@/features/community/components/EventFiltersBar'
import { EventDetailModal } from '@/features/community/components/EventDetailModal'
import { CreateEventModal } from '@/features/community/components/CreateEventModal'
import { EditEventModal } from '@/features/community/components/EditEventModal'
import { CancelEventModal } from '@/features/community/components/CancelEventModal'
import type { CommunityEvent, EventFilters } from '@/features/community/types'

describe('Community Events UI Components', () => {
  describe('EventTypeBadge', () => {
    it('renders human-readable labels for all 8 event types', () => {
      const types = [
        { type: 'GENERAL' as const, label: 'General' },
        { type: 'FESTIVAL' as const, label: 'Festival' },
        { type: 'MEETING' as const, label: 'Meeting' },
        { type: 'SPORTS' as const, label: 'Sports' },
        { type: 'YOUTH' as const, label: 'Youth' },
        { type: 'CULTURAL' as const, label: 'Cultural' },
        { type: 'WORKSHOP' as const, label: 'Workshop' },
        { type: 'OTHER' as const, label: 'Other' },
      ]

      for (const item of types) {
        const html = renderToStaticMarkup(<EventTypeBadge type={item.type} />)
        expect(html).toContain(item.label)
      }
    })
  })

  describe('EventStatusBadge', () => {
    it('renders human-readable labels for all event statuses', () => {
      const statuses = [
        { status: 'PUBLISHED' as const, label: 'Open for RSVP' },
        { status: 'CANCELLED' as const, label: 'Cancelled' },
        { status: 'COMPLETED' as const, label: 'Concluded' },
        { status: 'DRAFT' as const, label: 'Draft' },
        { status: 'ARCHIVED' as const, label: 'Archived' },
      ]

      for (const item of statuses) {
        const html = renderToStaticMarkup(<EventStatusBadge status={item.status} />)
        expect(html).toContain(item.label)
      }
    })
  })

  describe('RsvpButtonGroup', () => {
    it('renders Going, Maybe, and Can’t Go buttons', () => {
      const html = renderToStaticMarkup(
        <RsvpButtonGroup
          currentStatus="GOING"
          capacity={100}
          bookedSeats={10}
          isEventPast={false}
          isCancelled={false}
          onRsvp={vi.fn()}
        />
      )

      expect(html).toContain('Going')
      expect(html).toContain('Maybe')
      expect(html).toContain("Can&#x27;t Go")
    })

    it('highlights currently selected RSVP state', () => {
      const html = renderToStaticMarkup(
        <RsvpButtonGroup
          currentStatus="GOING"
          capacity={100}
          bookedSeats={10}
          isEventPast={false}
          isCancelled={false}
          onRsvp={vi.fn()}
        />
      )

      expect(html).toContain('bg-emerald-600')
    })

    it('displays capacity is full warning when capacity is reached', () => {
      const html = renderToStaticMarkup(
        <RsvpButtonGroup
          currentStatus={null}
          capacity={10}
          bookedSeats={10}
          isEventPast={false}
          isCancelled={false}
          onRsvp={vi.fn()}
        />
      )

      expect(html).toContain('Capacity is full for this event.')
    })
  })

  describe('EventCard', () => {
    const baseEvent: CommunityEvent = {
      id: 'ev-test-1',
      title: 'Annual Kutchi Sneh Milan 2026',
      description: 'Annual gathering of all village families in Bhuj.',
      event_type: 'CULTURAL',
      status: 'PUBLISHED',
      group_id: 'grp-1',
      group_name: 'Bhuj Association',
      group_slug: 'bhuj-association',
      creator_id: 'usr-1',
      creator_name: 'Bhuj Lead',
      creator_email: 'lead@example.com',
      start_time: '2026-12-01T10:00:00Z',
      end_time: '2026-12-01T16:00:00Z',
      location: 'Town Hall, Main Road, Bhuj',
      location_url: null,
      capacity: 250,
      cancellation_reason: null,
      cancelled_at: null,
      published_at: '2026-10-07T10:00:00Z',
      rsvp_count_going: 75,
      rsvp_count_maybe: 20,
      my_rsvp_status: 'GOING',
      my_guest_count: 2,
      my_notes: null,
      is_pinned: false,
      created_at: '2026-10-07T10:00:00Z',
      updated_at: '2026-10-07T10:00:00Z',
      deleted_at: null,
    }

    it('renders event title, location, type badge, and group attribution', () => {
      const html = renderToStaticMarkup(
        <EventCard
          event={baseEvent}
          onView={vi.fn()}
        />
      )

      expect(html).toContain('Annual Kutchi Sneh Milan 2026')
      expect(html).toContain('Town Hall, Main Road, Bhuj')
      expect(html).toContain('Cultural')
      expect(html).toContain('Bhuj Association')
      expect(html).toContain('75 attending')
      expect(html).toContain('75 / 250 seats (30%)')
    })

    it('renders Community-wide label when group_id is null', () => {
      const globalEvent: CommunityEvent = {
        ...baseEvent,
        group_id: null,
        group_name: null,
      }

      const html = renderToStaticMarkup(
        <EventCard
          event={globalEvent}
          onView={vi.fn()}
        />
      )

      expect(html).toContain('Community-wide')
    })

    it('displays capacity is full warning when full and user is not attending', () => {
      const fullEvent: CommunityEvent = {
        ...baseEvent,
        capacity: 10,
        rsvp_count_going: 10,
        my_rsvp_status: null,
      }

      const html = renderToStaticMarkup(
        <EventCard
          event={fullEvent}
          onView={vi.fn()}
          onRsvp={vi.fn()}
        />
      )

      expect(html).toContain('Capacity is full for this event.')
    })
  })

  describe('EventFiltersBar', () => {
    it('renders search input, category filters, and timeframe controls', () => {
      const filters: EventFilters = {
        search: 'sneh milan',
        event_type: 'CULTURAL',
        scope: 'GLOBAL',
        timeframe: 'UPCOMING',
      }

      const html = renderToStaticMarkup(
        <EventFiltersBar
          filters={filters}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      )

      expect(html).toContain('value="sneh milan"')
      expect(html).toContain('Upcoming')
      expect(html).toContain('Past')
      expect(html).toContain('Cultural')
      expect(html).toContain('Community-Wide Only')
    })
  })

  describe('EventDetailModal', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const event: CommunityEvent = {
      id: 'ev-detail-1',
      title: 'Full Details of Community Conference',
      description: 'Comprehensive agenda and keynote speakers.',
      event_type: 'MEETING',
      status: 'PUBLISHED',
      group_id: null,
      creator_id: 'usr-1',
      creator_name: 'Dr. Mehta',
      creator_email: 'dr@example.com',
      location: 'Virtual Video Conference',
      location_url: 'https://meet.jit.si/kutchi-conference',
      start_time: '2026-11-15T09:00:00Z',
      end_time: '2026-11-15T12:00:00Z',
      capacity: 100,
      cancellation_reason: null,
      cancelled_at: null,
      published_at: '2026-10-07T08:00:00Z',
      rsvp_count_going: 45,
      rsvp_count_maybe: 10,
      my_rsvp_status: null,
      my_guest_count: 0,
      my_notes: null,
      is_pinned: false,
      created_at: '2026-10-07T08:00:00Z',
      updated_at: '2026-10-07T08:00:00Z',
      deleted_at: null,
    }

    it('renders full event details, virtual meeting link, and capacity', () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <EventDetailModal
            event={event}
            isOpen={true}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      )

      expect(html).toContain('Full Details of Community Conference')
      expect(html).toContain('Comprehensive agenda and keynote speakers')
      expect(html).toContain('https://meet.jit.si/kutchi-conference')
      expect(html).toContain('Dr. Mehta')
    })

    it('returns null when closed', () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <EventDetailModal
            event={event}
            isOpen={false}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      )

      expect(html).toBe('')
    })
  })

  describe('CreateEventModal', () => {
    it('renders form inputs and options when open', () => {
      const html = renderToStaticMarkup(
        <CreateEventModal
          isOpen={true}
          onClose={vi.fn()}
          userManagedGroups={[{ id: 'g-1', name: 'Youth Committee' }]}
          isGlobalModerator={true}
          onSubmit={vi.fn()}
        />
      )

      expect(html).toContain('Create Community Event')
      expect(html).toContain('Publish Event')
      expect(html).toContain('Youth Committee')
    })

    it('returns null when closed', () => {
      const html = renderToStaticMarkup(
        <CreateEventModal
          isOpen={false}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      )

      expect(html).toBe('')
    })
  })

  describe('EditEventModal', () => {
    const event: CommunityEvent = {
      id: 'ev-edit-1',
      title: 'Existing Event Title',
      description: 'Existing event description.',
      event_type: 'WORKSHOP',
      status: 'PUBLISHED',
      group_id: null,
      creator_id: 'usr-1',
      start_time: '2026-12-01T10:00:00Z',
      end_time: '2026-12-01T14:00:00Z',
      location: 'Community Hall, 123 Market St',
      location_url: null,
      capacity: 50,
      cancellation_reason: null,
      cancelled_at: null,
      published_at: '2026-10-07T00:00:00Z',
      rsvp_count_going: 10,
      rsvp_count_maybe: 2,
      my_rsvp_status: null,
      my_guest_count: 0,
      my_notes: null,
      is_pinned: false,
      created_at: '2026-10-07T00:00:00Z',
      updated_at: '2026-10-07T00:00:00Z',
      deleted_at: null,
    }

    it('renders edit modal form when open with event', () => {
      const html = renderToStaticMarkup(
        <EditEventModal
          event={event}
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      )

      expect(html).toContain('Edit Community Event')
      expect(html).toContain('Save Changes')
    })

    it('returns null when closed', () => {
      const html = renderToStaticMarkup(
        <EditEventModal
          event={event}
          isOpen={false}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      )

      expect(html).toBe('')
    })
  })

  describe('CancelEventModal', () => {
    const event: CommunityEvent = {
      id: 'ev-cancel-1',
      title: 'Cricket Match 2026',
      description: 'Friendly tournament.',
      event_type: 'SPORTS',
      status: 'PUBLISHED',
      group_id: null,
      creator_id: 'usr-1',
      start_time: '2026-12-10T09:00:00Z',
      end_time: '2026-12-10T17:00:00Z',
      location: 'Ground',
      location_url: null,
      capacity: null,
      cancellation_reason: null,
      cancelled_at: null,
      published_at: '2026-10-07T00:00:00Z',
      rsvp_count_going: 22,
      rsvp_count_maybe: 0,
      my_rsvp_status: null,
      my_guest_count: 0,
      my_notes: null,
      is_pinned: false,
      created_at: '2026-10-07T00:00:00Z',
      updated_at: '2026-10-07T00:00:00Z',
      deleted_at: null,
    }

    it('renders cancel modal form when open', () => {
      const html = renderToStaticMarkup(
        <CancelEventModal
          event={event}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      )

      expect(html).toContain('Cancel Community Event')
      expect(html).toContain('Reason for cancellation (optional):')
      expect(html).toContain('Confirm Cancellation')
    })

    it('returns null when closed', () => {
      const html = renderToStaticMarkup(
        <CancelEventModal
          event={event}
          isOpen={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      )

      expect(html).toBe('')
    })
  })
})
