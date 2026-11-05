/**
 * Community Groups React Query Hooks (Phase 10 — Subtask 1)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import {
  listGroups,
  getGroupBySlug,
  getGroupMembers,
  createGroup,
  joinGroup,
  leaveGroup,
} from '../services/groups.service'
import type {
  GroupFilters,
  CreateGroupInput,
  GroupWithMembership,
  GroupMember,
} from '../types'

/**
 * Hook to fetch active community groups with membership details and counts.
 */
export function useGroups(filters?: GroupFilters) {
  const { user } = useAuthContext()

  return useQuery<GroupWithMembership[], Error>({
    queryKey: ['community-groups', filters, user?.id],
    queryFn: async () => {
      const res = await listGroups(filters, user?.id)
      if (res.error || !res.data) {
        throw new Error(res.error?.message ?? 'Failed to load community groups.')
      }
      return res.data
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

/**
 * Hook to fetch a single group by slug with caller membership details.
 */
export function useGroupBySlug(slug: string) {
  const { user } = useAuthContext()

  return useQuery<GroupWithMembership, Error>({
    queryKey: ['community-group', slug, user?.id],
    queryFn: async () => {
      const res = await getGroupBySlug(slug, user?.id)
      if (res.error || !res.data) {
        throw new Error(res.error?.message ?? 'Failed to load group details.')
      }
      return res.data
    },
    enabled: Boolean(slug),
  })
}

/**
 * Hook to fetch members of a specific community group.
 */
export function useGroupMembers(groupId: string) {
  return useQuery<GroupMember[], Error>({
    queryKey: ['community-group-members', groupId],
    queryFn: async () => {
      const res = await getGroupMembers(groupId)
      if (res.error || !res.data) {
        throw new Error(res.error?.message ?? 'Failed to load group members.')
      }
      return res.data
    },
    enabled: Boolean(groupId),
  })
}

/**
 * Mutation hook to create a new community group atomically.
 */
export function useCreateGroup() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()

  return useMutation<string, Error, CreateGroupInput>({
    mutationFn: async (input: CreateGroupInput) => {
      const res = await createGroup(input, user?.id)
      if (res.error || !res.data) {
        throw new Error(res.error?.message ?? 'Failed to create group.')
      }
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-groups'] })
    },
  })
}

/**
 * Mutation hook to join a public community group.
 */
export function useJoinGroup() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()

  return useMutation<string, Error, string>({
    mutationFn: async (groupId: string) => {
      const res = await joinGroup(groupId, user?.id)
      if (res.error || !res.data) {
        throw new Error(res.error?.message ?? 'Failed to join group.')
      }
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-groups'] })
      queryClient.invalidateQueries({ queryKey: ['community-group'] })
      queryClient.invalidateQueries({ queryKey: ['community-group-members'] })
    },
  })
}

/**
 * Mutation hook to leave a community group.
 */
export function useLeaveGroup() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()

  return useMutation<boolean, Error, string>({
    mutationFn: async (groupId: string) => {
      const res = await leaveGroup(groupId, user?.id)
      if (res.error || !res.data) {
        throw new Error(res.error?.message ?? 'Failed to leave group.')
      }
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-groups'] })
      queryClient.invalidateQueries({ queryKey: ['community-group'] })
      queryClient.invalidateQueries({ queryKey: ['community-group-members'] })
    },
  })
}
