import { describe, it, expect } from 'vitest'
import {
  createEventSchema,
  updateEventSchema,
  cancelEventSchema,
  setEventRsvpSchema,
  eventFiltersSchema,
  EVENT_TYPES,
  EVENT_STATUSES,
  EVENT_RSVP_STATUSES,
} from '@/features/community/schemas/event.schemas'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'
const FUTURE_DATE = '2026-11-01T10:00:00.000Z'
const FUTURE_END_DATE = '2026-11-01T13:00:00.000Z'
const PAST_DATE = '2026-11-01T08:00:00.000Z'

describe('event.schemas', () => {
  describe('constants & enums', () => {
    it('contains all canonical event types', () => {
      expect(EVENT_TYPES).toEqual([
        'GENERAL',
        'FESTIVAL',
        'MEETING',
        'SPORTS',
        'YOUTH',
        'CULTURAL',
        'WORKSHOP',
        'OTHER',
      ])
    })

    it('contains all canonical event statuses', () => {
      expect(EVENT_STATUSES).toEqual([
        'DRAFT',
        'PUBLISHED',
        'CANCELLED',
        'COMPLETED',
        'ARCHIVED',
      ])
    })

    it('contains all canonical RSVP statuses', () => {
      expect(EVENT_RSVP_STATUSES).toEqual(['GOING', 'MAYBE', 'NOT_GOING'])
    })
  })

  describe('createEventSchema', () => {
    it('accepts valid input with defaults', () => {
      const parsed = createEventSchema.parse({
        title: 'Community Annual Gathering',
        event_type: 'FESTIVAL',
        start_time: FUTURE_DATE,
      })

      expect(parsed.title).toBe('Community Annual Gathering')
      expect(parsed.status).toBe('PUBLISHED')
      expect(parsed.is_pinned).toBe(false)
      expect(parsed.group_id).toBeNull()
      expect(parsed.capacity).toBeNull()
      expect(parsed.end_time).toBeNull()
    })

    it('accepts valid end_time after start_time and positive capacity', () => {
      const parsed = createEventSchema.parse({
        title: 'Youth Cricket League',
        description: 'Under-19 tournament at grounds.',
        event_type: 'SPORTS',
        start_time: FUTURE_DATE,
        end_time: FUTURE_END_DATE,
        location: 'Wankhede Club Ground',
        capacity: 100,
        group_id: VALID_UUID,
        is_pinned: true,
      })

      expect(parsed.capacity).toBe(100)
      expect(parsed.is_pinned).toBe(true)
    })

    it('rejects end_time earlier than start_time', () => {
      const result = createEventSchema.safeParse({
        title: 'Invalid Program Time',
        event_type: 'MEETING',
        start_time: FUTURE_DATE,
        end_time: PAST_DATE,
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          'End time cannot be earlier than start time'
        )
      }
    })

    it('rejects non-positive capacity', () => {
      const result = createEventSchema.safeParse({
        title: 'Zero Capacity Test',
        event_type: 'WORKSHOP',
        start_time: FUTURE_DATE,
        capacity: 0,
      })

      expect(result.success).toBe(false)
    })

    it('rejects empty title or title exceeding 200 characters', () => {
      expect(
        createEventSchema.safeParse({
          title: '',
          event_type: 'GENERAL',
          start_time: FUTURE_DATE,
        }).success
      ).toBe(false)

      expect(
        createEventSchema.safeParse({
          title: 'a'.repeat(201),
          event_type: 'GENERAL',
          start_time: FUTURE_DATE,
        }).success
      ).toBe(false)
    })
  })

  describe('updateEventSchema', () => {
    it('accepts valid update parameters', () => {
      const parsed = updateEventSchema.parse({
        id: VALID_UUID,
        title: 'Updated Event Title',
        event_type: 'CULTURAL',
        start_time: FUTURE_DATE,
        end_time: FUTURE_END_DATE,
        status: 'PUBLISHED',
        is_pinned: false,
      })

      expect(parsed.id).toBe(VALID_UUID)
      expect(parsed.title).toBe('Updated Event Title')
    })

    it('rejects invalid UUID id', () => {
      expect(
        updateEventSchema.safeParse({
          id: 'invalid-id',
          title: 'Updated',
          event_type: 'GENERAL',
          start_time: FUTURE_DATE,
          status: 'PUBLISHED',
          is_pinned: false,
        }).success
      ).toBe(false)
    })
  })

  describe('cancelEventSchema', () => {
    it('accepts valid cancellation with reason', () => {
      const parsed = cancelEventSchema.parse({
        id: VALID_UUID,
        cancellation_reason: 'Rain expected all day.',
      })

      expect(parsed.id).toBe(VALID_UUID)
      expect(parsed.cancellation_reason).toBe('Rain expected all day.')
    })

    it('rejects cancellation reason exceeding 1000 characters', () => {
      expect(
        cancelEventSchema.safeParse({
          id: VALID_UUID,
          cancellation_reason: 'r'.repeat(1001),
        }).success
      ).toBe(false)
    })
  })

  describe('setEventRsvpSchema', () => {
    it('accepts valid RSVP with defaults', () => {
      const parsed = setEventRsvpSchema.parse({
        event_id: VALID_UUID,
      })

      expect(parsed.status).toBe('GOING')
      expect(parsed.guest_count).toBe(0)
      expect(parsed.notes).toBeNull()
    })

    it('accepts guest count up to 5', () => {
      const parsed = setEventRsvpSchema.parse({
        event_id: VALID_UUID,
        status: 'GOING',
        guest_count: 5,
        notes: 'Arriving with family.',
      })

      expect(parsed.guest_count).toBe(5)
    })

    it('rejects guest count > 5 or negative', () => {
      expect(
        setEventRsvpSchema.safeParse({
          event_id: VALID_UUID,
          guest_count: 6,
        }).success
      ).toBe(false)

      expect(
        setEventRsvpSchema.safeParse({
          event_id: VALID_UUID,
          guest_count: -1,
        }).success
      ).toBe(false)
    })

    it('rejects notes exceeding 300 characters', () => {
      expect(
        setEventRsvpSchema.safeParse({
          event_id: VALID_UUID,
          notes: 'n'.repeat(301),
        }).success
      ).toBe(false)
    })
  })

  describe('eventFiltersSchema', () => {
    it('applies expected defaults for filters', () => {
      const parsed = eventFiltersSchema.parse({})

      expect(parsed.event_type).toBe('ALL')
      expect(parsed.scope).toBe('ALL')
      expect(parsed.timeframe).toBe('UPCOMING')
      expect(parsed.status).toBe('ALL')
    })
  })
})
