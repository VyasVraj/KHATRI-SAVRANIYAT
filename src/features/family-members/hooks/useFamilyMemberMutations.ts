/**
 * Family member mutation hooks — TanStack Query useMutation wrappers.
 *
 * All operations operate strictly through the family-members service layer.
 * The service layer validates schemas, enforces provenance (added_by = callerUserId),
 * and maps database errors.
 *
 * SECURITY RULES:
 * - added_by is derived from useAuthContext().user.id. Never accepted from UI forms.
 * - PERSON != USER: person_id refers to a public.persons row, not auth.users.
 * - Soft-removal: removeFamilyMember sets left_at = NOW() by default.
 * - RLS is the ultimate authorization authority.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import {
  addFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
  transferFamilyHead,
} from '../services/family-members.service'
import type {
  AddFamilyMemberInput,
  UpdateFamilyMemberInput,
} from '../schemas/family-members.schemas'

// ---------------------------------------------------------------------------
// useAddFamilyMember
// ---------------------------------------------------------------------------

/**
 * Mutation hook for adding a person to a family.
 *
 * Populates added_by from the authenticated user's ID via AuthContext.
 * Invalidates ['family-members', 'list', input.family_id] on success.
 */
export function useAddFamilyMember() {
  const queryClient = useQueryClient()
  const { user } = useAuthContext()

  return useMutation({
    mutationFn: async (input: AddFamilyMemberInput) => {
      if (!user) throw new Error('Authentication required to add family members.')
      const result = await addFamilyMember(input, user.id)
      if (result.error) throw result.error
      return result.data!
    },
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({
        queryKey: ['family-members', 'list', input.family_id],
      })
    },
  })
}

// ---------------------------------------------------------------------------
// useUpdateFamilyMember
// ---------------------------------------------------------------------------

/**
 * Mutation hook for updating attributes of an existing family member (role, is_head, left_at).
 *
 * @param familyId - UUID of the family (used for query cache invalidation)
 */
export function useUpdateFamilyMember(familyId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      memberId,
      input,
    }: {
      memberId: string
      input: UpdateFamilyMemberInput
    }) => {
      const result = await updateFamilyMember(memberId, input)
      if (result.error) throw result.error
      return result.data!
    },
    onSuccess: (_, { memberId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['family-members', 'list', familyId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['family-members', 'detail', memberId],
      })
    },
  })
}

// ---------------------------------------------------------------------------
// useRemoveFamilyMember
// ---------------------------------------------------------------------------

/**
 * Mutation hook for removing a family member.
 *
 * Defaults to soft-exit (sets left_at = NOW()), preserving genealogical ties.
 *
 * @param familyId - UUID of the family (used for query cache invalidation)
 */
export function useRemoveFamilyMember(familyId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (memberId: string) => {
      const result = await removeFamilyMember(memberId, { hardDelete: false })
      if (result.error) throw result.error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['family-members', 'list', familyId],
      })
    },
  })
}

// ---------------------------------------------------------------------------
// useTransferFamilyHead
// ---------------------------------------------------------------------------

/**
 * Mutation hook for transferring head-of-family designation.
 *
 * Client-orchestrated demote-then-promote sequence with rollback on failure.
 *
 * @param familyId - UUID of the family
 */
export function useTransferFamilyHead(familyId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (newHeadMemberId: string) => {
      const result = await transferFamilyHead(familyId, newHeadMemberId)
      if (result.error) throw result.error
      return result.data!
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['family-members', 'list', familyId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['families', familyId],
      })
    },
  })
}
