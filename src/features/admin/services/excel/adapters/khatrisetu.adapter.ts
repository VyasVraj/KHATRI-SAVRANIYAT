/**
 * Khatrisetu Multi-Sheet Relational Format Adapter (Excel-2)
 *
 * Implements the ExcelFormatAdapter contract for the Khatrisetu workbook format (KHATRISETU_V1).
 * Specifically converts the multi-sheet relational workbook (Families + Members sheets)
 * into standard Phase 14 StagingRecordDraft[] entities.
 *
 * Architectural Invariants:
 * - PERSON != USER: Demographic census extraction only. 'Head Account' and 'Account'
 *   fields are NEVER mapped to auth.users, credentials, or logins.
 * - DETECT != MERGE: Extracts raw and normalized entities. Potential intra-file duplicates
 *   are flagged as WARNING, never merged or dropped destructively.
 * - STAGING != CANONICAL: Output entities are strictly StagingRecordDraft[] with canonical_id = null.
 * - ID Determinism: Generates stable, reproducible source_record_id keys based on Family Code,
 *   member row index, and normalized relationship endpoints.
 * - Relationship Normalization: Maps 'Son'/'Daughter' to canonical PARENT (endpoints reversed),
 *   'Spouse' to SPOUSE, and 'Father'/'Mother' to PARENT.
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
 * Normalizes gender value to canonical 'male' | 'female' | 'other' | undefined.
 */
function normalizeGenderValue(val: unknown): string | undefined {
  const s = cleanString(val)?.toLowerCase()
  if (!s) return undefined
  if (s === 'male' || s === 'm') return 'male'
  if (s === 'female' || s === 'f') return 'female'
  if (s === 'other' || s === 'o') return 'other'
  return s
}

/**
 * Normalizes life status to canonical status and is_living flag.
 */
function normalizeLifeStatus(val: unknown): {
  status: 'ACTIVE' | 'DECEASED' | undefined
  is_living: boolean | undefined
} {
  const s = cleanString(val)?.toLowerCase()
  if (!s) return { status: undefined, is_living: undefined }
  if (['alive', 'living', 'active'].includes(s)) {
    return { status: 'ACTIVE', is_living: true }
  }
  if (['deceased', 'dead', 'passed away'].includes(s)) {
    return { status: 'DECEASED', is_living: false }
  }
  return { status: undefined, is_living: undefined }
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
  if (!raw) return undefined
  const cleaned = raw.replace(/[^\d+]/g, '')
  return cleaned.length > 0 ? cleaned : undefined
}

/**
 * Normalizes email address (lowercased, trimmed).
 */
function normalizeEmail(val: unknown): string | undefined {
  const s = cleanString(val)?.toLowerCase()
  return s || undefined
}

/**
 * Sanitizes headers by building a case-insensitive, normalized lookup map.
 */
function buildHeaderIndexMap(headerRow: ExcelRow): Map<string, number> {
  const map = new Map<string, number>()
  headerRow.forEach((cell, idx) => {
    const norm = normalizeSignatureText(cell)
    if (norm) {
      map.set(norm, idx)
    }
  })
  return map
}

/**
 * Retrieves cell value safely by matching multiple possible header aliases.
 */
function getCellByAliases(row: ExcelRow, headerMap: Map<string, number>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const norm = normalizeSignatureText(alias)
    const idx = headerMap.get(norm)
    if (idx !== undefined && idx < row.length) {
      const val = row[idx]
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return val
      }
    }
  }
  return undefined
}

/**
 * Concrete Khatrisetu Relational Adapter (Format: KHATRISETU_V1)
 */
export class KhatrisetuRelationalAdapter implements ExcelFormatAdapter {
  readonly formatId: ApprovedExcelFormatId = 'KHATRISETU_V1'
  readonly displayName = 'Khatrisetu Relational Export'
  readonly description =
    'Multi-sheet relational workbook containing separate Families and Members sheets linked by Family Code.'

