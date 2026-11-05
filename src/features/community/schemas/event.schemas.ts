/**
 * Community Events & RSVP Zod Schemas (Phase 10 — Subtask 3)
 */

import { z } from 'zod'
import { sanitizeText, sanitizeMultilineText } from '@/lib/sanitization'

export const EVENT_TYPES = [
  'GENERAL',
  'FESTIVAL',
  'MEETING',
  'SPORTS',
  'YOUTH',
  'CULTURAL',
  'WORKSHOP',
  'OTHER',
] as const

export const EVENT_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'CANCELLED',
  'COMPLETED',
  'ARCHIVED',
] as const

export const EVENT_RSVP_STATUSES = ['GOING', 'MAYBE', 'NOT_GOING'] as const

export const eventTypeEnum = z.enum(EVENT_TYPES)
export const eventStatusEnum = z.enum(EVENT_STATUSES)
export const eventRsvpStatusEnum = z.enum(EVENT_RSVP_STATUSES)

export const createEventSchema = z
  .object({
    title: z
      .string()
      .transform(sanitizeText)
      .pipe(
        z
          .string()
          .min(1, 'Title is required')
          .max(200, 'Title must not exceed 200 characters')
      ),
    description: z
      .string()
      .transform(sanitizeMultilineText)
      .pipe(z.string().max(10000, 'Description must not exceed 10,000 characters'))
      .nullable()
      .optional()
      .default(null),
    event_type: eventTypeEnum,
    start_time: z
      .string()
      .min(1, 'Start time is required')
      .refine(
        (val) => !isNaN(Date.parse(val)),
        'Invalid start date/time format'
      ),
    end_time: z
      .string()
      .nullable()
      .optional()
      .refine(
        (val) => !val || !isNaN(Date.parse(val)),
        'Invalid end date/time format'
      )
      .default(null),
    location: z
      .string()
      .transform(sanitizeText)
      .pipe(z.string().max(300, 'Location must not exceed 300 characters'))
      .nullable()
      .optional()
      .default(null),
    location_url: z
      .string()
      .trim()
      .max(500, 'Location URL must not exceed 500 characters')
      .nullable()
      .optional()
      .default(null),
    group_id: z.string().uuid('Invalid group ID').nullable().optional().default(null),
    capacity: z
      .number()
      .int('Capacity must be an integer')
      .positive('Capacity must be greater than zero')
      .nullable()
      .optional()
      .default(null),
    status: eventStatusEnum.default('PUBLISHED'),
    is_pinned: z.boolean().default(false),
  })
  .refine(
    (data) => {
      if (!data.end_time || !data.start_time) return true
      return new Date(data.end_time) >= new Date(data.start_time)
    },
    {
      message: 'End time cannot be earlier than start time',
      path: ['end_time'],
    }
  )

export const updateEventSchema = z
  .object({
    id: z.string().uuid('Invalid event ID'),
    title: z
      .string()
      .transform(sanitizeText)
      .pipe(
        z
          .string()
          .min(1, 'Title is required')
          .max(200, 'Title must not exceed 200 characters')
      ),
    description: z
      .string()
      .transform(sanitizeMultilineText)
      .pipe(z.string().max(10000, 'Description must not exceed 10,000 characters'))
      .nullable()
      .optional(),
    event_type: eventTypeEnum,
    start_time: z
      .string()
      .min(1, 'Start time is required')
      .refine(
        (val) => !isNaN(Date.parse(val)),
        'Invalid start date/time format'
      ),
    end_time: z
      .string()
      .nullable()
      .optional()
      .refine(
        (val) => !val || !isNaN(Date.parse(val)),
        'Invalid end date/time format'
      ),
    location: z
      .string()
      .transform(sanitizeText)
      .pipe(z.string().max(300, 'Location must not exceed 300 characters'))
      .nullable()
      .optional(),
    location_url: z
      .string()
      .trim()
      .max(500, 'Location URL must not exceed 500 characters')
      .nullable()
      .optional(),
    capacity: z
      .number()
      .int('Capacity must be an integer')
      .positive('Capacity must be greater than zero')
      .nullable()
      .optional(),
    status: eventStatusEnum,
    is_pinned: z.boolean(),
  })
  .refine(
    (data) => {
      if (!data.end_time || !data.start_time) return true
      return new Date(data.end_time) >= new Date(data.start_time)
    },
    {
      message: 'End time cannot be earlier than start time',
      path: ['end_time'],
    }
  )

export const cancelEventSchema = z.object({
  id: z.string().uuid('Invalid event ID'),
  cancellation_reason: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().max(1000, 'Cancellation reason must not exceed 1000 characters'))
    .nullable()
    .optional(),
})

export const setEventRsvpSchema = z.object({
  event_id: z.string().uuid('Invalid event ID'),
  status: eventRsvpStatusEnum.default('GOING'),
  guest_count: z
    .number()
    .int('Guest count must be an integer')
    .min(0, 'Guest count cannot be negative')
    .max(5, 'Maximum of 5 additional guests allowed')
    .default(0),
  notes: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().max(300, 'Notes must not exceed 300 characters'))
    .nullable()
    .optional()
    .default(null),
})

export const eventFiltersSchema = z.object({
  search: z.string().trim().optional(),
  event_type: z.enum(['ALL', ...EVENT_TYPES]).default('ALL'),
  scope: z.enum(['ALL', 'GLOBAL', 'MY_GROUPS']).default('ALL'),
  timeframe: z.enum(['ALL', 'UPCOMING', 'PAST']).default('UPCOMING'),
  group_id: z.string().nullable().optional(),
  status: z.enum(['ALL', ...EVENT_STATUSES]).default('ALL'),
})

export type CreateEventFormData = z.infer<typeof createEventSchema>
export type UpdateEventFormData = z.infer<typeof updateEventSchema>
export type CancelEventFormData = z.infer<typeof cancelEventSchema>
export type SetEventRsvpFormData = z.infer<typeof setEventRsvpSchema>
