/**
 * Integration Tests: Excel Import Service Integration (Excel-4)
 *
 * Verifies that the Excel format registry, reader, and adapters (Khatrisetu & Community Web CMS)
 * are seamlessly integrated into the existing Phase 14 `parseImportFile` and `ingestImport` pipeline.
 *
 * Architectural Invariants Verified:
 * 1. PERSON != USER: Demographic census extraction only. auth.users / profiles are never touched.
 * 2. DETECT != MERGE: Potential duplicates or ambiguous relations are preserved as warnings, never merged.
 * 3. STAGING != CANONICAL: canonical_id strictly null across all staged records.
 * 4. DB Constraint Compliance: Staged Excel records return fileFormat: 'JSON' to comply with
 *    PostgreSQL CHECK (file_format IN ('CSV', 'JSON')) on import_batches.
 * 5. Deterministic Error Handling: Unsupported Excel formats and corrupted files produce structured errors.
 * 6. CSV and JSON Regressions: Existing CSV and JSON workflows remain 100% backward-compatible.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import { parseImportFile, computeSha256 } from '@/features/admin/services/importParser.service'
import { ingestImport } from '@/features/admin/services/import.service'
import { supabase } from '@/lib/supabase'

describe('Excel Phase 14 Service Integration (Excel-4)', () => {
  const khatrisetuPath = 'C:/Users/HP/Downloads/khatrisetu-families-2026-10-01.xlsx'
  const communityCmsPath = 'C:/Users/HP/Downloads/demo user data.xlsx'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. parseImportFile with Khatrisetu Excel File', () => {
    it('automatically detects and adapts Khatrisetu workbook through parseImportFile', async () => {
      if (!fs.existsSync(khatrisetuPath)) {
        return
      }

      const fileBuffer = fs.readFileSync(khatrisetuPath)
      const result = await parseImportFile(
        'khatrisetu-families-2026-10-01.xlsx',
        fileBuffer
      )

      expect(result.fileName).toBe('khatrisetu-families-2026-10-01.xlsx')
      // Database check constraint compatibility: fileFormat must be 'JSON' or 'CSV'
      expect(result.fileFormat).toBe('JSON')
      expect(result.fileSizeBytes).toBe(fileBuffer.byteLength)
      expect(result.fileHash).toMatch(/^[a-f0-9]{64}$/)

      // Khatrisetu real file expected counts
      expect(result.totalRows).toBe(48)
      expect(result.rowCounts.families).toBe(4)
      expect(result.rowCounts.persons).toBe(24)
      expect(result.rowCounts.relationships).toBe(20)

      // Invariants check across all records
      for (const draft of result.records) {
        expect(draft.canonical_id).toBeNull()
        expect(draft.source_record_id).toBeTruthy()
        expect(draft.source_row_number).toBeGreaterThan(1)
        expect(draft.parsed_data).toBeDefined()
        expect(draft.raw_data).toBeDefined()

        if (draft.entity_type === 'PERSON') {
          expect(draft.parsed_data.user_id).toBeUndefined()
          expect(draft.parsed_data.account).toBeUndefined()
          expect(draft.parsed_data.password).toBeUndefined()
        }

        if (draft.entity_type === 'RELATIONSHIP') {
          expect(['PARENT', 'SPOUSE', 'SIBLING']).toContain(draft.parsed_data.relationship_type)
        }
      }
    })
  })

  describe('2. parseImportFile with Community Web CMS Excel File', () => {
    it('automatically detects and adapts Community Web CMS workbook through parseImportFile', async () => {
      if (!fs.existsSync(communityCmsPath)) {
        return
      }

      const fileBuffer = fs.readFileSync(communityCmsPath)
      const result = await parseImportFile(
        'demo user data.xlsx',
        fileBuffer
      )

      expect(result.fileName).toBe('demo user data.xlsx')
      expect(result.fileFormat).toBe('JSON')
      expect(result.fileSizeBytes).toBe(fileBuffer.byteLength)
      expect(result.fileHash).toMatch(/^[a-f0-9]{64}$/)

      // Community Web CMS real file expected counts
      expect(result.totalRows).toBe(116)
      expect(result.rowCounts.families).toBe(15)
      expect(result.rowCounts.persons).toBe(58)
      expect(result.rowCounts.relationships).toBe(43)

      for (const draft of result.records) {
        expect(draft.canonical_id).toBeNull()
        expect(draft.source_record_id).toBeTruthy()
        expect(draft.source_row_number).toBeGreaterThan(1)

        if (draft.entity_type === 'PERSON') {
          expect(draft.parsed_data.user_id).toBeUndefined()
        }

        if (draft.entity_type === 'RELATIONSHIP' && draft.parsed_data.relationship_type !== null) {
          expect(['PARENT', 'SPOUSE', 'SIBLING']).toContain(draft.parsed_data.relationship_type)
        }
      }
    })
  })

  describe('3. Error Handling and Guardrails for Excel Files', () => {
    it('rejects unrecognized Excel workbook signatures with UNSUPPORTED_EXCEL_FORMAT', async () => {
      // Create a dummy workbook Uint8Array from read-excel-file or simulate invalid signature
      // We test by feeding an unsupported Excel file structure
      // Use an empty array or arbitrary binary bytes that are NOT an approved format
      const dummyBuffer = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      
      await expect(
        parseImportFile('unknown.xlsx', dummyBuffer)
      ).rejects.toThrow(/INVALID_EXCEL_FILE|UNSUPPORTED_EXCEL_FORMAT/)
    })

    it('rejects Excel files that exceed operational size limits', async () => {
      // 16 MB buffer exceeds 15 MB limit
      const oversizedBuffer = new Uint8Array(16 * 1024 * 1024)
      await expect(
        parseImportFile('huge.xlsx', oversizedBuffer)
      ).rejects.toThrow('FILE_TOO_LARGE')
    })
  })

  describe('4. ingestImport Orchestration Pipeline with Excel Inputs', () => {
    it('orchestrates Excel import through parseImportFile, createImportBatch, and stageImportRecords', async () => {
      if (!fs.existsSync(khatrisetuPath)) {
        return
      }

      const mockBatchId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
      const fileBuffer = fs.readFileSync(khatrisetuPath)

      // Mock create_import_batch and stage_import_records RPCs
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockImplementation(((fn: string, args: Record<string, unknown>) => {
        if (fn === 'create_import_batch') {
          // Assert that file_format sent to RPC is 'JSON'
          expect(args.p_file_format).toBe('JSON')
          expect(args.p_file_name).toBe('khatrisetu-families-2026-10-01.xlsx')
          return Promise.resolve({ data: mockBatchId, error: null })
        }
        if (fn === 'stage_import_records') {
          return Promise.resolve({
            data: {
              batch_id: mockBatchId,
              inserted_count: 48,
              total_records: 48,
              row_counts: { persons: 24, families: 4, relationships: 20 },
              validation_summary: { errors: 0, warnings: 0, valid: 48, duplicates: 0 },
            },
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any)

      const result = await ingestImport({
        fileName: 'khatrisetu-families-2026-10-01.xlsx',
        content: fileBuffer,
        notes: 'Testing Khatrisetu Excel ingestion',
      })

      expect(result.batchId).toBe(mockBatchId)
      expect(result.stagedRecordsCount).toBe(48)
      expect(result.totalRecords).toBe(48)
      expect(result.rowCounts.families).toBe(4)
      expect(result.rowCounts.persons).toBe(24)
      expect(result.rowCounts.relationships).toBe(20)
      expect(result.fileHash).toMatch(/^[a-f0-9]{64}$/)

      expect(rpcSpy).toHaveBeenCalledWith('create_import_batch', expect.objectContaining({
        p_file_name: 'khatrisetu-families-2026-10-01.xlsx',
        p_file_format: 'JSON',
      }))
    })

    it('auto-cancels batch when stageImportRecords fails on an Excel import', async () => {
      if (!fs.existsSync(khatrisetuPath)) {
        return
      }

      const mockBatchId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
      const fileBuffer = fs.readFileSync(khatrisetuPath)

      const rpcSpy = vi.spyOn(supabase, 'rpc').mockImplementation(((fn: string) => {
        if (fn === 'create_import_batch') {
          return Promise.resolve({ data: mockBatchId, error: null })
        }
        if (fn === 'stage_import_records') {
          return Promise.resolve({
            data: null,
            error: { message: 'Network error inserting chunk' },
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
          fileName: 'khatrisetu-families-2026-10-01.xlsx',
          content: fileBuffer,
        })
      ).rejects.toThrow('Failed to stage records on the server.')

      expect(rpcSpy).toHaveBeenCalledWith('cancel_import_batch', expect.objectContaining({
        p_batch_id: mockBatchId,
      }))
    })
  })

  describe('5. CSV & JSON Backward-Compatibility Preservation', () => {
    it('parses CSV records normally without any changes to behavior', async () => {
      const csv = `first_name,last_name,gender\nAarav,Sharma,male\nPriya,Patel,female`
      const result = await parseImportFile('sample.csv', csv)

      expect(result.fileFormat).toBe('CSV')
      expect(result.totalRows).toBe(2)
      expect(result.rowCounts.persons).toBe(2)
      expect(result.records[0].parsed_data.first_name).toBe('Aarav')
      expect(result.records[1].parsed_data.first_name).toBe('Priya')
    })

    it('parses JSON records normally without any changes to behavior', async () => {
      const json = JSON.stringify([
        { first_name: 'Dev', last_name: 'Mehta', gender: 'male' },
        { first_name: 'Ananya', last_name: 'Mehta', gender: 'female' },
      ])
      const result = await parseImportFile('sample.json', json)

      expect(result.fileFormat).toBe('JSON')
      expect(result.totalRows).toBe(2)
      expect(result.rowCounts.persons).toBe(2)
      expect(result.records[0].parsed_data.first_name).toBe('Dev')
      expect(result.records[1].parsed_data.first_name).toBe('Ananya')
    })

    it('computes exact same SHA-256 hash whether string or Uint8Array', async () => {
      const text = 'test content for sha256 equality'
      const stringHash = await computeSha256(text)
      const bufferHash = await computeSha256(new TextEncoder().encode(text))

      expect(stringHash).toBe(bufferHash)
    })
  })
})