  /**
   * Deterministic signature matching for Khatrisetu workbooks.
   */
  matches(workbook: ExcelWorkbookData): ExcelFormatDetectionResult {
    const matchedSignatures: string[] = []
    const unmatchedReasons: string[] = []

    const familiesSheet = workbook.sheets.find(
      (s) => s.name.trim().toLowerCase() === 'families'
    )
    const membersSheet = workbook.sheets.find(
      (s) => s.name.trim().toLowerCase() === 'members'
    )

    if (familiesSheet) {
      matchedSignatures.push("Sheet 'Families' present")
    } else {
      unmatchedReasons.push("Missing sheet 'Families'")
    }

    if (membersSheet) {
      matchedSignatures.push("Sheet 'Members' present")
    } else {
      unmatchedReasons.push("Missing sheet 'Members'")
    }

    let familiesHeaderMatched = false
    if (familiesSheet && familiesSheet.rows.length > 0) {
      const row1 = familiesSheet.rows[0]
      const colA = normalizeSignatureText(row1[0])
      const colB = normalizeSignatureText(row1[1])
      if (colA === 'familycode' || colB === 'headoffamily') {
        familiesHeaderMatched = true
        matchedSignatures.push("Families sheet header contains 'Family Code'")
      } else {
        unmatchedReasons.push("Families sheet row 1 does not start with 'Family Code'")
      }
    }

    let membersHeaderMatched = false
    if (membersSheet && membersSheet.rows.length > 0) {
      const row1 = membersSheet.rows[0]
      const colA = normalizeSignatureText(row1[0])
      const colB = normalizeSignatureText(row1[1])
      const colC = normalizeSignatureText(row1[2])
      if (colA === 'familycode' && (colB === 'name' || colC === 'relationship')) {
        membersHeaderMatched = true
        matchedSignatures.push("Members sheet header contains 'Family Code', 'Name', 'Relationship'")
      } else {
        unmatchedReasons.push("Members sheet row 1 does not match expected columns")
      }
    }

    if (familiesSheet && membersSheet && familiesHeaderMatched && membersHeaderMatched) {
      return {
        formatId: this.formatId,
        confidence: 'EXACT',
        matchedSignatures,
      }
    }

    if ((familiesSheet || membersSheet) && (familiesHeaderMatched || membersHeaderMatched)) {
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
   * Adapts the Khatrisetu workbook into Phase 14 StagingRecordDraft[] items.
   */
  async adapt(
    workbook: ExcelWorkbookData,
    _context: ExcelAdapterContext
  ): Promise<ExcelAdapterResult> {
    const records: StagingRecordDraft[] = []
    const globalErrors: StructuredImportError[] = []

    const familiesSheet = workbook.sheets.find(
      (s) => s.name.trim().toLowerCase() === 'families'
    )
    const membersSheet = workbook.sheets.find(
      (s) => s.name.trim().toLowerCase() === 'members'
    )

    if (!familiesSheet) {
      const err: StructuredImportError = {
        code: 'MISSING_FAMILIES_SHEET',
        severity: 'ERROR',
        message: "Workbook is missing required 'Families' sheet.",
      }
      return {
        formatId: this.formatId,
        records: [],
        errors: [err],
        summary: { totalRecords: 0, persons: 0, families: 0, relationships: 0 },
      }
    }

    if (!membersSheet) {
      const err: StructuredImportError = {
        code: 'MISSING_MEMBERS_SHEET',
        severity: 'ERROR',
        message: "Workbook is missing required 'Members' sheet.",
      }
      return {
        formatId: this.formatId,
        records: [],
        errors: [err],
        summary: { totalRecords: 0, persons: 0, families: 0, relationships: 0 },
      }
    }

    // Header index maps
    const familiesHeader = familiesSheet.rows[0] || []
    const familiesHeaderMap = buildHeaderIndexMap(familiesHeader)

    const membersHeader = membersSheet.rows[0] || []
    const membersHeaderMap = buildHeaderIndexMap(membersHeader)

    // Build raw row dictionaries for unmapped preservation
    const getFamiliesRawRow = (row: ExcelRow): Record<string, unknown> => {
      const raw: Record<string, unknown> = {}
      familiesHeader.forEach((h, idx) => {
        const key = cleanString(h) || `col_${idx}`
        // Exclude sensitive credentials if any
        if (!/(password|token|secret|jwt)/i.test(key)) {
          raw[key] = row[idx] ?? null
        }
      })
      return raw
    }

    const getMembersRawRow = (row: ExcelRow): Record<string, unknown> => {
      const raw: Record<string, unknown> = {}
      membersHeader.forEach((h, idx) => {
        const key = cleanString(h) || `col_${idx}`
        // Exclude sensitive credentials if any
        if (!/(password|token|secret|jwt)/i.test(key)) {
          raw[key] = row[idx] ?? null
        }
      })
      return raw
    }

    // -----------------------------------------------------------------
    // PASS 1: Extract Families
    // -----------------------------------------------------------------
    const familyCodeSet = new Set<string>()
    const familySourceIdMap = new Map<string, string>() // familyCode -> source_record_id

    for (let r = 1; r < familiesSheet.rows.length; r++) {
      const row = familiesSheet.rows[r]
      const rowNumber = r + 1 // 1-indexed row number in Excel sheet

      // Empty row check
      if (row.every((c) => c === null || c === undefined || String(c).trim() === '')) {
        continue
      }

      const rawFamilyCode = getCellByAliases(row, familiesHeaderMap, ['Family Code', 'familycode', 'code'])
      const familyCode = cleanString(rawFamilyCode)
      const headOfFamily = cleanString(getCellByAliases(row, familiesHeaderMap, ['Head of Family', 'head_of_family', 'head']))
      const surname = cleanString(getCellByAliases(row, familiesHeaderMap, ['Surname', 'last_name', 'family_name']))
      const nukh = cleanString(getCellByAliases(row, familiesHeaderMap, ['Nukh']))
      const gotra = cleanString(getCellByAliases(row, familiesHeaderMap, ['Gotra']))
      const moolShakha = cleanString(getCellByAliases(row, familiesHeaderMap, ['Mool Shakha']))
      const familyType = cleanString(getCellByAliases(row, familiesHeaderMap, ['Family Type']))
      const mukhi = cleanString(getCellByAliases(row, familiesHeaderMap, ['Mukhi']))
      const country = cleanString(getCellByAliases(row, familiesHeaderMap, ['Country']))
      const state = cleanString(getCellByAliases(row, familiesHeaderMap, ['State']))
      const city = cleanString(getCellByAliases(row, familiesHeaderMap, ['City']))
      const area = cleanString(getCellByAliases(row, familiesHeaderMap, ['Area']))
      const pincode = cleanString(getCellByAliases(row, familiesHeaderMap, ['Pincode', 'postal_code', 'zip']))
      const address = cleanString(getCellByAliases(row, familiesHeaderMap, ['Address']))
      const nativePlace = cleanString(getCellByAliases(row, familiesHeaderMap, ['Native Place']))
      const registeredOn = cleanString(getCellByAliases(row, familiesHeaderMap, ['Registered On']))

      const validationErrors: StructuredImportError[] = []
      let validationStatus: StagingValidationStatus = 'VALID'

      if (!familyCode) {
        validationErrors.push({
          code: 'MISSING_FAMILY_CODE',
          field: 'family_code',
          severity: 'ERROR',
          message: `Family row ${rowNumber} is missing Family Code.`,
        })
        validationStatus = 'ERROR'
      }

      // Detect duplicates within workbook
      if (familyCode) {
        if (familyCodeSet.has(familyCode.toUpperCase())) {
          validationErrors.push({
            code: 'DUPLICATE_FAMILY_CODE',
            field: 'family_code',
            severity: 'WARNING',
            message: `Duplicate Family Code '${familyCode}' detected at row ${rowNumber}; recorded with warning flag.`,
          })
          validationStatus = 'WARNING'
        } else {
          familyCodeSet.add(familyCode.toUpperCase())
        }
      }

      // Determine family_name
      let familyName = surname
      if (!familyName && headOfFamily) {
        const parts = splitFullName(headOfFamily)
        familyName = parts.last_name ? `${parts.last_name} Family` : `${headOfFamily} Family`
      }
      if (!familyName && familyCode) {
        familyName = `Family ${familyCode}`
      }
      if (!familyName) {
        familyName = `Family at row ${rowNumber}`
        validationErrors.push({
          code: 'MISSING_FAMILY_NAME',
          field: 'family_name',
          severity: 'ERROR',
          message: `Family row ${rowNumber} has no surname or head name to derive family_name.`,
        })
        validationStatus = 'ERROR'
      }

      const sourceRecordId = familyCode ? familyCode.trim() : `KS_FAM_ROW_${rowNumber}`
      if (familyCode) {
        familySourceIdMap.set(familyCode.trim().toUpperCase(), sourceRecordId)
      }

      const parsedData: Record<string, unknown> = {
        family_name: familyName,
        head_name: headOfFamily ?? undefined,
        city: city ?? undefined,
        state: state ?? undefined,
        country: country ?? undefined,
        postal_code: pincode ?? undefined,
        gotra: gotra ?? undefined,
        nukh: nukh ?? undefined,
        unmapped_fields: {
          family_code: familyCode,
          mool_shakha: moolShakha,
          family_type: familyType,
          mukhi: mukhi,
          area: area,
          address: address,
          native_place: nativePlace,
          registered_on: registeredOn,
        },
      }

      const draft: StagingRecordDraft = {
        entity_type: 'FAMILY' as ImportEntityType,
        source_row_number: rowNumber,
        source_record_id: sourceRecordId,
        parsed_data: parsedData,
        raw_data: getFamiliesRawRow(row),
        validation_status: validationStatus,
        validation_errors: validationErrors,
        canonical_id: null,
      }

      records.push(draft)
    }

    // -----------------------------------------------------------------
    // PASS 2: Extract Members (PERSON) & Index for Relationship Resolution
    // -----------------------------------------------------------------
    interface MemberIndexItem {
      familyCode: string
      name: string
      sourceRecordId: string
      rowNumber: number
      relationship: string | null
      linkedTo: string | null
      gender?: string
    }

    const membersByFamily = new Map<string, MemberIndexItem[]>()
    const memberNameMapByFamily = new Map<string, Map<string, MemberIndexItem>>()

    for (let r = 1; r < membersSheet.rows.length; r++) {
      const row = membersSheet.rows[r]
      const rowNumber = r + 1

      if (row.every((c) => c === null || c === undefined || String(c).trim() === '')) {
        continue
      }

      const rawFamilyCode = getCellByAliases(row, membersHeaderMap, ['Family Code', 'familycode', 'code'])
      const familyCode = cleanString(rawFamilyCode) || 'UNKNOWN_FAMILY'
      const name = cleanString(getCellByAliases(row, membersHeaderMap, ['Name', 'full_name', 'member_name']))
      const relationship = cleanString(getCellByAliases(row, membersHeaderMap, ['Relationship', 'relation']))
      const linkedTo = cleanString(getCellByAliases(row, membersHeaderMap, ['Linked To', 'linkedto', 'relative']))
      const gender = normalizeGenderValue(getCellByAliases(row, membersHeaderMap, ['Gender', 'sex']))
      const dobRaw = getCellByAliases(row, membersHeaderMap, ['Date of Birth', 'dob', 'birth_date'])
      const maritalStatus = cleanString(getCellByAliases(row, membersHeaderMap, ['Marital Status']))
      const bloodGroup = cleanString(getCellByAliases(row, membersHeaderMap, ['Blood Group']))
      const lifeStatusRaw = getCellByAliases(row, membersHeaderMap, ['Life Status', 'status'])
      const mobile = normalizePhone(getCellByAliases(row, membersHeaderMap, ['Mobile', 'phone', 'contact']))
      const email = normalizeEmail(getCellByAliases(row, membersHeaderMap, ['Email']))
      const sameHousehold = cleanString(getCellByAliases(row, membersHeaderMap, ['Same Household']))
      const currentCity = cleanString(getCellByAliases(row, membersHeaderMap, ['Current City', 'city']))
      const currentState = cleanString(getCellByAliases(row, membersHeaderMap, ['Current State', 'state']))
      const address = cleanString(getCellByAliases(row, membersHeaderMap, ['Address', 'street']))
      const area = cleanString(getCellByAliases(row, membersHeaderMap, ['Area']))
      const pincode = cleanString(getCellByAliases(row, membersHeaderMap, ['Pincode', 'postal_code']))
      const nativePlace = cleanString(getCellByAliases(row, membersHeaderMap, ['Native Place']))
      const birthOrder = cleanString(getCellByAliases(row, membersHeaderMap, ['Birth Order']))
      const addedOn = cleanString(getCellByAliases(row, membersHeaderMap, ['Added On']))

      const validationErrors: StructuredImportError[] = []
      let validationStatus: StagingValidationStatus = 'VALID'

      // Verification of Family Code correlation
      const normalizedFamCode = familyCode.toUpperCase()
      if (!familyCodeSet.has(normalizedFamCode)) {
        validationErrors.push({
          code: 'ORPHAN_MEMBER_FAMILY_CODE',
          field: 'family_code',
          severity: 'WARNING',
          message: `Member '${name || 'Unknown'}' references Family Code '${familyCode}' which was not found in Families sheet.`,
        })
        validationStatus = 'WARNING'
      }

      // Name normalization
      const nameParts = splitFullName(name)
      if (!nameParts.first_name) {
        validationErrors.push({
          code: 'MISSING_FIRST_NAME',
          field: 'first_name',
          severity: 'ERROR',
          message: `Member at row ${rowNumber} is missing first_name.`,
        })
        validationStatus = 'ERROR'
      }

      if (!nameParts.last_name) {
        validationErrors.push({
          code: 'MISSING_LAST_NAME',
          field: 'last_name',
          severity: 'ERROR',
          message: `Member at row ${rowNumber} is missing last_name.`,
        })
        validationStatus = 'ERROR'
      }

      // Date of Birth normalization
      let dateOfBirth: string | null = null
      if (dobRaw !== undefined && dobRaw !== null) {
        if (dobRaw instanceof Date) {
          dateOfBirth = dobRaw.toISOString().split('T')[0]
        } else {
          const dobNorm = normalizeDate(String(dobRaw))
          dateOfBirth = dobNorm.date
          if (dobNorm.warning) {
            validationErrors.push(dobNorm.warning)
            if (validationStatus === 'VALID') validationStatus = 'WARNING'
          }
        }
      }

      // Life status normalization
      const lifeNorm = normalizeLifeStatus(lifeStatusRaw)

      // Deterministic collision-safe source_record_id
      const sourceRecordId = `${familyCode}_MEMBER_${rowNumber}`

      const parsedData: Record<string, unknown> = {
        first_name: nameParts.first_name,
        middle_name: nameParts.middle_name ?? undefined,
        last_name: nameParts.last_name,
        gender: gender ?? undefined,
        date_of_birth: dateOfBirth ?? undefined,
        status: lifeNorm.status ?? undefined,
        is_living: lifeNorm.is_living ?? undefined,
        phone: mobile ?? undefined,
        email: email ?? undefined,
        city: currentCity ?? undefined,
        state: currentState ?? undefined,
        current_address: address ?? undefined,
        postal_code: pincode ?? undefined,
        unmapped_fields: {
          family_code: familyCode,
          marital_status: maritalStatus,
          blood_group: bloodGroup,
          same_household: sameHousehold,
          area: area,
          native_place: nativePlace,
          birth_order: birthOrder,
          added_on: addedOn,
          khatrisetu_relationship: relationship,
          khatrisetu_linked_to: linkedTo,
        },
      }

      const draft: StagingRecordDraft = {
        entity_type: 'PERSON' as ImportEntityType,
        source_row_number: rowNumber,
        source_record_id: sourceRecordId,
        parsed_data: parsedData,
        raw_data: getMembersRawRow(row),
        validation_status: validationStatus,
        validation_errors: validationErrors,
        canonical_id: null,
      }

      records.push(draft)

      // Index member for intra-family relationship resolution
      if (name) {
        const item: MemberIndexItem = {
          familyCode,
          name,
          sourceRecordId,
          rowNumber,
          relationship,
          linkedTo,
          gender,
        }

        if (!membersByFamily.has(normalizedFamCode)) {
          membersByFamily.set(normalizedFamCode, [])
        }
        membersByFamily.get(normalizedFamCode)!.push(item)

        if (!memberNameMapByFamily.has(normalizedFamCode)) {
          memberNameMapByFamily.set(normalizedFamCode, new Map())
        }
        const nameMap = memberNameMapByFamily.get(normalizedFamCode)!
        nameMap.set(name.trim().toLowerCase(), item)
      }
    }

    // -----------------------------------------------------------------
    // PASS 3: Generate Relationships
    // -----------------------------------------------------------------
    let relIndex = 0

    for (const [normFamCode, members] of membersByFamily.entries()) {
      const nameMap = memberNameMapByFamily.get(normFamCode)!

      for (const member of members) {
        const rawRel = member.relationship?.trim()
        if (!rawRel) continue

        // Head rows in Khatrisetu do not have a parent/spouse pointer unless linkedTo is set
        if (rawRel.toLowerCase() === 'head' && !member.linkedTo) {
          continue
        }

        const linkedToName = member.linkedTo?.trim()
        if (!linkedToName) {
          // If relationship is non-Head but missing Linked To, record review warning
          if (rawRel.toLowerCase() !== 'head') {
            const warningDraft: StagingRecordDraft = {
              entity_type: 'RELATIONSHIP' as ImportEntityType,
              source_row_number: member.rowNumber,
              source_record_id: `${member.familyCode}_REL_${member.sourceRecordId}_UNRESOLVED_${++relIndex}`,
              parsed_data: {
                person_a_id: member.sourceRecordId,
                person_b_id: null,
                relationship_type: null,
                notes: `Unresolved relationship: ${rawRel} without target 'Linked To'`,
                unmapped_fields: {
                  family_code: member.familyCode,
                  source_member_name: member.name,
                  relationship_raw: rawRel,
                },
              },
              raw_data: {
                family_code: member.familyCode,
                member_name: member.name,
                relationship: rawRel,
                linked_to: null,
              },
              validation_status: 'WARNING',
              validation_errors: [
                {
                  code: 'MISSING_LINKED_TO',
                  field: 'linked_to',
                  severity: 'WARNING',
                  message: `Member '${member.name}' has relationship '${rawRel}' but 'Linked To' is missing.`,
                },
              ],
              canonical_id: null,
            }
            records.push(warningDraft)
          }
          continue
        }

        // Lookup linked person in the same family
        const targetMember = nameMap.get(linkedToName.toLowerCase())

        if (!targetMember) {
          // Linked To name does not match any member in the same family
          const warningDraft: StagingRecordDraft = {
            entity_type: 'RELATIONSHIP' as ImportEntityType,
            source_row_number: member.rowNumber,
            source_record_id: `${member.familyCode}_REL_${member.sourceRecordId}_UNMATCHED_${++relIndex}`,
            parsed_data: {
              person_a_id: member.sourceRecordId,
              person_b_id: null,
              relationship_type: null,
              notes: `Target '${linkedToName}' not found in family ${member.familyCode}`,
              unmapped_fields: {
                family_code: member.familyCode,
                source_member_name: member.name,
                linked_to_raw: linkedToName,
                relationship_raw: rawRel,
              },
            },
            raw_data: {
              family_code: member.familyCode,
              member_name: member.name,
              relationship: rawRel,
              linked_to: linkedToName,
            },
            validation_status: 'WARNING',
            validation_errors: [
              {
                code: 'LINKED_TARGET_NOT_FOUND',
                field: 'linked_to',
                severity: 'WARNING',
                message: `Target person '${linkedToName}' could not be matched among members of Family '${member.familyCode}'.`,
              },
            ],
            canonical_id: null,
          }
          records.push(warningDraft)
          continue
        }

        // Self-relationship safety
        if (member.sourceRecordId === targetMember.sourceRecordId) {
          continue
        }

        // Canonical normalization:
        // Canonical enum values: 'PARENT' | 'SPOUSE' | 'SIBLING'
        let canonicalRelType: 'PARENT' | 'SPOUSE' | 'SIBLING' | null = null
        let personAId = member.sourceRecordId
        let personBId = targetMember.sourceRecordId

        const relNorm = rawRel.toLowerCase()

        if (['son', 'daughter', 'child', 'kid'].includes(relNorm)) {
          // Member is child of Target -> Target is PARENT of Member
          // Canonical schema semantics: person_a_id is Parent, person_b_id is Child
          canonicalRelType = 'PARENT'
          personAId = targetMember.sourceRecordId
          personBId = member.sourceRecordId
        } else if (['father', 'mother', 'parent', 'dad', 'mom'].includes(relNorm)) {
          // Member is parent of Target -> Member is PARENT of Target
          canonicalRelType = 'PARENT'
          personAId = member.sourceRecordId
          personBId = targetMember.sourceRecordId
        } else if (['spouse', 'wife', 'husband', 'partner'].includes(relNorm)) {
          canonicalRelType = 'SPOUSE'
          personAId = member.sourceRecordId
          personBId = targetMember.sourceRecordId
        } else if (['brother', 'sister', 'sibling'].includes(relNorm)) {
          canonicalRelType = 'SIBLING'
          personAId = member.sourceRecordId
          personBId = targetMember.sourceRecordId
        } else {
          // Other/unsupported relationship types
          canonicalRelType = null
        }

        const relSourceId = `${member.familyCode}_REL_${personAId}_${personBId}_${canonicalRelType || 'OTHER'}`

        const relErrors: StructuredImportError[] = []
        let relStatus: StagingValidationStatus = 'VALID'

        if (!canonicalRelType) {
          relErrors.push({
            code: 'UNSUPPORTED_RELATIONSHIP_TYPE',
            field: 'relationship_type',
            severity: 'WARNING',
            message: `Relationship '${rawRel}' is not mapped to canonical enum (PARENT, SPOUSE, SIBLING); marked for review.`,
          })
          relStatus = 'WARNING'
        }

        const relDraft: StagingRecordDraft = {
          entity_type: 'RELATIONSHIP' as ImportEntityType,
          source_row_number: member.rowNumber,
          source_record_id: relSourceId,
          parsed_data: {
            person_a_id: personAId,
            person_b_id: personBId,
            relationship_type: canonicalRelType,
            notes: `${rawRel} of ${targetMember.name}`,
            unmapped_fields: {
              family_code: member.familyCode,
              source_relation: rawRel,
              linked_to: linkedToName,
            },
          },
          raw_data: {
            family_code: member.familyCode,
            member_name: member.name,
            relationship: rawRel,
            linked_to: linkedToName,
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
