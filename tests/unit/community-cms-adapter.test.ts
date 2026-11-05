import { describe, it, expect } from 'vitest'
import {
  CommunityWebCmsAdapter,
  CommunityWebCmsAdapterStub,
  readExcelWorkbook,
  type ExcelWorkbookData,
} from '@/features/admin/services/excel'
import * as fs from 'fs'

describe('Community Web CMS Interleaved Block Adapter (Excel-3)', () => {
  const adapter = new CommunityWebCmsAdapter()

  const defaultContext = {
    fileName: 'demo-user-data.xlsx',
    fileHash: 'sha256-mock-cms-hash',
  }

  // 1. Exact CMS Format Detection
  describe('matches() Signature Detection', () => {
    it('returns EXACT confidence when Ghar Mukhi and Member Name headers are present', () => {
      const workbook: ExcelWorkbookData = {
        fileName: 'cms-sample.xlsx',
        fileSizeBytes: 2048,
        sheets: [
          {
            name: 'Sheet1',
            rows: [
              ['#', 'Ghar Mukhi Name', 'Fathers Name', 'Mothers Name', 'Mobile', 'Wife Name'],
              [1, 'Jaiprakash', 'Late Sachhanand', 'Kanta Devi', '9876543210', 'Jyoti'],
              ['#', 'Member Name', 'Fathers Name', 'Relation', 'DOB', 'Education'],
              [1, 'Durga', 'Sachcha Nand', 'Sister', '1960-01-06', 'N/A'],
            ],
          },
        ],
      }

      const match = adapter.matches(workbook)
      expect(match.confidence).toBe('EXACT')
      expect(match.formatId).toBe('COMMUNITY_WEB_CMS_V1')
      expect(match.matchedSignatures.length).toBeGreaterThanOrEqual(2)
    })

    it('returns HIGH confidence when Ghar Mukhi header is present but no member headers in sample rows', () => {
      const workbook: ExcelWorkbookData = {
        fileName: 'cms-only-heads.xlsx',
        fileSizeBytes: 1024,
        sheets: [
          {
            name: 'Sheet1',
            rows: [
              ['#', 'Ghar Mukhi Name', 'Fathers Name', 'Wife Name'],
              [1, 'Jaiprakash', 'Sachhanand', 'Jyoti'],
            ],
          },
        ],
      }

      const match = adapter.matches(workbook)
      expect(match.confidence).toBe('HIGH')
      expect(match.formatId).toBe('COMMUNITY_WEB_CMS_V1')
    })

    it('returns NONE confidence for unrelated workbooks', () => {
      const workbook: ExcelWorkbookData = {
        fileName: 'unrelated.xlsx',
        fileSizeBytes: 1024,
        sheets: [
          {
            name: 'Sheet1',
            rows: [
              ['ID', 'Full Name', 'Department'],
              [1, 'John Doe', 'Engineering'],
            ],
          },
        ],
      }

      const match = adapter.matches(workbook)
      expect(match.confidence).toBe('NONE')
      expect(match.formatId).toBeNull()
    })

    it('returns NONE confidence for empty workbooks', () => {
      const workbook: ExcelWorkbookData = {
        fileName: 'empty.xlsx',
        fileSizeBytes: 0,
        sheets: [],
      }

      const match = adapter.matches(workbook)
      expect(match.confidence).toBe('NONE')
      expect(match.formatId).toBeNull()
    })
  })

  // 2. Structure Guardrails
  describe('adapt() Worksheet Guardrails', () => {
    it('returns structured error if workbook has no sheets', async () => {
      const workbook: ExcelWorkbookData = {
        fileName: 'no-sheets.xlsx',
        fileSizeBytes: 0,
        sheets: [],
      }

      const res = await adapter.adapt(workbook, defaultContext)
      expect(res.records).toHaveLength(0)
      expect(res.errors).toHaveLength(1)
      expect(res.errors[0].code).toBe('MISSING_WORKSHEET')
      expect(res.summary.totalRecords).toBe(0)
    })

    it('returns structured error if first sheet has no rows', async () => {
      const workbook: ExcelWorkbookData = {
        fileName: 'no-rows.xlsx',
        fileSizeBytes: 100,
        sheets: [{ name: 'Sheet1', rows: [] }],
      }

      const res = await adapter.adapt(workbook, defaultContext)
      expect(res.records).toHaveLength(0)
      expect(res.errors).toHaveLength(1)
      expect(res.errors[0].code).toBe('EMPTY_WORKSHEET')
      expect(res.summary.totalRecords).toBe(0)
    })
  })

  // 3. Synthetic Unit Test for Block Parsing & Extraction
  describe('adapt() Synthetic Interleaved Block Ingestion', () => {
    const mockCmsWorkbook: ExcelWorkbookData = {
      fileName: 'cms-synthetic.xlsx',
      fileSizeBytes: 4096,
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            // Row 1: Head Header
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
            // Row 2: Family 1 Head (JAIPRAKASH)
            [
              2,
              'JAIPRAKASH KHATRI',
              'LATE SACHHANAND',
              'KANTA DEVI',
              '9876543210',
              'JYOTI',
              'DAWARIYA',
              'Sindh Gam',
              'WAMAN',
              'Plot 10, Main Road',
              'JODHPUR',
              '1975-05-15',
              'Trade',
              'Graduate',
              'Edit  ADD MEMBER  Delete',
            ],
            // Row 3: Member Header
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
            // Row 4: Member 1 (Sister)
            [
              1,
              'DURGA',
              'SACHCHA NAND',
              'Sister',
              '1960-01-06',
              'N/A',
              'N/A',
              '9876500001',
              'Edit  Delete',
            ],
            // Row 5: Member 2 (Mother)
            [
              2,
              'KANTA DEVI',
              'SACHCHANAND',
              'Mother',
              '1954-11-06',
              'N/A',
              'N/A',
              'N/A',
              'Edit  Delete',
            ],
            // Row 6: Member 3 (Wife)
            [
              3,
              'JYOTI',
              'JAIPRAKASH',
              'Wife',
              '1983-07-26',
              'M COM',
              'N/A',
              'N/A',
              'Edit  Delete',
            ],
            // Row 7: Member 4 (Son)
            [
              4,
              'GORAKSH',
              'JAIPRAKASH',
              'Son',
              '2011-02-03',
              'RUNNING',
              'STUDENT',
              'N/A',
              'Edit  Delete',
            ],
          ],
        },
      ],
    }

    it('extracts Family block correctly with demographic fields and provenance', async () => {
      const res = await adapter.adapt(mockCmsWorkbook, defaultContext)
      const familyRecords = res.records.filter((r) => r.entity_type === 'FAMILY')
      expect(familyRecords).toHaveLength(1)

      const fam = familyRecords[0]
      expect(fam.source_record_id).toBe('CMS_FAM_ROW_2')
      expect(fam.source_row_number).toBe(2)
      expect(fam.validation_status).toBe('VALID')
      expect(fam.canonical_id).toBeNull()

      expect(fam.parsed_data.family_name).toBe('KHATRI Family')
      expect(fam.parsed_data.head_name).toBe('JAIPRAKASH KHATRI')
      expect(fam.parsed_data.city).toBe('JODHPUR')
      expect(fam.parsed_data.current_address).toBe('Plot 10, Main Road')
      expect(fam.parsed_data.gotra).toBe('WAMAN')
      expect(fam.parsed_data.nukh).toBe('DAWARIYA')

      const unmapped = fam.parsed_data.unmapped_fields as Record<string, unknown>
      expect(unmapped).toBeDefined()
      expect(unmapped.fathers_name).toBe('LATE SACHHANAND')
      expect(unmapped.mothers_name).toBe('KANTA DEVI')
      expect(unmapped.wife_name).toBe('JYOTI')
      expect(unmapped.source_format).toBe('COMMUNITY_WEB_CMS_V1')
    })

    it('extracts Ghar Mukhi as a PERSON record and strictly enforces PERSON != USER', async () => {
      const res = await adapter.adapt(mockCmsWorkbook, defaultContext)
      const mukhi = res.records.find(
        (r) => r.entity_type === 'PERSON' && r.source_record_id === 'CMS_MUKHI_ROW_2'
      )
      expect(mukhi).toBeDefined()
      expect(mukhi?.source_row_number).toBe(2)
      expect(mukhi?.canonical_id).toBeNull()
      expect(mukhi?.parsed_data.first_name).toBe('JAIPRAKASH')
      expect(mukhi?.parsed_data.last_name).toBe('KHATRI')
      expect(mukhi?.parsed_data.gender).toBe('male')
      expect(mukhi?.parsed_data.date_of_birth).toBe('1975-05-15')
      expect(mukhi?.parsed_data.phone).toBe('9876543210')
      expect(mukhi?.parsed_data.city).toBe('JODHPUR')

      // Invariant: PERSON != USER
      expect(mukhi?.parsed_data.user_id).toBeUndefined()
      expect(mukhi?.parsed_data.account).toBeUndefined()
      expect(mukhi?.parsed_data.password).toBeUndefined()
      expect(mukhi?.parsed_data.role).toBeUndefined()
    })

    it('extracts nested Member PERSON records associated with the active family', async () => {
      const res = await adapter.adapt(mockCmsWorkbook, defaultContext)
      const memberPersons = res.records.filter(
        (r) => r.entity_type === 'PERSON' && r.source_record_id.includes('CMS_FAM_ROW_2_MEMBER_')
      )
      expect(memberPersons).toHaveLength(4)

      // Durga (Sister)
      const durga = memberPersons.find((m) => m.source_record_id === 'CMS_FAM_ROW_2_MEMBER_4')
      expect(durga).toBeDefined()
      expect(durga?.parsed_data.first_name).toBe('DURGA')
      expect(durga?.parsed_data.gender).toBe('female')
      expect(durga?.parsed_data.date_of_birth).toBe('1960-01-06')
      expect(durga?.parsed_data.phone).toBe('9876500001')
      expect(durga?.parsed_data.city).toBe('JODHPUR')
      expect(durga?.parsed_data.gotra).toBe('WAMAN')
      expect(durga?.canonical_id).toBeNull()

      // Goraksh (Son)
      const goraksh = memberPersons.find((m) => m.source_record_id === 'CMS_FAM_ROW_2_MEMBER_7')
      expect(goraksh).toBeDefined()
      expect(goraksh?.parsed_data.first_name).toBe('GORAKSH')
      expect(goraksh?.parsed_data.gender).toBe('male')
      expect(goraksh?.parsed_data.date_of_birth).toBe('2011-02-03')
    })

    it('generates canonical relationships with strict enum and PARENT endpoint reversal', async () => {
      const res = await adapter.adapt(mockCmsWorkbook, defaultContext)
      const rels = res.records.filter((r) => r.entity_type === 'RELATIONSHIP')
      expect(rels).toHaveLength(4)

      // 1. Wife: Jyoti -> Jaiprakash (SPOUSE)
      const wifeRel = rels.find(
        (r) =>
          r.parsed_data.relationship_type === 'SPOUSE' &&
          r.parsed_data.person_a_id === 'CMS_FAM_ROW_2_MEMBER_6'
      )
      expect(wifeRel).toBeDefined()
      expect(wifeRel?.parsed_data.person_b_id).toBe('CMS_MUKHI_ROW_2')
      expect(wifeRel?.validation_status).toBe('VALID')
      expect(wifeRel?.canonical_id).toBeNull()

      // 2. Son: Goraksh is Son of Jaiprakash -> Jaiprakash is PARENT of Goraksh (Endpoint Reversal)
      const sonRel = rels.find((r) => r.source_row_number === 7)
      expect(sonRel).toBeDefined()
      expect(sonRel?.parsed_data.relationship_type).toBe('PARENT')
      // person_a_id is Parent (Jaiprakash), person_b_id is Child (Goraksh)
      expect(sonRel?.parsed_data.person_a_id).toBe('CMS_MUKHI_ROW_2')
      expect(sonRel?.parsed_data.person_b_id).toBe('CMS_FAM_ROW_2_MEMBER_7')
      expect(sonRel?.validation_status).toBe('VALID')
      expect(sonRel?.canonical_id).toBeNull()

      // 3. Mother: Kanta Devi is Mother of Jaiprakash -> Kanta Devi is PARENT of Jaiprakash
      const motherRel = rels.find((r) => r.source_row_number === 5)
      expect(motherRel).toBeDefined()
      expect(motherRel?.parsed_data.relationship_type).toBe('PARENT')
      expect(motherRel?.parsed_data.person_a_id).toBe('CMS_FAM_ROW_2_MEMBER_5') // Mother
      expect(motherRel?.parsed_data.person_b_id).toBe('CMS_MUKHI_ROW_2') // Son (Jaiprakash)
      expect(motherRel?.validation_status).toBe('VALID')

      // 4. Sister: Durga is Sister of Jaiprakash -> SIBLING
      const sisterRel = rels.find((r) => r.source_row_number === 4)
      expect(sisterRel).toBeDefined()
      expect(sisterRel?.parsed_data.relationship_type).toBe('SIBLING')
      expect(sisterRel?.parsed_data.person_a_id).toBe('CMS_FAM_ROW_2_MEMBER_4')
      expect(sisterRel?.parsed_data.person_b_id).toBe('CMS_MUKHI_ROW_2')
      expect(sisterRel?.validation_status).toBe('VALID')
    })
  })

  // 4. Extended Relationship Mapping (In-Laws, Grandchildren, Ambiguous)
  describe('In-Law, Multi-Generation, and Ambiguous Relationships', () => {
    const mockExtendedWorkbook: ExcelWorkbookData = {
      fileName: 'cms-extended.xlsx',
      fileSizeBytes: 2048,
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            // Head
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
              1,
              'JAWAHARLAL',
              'NIYALCHAND',
              'LAXMIBAI',
              '9876543210',
              'JASODA DEVI',
              'HARGUN',
              'Sindh',
              'KASHYAP',
              'Address',
              'JODHPUR',
              '1950-01-01',
              'Business',
              'Education',
              'Edit  ADD MEMBER  Delete',
            ],
            // Member Header
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
            // Member 1: Son
            [1, 'DHARMENDRA', 'JAWAHARLAL', 'Son', '1975-01-01', 'Grad', 'Business', 'N/A', 'Edit  Delete'],
            // Member 2: Daughter In-Law (Husband is DHARMENDRA)
            [
              2,
              'DIVYA',
              'DHARMENDRA',
              'Daughter In-Law',
              '1978-01-01',
              'Grad',
              'Housewife',
              'N/A',
              'Edit  Delete',
            ],
            // Member 3: Grand Son (Parent is DHARMENDRA)
            [
              3,
              'VANSH',
              'DHARMENDRA',
              'Grand Son',
              '2005-01-01',
              'School',
              'Student',
              'N/A',
              'Edit  Delete',
            ],
            // Member 4: Ambiguous / Unknown relation
            [
              4,
              'UNKNOWN_RELATIVE',
              'DHARMENDRA',
              'Distant Cousin',
              '2000-01-01',
              'N/A',
              'N/A',
              'N/A',
              'Edit  Delete',
            ],
          ],
        },
      ],
    }

    it('resolves Daughter In-Law to SPOUSE of her husband in the same family', async () => {
      const res = await adapter.adapt(mockExtendedWorkbook, defaultContext)
      const divyaRel = res.records.find(
        (r) => r.entity_type === 'RELATIONSHIP' && r.source_row_number === 5
      )
      expect(divyaRel).toBeDefined()
      expect(divyaRel?.parsed_data.relationship_type).toBe('SPOUSE')
      // person_a_id is Divya, person_b_id is Dharmendra
      expect(divyaRel?.parsed_data.person_a_id).toBe('CMS_FAM_ROW_2_MEMBER_5') // Divya
      expect(divyaRel?.parsed_data.person_b_id).toBe('CMS_FAM_ROW_2_MEMBER_4') // Dharmendra
      expect(divyaRel?.validation_status).toBe('VALID')
    })

    it('resolves Grand Son to PARENT of his parent in the same family with endpoint reversal', async () => {
      const res = await adapter.adapt(mockExtendedWorkbook, defaultContext)
      const vanshRel = res.records.find(
        (r) => r.entity_type === 'RELATIONSHIP' && r.source_row_number === 6
      )
      expect(vanshRel).toBeDefined()
      expect(vanshRel?.parsed_data.relationship_type).toBe('PARENT')
      // person_a_id is Dharmendra (Parent), person_b_id is Vansh (Child)
      expect(vanshRel?.parsed_data.person_a_id).toBe('CMS_FAM_ROW_2_MEMBER_4') // Dharmendra
      expect(vanshRel?.parsed_data.person_b_id).toBe('CMS_FAM_ROW_2_MEMBER_6') // Vansh
      expect(vanshRel?.validation_status).toBe('VALID')
    })

    it('flags ambiguous relationships as WARNING without inventing a canonical enum', async () => {
      const res = await adapter.adapt(mockExtendedWorkbook, defaultContext)
      const distantRel = res.records.find(
        (r) => r.entity_type === 'RELATIONSHIP' && r.source_row_number === 7
      )
      expect(distantRel).toBeDefined()
      expect(distantRel?.parsed_data.relationship_type).toBeNull()
      expect(distantRel?.validation_status).toBe('WARNING')
      expect(distantRel?.validation_errors[0].code).toBe('AMBIGUOUS_RELATIONSHIP')
    })
  })

  // 5. Malformed Block & Edge-Case Handling
  describe('Malformed Block, Orphan Member & Duplicate Handling', () => {
    it('creates an ERROR staging record for orphan members appearing before any family block', async () => {
      const mockOrphanWorkbook: ExcelWorkbookData = {
        fileName: 'cms-orphan.xlsx',
        fileSizeBytes: 2048,
        sheets: [
          {
            name: 'Sheet1',
            rows: [
              ['#', 'Member Name', 'Fathers Name', 'Relation', 'Action'],
              [1, 'Orphan Member', 'Some Father', 'Son', 'Edit  Delete'],
              // Then family
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
                1,
                'Head Person',
                'Head Father',
                'Head Mother',
                '1234567890',
                'Head Wife',
                'Nukh',
                'Gam',
                'Gotra',
                'Address',
                'City',
                '1980-01-01',
                'Bus',
                'Edu',
                'Edit  ADD MEMBER  Delete',
              ],
            ],
          },
        ],
      }

      const res = await adapter.adapt(mockOrphanWorkbook, defaultContext)
      const orphan = res.records.find((r) => r.source_record_id === 'CMS_ORPHAN_MEMBER_ROW_2')
      expect(orphan).toBeDefined()
      expect(orphan?.validation_status).toBe('ERROR')
      expect(orphan?.validation_errors[0].code).toBe('ORPHAN_MEMBER_BLOCK')
    })

    it('creates an ERROR staging record for members with missing names', async () => {
      const mockMissingNameWorkbook: ExcelWorkbookData = {
        fileName: 'cms-missing-name.xlsx',
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
                1,
                'Head Person',
                'Head Father',
                'Head Mother',
                '1234567890',
                'Head Wife',
                'Nukh',
                'Gam',
                'Gotra',
                'Address',
                'City',
                '1980-01-01',
                'Bus',
                'Edu',
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
              [1, null, 'Head Person', 'Son', '2010-01-01', 'School', 'Student', 'N/A', 'Edit  Delete'],
            ],
          },
        ],
      }

      const res = await adapter.adapt(mockMissingNameWorkbook, defaultContext)
      const member = res.records.find((r) => r.source_record_id === 'CMS_FAM_ROW_2_MEMBER_4')
      expect(member).toBeDefined()
      expect(member?.validation_status).toBe('ERROR')
      expect(member?.validation_errors.some((e) => e.code === 'MISSING_MEMBER_NAME')).toBe(true)
    })

    it('flags duplicate Ghar Mukhi blocks within workbook as WARNING without merging', async () => {
      const mockDupWorkbook: ExcelWorkbookData = {
        fileName: 'cms-duplicate.xlsx',
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
                1,
                'Mohanlal Khatri',
                'Pesu Mal',
                'Savitri Devi',
                '7014736637',
                'Laxmi Devi',
                'Hargun',
                'Gam',
                'Kashyap',
                'Address 1',
                'Jaipur',
                '1951-04-07',
                'Law',
                'Merchant',
                'Edit  ADD MEMBER  Delete',
              ],
              [
                '#',
                'Member Name',
                'Fathers Name',
                'Relation',
                'Action',
              ],
              // Duplicate Head block (same Mukhi, Father, City)
              [
                2,
                'Mohanlal Khatri',
                'Pesu Mal',
                'Savitri Devi',
                '7014736637',
                'Laxmi Devi',
                'Hargun',
                'Gam',
                'Kashyap',
                'Address 1',
                'Jaipur',
                '1951-04-07',
                'Law',
                'Merchant',
                'Edit  ADD MEMBER  Delete',
              ],
            ],
          },
        ],
      }

      const res = await adapter.adapt(mockDupWorkbook, defaultContext)
      const families = res.records.filter((r) => r.entity_type === 'FAMILY')
      expect(families).toHaveLength(2)
      expect(families[1].validation_status).toBe('WARNING')
      expect(families[1].validation_errors[0].code).toBe('DUPLICATE_FAMILY_CANDIDATE')
    })
  })

  // 6. Real Workbook Integration Validation (demo user data.xlsx)
  describe('Real Workbook Ingestion (C:/Users/HP/Downloads/demo user data.xlsx)', () => {
    const realFilePath = 'C:/Users/HP/Downloads/demo user data.xlsx'

    it('parses real Community Web CMS workbook end-to-end with 100% contract compliance', async () => {
      if (!fs.existsSync(realFilePath)) {
        return
      }

      const fileBuffer = fs.readFileSync(realFilePath)
      const workbookData = await readExcelWorkbook(fileBuffer, 'demo user data.xlsx')

      // 1. Signature detection
      const match = adapter.matches(workbookData)
      expect(match.confidence).toBe('EXACT')
      expect(match.formatId).toBe('COMMUNITY_WEB_CMS_V1')

      // 2. Adaptation
      const result = await adapter.adapt(workbookData, {
        fileName: 'demo user data.xlsx',
        fileHash: 'sha256-actual-cms-hash',
      })

      expect(result.formatId).toBe('COMMUNITY_WEB_CMS_V1')

      // 15 Ghar Mukhis -> 15 Families + 15 Ghar Mukhi Persons
      expect(result.summary.families).toBe(15)
      // 15 Ghar Mukhi Persons + 43 Member Persons = 58 Persons
      expect(result.summary.persons).toBe(58)
      // 43 Member rows -> 43 Relationship drafts
      expect(result.summary.relationships).toBe(43)
      // Total records = 15 + 58 + 43 = 116 records
      expect(result.summary.totalRecords).toBe(116)
      expect(result.records).toHaveLength(116)

      // 3. Strict Invariant Verification Across All 116 Staging Records
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
          // Allowed values: 'PARENT', 'SPOUSE', 'SIBLING', or null (for ambiguous)
          if (rec.parsed_data.relationship_type !== null) {
            expect(['PARENT', 'SPOUSE', 'SIBLING']).toContain(rec.parsed_data.relationship_type)
          }
          expect(rec.parsed_data.person_a_id).toBeTruthy()
          expect(rec.parsed_data.person_b_id).toBeTruthy()
        }
      }
    })
  })

  // 7. Backward Compatibility: CommunityWebCmsAdapterStub
  describe('CommunityWebCmsAdapterStub Lock Safety', () => {
    it('throws explicit locked error when CommunityWebCmsAdapterStub is called directly', async () => {
      const stub = new CommunityWebCmsAdapterStub()
      await expect(stub.adapt()).rejects.toThrow('ADAPTER_NOT_IMPLEMENTED')
    })
  })
})
