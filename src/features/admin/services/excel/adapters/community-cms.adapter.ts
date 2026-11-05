/**
 * Community Web CMS Interleaved Block Format Adapter (Excel-3)
 *
 * Implements the ExcelFormatAdapter contract for the Community Web CMS workbook format (COMMUNITY_WEB_CMS_V1).
 * Specifically parses hierarchical, interleaved block exports where family (Ghar Mukhi) records
 * and nested member records alternate within a single worksheet.
 *
 * Architectural Invariants:
 * - PERSON != USER: Demographic census extraction only. 'Ghar Mukhi', 'Fathers Name', and 'Wife Name'
 *   are NEVER mapped to auth.users, credentials, or logins.
 * - DETECT != MERGE: Extracts raw and normalized entities. Duplicate candidates within the file
 *   are flagged as WARNING, never merged or dropped destructively.
 * - STAGING != CANONICAL: Output entities are strictly StagingRecordDraft[] with canonical_id = null.
 * - ID Determinism: Generates stable, reproducible source_record_id keys based on family row,
 *   member row number, and normalized relationship endpoints.
 * - Canonical Relationship Enum: Uses strictly 'PARENT' | 'SPOUSE' | 'SIBLING'.
 *   Normalizes unambiguous relationships (Parent, Son/Daughter with endpoint reversal, Wife/Spouse, Sibling).
 *   Leaves ambiguous relationships as WARNING / review required without guessing.
 * - Zero Secrets: Sensitive credentials, passwords, and tokens are completely excluded.
 */

import type {
  ApprovedExcelFormatId,
  ExcelAdapterContext,
  ExcelAdapterResult,
  ExcelFormatAdapter,
  ExcelFormatDetectionResult,
  ExcelRow,
  ExcelWorkbookData,
} from '../types'
import type {
  ImportEntityType,
  StagingRecordDraft,
  StagingValidationStatus,
  StructuredImportError,
} from '@/features/admin/types'
import { normalizeSignatureText } from '../registry'
import { normalizeDate } from '@/features/admin/services/importParser.service'

/**
 * Trims free text and treats null/undefined/empty string as null.
 */
function cleanString(val: unknown): string | null {
  if (val === null || val === undefined) return null
  const s = String(val).trim()
  return s.length > 0 ? s : null
}

/**
 * Parses full name into first_name, middle_name, and last_name tokens.
 */
function splitFullName(fullName: string | null): {
  first_name: string | null
  middle_name: string | null
  last_name: string | null
} {
  if (!fullName) {
    return { first_name: null, middle_name: null, last_name: null }
  }

  const tokens = fullName.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return { first_name: null, middle_name: null, last_name: null }
  }
  if (tokens.length === 1) {
    return { first_name: tokens[0], middle_name: null, last_name: tokens[0] }
  }
  if (tokens.length === 2) {
    return { first_name: tokens[0], middle_name: null, last_name: tokens[1] }
  }

  const first_name = tokens[0]
  const last_name = tokens[tokens.length - 1]
  const middle_name = tokens.slice(1, tokens.length - 1).join(' ')
  return { first_name, middle_name, last_name }
}

/**
 * Normalizes phone number (removes non-digit characters except leading +).
 */
function normalizePhone(val: unknown): string | undefined {
  if (val === null || val === undefined) return undefined
  const raw = String(val).trim()
  if (!raw || raw.toLowerCase() === 'n/a') return undefined
  const cleaned = raw.replace(/[^\d+]/g, '')
  return cleaned.length > 0 ? cleaned : undefined
}

/**
 * Normalizes raw date into ISO YYYY-MM-DD string.
 */
function normalizeDobCell(
  val: unknown
): { date: string | null; warning?: StructuredImportError } {
  if (val === null || val === undefined) return { date: null }
  if (val instanceof Date) {
    return { date: val.toISOString().split('T')[0] }
  }
  const raw = String(val).trim()
  if (!raw || raw.toLowerCase() === 'n/a' || raw === '-') {
    return { date: null }
  }
  return normalizeDate(raw)
}

