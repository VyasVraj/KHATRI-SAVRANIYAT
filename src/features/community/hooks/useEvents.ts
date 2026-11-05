/**
 * Community Events & RSVP TanStack Query Hooks (Phase 10 — Subtask 3)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import {
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
} from '../services/events.service'
import type {
  EventFilters,
  CreateEventInput,
  UpdateEventInput,
  CancelEventInput,
  SetEventRsvpInput,
} from '../types'

export const EVENTS_QUERY_KEY = 'community-events'
export const EVENT_DETAIL_KEY = 'community-event'
export const EVENT_RSVPS_KEY = 'community-event-rsvps'

/**
 * Hook to query community events with optional filters.
 */
export function useEvents(filters?: EventFilters) {
  const { user } = useAuthContext()

  return useQuery({
    queryKey: [EVENTS_QUERY_KEY, filters, user?.id],
    queryFn: async () => {
      const response = await listEvents(filters, user?.id)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data || []
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

/**
 * Hook to query a single event by ID with caller RSVP status.
 */
export function useEvent(id: string | undefined) {
  const { user } = useAuthContext()

  return useQuery({
    queryKey: [EVENT_DETAIL_KEY, id, user?.id],
    queryFn: async () => {
      if (!id) return null
      const response = await getEventById(id, user?.id)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    enabled: Boolean(id),
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

/**
 * Hook to query attendee roster (organizers/moderators only).
 */
export function useEventRsvps(eventId: string | undefined) {
  return useQuery({
    queryKey: [EVENT_RSVPS_KEY, eventId],
    queryFn: async () => {
      if (!eventId) return []
      const response = await listEventRsvps(eventId)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data || []
    },
    enabled: Boolean(eventId),
    staleTime: 1000 * 60 * 2,
  })
}

/**
 * Hook to authoritatively create a community event.
 */
export function useCreateEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const response = await createEvent(input)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EVENTS_QUERY_KEY] })
    },
  })
}

/**
 * Hook to authoritatively update an event.
 */
export function useUpdateEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateEventInput) => {
      const response = await updateEvent(input)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [EVENTS_QUERY_KEY] })
      queryClient.invalidateQueries({
        queryKey: [EVENT_DETAIL_KEY, variables.id],
      })
    },
  })
}

/**
 * Hook to authoritatively cancel an event.
 */
export function useCancelEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CancelEventInput) => {
      const response = await cancelEvent(input)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [EVENTS_QUERY_KEY] })
      queryClient.invalidateQueries({
        queryKey: [EVENT_DETAIL_KEY, variables.id],
      })
    },
  })
}

/**
 * Hook to authoritatively archive an event.
 */
export function useArchiveEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await archiveEvent(id)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [EVENTS_QUERY_KEY] })
      queryClient.invalidateQueries({
        queryKey: [EVENT_DETAIL_KEY, id],
      })
    },
  })
}

/**
 * Hook to authoritatively soft-delete an event.
 */
export function useDeleteEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await deleteEvent(id)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [EVENTS_QUERY_KEY] })
      queryClient.invalidateQueries({
        queryKey: [EVENT_DETAIL_KEY, id],
      })
    },
  })
}

/**
 * Hook to declare/update RSVP attendance intent.
 */
export function useSetEventRsvp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SetEventRsvpInput) => {
      const response = await setEventRsvp(input)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [EVENTS_QUERY_KEY] })
      queryClient.invalidateQueries({
        queryKey: [EVENT_DETAIL_KEY, variables.event_id],
      })
      queryClient.invalidateQueries({
        queryKey: [EVENT_RSVPS_KEY, variables.event_id],
      })
    },
  })
}

/**
 * Hook to cancel RSVP attendance (status -> NOT_GOING).
 */
export function useCancelEventRsvp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (eventId: string) => {
      const response = await cancelEventRsvp(eventId)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: [EVENTS_QUERY_KEY] })
      queryClient.invalidateQueries({
        queryKey: [EVENT_DETAIL_KEY, eventId],
      })
      queryClient.invalidateQueries({
        queryKey: [EVENT_RSVPS_KEY, eventId],
      })
    },
  })
}
