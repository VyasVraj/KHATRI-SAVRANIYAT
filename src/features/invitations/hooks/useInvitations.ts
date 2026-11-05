/**
 * React Query hooks for the Family Invitations feature (Phase 8 — Subtask 4B)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createFamilyInvitation,
  getInvitationByToken,
  acceptInvitation,
} from '../services/invitations.service'
import type {
  CreateFamilyInvitationInput,
  CreatedInvitationResult,
  InvitationPreview,
} from '../types'

/**
 * Hook to retrieve safe preview details of an invitation by its plaintext token.
 * Can be run anonymously or authenticated.
 *
 * @param token - Plaintext invitation token from URL
 */
export function useInvitationPreview(token: string | undefined) {
  return useQuery<InvitationPreview | null, Error>({
    queryKey: ['invitation-preview', token],
    queryFn: async () => {
      if (!token) return null
      const res = await getInvitationByToken(token)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    enabled: Boolean(token && token.trim().length > 0),
    staleTime: 1000 * 60, // 1 minute
    retry: false, // Don't retry on 404/invalid tokens
  })
}

/**
 * Hook providing mutations to create and accept family invitations.
 */
export function useInvitationMutations() {
  const queryClient = useQueryClient()

  const createInvitationMutation = useMutation<
    CreatedInvitationResult,
    Error,
    CreateFamilyInvitationInput
  >({
    mutationFn: async (input: CreateFamilyInvitationInput) => {
      const res = await createFamilyInvitation(input)
      if (res.error) {
        throw new Error(res.error.message)
      }
      if (!res.data) {
        throw new Error('Failed to create invitation.')
      }
      return res.data
    },
    onSuccess: (data) => {
      // Invalidate target family members query so new members roster reflects accurately
      queryClient.invalidateQueries({ queryKey: ['family-members', data.familyId] })
      queryClient.invalidateQueries({ queryKey: ['family', data.familyId] })
    },
  })

  const acceptInvitationMutation = useMutation<boolean, Error, { token: string; familyId?: string; personId?: string }>({
    mutationFn: async ({ token }: { token: string }) => {
      const res = await acceptInvitation(token)
      if (res.error) {
        throw new Error(res.error.message)
      }
      return Boolean(res.data)
    },
    onSuccess: (_, variables) => {
      // Invalidate invitation preview
      queryClient.invalidateQueries({ queryKey: ['invitation-preview', variables.token] })

      // Invalidate family members and family queries if familyId is known
      if (variables.familyId) {
        queryClient.invalidateQueries({ queryKey: ['family-members', variables.familyId] })
        queryClient.invalidateQueries({ queryKey: ['family', variables.familyId] })
      }

      // Invalidate person families list if personId is known
      if (variables.personId) {
        queryClient.invalidateQueries({ queryKey: ['person-families', variables.personId] })
        queryClient.invalidateQueries({ queryKey: ['person', variables.personId] })
      }

      // Invalidate global family list
      queryClient.invalidateQueries({ queryKey: ['families'] })
    },
  })

  return {
    createInvitation: createInvitationMutation,
    acceptInvitation: acceptInvitationMutation,
  }
}