/**
 * Normalizes gender from relationship role or explicit indicator.
 */
function inferGenderFromRelationship(rel: string | null): 'male' | 'female' | undefined {
  if (!rel) return undefined
  const norm = rel.toLowerCase()
  if (['wife', 'mother', 'daughter', 'sister', 'sister in law', 'niece', 'grand daughter'].includes(norm)) {
    return 'female'
  }
  if (['husband', 'father', 'son', 'brother', 'grand son', 'nephew'].includes(norm)) {
    return 'male'
  }
  return undefined
}

/**
 * Normalizes text for case-insensitive and whitespace-invariant lookup.
 */
function normalizeKey(str: string | null | undefined): string {
  if (!str) return ''
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Concrete Community Web CMS Interleaved Block Adapter (Format: COMMUNITY_WEB_CMS_V1)
 */
export class CommunityWebCmsAdapter implements ExcelFormatAdapter {
  readonly formatId: ApprovedExcelFormatId = 'COMMUNITY_WEB_CMS_V1'
  readonly displayName = 'Community Web CMS Interleaved Block Export'
  readonly description =
    'Single-sheet hierarchical block export containing interleaved Ghar Mukhi family headers and Member sub-tables.'

  /**
   * Deterministic signature matching for Community Web CMS workbooks.
   */
  matches(workbook: ExcelWorkbookData): ExcelFormatDetectionResult {
    const matchedSignatures: string[] = []
    const unmatchedReasons: string[] = []

    if (workbook.sheets.length === 0) {
      return {
        formatId: null,
        confidence: 'NONE',
        matchedSignatures: [],
        unmatchedReasons: ['Workbook has no sheets'],
      }
    }

    const firstSheet = workbook.sheets[0]
    if (firstSheet.rows.length === 0) {
      return {
        formatId: null,
        confidence: 'NONE',
        matchedSignatures: [],
        unmatchedReasons: ['First sheet is empty'],
      }
    }

    const row1 = firstSheet.rows[0]
    const row1Cols = row1.map(normalizeSignatureText)
    const hasGharMukhi = row1Cols.some((col) => col.includes('gharmukhi'))
    const hasFathersName = row1Cols.some((col) => col.includes('fathersname'))
    const hasWifeName = row1Cols.some((col) => col.includes('wifename'))

    if (hasGharMukhi) {
      matchedSignatures.push("Header row contains 'Ghar Mukhi Name'")
    } else {
      unmatchedReasons.push("First row missing 'Ghar Mukhi Name'")
    }

    if (hasFathersName && hasWifeName) {
      matchedSignatures.push("Header row contains 'Fathers Name' and 'Wife Name'")
    }

    let hasMemberHeader = false
    for (let r = 1; r < Math.min(25, firstSheet.rows.length); r++) {
      const row = firstSheet.rows[r]
      const cols = row.map(normalizeSignatureText)
      if (cols.some((c) => c === 'membername') && cols.some((c) => c === 'relation')) {
        hasMemberHeader = true
        matchedSignatures.push(`Found nested 'Member Name' header at row ${r + 1}`)
        break
      }
    }

    if (!hasMemberHeader && firstSheet.rows.length > 2) {
      unmatchedReasons.push("No nested 'Member Name' sub-headers found in sample rows")
    }

    if (hasGharMukhi && hasMemberHeader) {
      return {
        formatId: this.formatId,
        confidence: 'EXACT',
        matchedSignatures,
      }
    }

    if (hasGharMukhi) {
      return {
        formatId: this.formatId,
        confidence: 'HIGH',
        matchedSignatures,
        unmatchedReasons,
      }
    }

    return {
      formatId: null,
      confidence: 'NONE',
      matchedSignatures,
      unmatchedReasons,
    }
  }

  /**
   * Adapts the Community Web CMS workbook into Phase 14 StagingRecordDraft[] items.
   */
  async adapt(
    workbook: ExcelWorkbookData,
    _context: ExcelAdapterContext
  ): Promise<ExcelAdapterResult> {
    const records: StagingRecordDraft[] = []
    const globalErrors: StructuredImportError[] = []

    if (!workbook.sheets || workbook.sheets.length === 0) {
      const err: StructuredImportError = {
        code: 'MISSING_WORKSHEET',
        severity: 'ERROR',
        message: 'Workbook contains no sheets to parse.',
      }
      return {
        formatId: this.formatId,
        records: [],
        errors: [err],
        summary: { totalRecords: 0, persons: 0, families: 0, relationships: 0 },
      }
    }

    const sheet = workbook.sheets[0]
    if (!sheet.rows || sheet.rows.length === 0) {
      const err: StructuredImportError = {
        code: 'EMPTY_WORKSHEET',
        severity: 'ERROR',
        message: 'First worksheet contains no data rows.',
      }
      return {
        formatId: this.formatId,
        records: [],
        errors: [err],
        summary: { totalRecords: 0, persons: 0, families: 0, relationships: 0 },
      }
    }

    // Identify Head header columns from row 0
    const headHeaderRow = sheet.rows[0]
    const getHeadRawRow = (row: ExcelRow): Record<string, unknown> => {
      const raw: Record<string, unknown> = {}
      headHeaderRow.forEach((h, idx) => {
        const key = cleanString(h) || `col_${idx}`
        if (!/(password|token|secret|jwt)/i.test(key)) {
          raw[key] = row[idx] ?? null
        }
      })
      return raw
    }

    // Default member header columns for raw representation
    const defaultMemberHeaders = [
      '#',
      'Member Name',
      'Fathers Name',
      'Relation',
      'DOB',
      'Education',
      'Business',
      'Mobile',
      'Action',
    ]

    const getMemberRawRow = (row: ExcelRow): Record<string, unknown> => {
      const raw: Record<string, unknown> = {}
      defaultMemberHeaders.forEach((h, idx) => {
        raw[h] = row[idx] ?? null
      })
      return raw
    }

    interface ActiveFamilyContext {
      familyIndex: number
      familyRowNumber: number
      familySourceId: string
      gharMukhiPersonId: string
      gharMukhiName: string
      fatherName: string | null
      motherName: string | null
      wifeName: string | null
      city: string | null
      address: string | null
      gotra: string | null
      nukh: string | null
      members: Array<{
        memberRowNumber: number
        memberSourceId: string
        name: string
        fatherCol: string | null
        rel: string | null
      }>
    }

    let activeFamily: ActiveFamilyContext | null = null
    let familyCounter = 0
    const processedFamilies = new Map<number, ActiveFamilyContext>()
    const seenFamilySignatures = new Set<string>()

    // -----------------------------------------------------------------
    // PASS 1: Identify Blocks, Extract Families, and Extract Person Records
    // -----------------------------------------------------------------
    for (let r = 0; r < sheet.rows.length; r++) {
      const row = sheet.rows[r]
      const rowNumber = r + 1 // 1-indexed Excel row

      // Skip completely empty rows
      if (row.every((c) => c === null || c === undefined || String(c).trim() === '')) {
        continue
      }

      const col0 = cleanString(row[0])
      const col1 = cleanString(row[1])
      const col14Action = cleanString(row[14])
      const col8Action = cleanString(row[8])

      // Case A: Head Header Row (e.g. Row 1 with '#' and 'Ghar Mukhi Name')
      if (col0 === '#' && col1 && normalizeKey(col1) === 'gharmukhiname') {
        continue
      }

      // Case B: Member Header Row (e.g. Row 3, 5, 7 with '#' and 'Member Name')
      if (col0 === '#' && col1 && normalizeKey(col1) === 'membername') {
        continue
      }

      // Case C: Ghar Mukhi Family Block Row
      // Distinguishing signature: col14 contains 'ADD MEMBER' or (col1 is present and row has 14-15 columns)
      const isHeadRow =
        (col14Action && col14Action.includes('ADD MEMBER')) ||
        (row.length >= 14 &&
          col0 !== '#' &&
          col1 &&
          cleanString(row[5]) !== null && // Wife Name column present
          cleanString(row[10]) !== null) // City column present

      if (isHeadRow) {
        familyCounter++
        const gharMukhiName = col1 || `Ghar Mukhi Row ${rowNumber}`
        const fathersName = cleanString(row[2])
        const mothersName = cleanString(row[3])
        const mobile = normalizePhone(row[4])
        const wifeName = cleanString(row[5])
        const nukh = cleanString(row[6])
        const sindhGam = cleanString(row[7])
        const gotra = cleanString(row[8])
        const address = cleanString(row[9])
        const city = cleanString(row[10])
        const dobRaw = row[11]
        const education = cleanString(row[12])
        const business = cleanString(row[13])

        const familySourceId = `CMS_FAM_ROW_${rowNumber}`
        const gharMukhiPersonId = `CMS_MUKHI_ROW_${rowNumber}`

        activeFamily = {
          familyIndex: familyCounter,
          familyRowNumber: rowNumber,
          familySourceId,
          gharMukhiPersonId,
          gharMukhiName,
          fatherName: fathersName,
          motherName: mothersName,
          wifeName,
          city,
          address,
          gotra,
          nukh,
          members: [],
        }
        processedFamilies.set(familyCounter, activeFamily)

        // 1. Family Staging Draft
        const validationErrors: StructuredImportError[] = []
        let validationStatus: StagingValidationStatus = 'VALID'

        // Intra-file duplicate family detection
        const familySig = `${normalizeKey(gharMukhiName)}_${normalizeKey(fathersName)}_${normalizeKey(city)}`
        if (seenFamilySignatures.has(familySig)) {
          validationErrors.push({
            code: 'DUPLICATE_FAMILY_CANDIDATE',
            field: 'family_name',
            severity: 'WARNING',
            message: `Possible duplicate family block for '${gharMukhiName}' detected at row ${rowNumber}.`,
          })
          validationStatus = 'WARNING'
        } else {
          seenFamilySignatures.add(familySig)
        }

        const nameParts = splitFullName(gharMukhiName)
        const familyName = nameParts.last_name
          ? `${nameParts.last_name} Family`
          : `${gharMukhiName} Family`

        const familyDraft: StagingRecordDraft = {
          entity_type: 'FAMILY' as ImportEntityType,
          source_row_number: rowNumber,
          source_record_id: familySourceId,
          parsed_data: {
            family_name: familyName,
            head_name: gharMukhiName,
            city: city ?? undefined,
            current_address: address ?? undefined,
            gotra: gotra ?? undefined,
            nukh: nukh ?? undefined,
            unmapped_fields: {
              source_format: this.formatId,
              source_block: 'GHAR_MUKHI',
              fathers_name: fathersName,
              mothers_name: mothersName,
              wife_name: wifeName,
              sindh_jo_gam: sindhGam,
              education: education,
              business: business,
            },
          },
          raw_data: getHeadRawRow(row),
          validation_status: validationStatus,
          validation_errors: validationErrors,
          canonical_id: null,
        }
        records.push(familyDraft)

        // 2. Ghar Mukhi Person Staging Draft
        const mukhiDobNorm = normalizeDobCell(dobRaw)
        const mukhiValidationErrors: StructuredImportError[] = []
        let mukhiValidationStatus: StagingValidationStatus = 'VALID'

        if (mukhiDobNorm.warning) {
          mukhiValidationErrors.push(mukhiDobNorm.warning)
          mukhiValidationStatus = 'WARNING'
        }

        const mukhiPersonDraft: StagingRecordDraft = {
          entity_type: 'PERSON' as ImportEntityType,
          source_row_number: rowNumber,
          source_record_id: gharMukhiPersonId,
          parsed_data: {
            first_name: nameParts.first_name,
            middle_name: nameParts.middle_name ?? undefined,
            last_name: nameParts.last_name,
            gender: 'male',
            date_of_birth: mukhiDobNorm.date ?? undefined,
            status: 'ACTIVE',
            is_living: true,
            phone: mobile ?? undefined,
            city: city ?? undefined,
            current_address: address ?? undefined,
            gotra: gotra ?? undefined,
            nukh: nukh ?? undefined,
            unmapped_fields: {
              source_format: this.formatId,
              source_block: 'GHAR_MUKHI',
              family_source_id: familySourceId,
              fathers_name: fathersName,
              mothers_name: mothersName,
              wife_name: wifeName,
              education: education,
              business: business,
              sindh_jo_gam: sindhGam,
            },
          },
          raw_data: getHeadRawRow(row),
          validation_status: mukhiValidationStatus,
          validation_errors: mukhiValidationErrors,
          canonical_id: null,
        }
        records.push(mukhiPersonDraft)

        continue
      }

      // Case D: Nested Member Block Row
      // Distinguishing signature: col8Action contains 'Edit' or 'Delete' and row is not a head row
      const isMemberRow =
        (col8Action && (col8Action.includes('Edit') || col8Action.includes('Delete'))) ||
        (cleanString(row[3]) !== null && !isHeadRow && col0 !== '#')

      if (isMemberRow) {
        if (!activeFamily) {
          // Orphan member row outside of any family block!
          const orphanErrors: StructuredImportError[] = [
            {
              code: 'ORPHAN_MEMBER_BLOCK',
              severity: 'ERROR',
              message: `Member '${col1 || 'Unknown'}' at row ${rowNumber} is outside any Ghar Mukhi family block.`,
            },
          ]
          const orphanDraft: StagingRecordDraft = {
            entity_type: 'PERSON' as ImportEntityType,
            source_row_number: rowNumber,
            source_record_id: `CMS_ORPHAN_MEMBER_ROW_${rowNumber}`,
            parsed_data: {
              first_name: col1 ? splitFullName(col1).first_name : null,
              last_name: col1 ? splitFullName(col1).last_name : null,
              unmapped_fields: {
                source_format: this.formatId,
                orphan: true,
              },
            },
            raw_data: getMemberRawRow(row),
            validation_status: 'ERROR',
            validation_errors: orphanErrors,
            canonical_id: null,
          }
          records.push(orphanDraft)
          continue
        }

        const memberName = col1
        const fatherCol = cleanString(row[2])
        const relationship = cleanString(row[3])
        const dobRaw = row[4]
        const education = cleanString(row[5])
        const business = cleanString(row[6])
        const mobile = normalizePhone(row[7])

        const memberValidationErrors: StructuredImportError[] = []
        let memberValidationStatus: StagingValidationStatus = 'VALID'

        if (!memberName) {
          memberValidationErrors.push({
            code: 'MISSING_MEMBER_NAME',
            field: 'name',
            severity: 'ERROR',
            message: `Member at row ${rowNumber} is missing a name.`,
          })
          memberValidationStatus = 'ERROR'
        }

        const nameParts = splitFullName(memberName)
        if (memberName && !nameParts.first_name) {
          memberValidationErrors.push({
            code: 'MISSING_FIRST_NAME',
            field: 'first_name',
            severity: 'ERROR',
            message: `Member at row ${rowNumber} is missing first_name.`,
          })
          memberValidationStatus = 'ERROR'
        }

        const memberDobNorm = normalizeDobCell(dobRaw)
        if (memberDobNorm.warning) {
          memberValidationErrors.push(memberDobNorm.warning)
          if (memberValidationStatus === 'VALID') memberValidationStatus = 'WARNING'
        }

        const memberSourceId = `${activeFamily.familySourceId}_MEMBER_${rowNumber}`

        const gender = inferGenderFromRelationship(relationship)

        const memberPersonDraft: StagingRecordDraft = {
          entity_type: 'PERSON' as ImportEntityType,
          source_row_number: rowNumber,
          source_record_id: memberSourceId,
          parsed_data: {
            first_name: nameParts.first_name,
            middle_name: nameParts.middle_name ?? undefined,
            last_name: nameParts.last_name,
            gender: gender ?? undefined,
            date_of_birth: memberDobNorm.date ?? undefined,
            status: 'ACTIVE',
            is_living: true,
            phone: mobile ?? undefined,
            city: activeFamily.city ?? undefined,
            current_address: activeFamily.address ?? undefined,
            gotra: activeFamily.gotra ?? undefined,
            nukh: activeFamily.nukh ?? undefined,
            unmapped_fields: {
              source_format: this.formatId,
              source_block: 'MEMBER',
              family_source_id: activeFamily.familySourceId,
              ghar_mukhi_id: activeFamily.gharMukhiPersonId,
              ghar_mukhi_name: activeFamily.gharMukhiName,
              fathers_name_col: fatherCol,
              relationship_raw: relationship,
              education: education,
              business: business,
            },
          },
          raw_data: getMemberRawRow(row),
          validation_status: memberValidationStatus,
          validation_errors: memberValidationErrors,
          canonical_id: null,
        }
        records.push(memberPersonDraft)

        // Record member for relationship evaluation
        activeFamily.members.push({
          memberRowNumber: rowNumber,
          memberSourceId,
          name: memberName || `Member_Row_${rowNumber}`,
          fatherCol,
          rel: relationship,
        })

        continue
      }
    }

    // -----------------------------------------------------------------
    // PASS 2: Establish Canonical Relationships within Family Blocks
    // -----------------------------------------------------------------
    let relIndex = 0

    for (const family of processedFamilies.values()) {
      // Build member name lookup within family for target matching
      const memberLookup = new Map<string, { memberSourceId: string; name: string }>()
      for (const m of family.members) {
        memberLookup.set(normalizeKey(m.name), {
          memberSourceId: m.memberSourceId,
          name: m.name,
        })
      }

      for (const m of family.members) {
        if (!m.rel) continue
        const rawRel = m.rel.trim()
        const relNorm = rawRel.toLowerCase()

        let canonicalRelType: 'PARENT' | 'SPOUSE' | 'SIBLING' | null = null
        let personAId: string | null = null
        let personBId: string | null = null
        let targetPersonName = family.gharMukhiName
        let isAmbiguous = false
        const relErrors: StructuredImportError[] = []
        let relStatus: StagingValidationStatus = 'VALID'

        // 1. Wife / Spouse -> Relates to Ghar Mukhi (or designated husband)
        if (['wife', 'husband', 'spouse'].includes(relNorm)) {
          canonicalRelType = 'SPOUSE'
          personAId = m.memberSourceId
          personBId = family.gharMukhiPersonId
        }

        // 2. Son / Daughter / Child -> Canonical PARENT with endpoint reversal
        else if (['son', 'daughter', 'child'].includes(relNorm)) {
          canonicalRelType = 'PARENT'
          // Ghar Mukhi is parent -> person_a_id is Parent (Ghar Mukhi), person_b_id is Child (Member)
          personAId = family.gharMukhiPersonId
          personBId = m.memberSourceId
        }

        // 3. Mother / Father / Parent -> Canonical PARENT
        else if (['mother', 'father', 'parent'].includes(relNorm)) {
          canonicalRelType = 'PARENT'
          // Member is parent of Ghar Mukhi -> person_a_id is Parent (Member), person_b_id is Child (Ghar Mukhi)
          personAId = m.memberSourceId
          personBId = family.gharMukhiPersonId
        }

        // 4. Brother / Sister / Sibling -> Canonical SIBLING
        else if (['brother', 'sister', 'sibling'].includes(relNorm)) {
          canonicalRelType = 'SIBLING'
          personAId = m.memberSourceId
          personBId = family.gharMukhiPersonId
        }

        // 5. Daughter In-Law / Sister In-Law
        // In the CMS format, fatherCol indicates the husband's name within the family
        else if (['daughter in-law', 'daughter-in-law', 'daughter in law', 'sister in law', 'sister-in-law'].includes(relNorm)) {
          const husbandKey = normalizeKey(m.fatherCol)
          const husbandMatch = memberLookup.get(husbandKey)
          if (husbandMatch) {
            canonicalRelType = 'SPOUSE'
            personAId = m.memberSourceId
            personBId = husbandMatch.memberSourceId
            targetPersonName = husbandMatch.name
          } else {
            isAmbiguous = true
          }
        }

        // 6. Grand Son / Grand Daughter / Niece
        // In the CMS format, fatherCol indicates the immediate parent's name within the family
        else if (['grand son', 'grand-son', 'grandson', 'grand daughter', 'granddaughter', 'grand-daughter', 'niece', 'nephew'].includes(relNorm)) {
          const parentKey = normalizeKey(m.fatherCol)
          const parentMatch = memberLookup.get(parentKey)
          if (parentMatch) {
            canonicalRelType = 'PARENT'
            personAId = parentMatch.memberSourceId
            personBId = m.memberSourceId
            targetPersonName = parentMatch.name
          } else {
            isAmbiguous = true
          }
        }

        // 7. Ambiguous or unsupported relationships
        else {
          isAmbiguous = true
        }

        if (isAmbiguous || !canonicalRelType || !personAId || !personBId) {
          relErrors.push({
            code: 'AMBIGUOUS_RELATIONSHIP',
            field: 'relationship_type',
            severity: 'WARNING',
            message: `Relationship '${rawRel}' for '${m.name}' in family '${family.gharMukhiName}' requires manual review.`,
          })
          relStatus = 'WARNING'
          personAId = m.memberSourceId
          personBId = family.gharMukhiPersonId
        }

        const relSourceId = `${family.familySourceId}_REL_${m.memberSourceId}_${personBId}_${canonicalRelType || 'OTHER'}_${++relIndex}`

        const relDraft: StagingRecordDraft = {
          entity_type: 'RELATIONSHIP' as ImportEntityType,
          source_row_number: m.memberRowNumber,
          source_record_id: relSourceId,
          parsed_data: {
            person_a_id: personAId,
            person_b_id: personBId,
            relationship_type: canonicalRelType,
            notes: `${rawRel} of ${targetPersonName}`,
            unmapped_fields: {
              source_format: this.formatId,
              source_block: 'RELATIONSHIP',
              family_source_id: family.familySourceId,
              ghar_mukhi_name: family.gharMukhiName,
              source_member_name: m.name,
              fathers_name_col: m.fatherCol,
              raw_relationship: rawRel,
            },
          },
          raw_data: {
            family_row: family.familyRowNumber,
            member_row: m.memberRowNumber,
            member_name: m.name,
            father_col: m.fatherCol,
            relation: rawRel,
          },
          validation_status: relStatus,
          validation_errors: relErrors,
          canonical_id: null,
        }
        records.push(relDraft)
      }
    }

    // -----------------------------------------------------------------
    // Summary aggregation
    // -----------------------------------------------------------------
    const summary = {
      totalRecords: records.length,
      persons: records.filter((r) => r.entity_type === 'PERSON').length,
      families: records.filter((r) => r.entity_type === 'FAMILY').length,
      relationships: records.filter((r) => r.entity_type === 'RELATIONSHIP').length,
    }

    return {
      formatId: this.formatId,
      records,
      errors: globalErrors,
      summary,
    }
  }
}
