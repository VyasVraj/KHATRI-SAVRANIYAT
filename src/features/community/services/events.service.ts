/**
 * Community Events & RSVP Service (Phase 10 — Subtask 3)
 *
 * Implements strict domain boundaries:
 * - Direct table mutations are guarded; event lifecycle operations and RSVP
 *   registration route strictly through authoritative PostgreSQL RPCs.
 * - PERSON != USER: Event creator and attendee RSVPs link to interactive user
 *   accounts (public.profiles / auth.users).
 * - FAMILY != GROUP: Events belong to community groups or community at large,
 *   completely independent of family records.
 * - Capacity is database-authoritative with row-level locking.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse, AppError } from '@/types'
import {
  createEventSchema,
  updateEventSchema,
  cancelEventSchema,
  setEventRsvpSchema,
} from '../schemas/event.schemas'
import type {
  CommunityEvent,
  EventFilters,
  EventRsvp,
  CreateEventInput,
  UpdateEventInput,
  CancelEventInput,
  SetEventRsvpInput,
} from '../types'
import { ZodError } from 'zod'

// Helper accessors for untyped client access before remote code generation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eventsTable = () => (supabase.from as any)('events')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eventRsvpsTable = () => (supabase.from as any)('event_rsvps')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const groupMembersTable = () => (supabase.from as any)('group_members')
const rpcCall = (name: string, params: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.rpc as any)(name, params)

/**
 * Sanitizes PostgreSQL / Supabase errors into safe, user-facing error messages.
 */
export function sanitizeEventError(
  err: unknown,
  defaultMessage: string = 'An unexpected error occurred. Please try again.'
): string {
  if (!err) return defaultMessage

  const message =
    typeof err === 'string'
      ? err
      : (err as { message?: string })?.message ?? ''

  if (message.includes('capacity exceeded')) {
    return 'Event capacity exceeded. No seats remaining for this reservation.'
  }
  if (message.includes('already started or concluded')) {
    return 'Cannot RSVP: This event has already started or concluded.'
  }
  if (message.includes('not open for registration')) {
    return 'Cannot RSVP: This event is currently not open for registration.'
  }
  if (message.includes('reopen a cancelled event')) {
    return 'Cannot reopen a cancelled event whose start time has already passed.'
  }
  if (message.includes('global community events')) {
    return 'Only community moderators can post or modify global community events.'
  }
  if (
    message.includes('group managers') ||
    message.includes('group administrators')
  ) {
    return 'Only group managers or community moderators can post or modify events for this group.'
  }
  if (message.includes('already cancelled')) {
    return 'This event is already cancelled.'
  }
  if (message.includes('Unauthorized') || message.includes('42501')) {
    return 'You do not have permission to perform this action.'
  }
  if (message.includes('does not exist') || message.includes('P0002')) {
    return 'The requested event or community group could not be found.'
  }
  if (message.includes('between 1 and 200 characters')) {
    return 'Event title must be between 1 and 200 characters.'
  }
  if (message.includes('earlier than start time')) {
    return 'Event end time cannot be earlier than start time.'
  }
  if (message.includes('Guest count must be between 0 and 5')) {
    return 'Guest count must be between 0 and 5.'
  }

  return message || defaultMessage
}

/**
 * Retrieves a list of events matching given filters and caller scope.
 */
