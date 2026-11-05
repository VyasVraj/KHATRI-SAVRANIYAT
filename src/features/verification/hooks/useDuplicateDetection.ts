/**
 * Duplicate Detection Hooks (Phase 9 — Subtask 4)
 *
 * Provides React Query hooks for fetching, flagging, resolving, and detecting duplicate records.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { PersonRow, FamilyRow } from '@/types'
import {
  findPersonDuplicateCandidates,
  findFamilyDuplicateCandidates,
  flagDuplicateRecord,
  resolveDuplicateFlag,
  listDuplicateFlags,
} from '../services/duplicateDetection.service'
import type {
  DuplicateCandidate,
  DuplicateFlagsFilter,
  EnrichedDuplicateFlag,
  FlagDuplicateInput,
  ResolveDuplicateInput,
} from '../types/duplicate.types'
import { supabase } from '@/lib/supabase'

/**
 * Hook to retrieve duplicate flags with optional filtering (Moderator review).
 */
export function useDuplicateFlags(filter?: DuplicateFlagsFilter) {
  return useQuery<EnrichedDuplicateFlag[], Error>({
    queryKey: ['duplicate-flags', filter],
    queryFn: async () => {
      const response = await listDuplicateFlags(filter)
      if (response.error || !response.data) {
        throw new Error(response.error?.message ?? 'Failed to load duplicate flags.')
      }
      return response.data
    },
    staleTime: 30 * 1000,
  })
}

/**
 * Mutation hook to flag a pair of records as potential duplicates.
 */
export function useFlagDuplicate() {
  const queryClient = useQueryClient()

  return useMutation<string, Error, FlagDuplicateInput>({
    mutationFn: async (input: FlagDuplicateInput) => {
      const result = await flagDuplicateRecord(input)
      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? 'Failed to flag duplicate record.')
      }
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-flags'] })
    },
  })
}

/**
 * Mutation hook to resolve an existing duplicate flag.
 */
export function useResolveDuplicate() {
  const queryClient = useQueryClient()

  return useMutation<boolean, Error, ResolveDuplicateInput>({
    mutationFn: async (input: ResolveDuplicateInput) => {
      const result = await resolveDuplicateFlag(input)
      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? 'Failed to resolve duplicate flag.')
      }
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-flags'] })
    },
  })
}

/**
 * Query hook to compute duplicate candidates for a specific person against existing database records.
 */
export function usePersonDuplicateCandidates(targetPerson: PersonRow | null | undefined) {
  return useQuery<DuplicateCandidate<PersonRow>[], Error>({
    queryKey: ['person-duplicate-candidates', targetPerson?.id],
    queryFn: async () => {
      if (!targetPerson || !targetPerson.id) return []

      // Query potential matches by surname or birth year to keep candidate pool performant
      // Primary: community_persons security barrier view
      let query = supabase.from('community_persons').select('*').limit(200)

      if (targetPerson.last_name) {
        query = query.ilike('last_name', targetPerson.last_name.trim())
      }

      const { data: pool, error } = await query
      let poolRows = pool as unknown as PersonRow[] | null
      let queryError = error

      // Fallback: persons table if view not yet deployed
      if (error && (error.code === 'PGRST205' || error.code === '42P01')) {
        let fallbackQuery = supabase.from('persons').select('*').limit(200)
        if (targetPerson.last_name) {
          fallbackQuery = fallbackQuery.ilike('last_name', targetPerson.last_name.trim())
        }
        const fallbackRes = await fallbackQuery
        poolRows = fallbackRes.data as unknown as PersonRow[] | null
        queryError = fallbackRes.error
      }
      if (queryError) {
        throw new Error(queryError.message)
      }

      return findPersonDuplicateCandidates(targetPerson, poolRows ?? [])
    },
    enabled: Boolean(targetPerson?.id),
    staleTime: 60 * 1000,
  })
}

/**
 * Query hook to compute duplicate candidates for a specific family against existing database records.
 */
export function useFamilyDuplicateCandidates(targetFamily: FamilyRow | null | undefined) {
  return useQuery<DuplicateCandidate<FamilyRow>[], Error>({
    queryKey: ['family-duplicate-candidates', targetFamily?.id],
    queryFn: async () => {
      if (!targetFamily || !targetFamily.id) return []

      let query = supabase.from('families').select('*').limit(200)

      if (targetFamily.family_name) {
        query = query.ilike('family_name', targetFamily.family_name.trim())
      }

      const { data: pool, error } = await query
      if (error) {
        throw new Error(error.message)
      }

      return findFamilyDuplicateCandidates(targetFamily, (pool ?? []) as FamilyRow[])
    },
    enabled: Boolean(targetFamily?.id),
    staleTime: 60 * 1000,
  })
}
