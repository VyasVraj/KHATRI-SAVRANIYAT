import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sanitizeEventError,
  listEvents,
  getEventById,
  listEventRsvps,
  createEvent,
  updateEvent,
  cancelEvent,
  archiveEvent,
  deleteEvent,
  setEventRsvp,
  cancelEventRsvp,
} from '@/features/community/services/events.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

const VALID_UUID_1 = '123e4567-e89b-12d3-a456-426614174000'
const VALID_UUID_2 = '223e4567-e89b-12d3-a456-426614174001'
const FUTURE_DATE = '2026-11-01T10:00:00.000Z'
const FUTURE_END_DATE = '2026-11-01T13:00:00.000Z'

describe('events.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sanitizeEventError', () => {
    it('returns default message when err is nullish', () => {
      expect(sanitizeEventError(null)).toBe(
        'An unexpected error occurred. Please try again.'
      )
    })

    it('sanitizes capacity exceeded error', () => {
      expect(
        sanitizeEventError({
          message: 'Event capacity exceeded. Available seats: 0',
        })
      ).toBe('Event capacity exceeded. No seats remaining for this reservation.')
    })

    it('sanitizes event already started error', () => {
      expect(
        sanitizeEventError({
          message: 'Cannot RSVP: Event has already started or concluded.',
        })
      ).toBe('Cannot RSVP: This event has already started or concluded.')
    })

    it('sanitizes event not open error', () => {
      expect(
        sanitizeEventError({
          message: 'Cannot RSVP: Event is not open for registration (status: CANCELLED)',
        })
      ).toBe('Cannot RSVP: This event is currently not open for registration.')
    })

    it('sanitizes reopening past cancelled event error', () => {
      expect(
        sanitizeEventError({
          message: 'Cannot reopen a cancelled event whose start time has already passed.',
        })
      ).toBe('Cannot reopen a cancelled event whose start time has already passed.')
    })

    it('sanitizes global event moderator error', () => {
      expect(
        sanitizeEventError({
          message: 'Only community moderators can post global community events.',
        })
      ).toBe('Only community moderators can post or modify global community events.')
    })

    it('sanitizes group manager event error', () => {
      expect(
        sanitizeEventError({
          message: 'Only group managers or community moderators can post events for this group.',
        })
      ).toBe('Only group managers or community moderators can post or modify events for this group.')
    })

    it('sanitizes already cancelled error', () => {
      expect(
        sanitizeEventError({
          message: 'Event is already cancelled.',
        })
      ).toBe('This event is already cancelled.')
    })

    it('sanitizes 42501 unauthorized error', () => {
      expect(
        sanitizeEventError({
          message: 'Error 42501: permission denied',
        })
      ).toBe('You do not have permission to perform this action.')
    })

    it('sanitizes P0002 not found error', () => {
      expect(
        sanitizeEventError({
          message: 'Event does not exist or has been deleted.',
        })
      ).toBe('The requested event or community group could not be found.')
    })
  })

  describe('listEvents', () => {
    it('fetches events and joins RSVP aggregates', async () => {
      const mockEvents = [
        {
          id: VALID_UUID_1,
          title: 'Diwali Sneh Milan Celebration',
          description: 'Grand cultural evening',
          event_type: 'FESTIVAL',
          status: 'PUBLISHED',
          start_time: FUTURE_DATE,
          end_time: FUTURE_END_DATE,
          location: 'Community Hall',
          location_url: null,
          group_id: null,
          creator_id: 'usr-1',
          is_pinned: true,
          capacity: 100,
          published_at: '2026-10-07T12:00:00Z',
          cancelled_at: null,
          cancellation_reason: null,
          created_at: '2026-10-07T12:00:00Z',
          updated_at: '2026-10-07T12:00:00Z',
          deleted_at: null,
          creator: {
            id: 'usr-1',
            display_name: 'President Patel',
            email: 'prez@example.com',
            avatar_url: null,
          },
          group: null,
        },
      ]

      const mockRsvps = [
        {
          event_id: VALID_UUID_1,
          user_id: 'usr-1',
          status: 'GOING',
          guest_count: 2,
          notes: 'Front row please',
        },
        {
          event_id: VALID_UUID_1,
          user_id: 'usr-2',
          status: 'MAYBE',
          guest_count: 0,
          notes: null,
        },
      ]

      const eventChain: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(),
        is: vi.fn(),
        eq: vi.fn(),
        in: vi.fn(),
        gte: vi.fn(),
        lt: vi.fn(),
        order: vi.fn(),
      }
      eventChain.select.mockReturnValue(eventChain)
      eventChain.is.mockReturnValue(eventChain)
      eventChain.eq.mockReturnValue(eventChain)
      eventChain.in.mockReturnValue(eventChain)
      eventChain.gte.mockReturnValue(eventChain)
      eventChain.lt.mockReturnValue(eventChain)
      eventChain.order.mockReturnValue(eventChain)
      ;(eventChain as unknown as Promise<unknown>).then = vi
        .fn()
        .mockImplementation((resolve) =>
          Promise.resolve({ data: mockEvents, error: null }).then(resolve)
        )

      const rsvpChain: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(),
        in: vi.fn(),
      }
      rsvpChain.select.mockReturnValue(rsvpChain)
      rsvpChain.in.mockReturnValue(rsvpChain)
      ;(rsvpChain as unknown as Promise<unknown>).then = vi
        .fn()
        .mockImplementation((resolve) =>
          Promise.resolve({ data: mockRsvps, error: null }).then(resolve)
        )

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'events') return eventChain as never
        if (table === 'event_rsvps') return rsvpChain as never
        return {} as never
      })

      const result = await listEvents({ timeframe: 'UPCOMING' }, 'usr-1')

      expect(result.data).toHaveLength(1)
      const ev = result.data?.[0]
      expect(ev?.title).toBe('Diwali Sneh Milan Celebration')
      expect(ev?.creator_name).toBe('President Patel')
      // GOING count: 1 + 2 = 3
      expect(ev?.rsvp_count_going).toBe(3)
      expect(ev?.rsvp_count_maybe).toBe(1)
      expect(ev?.my_rsvp_status).toBe('GOING')
      expect(ev?.my_guest_count).toBe(2)
      expect(ev?.can_manage).toBe(true)
    })

    it('returns empty list when events table has no records', async () => {
      const eventChain: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(),
        is: vi.fn(),
        in: vi.fn(),
        gte: vi.fn(),
        order: vi.fn(),
      }
      eventChain.select.mockReturnValue(eventChain)
      eventChain.is.mockReturnValue(eventChain)
      eventChain.in.mockReturnValue(eventChain)
      eventChain.gte.mockReturnValue(eventChain)
      eventChain.order.mockReturnValue(eventChain)
      ;(eventChain as unknown as Promise<unknown>).then = vi
        .fn()
        .mockImplementation((resolve) =>
          Promise.resolve({ data: [], error: null }).then(resolve)
        )

      vi.mocked(supabase.from).mockReturnValue(eventChain as never)

      const result = await listEvents()

      expect(result.data).toEqual([])
      expect(result.error).toBeNull()
    })
  })

  describe('getEventById', () => {
    it('retrieves single event and computes caller RSVP', async () => {
      const mockEvent = {
        id: VALID_UUID_1,
        title: 'Sports Day 2026',
        description: 'Cricket tournament',
        event_type: 'SPORTS',
        status: 'PUBLISHED',
        start_time: FUTURE_DATE,
        end_time: FUTURE_END_DATE,
        location: 'Ground A',
        location_url: null,
        group_id: VALID_UUID_2,
        creator_id: 'usr-organizer',
        is_pinned: false,
        capacity: 50,
        published_at: '2026-10-07T10:00:00Z',
        cancelled_at: null,
        cancellation_reason: null,
        created_at: '2026-10-07T10:00:00Z',
        updated_at: '2026-10-07T10:00:00Z',
        deleted_at: null,
        creator: {
          id: 'usr-organizer',
          display_name: 'Sports Secretary',
          email: 'sports@example.com',
          avatar_url: null,
        },
        group: {
          id: VALID_UUID_2,
          name: 'Youth Association',
          slug: 'youth-association',
        },
      }

      const mockRsvps = [
        {
          user_id: 'usr-caller',
          status: 'GOING',
          guest_count: 1,
          notes: 'Need bat',
        },
      ]

      const eventChain: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(),
        eq: vi.fn(),
        is: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockEvent, error: null }),
      }
      eventChain.select.mockReturnValue(eventChain)
      eventChain.eq.mockReturnValue(eventChain)
      eventChain.is.mockReturnValue(eventChain)

      const rsvpChain: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(),
        eq: vi.fn(),
      }
      rsvpChain.select.mockReturnValue(rsvpChain)
      rsvpChain.eq.mockReturnValue(rsvpChain)
      ;(rsvpChain as unknown as Promise<unknown>).then = vi
        .fn()
        .mockImplementation((resolve) =>
          Promise.resolve({ data: mockRsvps, error: null }).then(resolve)
        )

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'events') return eventChain as never
        if (table === 'event_rsvps') return rsvpChain as never
        return {} as never
      })

      const result = await getEventById(VALID_UUID_1, 'usr-caller')

      expect(result.data?.group_name).toBe('Youth Association')
      expect(result.data?.my_rsvp_status).toBe('GOING')
      expect(result.data?.my_guest_count).toBe(1)
      expect(result.data?.my_notes).toBe('Need bat')
      expect(result.data?.rsvp_count_going).toBe(2)
      expect(result.data?.can_manage).toBe(false)
    })

    it('returns not found error if record does not exist', async () => {
      const eventChain: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(),
        eq: vi.fn(),
        is: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      eventChain.select.mockReturnValue(eventChain)
      eventChain.eq.mockReturnValue(eventChain)
      eventChain.is.mockReturnValue(eventChain)

      vi.mocked(supabase.from).mockReturnValue(eventChain as never)

      const result = await getEventById(VALID_UUID_1)

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('EVENT_NOT_FOUND')
    })
  })

  describe('listEventRsvps', () => {
    it('fetches attendee roster for an event', async () => {
      const mockRows = [
        {
          id: VALID_UUID_1,
          event_id: VALID_UUID_2,
          user_id: 'usr-1',
          status: 'GOING',
          guest_count: 2,
          notes: 'Family of 3',
          created_at: '2026-10-07T12:00:00Z',
          updated_at: '2026-10-07T12:00:00Z',
          user: {
            id: 'usr-1',
            display_name: 'Amit Shah',
            email: 'amit@example.com',
            avatar_url: null,
          },
        },
      ]

      const chain: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
      }
      chain.select.mockReturnValue(chain)
      chain.eq.mockReturnValue(chain)
      chain.order.mockReturnValue(chain)
      ;(chain as unknown as Promise<unknown>).then = vi
        .fn()
        .mockImplementation((resolve) =>
          Promise.resolve({ data: mockRows, error: null }).then(resolve)
        )

      vi.mocked(supabase.from).mockReturnValue(chain as never)

      const result = await listEventRsvps(VALID_UUID_2)

      expect(result.data).toHaveLength(1)
      expect(result.data?.[0].user_display_name).toBe('Amit Shah')
      expect(result.data?.[0].guest_count).toBe(2)
    })
  })

  describe('createEvent', () => {
    it('invokes create_community_event RPC with mapped parameters', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: VALID_UUID_1,
        error: null,
      } as never)

      const result = await createEvent({
        title: 'Diwali Gathering',
        description: 'Cultural program',
        event_type: 'FESTIVAL',
        start_time: FUTURE_DATE,
        end_time: FUTURE_END_DATE,
        location: 'Community Center',
        capacity: 150,
      })

      expect(supabase.rpc).toHaveBeenCalledWith('create_community_event', {
        p_title: 'Diwali Gathering',
        p_description: 'Cultural program',
        p_event_type: 'FESTIVAL',
        p_start_time: FUTURE_DATE,
        p_end_time: FUTURE_END_DATE,
        p_location: 'Community Center',
        p_location_url: null,
        p_group_id: null,
        p_capacity: 150,
        p_status: 'PUBLISHED',
        p_is_pinned: false,
      })
      expect(result.data).toBe(VALID_UUID_1)
      expect(result.error).toBeNull()
    })

    it('returns sanitized error if RPC fails', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Only community moderators can post global community events.',
          code: '42501',
        },
      } as never)

      const result = await createEvent({
        title: 'Unauthorized Global Event',
        event_type: 'GENERAL',
        start_time: FUTURE_DATE,
      })

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe(
        'Only community moderators can post or modify global community events.'
      )
    })
  })

  describe('updateEvent', () => {
    it('invokes update_community_event RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const result = await updateEvent({
        id: VALID_UUID_1,
        title: 'Updated Event',
        event_type: 'MEETING',
        start_time: FUTURE_DATE,
        status: 'PUBLISHED',
        is_pinned: true,
      })

      expect(supabase.rpc).toHaveBeenCalledWith('update_community_event', {
        p_event_id: VALID_UUID_1,
        p_title: 'Updated Event',
        p_description: null,
        p_event_type: 'MEETING',
        p_start_time: FUTURE_DATE,
        p_end_time: null,
        p_location: null,
        p_location_url: null,
        p_capacity: null,
        p_status: 'PUBLISHED',
        p_is_pinned: true,
      })
      expect(result.data).toBe(true)
    })
  })

  describe('cancelEvent', () => {
    it('invokes cancel_community_event RPC with reason', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const result = await cancelEvent({
        id: VALID_UUID_1,
        cancellation_reason: 'Bad weather warning.',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('cancel_community_event', {
        p_event_id: VALID_UUID_1,
        p_cancellation_reason: 'Bad weather warning.',
      })
      expect(result.data).toBe(true)
    })
  })

  describe('archiveEvent & deleteEvent', () => {
    it('invokes archive_community_event RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const result = await archiveEvent(VALID_UUID_1)

      expect(supabase.rpc).toHaveBeenCalledWith('archive_community_event', {
        p_event_id: VALID_UUID_1,
      })
      expect(result.data).toBe(true)
    })

    it('invokes delete_community_event RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const result = await deleteEvent(VALID_UUID_1)

      expect(supabase.rpc).toHaveBeenCalledWith('delete_community_event', {
        p_event_id: VALID_UUID_1,
      })
      expect(result.data).toBe(true)
    })
  })

  describe('setEventRsvp', () => {
    it('invokes set_event_rsvp RPC with valid parameters', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: VALID_UUID_2,
        error: null,
      } as never)

      const result = await setEventRsvp({
        event_id: VALID_UUID_1,
        status: 'GOING',
        guest_count: 2,
        notes: 'Arriving together',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('set_event_rsvp', {
        p_event_id: VALID_UUID_1,
        p_status: 'GOING',
        p_guest_count: 2,
        p_notes: 'Arriving together',
      })
      expect(result.data).toBe(VALID_UUID_2)
    })

    it('returns sanitized error when capacity is exceeded', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Event capacity exceeded. Available seats: 0',
          code: '23514',
        },
      } as never)

      const result = await setEventRsvp({
        event_id: VALID_UUID_1,
        status: 'GOING',
      })

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe(
        'Event capacity exceeded. No seats remaining for this reservation.'
      )
    })
  })

  describe('cancelEventRsvp', () => {
    it('invokes cancel_event_rsvp RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never)

      const result = await cancelEventRsvp(VALID_UUID_1)

      expect(supabase.rpc).toHaveBeenCalledWith('cancel_event_rsvp', {
        p_event_id: VALID_UUID_1,
      })
      expect(result.data).toBe(true)
    })
  })
})
