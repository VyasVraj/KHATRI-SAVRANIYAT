/**
 * Unit Tests: Community Events Hooks (Phase 10 — Subtask 3)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useCreateEvent,
  useUpdateEvent,
  useCancelEvent,
  useArchiveEvent,
  useDeleteEvent,
  useSetEventRsvp,
  useCancelEventRsvp,
} from '@/features/community/hooks/useEvents'
import * as eventsService from '@/features/community/services/events.service'

vi.mock('@/features/community/services/events.service')
vi.mock('@/features/auth/context/AuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    isAuthenticated: true,
  }),
}))

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

describe('Community Events Hooks', () => {
  let queryClient: QueryClient

  function captureHook<T>(hookFn: () => T): T {
    let captured!: T
    function TestComponent() {
      captured = hookFn()
      return null
    }
    renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(TestComponent)
      )
    )
    return captured
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  })

  describe('useCreateEvent', () => {
    it('calls createEvent service and invalidates query cache', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(eventsService.createEvent).mockResolvedValueOnce({
        data: VALID_UUID,
        error: null,
      })

      const mutation = captureHook(() => useCreateEvent())
      const result = await mutation.mutateAsync({
        title: 'Diwali Sneh Milan',
        event_type: 'FESTIVAL',
        start_time: '2026-11-01T10:00:00Z',
      })

      expect(eventsService.createEvent).toHaveBeenCalledWith({
        title: 'Diwali Sneh Milan',
        event_type: 'FESTIVAL',
        start_time: '2026-11-01T10:00:00Z',
      })
      expect(result).toBe(VALID_UUID)
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-events'],
      })
    })

    it('throws error when service returns error', async () => {
      vi.mocked(eventsService.createEvent).mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'Unauthorized permission denied.' },
      })

      const mutation = captureHook(() => useCreateEvent())

      await expect(
        mutation.mutateAsync({
          title: 'Unauthorized Event',
          event_type: 'GENERAL',
          start_time: '2026-11-01T10:00:00Z',
        })
      ).rejects.toThrow('Unauthorized permission denied.')
    })
  })

  describe('useUpdateEvent', () => {
    it('calls updateEvent service and invalidates caches', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(eventsService.updateEvent).mockResolvedValueOnce({
        data: true,
        error: null,
      })

      const mutation = captureHook(() => useUpdateEvent())
      await mutation.mutateAsync({
        id: VALID_UUID,
        title: 'Updated Event Title',
        event_type: 'MEETING',
        start_time: '2026-11-01T10:00:00Z',
        status: 'PUBLISHED',
        is_pinned: true,
      })

      expect(eventsService.updateEvent).toHaveBeenCalledWith({
        id: VALID_UUID,
        title: 'Updated Event Title',
        event_type: 'MEETING',
        start_time: '2026-11-01T10:00:00Z',
        status: 'PUBLISHED',
        is_pinned: true,
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-events'],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-event', VALID_UUID],
      })
    })
  })

  describe('useCancelEvent', () => {
    it('calls cancelEvent service and invalidates caches', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(eventsService.cancelEvent).mockResolvedValueOnce({
        data: true,
        error: null,
      })

      const mutation = captureHook(() => useCancelEvent())
      await mutation.mutateAsync({
        id: VALID_UUID,
        cancellation_reason: 'Bad weather.',
      })

      expect(eventsService.cancelEvent).toHaveBeenCalledWith({
        id: VALID_UUID,
        cancellation_reason: 'Bad weather.',
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-events'],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-event', VALID_UUID],
      })
    })
  })

  describe('useArchiveEvent & useDeleteEvent', () => {
    it('calls archiveEvent service and invalidates cache', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(eventsService.archiveEvent).mockResolvedValueOnce({
        data: true,
        error: null,
      })

      const mutation = captureHook(() => useArchiveEvent())
      await mutation.mutateAsync(VALID_UUID)

      expect(eventsService.archiveEvent).toHaveBeenCalledWith(VALID_UUID)
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-events'],
      })
    })

    it('calls deleteEvent service and invalidates cache', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(eventsService.deleteEvent).mockResolvedValueOnce({
        data: true,
        error: null,
      })

      const mutation = captureHook(() => useDeleteEvent())
      await mutation.mutateAsync(VALID_UUID)

      expect(eventsService.deleteEvent).toHaveBeenCalledWith(VALID_UUID)
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-events'],
      })
    })
  })

  describe('useSetEventRsvp & useCancelEventRsvp', () => {
    it('calls setEventRsvp and invalidates event and rsvps caches', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(eventsService.setEventRsvp).mockResolvedValueOnce({
        data: 'rsvp-1',
        error: null,
      })

      const mutation = captureHook(() => useSetEventRsvp())
      await mutation.mutateAsync({
        event_id: VALID_UUID,
        status: 'GOING',
        guest_count: 2,
      })

      expect(eventsService.setEventRsvp).toHaveBeenCalledWith({
        event_id: VALID_UUID,
        status: 'GOING',
        guest_count: 2,
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-events'],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-event', VALID_UUID],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-event-rsvps', VALID_UUID],
      })
    })

    it('calls cancelEventRsvp and invalidates event and rsvps caches', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(eventsService.cancelEventRsvp).mockResolvedValueOnce({
        data: true,
        error: null,
      })

      const mutation = captureHook(() => useCancelEventRsvp())
      await mutation.mutateAsync(VALID_UUID)

      expect(eventsService.cancelEventRsvp).toHaveBeenCalledWith(VALID_UUID)
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-events'],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-event', VALID_UUID],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-event-rsvps', VALID_UUID],
      })
    })
  })
})
