/**
 * Unit Tests: Import Service (Phase 14 — Subtask 1)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createImportBatch,
  cancelImportBatch,
  listImportBatches,
  getImportBatch,
  sanitizeImportError,
  stageImportRecords,
  ingestImport,
  listStagingRecords,
  validateImportBatch,
  setStagingRecordStatus,
  finalizeBatchValidation,
  calculateBatchDataQuality,
  promoteImportBatch,
} from '@/features/admin/services/import.service'
import { supabase } from '@/lib/supabase'

describe('import.service unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createImportBatch', () => {
    it('creates an import batch and returns the batch UUID', async () => {
      const mockBatchId = '11111111-2222-3333-4444-555555555555'
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: mockBatchId,
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const result = await createImportBatch({
        fileName: 'census_records.csv',
        fileFormat: 'CSV',
        fileHash: 'e'.repeat(64),
        fileSizeBytes: 1048576,
        notes: 'Initial census batch',
      })

      expect(result).toBe(mockBatchId)
      expect(supabase.rpc).toHaveBeenCalledWith('create_import_batch', {
        p_file_name: 'census_records.csv',
        p_file_format: 'CSV',
        p_file_hash: 'e'.repeat(64),
        p_file_size_bytes: 1048576,
        p_notes: 'Initial census batch',
      })
    })

    it('throws error when server returns invalid batch id', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        createImportBatch({
          fileName: 'test.csv',
          fileFormat: 'CSV',
          fileHash: 'f'.repeat(64),
        })
      ).rejects.toThrow('Server returned an invalid import batch identifier.')
    })

    it('throws sanitized error when RPC fails', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'INVALID_ARGUMENT: file_name must be between 1 and 255 characters' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        createImportBatch({
          fileName: '',
          fileFormat: 'CSV',
          fileHash: 'f'.repeat(64),
        })
      ).rejects.toThrow('file_name must be between 1 and 255 characters')
    })
  })

  describe('cancelImportBatch', () => {
    it('cancels an unpromoted import batch successfully', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: true,
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const result = await cancelImportBatch({
        batchId: '22222222-3333-4444-5555-666666666666',
        reason: 'Uploaded wrong year',
      })

      expect(result).toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('cancel_import_batch', {
        p_batch_id: '22222222-3333-4444-5555-666666666666',
        p_reason: 'Uploaded wrong year',
      })
    })

    it('throws sanitized error when batch cancellation fails', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'NOT_FOUND: Import batch not found' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        cancelImportBatch({
          batchId: '99999999-9999-9999-9999-999999999999',
        })
      ).rejects.toThrow('The requested import batch was not found.')
    })
  })

  describe('listImportBatches', () => {
    it('queries import batches with correct pagination and status filter', async () => {
      const mockBatches = [
        {
          id: 'b1',
          file_name: 'test1.csv',
          status: 'STAGED',
          created_at: '2026-10-17T03:00:00Z',
        },
      ]

      const mockRange = vi.fn().mockResolvedValueOnce({
        data: mockBatches,
        count: 1,
        error: null,
      })
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq,
        order: mockOrder,
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(supabase, 'from').mockReturnValue({ select: mockSelect } as any)

      const response = await listImportBatches({
        status: 'STAGED',
        page: 1,
        pageSize: 15,
      })

      expect(response.batches).toHaveLength(1)
      expect(response.totalCount).toBe(1)
      expect(response.page).toBe(1)
      expect(response.totalPages).toBe(1)
      expect(mockEq).toHaveBeenCalledWith('status', 'STAGED')
      expect(mockRange).toHaveBeenCalledWith(0, 14)
    })

    it('queries all batches without status filter when status is ALL', async () => {
      const mockRange = vi.fn().mockResolvedValueOnce({
        data: [],
        count: 0,
        error: null,
      })
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange })
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(supabase, 'from').mockReturnValue({ select: mockSelect } as any)

      const response = await listImportBatches({
        status: 'ALL',
        page: 2,
        pageSize: 10,
      })

      expect(response.batches).toEqual([])
      expect(response.totalCount).toBe(0)
      expect(response.page).toBe(2)
      expect(mockRange).toHaveBeenCalledWith(10, 19)
    })

    it('throws error when database query fails', async () => {
      const mockRange = vi.fn().mockResolvedValueOnce({
        data: null,
        count: null,
        error: { message: 'Database connection failed' },
      })
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange })
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(supabase, 'from').mockReturnValue({ select: mockSelect } as any)

      await expect(listImportBatches()).rejects.toThrow(
        'Failed to fetch import batches from server.'
      )
    })
  })

  describe('getImportBatch', () => {
    it('fetches a single import batch by ID', async () => {
      const mockBatch = {
        id: 'batch-123',
        file_name: 'test.csv',
        status: 'STAGED',
      }
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: mockBatch,
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(supabase, 'from').mockReturnValue({ select: mockSelect } as any)

      const result = await getImportBatch('batch-123')
      expect(result.id).toBe('batch-123')
      expect(mockEq).toHaveBeenCalledWith('id', 'batch-123')
    })

    it('throws sanitized error when batch not found', async () => {
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Row not found' },
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(supabase, 'from').mockReturnValue({ select: mockSelect } as any)

      await expect(getImportBatch('batch-999')).rejects.toThrow(
        'Import batch not found or access denied.'
      )
    })
  })

  describe('sanitizeImportError', () => {
    it('maps all expected error variants', () => {
      expect(
        sanitizeImportError('CONFLICT: An active import batch exists', 'default')
      ).toBe('An import batch with this exact file hash is already in progress.')

      expect(
        sanitizeImportError(
          'CONFLICT: This exact file has already been imported and promoted in batch 123',
          'default'
        )
      ).toBe('This exact file has already been imported and promoted in a previous batch.')

      expect(
        sanitizeImportError('CONFLICT: Import batch 123 is already cancelled', 'default')
      ).toBe('This import batch has already been cancelled.')

      expect(
        sanitizeImportError(
          'CONFLICT: Cannot cancel an already promoted import batch',
          'default'
        )
      ).toBe('Cannot cancel an import batch that has already been promoted.')

      expect(
        sanitizeImportError('NOT_FOUND: Import batch not found', 'default')
      ).toBe('The requested import batch was not found.')

      expect(
        sanitizeImportError('UNAUTHENTICATED: Caller must be authenticated', 'default')
      ).toBe('You must be signed in to perform import operations.')

      expect(
        sanitizeImportError('FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN', 'default')
      ).toBe(
        'You do not have permission to manage data imports. Administrator privileges required.'
      )

      expect(
        sanitizeImportError(
          'INVALID_STATUS: Cannot stage records into import batch',
          'default'
        )
      ).toBe('Cannot stage records into this import batch because its status is not STAGED.')

      expect(
        sanitizeImportError(
          'INVALID_ARGUMENT: notes must not exceed 2000 characters',
          'default'
        )
      ).toBe('notes must not exceed 2000 characters')

      expect(sanitizeImportError(null, 'fallback')).toBe('fallback')
    })
  })

  describe('stageImportRecords', () => {
    it('stages records via authoritative RPC and returns synchronized metrics', async () => {
      const mockBatchId = '11111111-2222-3333-4444-555555555555'
      const mockDrafts = [
        {
          entity_type: 'PERSON' as const,
          source_row_number: 1,
          source_record_id: 'PERSON_ROW_1',
          parsed_data: { first_name: 'Aarav', last_name: 'Sharma' },
          raw_data: { first_name: 'Aarav', last_name: 'Sharma' },
          validation_status: 'PENDING' as const,
          validation_errors: [],
          canonical_id: null,
        },
      ]

      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          batch_id: mockBatchId,
          inserted_count: 1,
          total_records: 1,
          row_counts: { persons: 1, families: 0, relationships: 0 },
          validation_summary: { errors: 0, warnings: 0, valid: 1, duplicates: 0 },
        },
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const result = await stageImportRecords(mockBatchId, mockDrafts)

      expect(result.insertedCount).toBe(1)
      expect(result.totalRecords).toBe(1)
      expect(result.rowCounts.persons).toBe(1)
      expect(supabase.rpc).toHaveBeenCalledWith('stage_import_records', {
        p_batch_id: mockBatchId,
        p_records: mockDrafts,
      })
    })

    it('throws error when batchId is missing', async () => {
      await expect(stageImportRecords('', [])).rejects.toThrow(
        'batchId is required to stage records.'
      )
    })

    it('throws sanitized error when staging RPC fails', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'INVALID_STATUS: Cannot stage records into import batch' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        stageImportRecords('batch-123', [
          {
            entity_type: 'PERSON',
            source_row_number: 1,
            source_record_id: 'P1',
            parsed_data: {},
            raw_data: {},
            validation_status: 'PENDING',
            validation_errors: [],
            canonical_id: null,
          },
        ])
      ).rejects.toThrow(
        'Cannot stage records into this import batch because its status is not STAGED.'
      )
    })

    it('throws sanitized error when chunk size exceeds 500 records', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'INVALID_ARGUMENT: Chunk size exceeds maximum allowed limit of 500 records (received 501)' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        stageImportRecords('batch-123', new Array(501).fill({
          entity_type: 'PERSON' as const,
          source_row_number: 1,
          source_record_id: 'P1',
          parsed_data: {},
          raw_data: {},
          validation_status: 'PENDING' as const,
          validation_errors: [],
          canonical_id: null,
        }))
      ).rejects.toThrow('Chunk size exceeds maximum allowed limit of 500 records (received 501)')
    })

    it('throws sanitized error when record is malformed or missing required structure', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'INVALID_ARGUMENT: Record at index 1 is not a JSON object' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stageImportRecords('batch-123', ['not-an-object' as any])
      ).rejects.toThrow('Record at index 1 is not a JSON object')
    })

    it('throws sanitized error when entity_type or source_row_number is invalid', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'INVALID_ARGUMENT: Record at index 1 has missing or invalid entity_type "UNKNOWN"' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        stageImportRecords('batch-123', [
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entity_type: 'UNKNOWN' as any,
            source_row_number: 1,
            source_record_id: 'UNKNOWN_1',
            parsed_data: {},
            raw_data: {},
            validation_status: 'PENDING',
            validation_errors: [],
            canonical_id: null,
          },
        ])
      ).rejects.toThrow('Record at index 1 has missing or invalid entity_type "UNKNOWN"')
    })
  })

  describe('ingestImport', () => {
    it('orchestrates parsing, batch creation, and staging ingestion end-to-end', async () => {
      const mockBatchId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

      // Mock create_import_batch RPC
      vi.spyOn(supabase, 'rpc').mockImplementation(((fn: string) => {
        if (fn === 'create_import_batch') {
          return Promise.resolve({ data: mockBatchId, error: null })
        }
        if (fn === 'stage_import_records') {
          return Promise.resolve({
            data: {
              batch_id: mockBatchId,
              inserted_count: 2,
              total_records: 2,
              row_counts: { persons: 2, families: 0, relationships: 0 },
              validation_summary: { errors: 0, warnings: 0, valid: 2, duplicates: 0 },
            },
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any)

      const csvContent = `first_name,last_name,gender\nAarav,Sharma,male\nDiya,Sharma,female`
      const result = await ingestImport({
        fileName: 'census_2026.csv',
        content: csvContent,
      })

      expect(result.batchId).toBe(mockBatchId)
      expect(result.stagedRecordsCount).toBe(2)
      expect(result.totalRecords).toBe(2)
      expect(result.rowCounts.persons).toBe(2)
      expect(result.fileHash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('auto-cancels batch when staging fails to prevent orphaned active file hash lockout', async () => {
      const mockBatchId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

      const rpcSpy = vi.spyOn(supabase, 'rpc').mockImplementation(((fn: string) => {
        if (fn === 'create_import_batch') {
          return Promise.resolve({ data: mockBatchId, error: null })
        }
        if (fn === 'stage_import_records') {
          return Promise.resolve({
            data: null,
            error: { message: 'Database connection timeout during chunk insertion' },
          })
        }
        if (fn === 'cancel_import_batch') {
          return Promise.resolve({ data: true, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any)

      await expect(
        ingestImport({
          fileName: 'failing_census.csv',
          content: 'first_name,last_name\nTest,User',
        })
      ).rejects.toThrow('Failed to stage records on the server.')

      // Verify that cancel_import_batch was called to release active file hash index
      expect(rpcSpy).toHaveBeenCalledWith('cancel_import_batch', expect.objectContaining({
        p_batch_id: mockBatchId,
        p_reason: expect.stringContaining('Automatic cleanup: Ingestion failed'),
      }))
    })

    it('resumes staging into an existingBatchId without calling create_import_batch', async () => {
      const existingBatchId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

      const rpcSpy = vi.spyOn(supabase, 'rpc').mockImplementation(((fn: string) => {
        if (fn === 'stage_import_records') {
          return Promise.resolve({
            data: {
              batch_id: existingBatchId,
              inserted_count: 1,
              total_records: 1,
              row_counts: { persons: 1, families: 0, relationships: 0 },
              validation_summary: { errors: 0, warnings: 0, valid: 1, duplicates: 0 },
            },
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any)

      const result = await ingestImport({
        fileName: 'resume_census.csv',
        content: 'first_name,last_name\nResumed,User',
        existingBatchId,
      })

      expect(result.batchId).toBe(existingBatchId)
      expect(result.stagedRecordsCount).toBe(1)
      expect(rpcSpy).not.toHaveBeenCalledWith('create_import_batch', expect.anything())
    })
  })

  describe('listStagingRecords', () => {
    it('queries staging records with pagination and filters', async () => {
      const mockRows = [
        {
          id: 'sr-1',
          batch_id: 'batch-1',
          entity_type: 'PERSON',
          source_row_number: 1,
          source_record_id: 'P1',
          parsed_data: { first_name: 'Aarav' },
          validation_status: 'PENDING',
        },
      ]

      const mockRange = vi.fn().mockResolvedValueOnce({
        data: mockRows,
        count: 1,
        error: null,
      })
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange })
      const mockStatusEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockTypeEq = vi.fn().mockReturnValue({ eq: mockStatusEq })
      const mockBatchEq = vi.fn().mockReturnValue({ eq: mockTypeEq })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockBatchEq })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(supabase, 'from').mockReturnValue({ select: mockSelect } as any)

      const response = await listStagingRecords('batch-1', {
        entityType: 'PERSON',
        validationStatus: 'PENDING',
        page: 1,
        pageSize: 20,
      })

      expect(response.records).toHaveLength(1)
      expect(response.totalCount).toBe(1)
      expect(response.page).toBe(1)
      expect(response.totalPages).toBe(1)
    })
  })

  describe('validateImportBatch (Subtask 3)', () => {
    it('calls validate_import_batch RPC and returns synchronized metrics', async () => {
      const mockBatchId = '33333333-3333-3333-3333-333333333333'
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          batch_id: mockBatchId,
          total_records: 10,
          row_counts: { persons: 8, families: 1, relationships: 1 },
          validation_summary: { errors: 1, warnings: 2, valid: 7, duplicates: 1 },
        },
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const result = await validateImportBatch(mockBatchId)
      expect(result.batchId).toBe(mockBatchId)
      expect(result.totalRecords).toBe(10)
      expect(result.validationSummary.errors).toBe(1)
      expect(result.validationSummary.duplicates).toBe(1)
      expect(supabase.rpc).toHaveBeenCalledWith('validate_import_batch', {
        p_batch_id: mockBatchId,
      })
    })

    it('supports repeated validation invocations idempotently on STAGED batches', async () => {
      const mockBatchId = '33333333-3333-3333-3333-333333333333'
      vi.spyOn(supabase, 'rpc')
        .mockResolvedValueOnce({
          data: {
            batch_id: mockBatchId,
            total_records: 5,
            row_counts: { persons: 5, families: 0, relationships: 0 },
            validation_summary: { errors: 2, warnings: 1, valid: 2, duplicates: 1 },
          },
          error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .mockResolvedValueOnce({
          data: {
            batch_id: mockBatchId,
            total_records: 5,
            row_counts: { persons: 5, families: 0, relationships: 0 },
            validation_summary: { errors: 0, warnings: 1, valid: 4, duplicates: 1 },
          },
          error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)

      const firstRun = await validateImportBatch(mockBatchId)
      expect(firstRun.validationSummary.errors).toBe(2)

      const secondRun = await validateImportBatch(mockBatchId)
      expect(secondRun.validationSummary.errors).toBe(0)
      expect(supabase.rpc).toHaveBeenCalledTimes(2)
    })

    it('throws error when batchId is missing', async () => {
      await expect(validateImportBatch('')).rejects.toThrow(
        'batchId is required to validate import batch.'
      )
    })

    it('throws sanitized error when validation RPC fails due to unauthorized caller', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(validateImportBatch('batch-123')).rejects.toThrow(
        'You do not have permission to manage data imports. Administrator privileges required.'
      )
    })
  })

  describe('setStagingRecordStatus (Subtask 3)', () => {
    it('updates staging record status via authoritative RPC', async () => {
      const recordId = '44444444-4444-4444-4444-444444444444'
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          record_id: recordId,
          batch_id: 'batch-123',
          status: 'EXCLUDED',
        },
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const res = await setStagingRecordStatus({
        recordId,
        status: 'EXCLUDED',
        notes: 'User requested exclusion',
      })

      expect(res.recordId).toBe(recordId)
      expect(res.status).toBe('EXCLUDED')
      expect(supabase.rpc).toHaveBeenCalledWith('set_staging_record_status', {
        p_record_id: recordId,
        p_status: 'EXCLUDED',
        p_notes: 'User requested exclusion',
      })
    })

    it('resolves ERROR to VALID when mandatory review notes are provided', async () => {
      const recordId = '44444444-4444-4444-4444-444444444444'
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          record_id: recordId,
          batch_id: 'batch-123',
          status: 'VALID',
        },
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const res = await setStagingRecordStatus({
        recordId,
        status: 'VALID',
        notes: 'Manually verified birth record with original registry',
      })

      expect(res.recordId).toBe(recordId)
      expect(res.status).toBe('VALID')
      expect(supabase.rpc).toHaveBeenCalledWith('set_staging_record_status', {
        p_record_id: recordId,
        p_status: 'VALID',
        p_notes: 'Manually verified birth record with original registry',
      })
    })

    it('throws error when server rejects resolving ERROR to VALID without notes', async () => {
      const recordId = '44444444-4444-4444-4444-444444444444'
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'INVALID_ARGUMENT: Mandatory review notes (minimum 3 characters) required to resolve blocking validation errors' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        setStagingRecordStatus({ recordId, status: 'VALID' })
      ).rejects.toThrow('Mandatory review notes (minimum 3 characters) required to resolve blocking validation errors')
    })

    it('throws error when server rejects transitioning PENDING record to VALID, WARNING, or ERROR', async () => {
      const recordId = '44444444-4444-4444-4444-444444444444'
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'INVALID_STATUS: PENDING records must be processed by validate_import_batch() before they can become VALID, WARNING, or ERROR.' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        setStagingRecordStatus({ recordId, status: 'VALID' })
      ).rejects.toThrow('PENDING records must be processed by validate_import_batch() before they can become VALID, WARNING, or ERROR.')
    })

    it('throws error when server rejects transitioning EXCLUDED record to VALID, WARNING, or ERROR', async () => {
      const recordId = '44444444-4444-4444-4444-444444444444'
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'INVALID_STATUS: EXCLUDED records must be reprocessed by validate_import_batch() before becoming VALID, WARNING, or ERROR.' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(
        setStagingRecordStatus({ recordId, status: 'VALID' })
      ).rejects.toThrow('EXCLUDED records must be reprocessed by validate_import_batch() before becoming VALID, WARNING, or ERROR.')
    })

    it('allows EXCLUDED to EXCLUDED harmlessly or with review notes', async () => {
      const recordId = '44444444-4444-4444-4444-444444444444'
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          record_id: recordId,
          batch_id: 'batch-123',
          status: 'EXCLUDED',
        },
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const res = await setStagingRecordStatus({
        recordId,
        status: 'EXCLUDED',
        notes: 'Keep excluded from import',
      })

      expect(res.recordId).toBe(recordId)
      expect(res.status).toBe('EXCLUDED')
    })

    it('throws error when recordId is empty', async () => {
      await expect(
        setStagingRecordStatus({ recordId: '', status: 'EXCLUDED' })
      ).rejects.toThrow('recordId is required.')
    })
  })

  describe('finalizeBatchValidation (Subtask 3)', () => {
    it('finalizes batch to VALIDATED status via authoritative RPC', async () => {
      const mockBatchId = '55555555-5555-5555-5555-555555555555'
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          batch_id: mockBatchId,
          status: 'VALIDATED',
        },
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const res = await finalizeBatchValidation(mockBatchId)
      expect(res.batchId).toBe(mockBatchId)
      expect(res.status).toBe('VALIDATED')
      expect(supabase.rpc).toHaveBeenCalledWith('finalize_batch_validation', {
        p_batch_id: mockBatchId,
      })
    })

    it('throws error if blocking errors exist', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'PRECONDITION_FAILED: Cannot finalize batch with 3 unresolved blocking errors.' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(finalizeBatchValidation('batch-err')).rejects.toThrow(
        'Cannot finalize batch with 3 unresolved blocking errors.'
      )
    })

    it('throws error if records remain in PENDING status', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'PRECONDITION_FAILED: Cannot finalize batch with 5 unvalidated (PENDING) records.' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(finalizeBatchValidation('batch-pending')).rejects.toThrow(
        'Cannot finalize batch with 5 unvalidated (PENDING) records.'
      )
    })

    it('throws error if batch has zero eligible records to import', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'PRECONDITION_FAILED: Cannot finalize batch with zero valid or warning records to import.' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(finalizeBatchValidation('batch-empty')).rejects.toThrow(
        'Cannot finalize batch with zero valid or warning records to import.'
      )
    })
  })

  describe('calculateBatchDataQuality (Subtask 3)', () => {
    it('calculates deterministic score and tier for pristine batch', () => {
      const quality = calculateBatchDataQuality(
        { errors: 0, warnings: 0, valid: 100, duplicates: 0 },
        100
      )
      expect(quality.qualityScore).toBe(100)
      expect(quality.tier).toBe('EXCELLENT')
      expect(quality.validityRate).toBe(100)
      expect(quality.errorRate).toBe(0)
    })

    it('penalizes errors and warnings deterministically', () => {
      const quality = calculateBatchDataQuality(
        { errors: 10, warnings: 20, valid: 70, duplicates: 5 },
        100
      )
      // 100 - (10/100 * 70) - (20/100 * 30) = 100 - 7 - 6 = 87 -> EXCELLENT
      expect(quality.qualityScore).toBe(87)
      expect(quality.tier).toBe('EXCELLENT')
      expect(quality.errorCount).toBe(10)
      expect(quality.warningCount).toBe(20)
      expect(quality.duplicateCount).toBe(5)
    })

    it('handles empty batch gracefully', () => {
      const quality = calculateBatchDataQuality(
        { errors: 0, warnings: 0, valid: 0, duplicates: 0 },
        0
      )
      expect(quality.qualityScore).toBe(100)
      expect(quality.tier).toBe('EXCELLENT')
      expect(quality.totalRecords).toBe(0)
    })
  })

  describe('promoteImportBatch (Subtask 4)', () => {
    it('promotes validated batch successfully and returns promoted counts', async () => {
      const mockResult = {
        batchId: 'batch-validated-1',
        status: 'PROMOTED',
        alreadyPromoted: false,
        promotedAt: '2026-10-18T04:00:00Z',
        promotedBy: 'admin-uuid',
        promotedCounts: {
          persons: 10,
          families: 2,
          relationships: 5,
          total: 17,
        },
        familyMemberships: 2,
        duplicateFlags: 1,
        total: 17,
      }

      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: mockResult,
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const result = await promoteImportBatch('batch-validated-1')

      expect(supabase.rpc).toHaveBeenCalledWith('promote_import_batch', {
        p_batch_id: 'batch-validated-1',
      })
      expect(result.status).toBe('PROMOTED')
      expect(result.promotedCounts.persons).toBe(10)
      expect(result.promotedCounts.families).toBe(2)
      expect(result.promotedCounts.relationships).toBe(5)
      expect(result.familyMemberships).toBe(2)
      expect(result.duplicateFlags).toBe(1)
      expect(result.total).toBe(17)
    })

    it('handles idempotent call when batch is already promoted', async () => {
      const mockAlreadyPromotedResult = {
        batchId: 'batch-promoted-2',
        status: 'PROMOTED',
        alreadyPromoted: true,
        promotedAt: '2026-10-17T20:00:00Z',
        promotedBy: 'admin-uuid',
        promotedCounts: {
          persons: 5,
          families: 1,
          relationships: 2,
          total: 8,
        },
        familyMemberships: 0,
        duplicateFlags: 0,
        total: 8,
      }

      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: mockAlreadyPromotedResult,
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const result = await promoteImportBatch('batch-promoted-2')
      expect(result.alreadyPromoted).toBe(true)
      expect(result.total).toBe(8)
    })

    it('throws sanitized error on PRECONDITION_FAILED', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'PRECONDITION_FAILED: Cannot promote batch with 2 unvalidated (PENDING) records.' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(promoteImportBatch('batch-fail')).rejects.toThrow(
        'Cannot promote batch with 2 unvalidated (PENDING) records.'
      )
    })

    it('throws sanitized error on UNRESOLVED_REFERENCE', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'UNRESOLVED_REFERENCE: Relationship row 4 person_a_id "UNKNOWN" cannot be resolved.' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(promoteImportBatch('batch-unresolved')).rejects.toThrow(
        'Relationship row 4 person_a_id "UNKNOWN" cannot be resolved.'
      )
    })

    it('throws sanitized error on FORBIDDEN', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await expect(promoteImportBatch('batch-forbidden')).rejects.toThrow(
        'You do not have permission to manage data imports. Administrator privileges required.'
      )
    })
  })
})
