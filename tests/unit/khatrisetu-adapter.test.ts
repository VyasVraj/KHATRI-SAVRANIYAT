import { describe, it, expect } from 'vitest'
import {
  KhatrisetuRelationalAdapter,
  readExcelWorkbook,
  type ExcelWorkbookData,
} from '@/features/admin/services/excel'
import * as fs from 'fs'

describe('Khatrisetu Multi-Sheet Relational Adapter (Excel-2)', () => {
  const adapter = new KhatrisetuRelationalAdapter()

  const defaultContext = {
    fileName: 'khatrisetu-families-2026-10-01.xlsx',
    fileHash: 'sha256-mock-test-hash',
  }

  // 1. Structure Matching
  describe('matches() Signature Detection', () => {
    it('returns EXACT confidence when Families and Members sheets and headers are present', () => {
      const workbook: ExcelWorkbookData = {
        fileName: 'khatrisetu.xlsx',
        fileSizeBytes: 2048,
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
              ['Family Code', 'Name', 'Relationship', 'Linked To', 'Gender'],
              ['KS-001', 'Prakash Keria', 'Head', null, 'male'],
            ],
          },
        ],
      }

      const match = adapter.matches(workbook)
      expect(match.confidence).toBe('EXACT')
      expect(match.formatId).toBe('KHATRISETU_V1')
      expect(match.matchedSignatures.length).toBeGreaterThanOrEqual(4)
    })

    it('returns NONE confidence for unrelated workbooks', () => {
      const workbook: ExcelWorkbookData = {
        fileName: 'random.xlsx',
        fileSizeBytes: 1024,
        sheets: [
          {
            name: 'Sheet1',
            rows: [['A', 'B', 'C']],
          },
        ],
      }

      const match = adapter.matches(workbook)
      expect(match.confidence).toBe('NONE')
      expect(match.formatId).toBeNull()
    })
  })

  // 2. Missing Required Sheets
  describe('adapt() Missing Sheet Guardrails', () => {
    it('returns an ERROR if Families sheet is missing', async () => {
      const workbook: ExcelWorkbookData = {
        fileName: 'missing-families.xlsx',
        fileSizeBytes: 1024,
        sheets: [
          {
            name: 'Members',
            rows: [['Family Code', 'Name', 'Relationship']],
          },
        ],
      }

      const result = await adapter.adapt(workbook, defaultContext)
      expect(result.records).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('MISSING_FAMILIES_SHEET')
      expect(result.summary.totalRecords).toBe(0)
    })

    it('returns an ERROR if Members sheet is missing', async () => {
      const workbook: ExcelWorkbookData = {
        fileName: 'missing-members.xlsx',
        fileSizeBytes: 1024,
        sheets: [
          {
            name: 'Families',
            rows: [['Family Code', 'Head of Family']],
          },
        ],
      }

      const result = await adapter.adapt(workbook, defaultContext)
      expect(result.records).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('MISSING_MEMBERS_SHEET')
      expect(result.summary.totalRecords).toBe(0)
    })
  })

  // 3. Extraction & Normalization Unit Tests
  describe('adapt() Multi-Sheet Extraction', () => {
    const mockWorkbook: ExcelWorkbookData = {
      fileName: 'khatrisetu-unit-mock.xlsx',
      fileSizeBytes: 4096,
      sheets: [
        {
          name: 'Families',
          rows: [
            [
              'Family Code',
              'Head of Family',
              'Head Account',
              'Census Status',
              'Members',
              'Surname',
              'Nukh',
              'Gotra',
              'Mool Shakha',
              'Family Type',
              'Mukhi',
              'Country',
              'State',
              'City',
              'Area',
              'Pincode',
              'Address',
              'Native Place',
              'Registered On',
            ],
            [
              'KS-FAM01',
              'Prakash Mulchand Keria',
              'Claimed',
              'completed',
              3,
              'Keria',
              'Keria',
              'Kanu',
              'None',
              'Nuclear',
              'Govindbhai',
              'India',
              'Gujarat',
              'Rajkot',
              'Nana Mava',
              '360005',
              'Kailash 15 Dipvan Park',
              'Rajkot',
              '2026-09-26',
            ],
          ],
        },
        {
          name: 'Members',
          rows: [
            [
              'Family Code',
              'Name',
              'Relationship',
              'Linked To',
              'Gender',
              'Date of Birth',
              'Age',
              'Under 18',
              'Marital Status',
              'Blood Group',
              'Life Status',
              'Mobile',
              'Email',
              'Account',
              'Same Household',
              'Current City',
              'Current State',
              'Address',
              'Area',
              'Pincode',
              'Native Place',
              'Birth Order',
              'Census Status',
              'Added On',
            ],
            [
              'KS-FAM01',
              'Prakash Mulchand Keria',
              'Head',
              null,
              'male',
              '1960-07-01',
              66,
              'No',
              'Married',
              'O+',
              'alive',
              '919428251508',
              'prakash.keria@gmail.com',
              'Claimed',
              'Yes',
              'Rajkot',
              'Gujarat',
              'Kailash 15 Dipvan Park',
              'Rajkot',
              '360005',
              'Rajkot',
              null,
              'completed',
              '2026-09-26',
            ],
            [
              'KS-FAM01',
              'Kamla Prakash Keria',
              'Spouse',
              'Prakash Mulchand Keria',
              'female',
              '1964-01-14',
              62,
              'No',
              'Married',
              'O+',
              'alive',
              '919428251508',
              'prakash.keria@gmail.com',
              'Not claimed',
              'Yes',
              'Rajkot',
              'Gujarat',
              null,
              null,
              null,
              null,
              null,
              'draft',
              '2026-09-26',
            ],
            [
              'KS-FAM01',
              'Kailash Prakash Keria',
              'Son',
              'Prakash Mulchand Keria',
              'male',
              '1985-05-10',
              41,
              'No',
              'Married',
              'B+',
              'alive',
              '919898811701',
              'prakash.keria@gmail.com',
              'Not claimed',
              'Yes',
              'Rajkot',
              'Gujarat',
              null,
              null,
              null,
              null,
              1,
              'draft',
              '2026-09-26',
            ],
          ],
        },
      ],
    }

    it('maps Family record correctly with canonical fields and unmapped preserved', async () => {
      const res = await adapter.adapt(mockWorkbook, defaultContext)
      const familyRecords = res.records.filter((r) => r.entity_type === 'FAMILY')
      expect(familyRecords).toHaveLength(1)

      const fam = familyRecords[0]
      expect(fam.source_record_id).toBe('KS-FAM01')
      expect(fam.source_row_number).toBe(2)
      expect(fam.validation_status).toBe('VALID')
      expect(fam.canonical_id).toBeNull()

      expect(fam.parsed_data.family_name).toBe('Keria')
      expect(fam.parsed_data.head_name).toBe('Prakash Mulchand Keria')
      expect(fam.parsed_data.city).toBe('Rajkot')
      expect(fam.parsed_data.state).toBe('Gujarat')
      expect(fam.parsed_data.country).toBe('India')
      expect(fam.parsed_data.postal_code).toBe('360005')
      expect(fam.parsed_data.gotra).toBe('Kanu')
      expect(fam.parsed_data.nukh).toBe('Keria')

      // Unmapped fields preservation
      const unmapped = fam.parsed_data.unmapped_fields as Record<string, unknown>
      expect(unmapped).toBeDefined()
      expect(unmapped.mool_shakha).toBe('None')
      expect(unmapped.family_type).toBe('Nuclear')
      expect(unmapped.mukhi).toBe('Govindbhai')
      expect(unmapped.registered_on).toBe('2026-09-26')
    })

    it('maps Person records correctly and guarantees PERSON != USER invariant', async () => {
      const res = await adapter.adapt(mockWorkbook, defaultContext)
      const personRecords = res.records.filter((r) => r.entity_type === 'PERSON')
      expect(personRecords).toHaveLength(3)

      const head = personRecords[0]
      expect(head.source_record_id).toBe('KS-FAM01_MEMBER_2')
      expect(head.source_row_number).toBe(2)
      expect(head.canonical_id).toBeNull()
      expect(head.parsed_data.first_name).toBe('Prakash')
      expect(head.parsed_data.middle_name).toBe('Mulchand')
      expect(head.parsed_data.last_name).toBe('Keria')
      expect(head.parsed_data.gender).toBe('male')
      expect(head.parsed_data.date_of_birth).toBe('1960-07-01')
      expect(head.parsed_data.status).toBe('ACTIVE')
      expect(head.parsed_data.is_living).toBe(true)
      expect(head.parsed_data.phone).toBe('919428251508')
      expect(head.parsed_data.email).toBe('prakash.keria@gmail.com')

      // Invariant: Account or Head Account must NEVER be mapped as auth/user credentials
      expect(head.parsed_data.user_id).toBeUndefined()
      expect(head.parsed_data.account).toBeUndefined()
      expect(head.parsed_data.password).toBeUndefined()
      expect(head.parsed_data.role).toBeUndefined()

      const son = personRecords[2]
      expect(son.source_record_id).toBe('KS-FAM01_MEMBER_4')
      expect(son.parsed_data.first_name).toBe('Kailash')
      expect(son.parsed_data.middle_name).toBe('Prakash')
      expect(son.parsed_data.last_name).toBe('Keria')
      expect(son.parsed_data.gender).toBe('male')
    })

    it('maps Relationships correctly with canonical enum and reversed endpoints for Son/Daughter', async () => {
      const res = await adapter.adapt(mockWorkbook, defaultContext)
      const relRecords = res.records.filter((r) => r.entity_type === 'RELATIONSHIP')
      expect(relRecords).toHaveLength(2)

      // 1. Spouse relationship: Kamla -> Prakash
      const spouseRel = relRecords.find(
        (r) => r.parsed_data.relationship_type === 'SPOUSE'
      )
      expect(spouseRel).toBeDefined()
      expect(spouseRel?.parsed_data.person_a_id).toBe('KS-FAM01_MEMBER_3') // Kamla
      expect(spouseRel?.parsed_data.person_b_id).toBe('KS-FAM01_MEMBER_2') // Prakash
      expect(spouseRel?.canonical_id).toBeNull()

      // 2. Son relationship: Kailash is Son of Prakash -> Prakash is PARENT of Kailash
      const parentRel = relRecords.find(
        (r) => r.parsed_data.relationship_type === 'PARENT'
      )
      expect(parentRel).toBeDefined()
      // Endpoints must be reversed: person_a_id is Parent (Prakash), person_b_id is Child (Kailash)
      expect(parentRel?.parsed_data.person_a_id).toBe('KS-FAM01_MEMBER_2') // Prakash (Parent)
      expect(parentRel?.parsed_data.person_b_id).toBe('KS-FAM01_MEMBER_4') // Kailash (Child)
      expect(parentRel?.canonical_id).toBeNull()
      expect(parentRel?.validation_status).toBe('VALID')
    })
  })

  // 4. Edge Cases: Father relationship, Unmatched Linked To, Missing Linked To, Duplicate Family Code
  describe('Edge Cases & Resilient Fallbacks', () => {
    it('normalizes Father relationship to PARENT without reversing endpoints', async () => {
      const mockFatherWorkbook: ExcelWorkbookData = {
        fileName: 'khatrisetu-father.xlsx',
        fileSizeBytes: 2048,
        sheets: [
          {
            name: 'Families',
            rows: [
              ['Family Code', 'Head of Family', 'Surname'],
              ['KS-FATHER01', 'Nanak Jamnadas Pamnani', 'Pamnani'],
            ],
          },
          {
            name: 'Members',
            rows: [
              ['Family Code', 'Name', 'Relationship', 'Linked To', 'Gender', 'Life Status'],
              ['KS-FATHER01', 'Nanak Jamnadas Pamnani', 'Head', null, 'male', 'alive'],
              ['KS-FATHER01', 'Jamnadas Chhotalal Pamnani', 'Father', 'Nanak Jamnadas Pamnani', 'male', 'deceased'],
            ],
          },
        ],
      }

      const res = await adapter.adapt(mockFatherWorkbook, defaultContext)
      const rel = res.records.find((r) => r.entity_type === 'RELATIONSHIP')
      expect(rel).toBeDefined()
      expect(rel?.parsed_data.relationship_type).toBe('PARENT')
      // Jamnadas is Father of Nanak -> Jamnadas is PARENT of Nanak
      expect(rel?.parsed_data.person_a_id).toBe('KS-FATHER01_MEMBER_3') // Jamnadas (Parent)
      expect(rel?.parsed_data.person_b_id).toBe('KS-FATHER01_MEMBER_2') // Nanak (Child)

      // Life status deceased check
      const jamnadas = res.records.find(
        (r) => r.entity_type === 'PERSON' && r.parsed_data.first_name === 'Jamnadas'
      )
      expect(jamnadas?.parsed_data.status).toBe('DECEASED')
      expect(jamnadas?.parsed_data.is_living).toBe(false)
    })

    it('records WARNING staging record when Linked To cannot be matched in the family', async () => {
      const mockUnmatchedWorkbook: ExcelWorkbookData = {
        fileName: 'unmatched-link.xlsx',
        fileSizeBytes: 2048,
        sheets: [
          {
            name: 'Families',
            rows: [
              ['Family Code', 'Head of Family', 'Surname'],
              ['KS-UNMATCH01', 'Test Head', 'TestFamily'],
            ],
          },
          {
            name: 'Members',
            rows: [
              ['Family Code', 'Name', 'Relationship', 'Linked To', 'Gender'],
              ['KS-UNMATCH01', 'Test Head', 'Head', null, 'male'],
              ['KS-UNMATCH01', 'Child Person', 'Son', 'NonExistent Parent', 'male'],
            ],
          },
        ],
      }

      const res = await adapter.adapt(mockUnmatchedWorkbook, defaultContext)
      const rel = res.records.find((r) => r.entity_type === 'RELATIONSHIP')
      expect(rel).toBeDefined()
      expect(rel?.validation_status).toBe('WARNING')
      expect(rel?.validation_errors[0].code).toBe('LINKED_TARGET_NOT_FOUND')
    })

    it('records WARNING staging record when non-Head member has relationship but no Linked To', async () => {
      const mockMissingLinkWorkbook: ExcelWorkbookData = {
        fileName: 'missing-link.xlsx',
        fileSizeBytes: 2048,
        sheets: [
          {
            name: 'Families',
            rows: [
              ['Family Code', 'Head of Family', 'Surname'],
              ['KS-MISS01', 'Test Head', 'TestFamily'],
            ],
          },
          {
            name: 'Members',
            rows: [
              ['Family Code', 'Name', 'Relationship', 'Linked To', 'Gender'],
              ['KS-MISS01', 'Test Head', 'Head', null, 'male'],
              ['KS-MISS01', 'Spouse Person', 'Spouse', null, 'female'],
            ],
          },
        ],
      }

      const res = await adapter.adapt(mockMissingLinkWorkbook, defaultContext)
      const rel = res.records.find((r) => r.entity_type === 'RELATIONSHIP')
      expect(rel).toBeDefined()
      expect(rel?.validation_status).toBe('WARNING')
      expect(rel?.validation_errors[0].code).toBe('MISSING_LINKED_TO')
    })

    it('flags DUPLICATE_FAMILY_CODE with WARNING when multiple families have identical code', async () => {
      const mockDupWorkbook: ExcelWorkbookData = {
        fileName: 'duplicate-family-code.xlsx',
        fileSizeBytes: 2048,
        sheets: [
          {
            name: 'Families',
            rows: [
              ['Family Code', 'Head of Family', 'Surname'],
              ['KS-DUP01', 'Head A', 'FamilyA'],
              ['KS-DUP01', 'Head B', 'FamilyB'],
            ],
          },
          {
            name: 'Members',
            rows: [
              ['Family Code', 'Name', 'Relationship', 'Linked To'],
              ['KS-DUP01', 'Head A', 'Head', null],
            ],
          },
        ],
      }

      const res = await adapter.adapt(mockDupWorkbook, defaultContext)
      const fam2 = res.records.filter((r) => r.entity_type === 'FAMILY')[1]
      expect(fam2.validation_status).toBe('WARNING')
      expect(fam2.validation_errors.some((e) => e.code === 'DUPLICATE_FAMILY_CODE')).toBe(true)
    })

    it('flags ORPHAN_MEMBER_FAMILY_CODE with WARNING when member references unknown family', async () => {
      const mockOrphanWorkbook: ExcelWorkbookData = {
        fileName: 'orphan-member.xlsx',
        fileSizeBytes: 2048,
        sheets: [
          {
            name: 'Families',
            rows: [
              ['Family Code', 'Head of Family', 'Surname'],
              ['KS-REAL01', 'Head A', 'FamilyA'],
            ],
          },
          {
            name: 'Members',
            rows: [
              ['Family Code', 'Name', 'Relationship', 'Linked To'],
              ['KS-ORPHAN99', 'Orphan Person', 'Head', null],
            ],
          },
        ],
      }

      const res = await adapter.adapt(mockOrphanWorkbook, defaultContext)
      const member = res.records.find((r) => r.entity_type === 'PERSON')
      expect(member).toBeDefined()
      expect(member?.validation_status).toBe('WARNING')
      expect(member?.validation_errors.some((e) => e.code === 'ORPHAN_MEMBER_FAMILY_CODE')).toBe(true)
    })
  })

  // 5. Real Khatrisetu Sample Workbook Validation
  describe('Real Workbook Ingestion (C:/Users/HP/Downloads/khatrisetu-families-2026-10-01.xlsx)', () => {
    const realFilePath = 'C:/Users/HP/Downloads/khatrisetu-families-2026-10-01.xlsx'

    it('parses real Khatrisetu file end-to-end with 100% contract compliance', async () => {
      if (!fs.existsSync(realFilePath)) {
        return
      }

      const fileBuffer = fs.readFileSync(realFilePath)
      const workbookData = await readExcelWorkbook(fileBuffer, 'khatrisetu-families-2026-10-01.xlsx')

      // 1. Signature detection
      const match = adapter.matches(workbookData)
      expect(match.confidence).toBe('EXACT')
      expect(match.formatId).toBe('KHATRISETU_V1')

      // 2. Adaptation
      const result = await adapter.adapt(workbookData, {
        fileName: 'khatrisetu-families-2026-10-01.xlsx',
        fileHash: 'sha256-actual-real-hash',
      })

      expect(result.formatId).toBe('KHATRISETU_V1')
      expect(result.summary.families).toBe(4)
      expect(result.summary.persons).toBe(24)
      expect(result.summary.relationships).toBe(20)
      expect(result.summary.totalRecords).toBe(48)
      expect(result.records).toHaveLength(48)

      // 3. Invariants across all 48 records
      for (const rec of result.records) {
        // Lineage points to staging only; canonical_id strictly null
        expect(rec.canonical_id).toBeNull()
        expect(rec.source_record_id).toBeTruthy()
        expect(rec.source_row_number).toBeGreaterThan(1)
        expect(rec.parsed_data).toBeDefined()
        expect(rec.raw_data).toBeDefined()

        // PERSON != USER
        if (rec.entity_type === 'PERSON') {
          expect(rec.parsed_data.user_id).toBeUndefined()
          expect(rec.parsed_data.account).toBeUndefined()
          expect(rec.parsed_data.password).toBeUndefined()
        }

        // Canonical Relationship Enum
        if (rec.entity_type === 'RELATIONSHIP') {
          expect(['PARENT', 'SPOUSE', 'SIBLING']).toContain(rec.parsed_data.relationship_type)
          expect(rec.parsed_data.person_a_id).toBeTruthy()
          expect(rec.parsed_data.person_b_id).toBeTruthy()
        }
      }
    })
  })
})