export async function listEvents(
  filters?: EventFilters,
  callerUserId?: string
): Promise<ApiResponse<CommunityEvent[]>> {
  try {
    let query = eventsTable()
      .select(`
        id,
        title,
        description,
        event_type,
        status,
        start_time,
        end_time,
        location,
        location_url,
        group_id,
        creator_id,
        is_pinned,
        capacity,
        published_at,
        cancelled_at,
        cancellation_reason,
        created_at,
        updated_at,
        deleted_at,
        creator:profiles!creator_id (
          id,
          display_name,
          email,
          avatar_url
        ),
        group:groups (
          id,
          name,
          slug
        )
      `)
      .is('deleted_at', null)

    // Filter by event_type
    if (filters?.event_type && filters.event_type !== 'ALL') {
      query = query.eq('event_type', filters.event_type)
    }

    // Filter by status (default to PUBLISHED if not specified)
    if (filters?.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status)
    } else if (!filters?.status) {
      query = query.in('status', ['PUBLISHED', 'CANCELLED', 'COMPLETED'])
    }

    // Filter by timeframe
    const nowIso = new Date().toISOString()
    if (filters?.timeframe === 'UPCOMING') {
      query = query.gte('start_time', nowIso)
    } else if (filters?.timeframe === 'PAST') {
      query = query.lt('start_time', nowIso)
    }

    // Filter by specific group
    if (filters?.group_id && filters.group_id !== 'ALL') {
      query = query.eq('group_id', filters.group_id)
    }

    // Scope filter: GLOBAL vs MY_GROUPS
    if (filters?.scope === 'GLOBAL') {
      query = query.is('group_id', null)
    } else if (filters?.scope === 'MY_GROUPS' && callerUserId) {
      const { data: myMemberships } = await groupMembersTable()
        .select('group_id')
        .eq('user_id', callerUserId)

      const myGroupIds = (myMemberships || []).map(
        (m: { group_id: string }) => m.group_id
      )

      if (myGroupIds.length > 0) {
        query = query.in('group_id', myGroupIds)
      } else {
        return { data: [], error: null }
      }
    }

    // Ordering: pinned first, then by start_time
    if (filters?.timeframe === 'PAST') {
      query = query.order('start_time', { ascending: false })
    } else {
      query = query
        .order('is_pinned', { ascending: false })
        .order('start_time', { ascending: true })
    }

    const { data: eventRows, error } = await query

    if (error) {
      const appErr: AppError = {
        code: error.code || 'EVENTS_QUERY_ERROR',
        message: sanitizeEventError(error),
      }
      return { data: null, error: appErr }
    }

    const eventList = eventRows || []
    if (eventList.length === 0) {
      return { data: [], error: null }
    }

    const eventIds = eventList.map((e: { id: string }) => e.id)

    // Fetch RSVP counts and caller's RSVP in batch
    const { data: rsvpRows } = await eventRsvpsTable()
      .select('event_id, user_id, status, guest_count, notes')
      .in('event_id', eventIds)

    const rsvps = rsvpRows || []

    // Map aggregated RSVP stats per event
    const rsvpStatsMap = new Map<
      string,
      {
        going: number
        maybe: number
        myStatus: 'GOING' | 'MAYBE' | 'NOT_GOING' | null
        myGuests: number
        myNotes: string | null
      }
    >()

    for (const r of rsvps) {
      const entry = rsvpStatsMap.get(r.event_id) || {
        going: 0,
        maybe: 0,
        myStatus: null,
        myGuests: 0,
        myNotes: null,
      }

      if (r.status === 'GOING') {
        entry.going += 1 + (r.guest_count || 0)
      } else if (r.status === 'MAYBE') {
        entry.maybe += 1
      }

      if (callerUserId && r.user_id === callerUserId) {
        entry.myStatus = r.status
        entry.myGuests = r.guest_count || 0
        entry.myNotes = r.notes || null
      }

      rsvpStatsMap.set(r.event_id, entry)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let items: CommunityEvent[] = eventList.map((row: any) => {
      const stats = rsvpStatsMap.get(row.id) || {
        going: 0,
        maybe: 0,
        myStatus: null,
        myGuests: 0,
        myNotes: null,
      }

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        event_type: row.event_type,
        status: row.status,
        start_time: row.start_time,
        end_time: row.end_time,
        location: row.location,
        location_url: row.location_url,
        group_id: row.group_id,
        group_name: row.group?.name || null,
        group_slug: row.group?.slug || null,
        creator_id: row.creator_id,
        creator_name: row.creator?.display_name || null,
        creator_email: row.creator?.email || null,
        creator_avatar: row.creator?.avatar_url || null,
        is_pinned: row.is_pinned,
        capacity: row.capacity,
        published_at: row.published_at,
        cancelled_at: row.cancelled_at,
        cancellation_reason: row.cancellation_reason,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at,
        creator: row.creator
          ? {
              id: row.creator.id,
              display_name: row.creator.display_name,
              email: row.creator.email,
              avatar_url: row.creator.avatar_url,
            }
          : undefined,
        rsvp_count_going: stats.going,
        rsvp_count_maybe: stats.maybe,
        my_rsvp_status: stats.myStatus,
        my_guest_count: stats.myGuests,
        my_notes: stats.myNotes,
        can_manage: callerUserId ? row.creator_id === callerUserId : false,
      }
    })

    // Client-side text search if specified
    if (filters?.search && filters.search.trim().length > 0) {
      const q = filters.search.toLowerCase()
      items = items.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.description && e.description.toLowerCase().includes(q)) ||
          (e.location && e.location.toLowerCase().includes(q)) ||
          (e.group_name && e.group_name.toLowerCase().includes(q))
      )
    }

    return { data: items, error: null }
  } catch (err) {
    const appErr: AppError = {
      code: 'EVENTS_FETCH_ERROR',
      message: sanitizeEventError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Retrieves a single event by ID with attendee stats and caller RSVP.
 */
export async function getEventById(
  id: string,
  callerUserId?: string
): Promise<ApiResponse<CommunityEvent>> {
  try {
    const { data, error } = await eventsTable()
      .select(`
        id,
        title,
        description,
        event_type,
        status,
        start_time,
        end_time,
        location,
        location_url,
        group_id,
        creator_id,
        is_pinned,
        capacity,
        published_at,
        cancelled_at,
        cancellation_reason,
        created_at,
        updated_at,
        deleted_at,
        creator:profiles!creator_id (
          id,
          display_name,
          email,
          avatar_url
        ),
        group:groups (
          id,
          name,
          slug
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      const appErr: AppError = {
        code: error.code || 'EVENT_FETCH_ERROR',
        message: sanitizeEventError(error),
      }
      return { data: null, error: appErr }
    }

    if (!data) {
      const appErr: AppError = {
        code: 'EVENT_NOT_FOUND',
        message: 'The requested event could not be found.',
      }
      return { data: null, error: appErr }
    }

    // Fetch RSVP stats
    const { data: rsvps } = await eventRsvpsTable()
      .select('user_id, status, guest_count, notes')
      .eq('event_id', id)

    let going = 0
    let maybe = 0
    let myStatus: 'GOING' | 'MAYBE' | 'NOT_GOING' | null = null
    let myGuests = 0
    let myNotes: string | null = null

    for (const r of rsvps || []) {
      if (r.status === 'GOING') {
        going += 1 + (r.guest_count || 0)
      } else if (r.status === 'MAYBE') {
        maybe += 1
      }

      if (callerUserId && r.user_id === callerUserId) {
        myStatus = r.status
        myGuests = r.guest_count || 0
        myNotes = r.notes || null
      }
    }

    const event: CommunityEvent = {
      id: data.id,
      title: data.title,
      description: data.description,
      event_type: data.event_type,
      status: data.status,
      start_time: data.start_time,
      end_time: data.end_time,
      location: data.location,
      location_url: data.location_url,
      group_id: data.group_id,
      group_name: data.group?.name || null,
      group_slug: data.group?.slug || null,
      creator_id: data.creator_id,
      creator_name: data.creator?.display_name || null,
      creator_email: data.creator?.email || null,
      creator_avatar: data.creator?.avatar_url || null,
      is_pinned: data.is_pinned,
      capacity: data.capacity,
      published_at: data.published_at,
      cancelled_at: data.cancelled_at,
      cancellation_reason: data.cancellation_reason,
      created_at: data.created_at,
      updated_at: data.updated_at,
      deleted_at: data.deleted_at,
      creator: data.creator
        ? {
            id: data.creator.id,
            display_name: data.creator.display_name,
            email: data.creator.email,
            avatar_url: data.creator.avatar_url,
          }
        : undefined,
      rsvp_count_going: going,
      rsvp_count_maybe: maybe,
      my_rsvp_status: myStatus,
      my_guest_count: myGuests,
      my_notes: myNotes,
      can_manage: callerUserId ? data.creator_id === callerUserId : false,
    }

    return { data: event, error: null }
  } catch (err) {
    const appErr: AppError = {
      code: 'EVENT_FETCH_ERROR',
      message: sanitizeEventError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Retrieves the attendee roster for an event (restricted to organizers/moderators).
 */
export async function listEventRsvps(
  eventId: string
): Promise<ApiResponse<EventRsvp[]>> {
  try {
    const { data, error } = await eventRsvpsTable()
      .select(`
        id,
        event_id,
        user_id,
        status,
        guest_count,
        notes,
        created_at,
        updated_at,
        user:profiles!user_id (
          id,
          display_name,
          email,
          avatar_url
        )
      `)
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })

    if (error) {
      const appErr: AppError = {
        code: error.code || 'RSVP_FETCH_ERROR',
        message: sanitizeEventError(error),
      }
      return { data: null, error: appErr }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: EventRsvp[] = (data || []).map((row: any) => ({
      id: row.id,
      event_id: row.event_id,
      user_id: row.user_id,
      status: row.status,
      guest_count: row.guest_count,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user_display_name: row.user?.display_name || null,
      user_email: row.user?.email || null,
      user_avatar: row.user?.avatar_url || null,
    }))

    return { data: items, error: null }
  } catch (err) {
    const appErr: AppError = {
      code: 'RSVP_FETCH_ERROR',
      message: sanitizeEventError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Creates an event authoritatively via create_community_event RPC.
 */
export async function createEvent(
  input: CreateEventInput
): Promise<ApiResponse<string>> {
  try {
    const validated = createEventSchema.parse(input)

    const { data, error } = await rpcCall('create_community_event', {
      p_title: validated.title,
      p_description: validated.description || null,
      p_event_type: validated.event_type,
      p_start_time: validated.start_time,
      p_end_time: validated.end_time || null,
      p_location: validated.location || null,
      p_location_url: validated.location_url || null,
      p_group_id: validated.group_id || null,
      p_capacity: validated.capacity || null,
      p_status: validated.status,
      p_is_pinned: validated.is_pinned,
    })

    if (error) {
      const appErr: AppError = {
        code: error.code || 'EVENT_CREATE_ERROR',
        message: sanitizeEventError(error),
      }
      return { data: null, error: appErr }
    }

    return { data: data as string, error: null }
  } catch (err) {
    if (err instanceof ZodError) {
      const appErr: AppError = {
        code: 'VALIDATION_ERROR',
        message: err.errors[0]?.message || 'Invalid event data.',
      }
      return { data: null, error: appErr }
    }

    const appErr: AppError = {
      code: 'EVENT_CREATE_ERROR',
      message: sanitizeEventError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Updates an event authoritatively via update_community_event RPC.
 */
export async function updateEvent(
  input: UpdateEventInput
): Promise<ApiResponse<boolean>> {
  try {
    const validated = updateEventSchema.parse(input)

    const { data, error } = await rpcCall('update_community_event', {
      p_event_id: validated.id,
      p_title: validated.title,
      p_description: validated.description || null,
      p_event_type: validated.event_type,
      p_start_time: validated.start_time,
      p_end_time: validated.end_time || null,
      p_location: validated.location || null,
      p_location_url: validated.location_url || null,
      p_capacity: validated.capacity || null,
      p_status: validated.status,
      p_is_pinned: validated.is_pinned,
    })

    if (error) {
      const appErr: AppError = {
        code: error.code || 'EVENT_UPDATE_ERROR',
        message: sanitizeEventError(error),
      }
      return { data: null, error: appErr }
    }

    return { data: Boolean(data), error: null }
  } catch (err) {
    if (err instanceof ZodError) {
      const appErr: AppError = {
        code: 'VALIDATION_ERROR',
        message: err.errors[0]?.message || 'Invalid event update data.',
      }
      return { data: null, error: appErr }
    }

    const appErr: AppError = {
      code: 'EVENT_UPDATE_ERROR',
      message: sanitizeEventError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Cancels an event authoritatively via cancel_community_event RPC.
 */
export async function cancelEvent(
  input: CancelEventInput
): Promise<ApiResponse<boolean>> {
  try {
    const validated = cancelEventSchema.parse(input)

    const { data, error } = await rpcCall('cancel_community_event', {
      p_event_id: validated.id,
      p_cancellation_reason: validated.cancellation_reason || null,
    })

    if (error) {
      const appErr: AppError = {
        code: error.code || 'EVENT_CANCEL_ERROR',
        message: sanitizeEventError(error),
      }
      return { data: null, error: appErr }
    }

    return { data: Boolean(data), error: null }
  } catch (err) {
    const appErr: AppError = {
      code: 'EVENT_CANCEL_ERROR',
      message: sanitizeEventError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Archives an event authoritatively via archive_community_event RPC.
 */
export async function archiveEvent(
  id: string
): Promise<ApiResponse<boolean>> {
  try {
    const { data, error } = await rpcCall('archive_community_event', {
      p_event_id: id,
    })

    if (error) {
      const appErr: AppError = {
        code: error.code || 'EVENT_ARCHIVE_ERROR',
        message: sanitizeEventError(error),
      }
      return { data: null, error: appErr }
    }

    return { data: Boolean(data), error: null }
  } catch (err) {
    const appErr: AppError = {
      code: 'EVENT_ARCHIVE_ERROR',
      message: sanitizeEventError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Soft-deletes an event authoritatively via delete_community_event RPC.
 */
export async function deleteEvent(
  id: string
): Promise<ApiResponse<boolean>> {
  try {
    const { data, error } = await rpcCall('delete_community_event', {
      p_event_id: id,
    })

    if (error) {
      const appErr: AppError = {
        code: error.code || 'EVENT_DELETE_ERROR',
        message: sanitizeEventError(error),
      }
      return { data: null, error: appErr }
    }

    return { data: Boolean(data), error: null }
  } catch (err) {
    const appErr: AppError = {
      code: 'EVENT_DELETE_ERROR',
      message: sanitizeEventError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Sets an RSVP declaration authoritatively via set_event_rsvp RPC.
 */
export async function setEventRsvp(
  input: SetEventRsvpInput
): Promise<ApiResponse<string>> {
  try {
    const validated = setEventRsvpSchema.parse(input)

    const { data, error } = await rpcCall('set_event_rsvp', {
      p_event_id: validated.event_id,
      p_status: validated.status,
      p_guest_count: validated.guest_count,
      p_notes: validated.notes || null,
    })

    if (error) {
      const appErr: AppError = {
        code: error.code || 'RSVP_SET_ERROR',
        message: sanitizeEventError(error),
      }
      return { data: null, error: appErr }
    }

    return { data: data as string, error: null }
  } catch (err) {
    if (err instanceof ZodError) {
      const appErr: AppError = {
        code: 'VALIDATION_ERROR',
        message: err.errors[0]?.message || 'Invalid RSVP data.',
      }
      return { data: null, error: appErr }
    }

    const appErr: AppError = {
      code: 'RSVP_SET_ERROR',
      message: sanitizeEventError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Cancels an RSVP declaration authoritatively via cancel_event_rsvp RPC.
 */
export async function cancelEventRsvp(
  eventId: string
): Promise<ApiResponse<boolean>> {
  try {
    const { data, error } = await rpcCall('cancel_event_rsvp', {
      p_event_id: eventId,
    })

    if (error) {
      const appErr: AppError = {
        code: error.code || 'RSVP_CANCEL_ERROR',
        message: sanitizeEventError(error),
      }
      return { data: null, error: appErr }
    }

    return { data: Boolean(data), error: null }
  } catch (err) {
    const appErr: AppError = {
      code: 'RSVP_CANCEL_ERROR',
      message: sanitizeEventError(err),
    }
    return { data: null, error: appErr }
  }
}
