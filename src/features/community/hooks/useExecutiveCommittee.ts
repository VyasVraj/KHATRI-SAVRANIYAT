/**
 * useExecutiveCommittee — TanStack Query hook for the 31-member Executive Committee directory.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getExecutiveCommitteeMembers,
  upsertExecutiveCommitteeMember,
  toggleExecutiveCommitteeMemberStatus,
  type ExecutiveCommitteeFilters,
  type ExecutiveCommitteeMember,
} from '../services/executive-committee.service'

export function useExecutiveCommittee(filters: ExecutiveCommitteeFilters = {}) {
  const queryClient = useQueryClient()

  const query = useQuery<ExecutiveCommitteeMember[]>({
    queryKey: ['community', 'executive-committee', filters],
    queryFn: async () => {
      const res = await getExecutiveCommitteeMembers(filters)
      if (res.error) throw res.error
      return res.data ?? []
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const upsertMutation = useMutation({
    mutationFn: async (member: Partial<ExecutiveCommitteeMember>) => {
      const res = await upsertExecutiveCommitteeMember(member)
      if (res.error) throw res.error
      return res.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community', 'executive-committee'] })
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await toggleExecutiveCommitteeMemberStatus(id, isActive)
      if (res.error) throw res.error
      return res.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community', 'executive-committee'] })
    },
  })

  return {
    members: query.data ?? [],
    totalCount: query.data?.length ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    upsertMember: upsertMutation.mutateAsync,
    isUpserting: upsertMutation.isPending,
    toggleStatus: toggleStatusMutation.mutateAsync,
    isTogglingStatus: toggleStatusMutation.isPending,
  }
}
