/**
 * useImportBatches — TanStack Query hooks for Import & Data Migration (Phase 14)
 *
 * Invariants:
 * - Reads from public.import_batches via listImportBatches / getImportBatch
 * - Mutations route through authoritative RPCs via cancelImportBatch
 * - Automatic query cache invalidation on batch mutations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ImportBatchFilterParams,
  ImportBatchListResponse,
  ImportBatchItem,
  CancelImportBatchInput,
} from '../types'
import {
  listImportBatches,
  getImportBatch,
  cancelImportBatch,
} from '../services/import.service'

export function useImportBatches(params: ImportBatchFilterParams = {}) {
  return useQuery<ImportBatchListResponse, Error>({
    queryKey: ['admin', 'import-batches', params],
    queryFn: () => listImportBatches(params),
    staleTime: 15_000,
  })
}

export function useImportBatch(batchId: string | null | undefined) {
  return useQuery<ImportBatchItem, Error>({
    queryKey: ['admin', 'import-batches', batchId],
    queryFn: () => getImportBatch(batchId!),
    enabled: Boolean(batchId),
    staleTime: 15_000,
  })
}

export function useCancelImportBatch() {
  const queryClient = useQueryClient()

  return useMutation<boolean, Error, CancelImportBatchInput>({
    mutationFn: (input) => cancelImportBatch(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'import-batches'] })
    },
  })
}
