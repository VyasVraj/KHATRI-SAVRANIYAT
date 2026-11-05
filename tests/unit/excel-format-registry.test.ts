import { describe, it, expect } from 'vitest'
import {
  ExcelFormatRegistry,
  detectExcelFormat,
  normalizeSignatureText,
  KhatrisetuAdapterStub,
  CommunityWebCmsAdapterStub,
  type ExcelWorkbookData,
} from '@/features/admin/services/excel'

describe('Excel Format Registry & Detector (Excel-1)', () => {
  describe('normalizeSignatureText', () => {
    it('normalizes strings by trimming, lowercasing, and removing punctuation', () => {
      expect(normalizeSignatureText('  Family Code  ')).toBe('familycode')
      expect(normalizeSignatureText('Ghar Mukhi Name!')).toBe('gharmukhiname')
      expect(normalizeSignatureText('Fathers_Name #')).toBe('fathersname')
      expect(normalizeSignatureText(null)).toBe('')
      expect(normalizeSignatureText(undefined)).toBe('')
      expect(normalizeSignatureText(123)).toBe('123')
    })
  })

  describe('Registry Configuration & Default Registrations', () => {
    it('provides a singleton registry with the two approved format definitions', () => {
      const registry = ExcelFormatRegistry.getInstance()
      const formats = registry.list()

      expect(formats).toHaveLength(2)
      const ids = formats.map((f) => f.formatId)
      expect(ids).toContain('KHATRISETU_V1')
      expect(ids).toContain('COMMUNITY_WEB_CMS_V1')
    })

    it('allows retrieving individual format definitions by formatId', () => {
      const registry = ExcelFormatRegistry.getInstance()
      const khatrisetu = registry.get('KHATRISETU_V1')
      expect(khatrisetu).toBeDefined()
      expect(khatrisetu?.displayName).toBe('Khatrisetu Relational Export')
      expect(khatrisetu?.expectedSheets).toEqual(['Families', 'Members'])

      const cms = registry.get('COMMUNITY_WEB_CMS_V1')
      expect(cms).toBeDefined()
      expect(cms?.displayName).toBe('Community Web CMS Interleaved Block Export')
      expect(cms?.expectedSheets).toEqual(['Sheet1'])
    })
  })

  describe('Deterministic Format Detection: KHATRISETU_V1', () => {
    it('detects KHATRISETU_V1 with EXACT confidence when sheets and signatures match', () => {
      const mockWorkbook: ExcelWorkbookData = {
        fileName: 'khatrisetu-sample.xlsx',
        fileSizeBytes: 1024,
        sheets: [
          {
            name: 'Families',
            rows: [
              ['Family Code', 'Head of Family', 'Surname', 'Gotra', 'Nukh'],
              ['KS-001', 'Prakash Keria', 'Keria', 'Kanu', 'Keria'],
            ],
          },
          {
            name: 'Members',
            rows: [
              ['Family Code', 'Name', 'Relationship', 'Gender', 'Date of Birth'],
              ['KS-001', 'Prakash Keria', 'Head', 'male', '1960-07-01'],
            ],
          },
        ],
      }

      const result = detectExcelFormat(mockWorkbook)
      expect(result.formatId).toBe('KHATRISETU_V1')
      expect(result.confidence).toBe('EXACT')
      expect(result.matchedSignatures).toEqual(
        expect.arrayContaining([
          "Sheet 'Families' present",
          "Sheet 'Members' present",
          "Families sheet header contains 'Family Code'",
          "Members sheet header contains 'Family Code', 'Name', 'Relationship'",
        ])
      )
    })

    it('detects KHATRISETU_V1 with HIGH confidence if partial signatures match', () => {
      const mockWorkbook: ExcelWorkbookData = {
        fileName: 'khatrisetu-partial.xlsx',
        fileSizeBytes: 1024,
        sheets: [
          {
            name: 'Families',
            rows: [['Family Code', 'Head of Family']],
          },
          // Missing Members sheet
        ],
      }

      const adapter = new KhatrisetuAdapterStub()
      const result = adapter.matches(mockWorkbook)
      expect(result.formatId).toBe('KHATRISETU_V1')
      expect(result.confidence).toBe('HIGH')
      expect(result.unmatchedReasons).toContain("Missing sheet 'Members'")
    })
  })

  describe('Deterministic Format Detection: COMMUNITY_WEB_CMS_V1', () => {
    it('detects COMMUNITY_WEB_CMS_V1 with EXACT confidence when interleaved signatures match', () => {
      const mockWorkbook: ExcelWorkbookData = {
        fileName: 'demo-user-data.xlsx',
        fileSizeBytes: 2048,
        sheets: [
          {
            name: 'Sheet1',
            rows: [
              [
                '#',
                'Ghar Mukhi Name',
                'Fathers Name',
                'Mothers Name',
                'Mobile',
                'Wife Name',
                'Nukh',
                'Sihdh Jo Gam',
                'Gotra',
                'Address',
                'City',
                'DOB',
                'Business',
                'Eduction',
                'Action',
              ],
              [
                '1',
                'JAIPRAKASH',
                'LATE SACHHANAND',
                'KANTA DEVI',
                '98259350322',
                'JYOTI',
                'DAWARIYA',
                'JHANDMERI',
                'WAMAN',
                'PLOT 115',
                'JODHPUR',
                '14/8/1982',
                'B COM',
                'N/A',
                'Edit  ADD MEMBER  Delete',
              ],
              [
                '#',
                'Member Name',
                'Fathers Name',
                'Relation',
                'DOB',
                'Education',
                'Business',
                'Mobile',
                'Action',
              ],
              ['1', 'DURGA', 'SACHCHA NAND', 'Sister', '1960-01-01', 'N/A', 'N/A', 'N/A', 'Edit  Delete'],
            ],
          },
        ],
      }

      const result = detectExcelFormat(mockWorkbook)
      expect(result.formatId).toBe('COMMUNITY_WEB_CMS_V1')
      expect(result.confidence).toBe('EXACT')
      expect(result.matchedSignatures).toEqual(
        expect.arrayContaining([
          "Header row contains 'Ghar Mukhi Name'",
          "Header row contains 'Fathers Name' and 'Wife Name'",
          "Found nested 'Member Name' header at row 3",
        ])
      )
    })

    it('detects COMMUNITY_WEB_CMS_V1 with HIGH confidence if only head header is present', () => {
      const mockWorkbook: ExcelWorkbookData = {
        fileName: 'heads-only.xlsx',
        fileSizeBytes: 1024,
        sheets: [
          {
            name: 'Sheet1',
            rows: [
              [
                '#',
                'Ghar Mukhi Name',
                'Fathers Name',
                'Mothers Name',
                'Mobile',
                'Wife Name',
              ],
              ['1', 'Mohanlal', 'Pesu Mal', 'Savitri', '7014736637', 'Laxmi'],
            ],
          },
        ],
      }

      const adapter = new CommunityWebCmsAdapterStub()
      const result = adapter.matches(mockWorkbook)
      expect(result.formatId).toBe('COMMUNITY_WEB_CMS_V1')
      expect(result.confidence).toBe('HIGH')
    })
  })

  describe('Unsupported / Unknown Workbooks', () => {
    it('returns null formatId and NONE confidence for unknown sheets and headers', () => {
      const mockWorkbook: ExcelWorkbookData = {
        fileName: 'financial-ledger.xlsx',
        fileSizeBytes: 1024,
        sheets: [
          {
            name: 'Transactions',
            rows: [
              ['Transaction ID', 'Account Number', 'Amount', 'Date'],
              ['TX-100', 'AC-999', '500.00', '2026-01-01'],
            ],
          },
        ],
      }

      const result = detectExcelFormat(mockWorkbook)
      expect(result.formatId).toBeNull()
      expect(result.confidence).toBe('NONE')
      expect(result.unmatchedReasons).toContain(
        'No registered Excel format matched the workbook signatures'
      )
    })

    it('handles empty workbooks safely without throwing', () => {
      const emptyWorkbook: ExcelWorkbookData = {
        fileName: 'empty.xlsx',
        fileSizeBytes: 0,
        sheets: [],
      }

      const result = detectExcelFormat(emptyWorkbook)
      expect(result.formatId).toBeNull()
      expect(result.confidence).toBe('NONE')
      expect(result.unmatchedReasons).toContain(
        'Workbook contains no sheets or invalid structure'
      )
    })

    it('handles sheets with zero rows gracefully', () => {
      const blankSheetsWorkbook: ExcelWorkbookData = {
        fileName: 'blank-sheets.xlsx',
        fileSizeBytes: 100,
        sheets: [
          {
            name: 'Sheet1',
            rows: [],
          },
        ],
      }

      const result = detectExcelFormat(blankSheetsWorkbook)
      expect(result.formatId).toBeNull()
      expect(result.confidence).toBe('NONE')
    })
  })

  describe('Adapter Contract Invariant & Locking (Excel-1)', () => {
    it('enforces that adapter stubs throw explicit locked implementation errors', async () => {
      const khatrisetu = new KhatrisetuAdapterStub()
      await expect(
        khatrisetu.adapt()
      ).rejects.toThrow(
        'ADAPTER_NOT_IMPLEMENTED: Khatrisetu adapter implementation is locked for Subtask Excel-2.'
      )

      const cms = new CommunityWebCmsAdapterStub()
      await expect(
        cms.adapt()
      ).rejects.toThrow(
        'ADAPTER_NOT_IMPLEMENTED: Community Web CMS adapter implementation is locked for Subtask Excel-3.'
      )
    })
  })
})
