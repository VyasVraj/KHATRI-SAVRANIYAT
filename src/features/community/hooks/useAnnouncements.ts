/**
 * Community Announcements TanStack Query Hooks (Phase 10 — Subtask 2)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import {
  listAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  archiveAnnouncement,
  deleteAnnouncement,
} from '../services/announcements.service'
import type {
  AnnouncementFilters,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from '../types'

export const ANNOUNCEMENTS_QUERY_KEY = 'community-announcements'
export const ANNOUNCEMENT_DETAIL_KEY = 'community-announcement'

/**
 * Hook to query announcements with optional filters.
 */
export function useAnnouncements(filters?: AnnouncementFilters) {
  const { user } = useAuthContext()

  return useQuery({
    queryKey: [ANNOUNCEMENTS_QUERY_KEY, filters, user?.id],
    queryFn: async () => {
      const response = await listAnnouncements(filters, user?.id)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data || []
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

/**
 * Hook to query a single announcement by ID.
 */
export function useAnnouncement(id: string | undefined) {
  const { user } = useAuthContext()

  return useQuery({
    queryKey: [ANNOUNCEMENT_DETAIL_KEY, id, user?.id],
    queryFn: async () => {
      if (!id) return null
      const response = await getAnnouncementById(id, user?.id)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    enabled: Boolean(id),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Hook to authoritatively create a community announcement.
 */
export function useCreateAnnouncement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateAnnouncementInput) => {
      const response = await createAnnouncement(input)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ANNOUNCEMENTS_QUERY_KEY] })
    },
  })
}

/**
 * Hook to authoritatively update an announcement.
 */
export function useUpdateAnnouncement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateAnnouncementInput) => {
      const response = await updateAnnouncement(input)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [ANNOUNCEMENTS_QUERY_KEY] })
      queryClient.invalidateQueries({
        queryKey: [ANNOUNCEMENT_DETAIL_KEY, variables.id],
      })
    },
  })
}

/**
 * Hook to archive an announcement.
 */
export function useArchiveAnnouncement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await archiveAnnouncement(id)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ANNOUNCEMENTS_QUERY_KEY] })
    },
  })
}

/**
 * Hook to soft-delete an announcement.
 */
export function useDeleteAnnouncement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await deleteAnnouncement(id)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ANNOUNCEMENTS_QUERY_KEY] })
    },
  })
}
