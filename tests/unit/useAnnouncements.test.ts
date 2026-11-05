/**
 * Unit Tests: Community Announcements Hooks (Phase 10 — Subtask 2)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useArchiveAnnouncement,
  useDeleteAnnouncement,
} from '@/features/community/hooks/useAnnouncements'
import * as announcementsService from '@/features/community/services/announcements.service'

vi.mock('@/features/community/services/announcements.service')
vi.mock('@/features/auth/context/AuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    isAuthenticated: true,
  }),
}))

describe('Community Announcements Hooks', () => {
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

  describe('useCreateAnnouncement', () => {
    it('calls createAnnouncement service and invalidates query cache', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(announcementsService.createAnnouncement).mockResolvedValueOnce({
        data: 'new-ann-id',
        error: null,
      })

      const mutation = captureHook(() => useCreateAnnouncement())
      const result = await mutation.mutateAsync({
        title: 'New Annual Meeting',
        content: 'Meeting on Sunday.',
        announcement_type: 'GENERAL',
      })

      expect(announcementsService.createAnnouncement).toHaveBeenCalledWith({
        title: 'New Annual Meeting',
        content: 'Meeting on Sunday.',
        announcement_type: 'GENERAL',
      })
      expect(result).toBe('new-ann-id')
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-announcements'],
      })
    })

    it('throws error when service returns error', async () => {
      vi.mocked(announcementsService.createAnnouncement).mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'Unauthorized permission denied.' },
      })

      const mutation = captureHook(() => useCreateAnnouncement())

      await expect(
        mutation.mutateAsync({
          title: 'Unauthorized Announcement',
          content: 'Details.',
          announcement_type: 'URGENT',
        })
      ).rejects.toThrow('Unauthorized permission denied.')
    })
  })

  describe('useUpdateAnnouncement', () => {
    it('calls updateAnnouncement service and invalidates cache', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(announcementsService.updateAnnouncement).mockResolvedValueOnce({
        data: true,
        error: null,
      })

      const mutation = captureHook(() => useUpdateAnnouncement())
      await mutation.mutateAsync({
        id: 'ann-1',
        title: 'Updated Title',
        content: 'Updated Content',
        announcement_type: 'URGENT',
        status: 'PUBLISHED',
        is_pinned: true,
      })

      expect(announcementsService.updateAnnouncement).toHaveBeenCalledWith({
        id: 'ann-1',
        title: 'Updated Title',
        content: 'Updated Content',
        announcement_type: 'URGENT',
        status: 'PUBLISHED',
        is_pinned: true,
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-announcements'],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-announcement', 'ann-1'],
      })
    })
  })

  describe('useArchiveAnnouncement', () => {
    it('calls archiveAnnouncement service and invalidates cache', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(announcementsService.archiveAnnouncement).mockResolvedValueOnce({
        data: true,
        error: null,
      })

      const mutation = captureHook(() => useArchiveAnnouncement())
      await mutation.mutateAsync('ann-1')

      expect(announcementsService.archiveAnnouncement).toHaveBeenCalledWith('ann-1')
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-announcements'],
      })
    })
  })

  describe('useDeleteAnnouncement', () => {
    it('calls deleteAnnouncement service and invalidates cache', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(announcementsService.deleteAnnouncement).mockResolvedValueOnce({
        data: true,
        error: null,
      })

      const mutation = captureHook(() => useDeleteAnnouncement())
      await mutation.mutateAsync('ann-1')

      expect(announcementsService.deleteAnnouncement).toHaveBeenCalledWith('ann-1')
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['community-announcements'],
      })
    })
  })
})
