/**
 * Verification Hooks — React Query mutation hooks for verification requests (Phase 9 — Subtask 2)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  submitVerificationRequest,
  cancelVerificationRequest,
} from '../services/verification.service'
import type {
  SubmitVerificationRequestInput,
  SubmitVerificationResult,
} from '../types'

/**
 * Mutation hook for submitting a verification request.
 * Automatically invalidates targeted entity cache on success.
 */
export function useSubmitVerificationRequest() {
  const queryClient = useQueryClient()

  return useMutation<
    SubmitVerificationResult,
    Error,
    SubmitVerificationRequestInput
  >({
    mutationFn: async (input: SubmitVerificationRequestInput) => {
      const result = await submitVerificationRequest(input)
      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? 'Failed to submit verification request.')
      }
      return result.data
    },
    onSuccess: (data) => {
      if (data.entityType === 'PERSON') {
        queryClient.invalidateQueries({ queryKey: ['persons', data.entityId] })
        queryClient.invalidateQueries({ queryKey: ['people'] })
        queryClient.invalidateQueries({ queryKey: ['people-directory'] })
      } else if (data.entityType === 'FAMILY') {
        queryClient.invalidateQueries({ queryKey: ['families', data.entityId] })
        queryClient.invalidateQueries({ queryKey: ['families'] })
        queryClient.invalidateQueries({ queryKey: ['family-directory'] })
      }
      queryClient.invalidateQueries({ queryKey: ['verification-requests'] })
    },
  })
}

/**
 * Mutation hook for cancelling a verification request.
 * Invalidates verification requests and entity caches on success.
 */
export function useCancelVerificationRequest() {
  const queryClient = useQueryClient()

  return useMutation<boolean, Error, { requestId: string; entityType?: 'PERSON' | 'FAMILY'; entityId?: string }>({
    mutationFn: async ({ requestId }) => {
      const result = await cancelVerificationRequest(requestId)
      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? 'Failed to cancel verification request.')
      }
      return result.data
    },

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['verification-requests'] })
      if (variables.entityId) {
        if (variables.entityType === 'PERSON') {
          queryClient.invalidateQueries({ queryKey: ['persons', variables.entityId] })
          queryClient.invalidateQueries({ queryKey: ['people'] })
        } else if (variables.entityType === 'FAMILY') {
          queryClient.invalidateQueries({ queryKey: ['families', variables.entityId] })
          queryClient.invalidateQueries({ queryKey: ['families'] })
        }
      }
    },
  })
}

