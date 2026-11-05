/**
 * Import Parser & Mapping Service (Phase 14 — Subtask 2)
 *
 * Provides pure, deterministic parsing, mapping, normalization, and lineage
 * construction for census data migration (CSV and JSON formats).
 *
 * Architectural Invariants:
 * - PERSON != USER: Maps demographic census entities only. Never touches auth.users or profiles.
 * - DETECT != MERGE: Extracts and stages raw and normalized data without automated merging.
 * - STAGING != CANONICAL: Lineage points to staging only; canonical_id remains strictly null.
 * - Zero Secrets: Redacts any credential-like fields (passwords, tokens, API keys).
 */

import type {
  ImportEntityType,
  StagingRecordDraft,
  StructuredImportError,
  ParseImportOptions,
  ParseImportResult,
  ImportBatchRowCounts,
  ImportBatchValidationSummary,
} from '../types'
import { sanitizeText, sanitizeMultilineText } from '@/lib/sanitization'
import { readExcelWorkbook, EXCEL_READER_LIMITS } from './excel/reader'
import { ExcelFormatRegistry } from './excel/registry'
import type { ExcelWorkbookData, ApprovedExcelFormatId } from './excel/types'

/**
 * Explicit operational limits for import files and records.
 */
export const IMPORT_LIMITS = {
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_RECORDS_PER_BATCH: 5000,
  MAX_FIELD_LENGTH: 10000,
  CHUNK_SIZE: 500,
} as const

/**
 * Computes deterministic SHA-256 hash across web or Node environments.
 * Supports string content, ArrayBuffer, and Uint8Array binary buffers.
 */
export async function computeSha256(
  content: string | ArrayBuffer | Uint8Array
): Promise<string> {
  let uint8: Uint8Array
  if (typeof content === 'string') {
    uint8 = new TextEncoder().encode(content)
  } else if (content instanceof ArrayBuffer) {
    uint8 = new Uint8Array(content)
  } else {
    uint8 = content
  }

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto
  if (cryptoObj && cryptoObj.subtle && typeof cryptoObj.subtle.digest === 'function') {
    try {
      const hashBuffer = await cryptoObj.subtle.digest('SHA-256', uint8 as unknown as BufferSource)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    } catch {
      // Cross-realm ArrayBuffer or environment mismatch (e.g. happy-dom / jsdom on Linux):
      // Fall through to Node.js crypto fallback
    }
  }

  // Fallback for Node.js test environment
  const nodeCrypto = await import('crypto')
  return nodeCrypto.createHash('sha256').update(uint8).digest('hex')
}

/**
 * Sanitizes input text by removing UTF-8 Byte Order Mark (BOM).
 */
export function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1)
  }
  return text
}

/**
 * Sensitive field regex: prevents storing credentials or tokens.
 */
const SENSITIVE_KEY_REGEX = /(password|pass|secret|token|jwt|api_key|auth_key|private_key)/i

/**
 * Null representation literals in census data.
 */
const NULL_LITERALS = new Set([
  '',
  'null',
  'none',
  'nil',
  'n/a',
  'na',
  '-',
  '--',
  'unknown',
  'undefined',
])

/**
 * RFC 4180-compliant CSV parser.
 * Handles quoted fields, commas inside quotes, escaped quotes (""), newlines in quotes, and empty lines.
 */
export function parseCsvRows(csvContent: string): {
  headers: string[]
  rows: Array<{ rowNumber: number; data: Record<string, string>; errors: StructuredImportError[] }>
  fileErrors: StructuredImportError[]
} {
  const content = stripBom(csvContent)
  const fileErrors: StructuredImportError[] = []

  const rawLines: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    const nextChar = content[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote: ""
        currentField += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField)
      currentField = ''
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++ // Skip \n in \r\n
      }
      currentRow.push(currentField)
      currentField = ''

      // Push non-empty line
      const hasContent = currentRow.some((val) => val.trim().length > 0)
      if (hasContent) {
        rawLines.push(currentRow)
      }
      currentRow = []
    } else {
      currentField += char
    }
  }

  // Handle trailing content
  if (inQuotes) {
    fileErrors.push({
      code: 'UNCLOSED_QUOTE',
      message: 'CSV file contains an unclosed quotation mark.',
      severity: 'ERROR',
    })
  }

  currentRow.push(currentField)
  if (currentRow.some((val) => val.trim().length > 0)) {
    rawLines.push(currentRow)
  }

  if (rawLines.length === 0) {
    fileErrors.push({
      code: 'EMPTY_FILE',
      message: 'The uploaded CSV file is empty.',
      severity: 'ERROR',
    })
    return { headers: [], rows: [], fileErrors }
  }

  // Header row (first line)
  const rawHeaders = rawLines[0]
  const headers = rawHeaders.map((h, idx) => {
    const trimmed = h.trim()
    return trimmed.length > 0 ? trimmed : `column_${idx + 1}`
  })

  const rows: Array<{
    rowNumber: number
    data: Record<string, string>
    errors: StructuredImportError[]
  }> = []

  // Data rows (1-indexed for data records)
  for (let r = 1; r < rawLines.length; r++) {
    const line = rawLines[r]
    const rowErrors: StructuredImportError[] = []
    const rowData: Record<string, string> = {}

    if (line.length !== headers.length) {
      rowErrors.push({
        code: 'COLUMN_COUNT_MISMATCH',
        message: `Row ${r} has ${line.length} columns, expected ${headers.length}.`,
        severity: 'WARNING',
      })
    }

    for (let c = 0; c < headers.length; c++) {
      const header = headers[c]
      const val = line[c] ?? ''
      rowData[header] = val
    }

    rows.push({
      rowNumber: r,
      data: rowData,
      errors: rowErrors,
    })
  }

  return { headers, rows, fileErrors }
}

/**
 * Parses and validates raw JSON input into record objects.
 * Supports top-level arrays or objects containing a `records`, `data`, or `items` array.
 */
export function parseJsonRecords(jsonContent: string): {
  records: Array<{ rowNumber: number; data: Record<string, unknown>; errors: StructuredImportError[] }>
  fileErrors: StructuredImportError[]
} {
  const content = stripBom(jsonContent).trim()
  const fileErrors: StructuredImportError[] = []

  if (!content) {
    fileErrors.push({
      code: 'EMPTY_FILE',
      message: 'The uploaded JSON file is empty.',
      severity: 'ERROR',
    })
    return { records: [], fileErrors }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    fileErrors.push({
      code: 'MALFORMED_JSON',
      message: `Invalid JSON syntax: ${(err as Error).message}`,
      severity: 'ERROR',
    })
    return { records: [], fileErrors }
  }

  let rawArray: unknown[]

  if (Array.isArray(parsed)) {
    rawArray = parsed
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    if (Array.isArray(obj.records)) {
      rawArray = obj.records
    } else if (Array.isArray(obj.data)) {
      rawArray = obj.data
    } else if (Array.isArray(obj.items)) {
      rawArray = obj.items
    } else {
      fileErrors.push({
        code: 'UNSUPPORTED_JSON_STRUCTURE',
        message:
          'JSON must be an array of records or an object containing a "records", "data", or "items" array.',
        severity: 'ERROR',
      })
      return { records: [], fileErrors }
    }
  } else {
    fileErrors.push({
      code: 'UNSUPPORTED_JSON_STRUCTURE',
      message: 'Top-level JSON value must be an array or object.',
      severity: 'ERROR',
    })
    return { records: [], fileErrors }
  }

  const records: Array<{
    rowNumber: number
    data: Record<string, unknown>
    errors: StructuredImportError[]
  }> = []

  for (let i = 0; i < rawArray.length; i++) {
    const item = rawArray[i]
    const rowNumber = i + 1
    const errors: StructuredImportError[] = []

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({
        code: 'INVALID_ROW_STRUCTURE',
        message: `Record at index ${i} is not a valid JSON object.`,
        severity: 'ERROR',
      })
      records.push({
        rowNumber,
        data: {},
        errors,
      })
    } else {
      records.push({
        rowNumber,
        data: item as Record<string, unknown>,
        errors,
      })
    }
  }

  return { records, fileErrors }
}

/**
 * Normalizes string values, converting null representations and trimming whitespace.
 */
export function normalizeValue(val: unknown): unknown {
  if (val === null || val === undefined) {
    return null
  }

  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (NULL_LITERALS.has(trimmed.toLowerCase())) {
      return null
    }
    return trimmed
  }

  return val
}

/**
 * Normalizes single-line free text fields (names, locations, gotra, nukh, kul).
 * Preserves Unicode and standard punctuation while stripping executable tags,
 * dangerous protocols, and control characters.
 */
export function normalizeFreeText(val: unknown): string | null {
  const norm = normalizeValue(val)
  if (norm === null || typeof norm !== 'string') {
    return null
  }
  const sanitized = sanitizeText(norm)
  return sanitized.length > 0 ? sanitized : null
}

/**
 * Normalizes multiline free text fields (descriptions, histories, notes).
 * Preserves Unicode, line breaks, and standard punctuation while stripping executable tags,
 * dangerous protocols, and control characters.
 */
export function normalizeMultilineFreeText(val: unknown): string | null {
  const norm = normalizeValue(val)
  if (norm === null || typeof norm !== 'string') {
    return null
  }
  const sanitized = sanitizeMultilineText(norm)
  return sanitized.length > 0 ? sanitized : null
}

/**
 * Redacts any sensitive credential fields from raw and parsed maps.
 */
export function sanitizeSensitiveFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(data)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = '[REDACTED_CREDENTIAL]'
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = sanitizeSensitiveFields(val as Record<string, unknown>)
    } else {
      result[key] = val
    }
  }
  return result
}

/**
 * Normalizes gender input into standard census gender strings.
 */
export function normalizeGender(val: unknown): 'male' | 'female' | 'other' | null {
  if (typeof val !== 'string') return null
  const s = val.trim().toLowerCase()
  if (s === 'male' || s === 'm' || s === 'man' || s === 'boy') return 'male'
  if (s === 'female' || s === 'f' || s === 'woman' || s === 'girl') return 'female'
  if (s === 'other' || s === 'non-binary' || s === 'nb' || s === 'transgender') return 'other'
  return null
}

/**
 * Normalizes relationship types into supported relationship categories.
 */
export function normalizeRelationshipType(val: unknown): 'parent' | 'child' | 'spouse' | 'sibling' | string | null {
  if (typeof val !== 'string') return null
  const s = val.trim().toLowerCase()
  if (['parent', 'father', 'mother', 'dad', 'mom'].includes(s)) return 'parent'
  if (['child', 'son', 'daughter', 'kid'].includes(s)) return 'child'
  if (['spouse', 'husband', 'wife', 'partner', 'married'].includes(s)) return 'spouse'
  if (['sibling', 'brother', 'sister'].includes(s)) return 'sibling'
  return s
}

/**
 * Attempts to parse date string into standard ISO YYYY-MM-DD.
 * Returns parsed date or original string with warning flag.
 */
export function normalizeDate(
  raw: unknown
): { date: string | null; warning?: StructuredImportError } {
  if (!raw || typeof raw !== 'string') return { date: null }
  const trimmed = raw.trim()
  if (NULL_LITERALS.has(trimmed.toLowerCase())) return { date: null }

  // Check ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) {
      return { date: trimmed }
    }
  }

  // Check DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0')
    const month = dmyMatch[2].padStart(2, '0')
    const year = dmyMatch[3]
    const iso = `${year}-${month}-${day}`
    const d = new Date(iso)
    if (!isNaN(d.getTime())) {
      return { date: iso }
    }
  }

  // Check MM/DD/YYYY
  const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdyMatch) {
    const month = mdyMatch[1].padStart(2, '0')
    const day = mdyMatch[2].padStart(2, '0')
    const year = mdyMatch[3]
    const iso = `${year}-${month}-${day}`
    const d = new Date(iso)
    if (!isNaN(d.getTime())) {
      return { date: iso }
    }
  }

  // Non-fatal warning if date cannot be normalized to YYYY-MM-DD
  return {
    date: trimmed,
    warning: {
      code: 'UNRECOGNIZED_DATE_FORMAT',
      message: `Date "${trimmed}" could not be parsed to standard YYYY-MM-DD; preserved as raw string.`,
      severity: 'WARNING',
    },
  }
}

/**
 * Normalizes boolean or living status representations.
 */
export function normalizeIsLiving(val: unknown): boolean | null {
  if (typeof val === 'boolean') return val
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase()
    if (['true', 'yes', 'y', 'living', 'alive', '1'].includes(s)) return true
    if (['false', 'no', 'n', 'deceased', 'dead', '0'].includes(s)) return false
  }
  return null
}

/**
 * Normalizes person status to canonical values: 'ACTIVE' | 'DECEASED'.
 * Source 'LIVING' maps to 'ACTIVE'.
 * Unsupported status returns the trimmed raw string along with a warning.
 */
export function normalizePersonStatus(val: unknown): {
  status: 'ACTIVE' | 'DECEASED' | null
  rawStatus?: string
  warning?: StructuredImportError
} {
  if (val === null || val === undefined || val === '') {
    return { status: null }
  }

  const s = String(val).trim().toUpperCase()
  if (s === 'ACTIVE' || s === 'LIVING') {
    return { status: 'ACTIVE' }
  }
  if (s === 'DECEASED') {
    return { status: 'DECEASED' }
  }

  return {
    status: null,
    rawStatus: s,
    warning: {
      code: 'INVALID_PERSON_STATUS',
      field: 'status',
      severity: 'WARNING',
      message: `Status "${s}" is not a recognized canonical person status; expected ACTIVE or DECEASED (source LIVING maps to ACTIVE).`,
    },
  }
}

/**
 * Finds first matching key in source record based on aliases.
 */
function findSourceValue(
  record: Record<string, unknown>,
  aliases: string[]
): unknown {
  const normKeys = Object.keys(record).map((k) => ({
    orig: k,
    norm: k.toLowerCase().replace(/[^a-z0-9]/g, '_'),
  }))

  for (const alias of aliases) {
    const target = alias.toLowerCase().replace(/[^a-z0-9]/g, '_')
    const match = normKeys.find((nk) => nk.norm === target)
    if (match && record[match.orig] !== undefined) {
      return record[match.orig]
    }
  }

  return undefined
}

/**
 * Determines entity type from explicit column, options, or field inference.
 */
export function detectEntityType(
  rawRecord: Record<string, unknown>,
  defaultType?: ImportEntityType
): ImportEntityType {
  // 1. Explicit column in record
  const explicit = findSourceValue(rawRecord, [
    'entity_type',
    'type',
    'record_type',
    '_type',
  ])
  if (typeof explicit === 'string') {
    const s = explicit.trim().toUpperCase()
    if (s === 'PERSON' || s === 'FAMILY' || s === 'RELATIONSHIP') {
      return s as ImportEntityType
    }
  }

  // 2. Options override
  if (defaultType) {
    return defaultType
  }

  // 3. Field inference
  const hasRelationshipFields =
    findSourceValue(rawRecord, ['relationship_type', 'relation', 'rel_type']) !== undefined ||
    (findSourceValue(rawRecord, ['person_a_id', 'person_1', 'source_person_id']) !== undefined &&
      findSourceValue(rawRecord, ['person_b_id', 'person_2', 'target_person_id']) !== undefined)

  if (hasRelationshipFields) {
    return 'RELATIONSHIP'
  }

  const hasFamilyName =
    findSourceValue(rawRecord, ['family_name', 'family', 'house_name']) !== undefined
  const hasPersonName =
    findSourceValue(rawRecord, ['first_name', 'given_name', 'fname']) !== undefined ||
    findSourceValue(rawRecord, ['last_name', 'surname', 'lname']) !== undefined

  if (hasFamilyName && !hasPersonName) {
    return 'FAMILY'
  }

  // Default census entity
  return 'PERSON'
}

/**
 * Maps and normalizes raw record into a typed PERSON entity.
 */
export function mapPersonEntity(
  rawRecord: Record<string, unknown>
): {
  parsedData: Record<string, unknown>
  mappedKeys: Set<string>
  errors: StructuredImportError[]
} {
  const errors: StructuredImportError[] = []
  const mappedKeys = new Set<string>()

  const firstNameRaw = findSourceValue(rawRecord, ['first_name', 'first', 'given_name', 'fname'])
  const middleNameRaw = findSourceValue(rawRecord, ['middle_name', 'middle', 'mname'])
  const lastNameRaw = findSourceValue(rawRecord, ['last_name', 'last', 'surname', 'lname'])
  const maidenNameRaw = findSourceValue(rawRecord, ['maiden_name', 'maiden', 'previous_name'])
  const genderRaw = findSourceValue(rawRecord, ['gender', 'sex'])
  const dobRaw = findSourceValue(rawRecord, ['date_of_birth', 'dob', 'birth_date', 'born'])
  const pobRaw = findSourceValue(rawRecord, ['birth_place', 'pob', 'place_of_birth', 'birth_city'])
  const dodRaw = findSourceValue(rawRecord, ['date_of_death', 'dod', 'death_date', 'died'])
  const podRaw = findSourceValue(rawRecord, ['death_place', 'pod', 'place_of_death', 'death_city'])
  const isLivingRaw = findSourceValue(rawRecord, ['is_living', 'living', 'alive'])
  const statusRaw = findSourceValue(rawRecord, ['status', 'person_status', 'vital_status'])
  const gotraRaw = findSourceValue(rawRecord, ['gotra', 'gothra'])
  const nukhRaw = findSourceValue(rawRecord, ['nukh', 'nookh'])
  const kulRaw = findSourceValue(rawRecord, ['kul', 'kula'])
  const addressRaw = findSourceValue(rawRecord, ['current_address', 'address', 'street', 'residence'])
  const cityRaw = findSourceValue(rawRecord, ['city'])
  const stateRaw = findSourceValue(rawRecord, ['state', 'province'])
  const countryRaw = findSourceValue(rawRecord, ['country'])
  const postalCodeRaw = findSourceValue(rawRecord, ['postal_code', 'zip', 'pincode'])
  const emailRaw = findSourceValue(rawRecord, ['email'])
  const phoneRaw = findSourceValue(rawRecord, ['phone', 'mobile', 'telephone', 'contact_number'])

  const dobNorm = normalizeDate(dobRaw)
  if (dobNorm.warning) errors.push(dobNorm.warning)

  const dodNorm = normalizeDate(dodRaw)
  if (dodNorm.warning) errors.push(dodNorm.warning)

  const firstName = normalizeFreeText(firstNameRaw)
  const lastName = normalizeFreeText(lastNameRaw)

  if (!firstName) {
    errors.push({
      code: 'MISSING_FIRST_NAME',
      field: 'first_name',
      message: 'Person record must have a first_name.',
      severity: 'ERROR',
    })
  }

  if (!lastName) {
    errors.push({
      code: 'MISSING_LAST_NAME',
      field: 'last_name',
      message: 'Person record must have a last_name.',
      severity: 'ERROR',
    })
  }

  // Handle status normalization (canonical: ACTIVE | DECEASED, source LIVING -> ACTIVE)
  const statusNorm = normalizePersonStatus(statusRaw)
  if (statusNorm.warning) errors.push(statusNorm.warning)

  const parsedData: Record<string, unknown> = {
    first_name: firstName,
    middle_name: normalizeFreeText(middleNameRaw),
    last_name: lastName,
    maiden_name: normalizeFreeText(maidenNameRaw),
    gender: normalizeGender(genderRaw),
    date_of_birth: dobNorm.date,
    birth_place: normalizeFreeText(pobRaw),
    date_of_death: dodNorm.date,
    death_place: normalizeFreeText(podRaw),
    is_living: normalizeIsLiving(isLivingRaw ?? statusRaw),
    status: statusNorm.status ?? (statusNorm.rawStatus ? statusNorm.rawStatus : undefined),
    gotra: normalizeFreeText(gotraRaw),
    nukh: normalizeFreeText(nukhRaw),
    kul: normalizeFreeText(kulRaw),
    current_address: normalizeFreeText(addressRaw),
    city: normalizeFreeText(cityRaw),
    state: normalizeFreeText(stateRaw),
    country: normalizeFreeText(countryRaw),
    postal_code: normalizeValue(postalCodeRaw),
    email: normalizeValue(emailRaw),
    phone: normalizeValue(phoneRaw),
  }

  return { parsedData, mappedKeys, errors }
}

/**
 * Maps and normalizes raw record into a typed FAMILY entity.
 */
export function mapFamilyEntity(
  rawRecord: Record<string, unknown>
): {
  parsedData: Record<string, unknown>
  mappedKeys: Set<string>
  errors: StructuredImportError[]
} {
  const errors: StructuredImportError[] = []
  const mappedKeys = new Set<string>()

  const familyNameRaw = findSourceValue(rawRecord, ['family_name', 'name', 'family', 'house_name'])
  const headIdRaw = findSourceValue(rawRecord, ['head_id', 'head_person_id', 'family_head_id', 'head'])
  const headNameRaw = findSourceValue(rawRecord, ['head_name', 'head_person_name', 'head_full_name'])
  const cityRaw = findSourceValue(rawRecord, ['city'])
  const stateRaw = findSourceValue(rawRecord, ['state', 'province'])
  const countryRaw = findSourceValue(rawRecord, ['country'])
  const postalCodeRaw = findSourceValue(rawRecord, ['postal_code', 'zip', 'pincode'])
  const descRaw = findSourceValue(rawRecord, ['description', 'notes', 'about', 'history'])
  const gotraRaw = findSourceValue(rawRecord, ['gotra', 'gothra'])
  const nukhRaw = findSourceValue(rawRecord, ['nukh', 'nookh'])
  const kulRaw = findSourceValue(rawRecord, ['kul', 'kula'])

  const familyName = normalizeFreeText(familyNameRaw)

  if (!familyName) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      field: 'family_name',
      message: 'Family record must have a family_name.',
      severity: 'ERROR',
    })
  }

  const parsedData: Record<string, unknown> = {
    family_name: familyName,
    head_id: normalizeValue(headIdRaw),
    head_name: normalizeFreeText(headNameRaw),
    city: normalizeFreeText(cityRaw),
    state: normalizeFreeText(stateRaw),
    country: normalizeFreeText(countryRaw),
    postal_code: normalizeValue(postalCodeRaw),
    description: normalizeMultilineFreeText(descRaw),
    gotra: normalizeFreeText(gotraRaw),
    nukh: normalizeFreeText(nukhRaw),
    kul: normalizeFreeText(kulRaw),
  }

  return { parsedData, mappedKeys, errors }
}

/**
 * Maps and normalizes raw record into a typed RELATIONSHIP entity.
 */
export function mapRelationshipEntity(
  rawRecord: Record<string, unknown>
): {
  parsedData: Record<string, unknown>
  mappedKeys: Set<string>
  errors: StructuredImportError[]
} {
  const errors: StructuredImportError[] = []
  const mappedKeys = new Set<string>()

  const personARaw = findSourceValue(rawRecord, ['person_a_id', 'person_1', 'source_person_id', 'from_person_id', 'person_a'])
  const personBRaw = findSourceValue(rawRecord, ['person_b_id', 'person_2', 'target_person_id', 'to_person_id', 'person_b'])
  const typeRaw = findSourceValue(rawRecord, ['relationship_type', 'relation', 'type', 'rel_type'])
  const notesRaw = findSourceValue(rawRecord, ['notes', 'note', 'description', 'comment', 'relationship_notes'])

  let personA = normalizeValue(personARaw) as string | null
  let personB = normalizeValue(personBRaw) as string | null
  let relType = normalizeRelationshipType(typeRaw)

  if (relType === 'child') {
    // Canonical relationship_type is strictly: PARENT, SPOUSE, SIBLING (no CHILD enum).
    // Normalize source CHILD to canonical PARENT semantics with endpoints reversed:
    // If source says A is CHILD of B, then canonically B is PARENT of A.
    const origA = personA
    personA = personB
    personB = origA
    relType = 'parent'
  }

  if (!personA) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      field: 'person_a_id',
      message: 'Relationship record must reference Person A (person_a_id).',
      severity: 'ERROR',
    })
  }

  if (!personB) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      field: 'person_b_id',
      message: 'Relationship record must reference Person B (person_b_id).',
      severity: 'ERROR',
    })
  }

  if (!relType) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      field: 'relationship_type',
      message: 'Relationship record must specify relationship_type (e.g. parent, spouse, sibling).',
      severity: 'ERROR',
    })
  }

  const parsedData: Record<string, unknown> = {
    person_a_id: personA,
    person_b_id: personB,
    relationship_type: relType ? (relType === 'parent' ? 'PARENT' : relType === 'spouse' ? 'SPOUSE' : relType === 'sibling' ? 'SIBLING' : relType.toUpperCase()) : null,
    notes: normalizeMultilineFreeText(notesRaw),
  }

  return { parsedData, mappedKeys, errors }
}

/**
 * Extracts unmapped fields from raw record to ensure zero data loss.
 */
export function extractUnmappedFields(
  rawRecord: Record<string, unknown>,
  parsedData: Record<string, unknown>
): Record<string, unknown> {
  const unmapped: Record<string, unknown> = {}
  const parsedKeys = new Set(Object.keys(parsedData))

  for (const [key, val] of Object.entries(rawRecord)) {
    // Exclude metadata/sensitive columns
    if (SENSITIVE_KEY_REGEX.test(key)) continue
    if (key.toLowerCase() === 'entity_type') continue

    // If key not in parsedData directly
    if (!parsedKeys.has(key)) {
      unmapped[key] = normalizeValue(val)
    }
  }

  return unmapped
}

/**
 * Determines deterministic source record ID.
 * Prefers mapped ID column, falling back to `${entity_type}_ROW_${source_row_number}`.
 */
export function resolveSourceRecordId(
  rawRecord: Record<string, unknown>,
  entityType: ImportEntityType,
  rowNumber: number
): string {
  const sourceIdVal = findSourceValue(rawRecord, [
    'source_record_id',
    'id',
    'external_id',
    'person_id',
    'family_id',
    'relationship_id',
    'source_id',
    'record_id',
    'member_id',
  ])

  if (sourceIdVal && typeof sourceIdVal === 'string' && sourceIdVal.trim().length > 0) {
    return sourceIdVal.trim()
  }

  if (sourceIdVal && typeof sourceIdVal === 'number') {
    return String(sourceIdVal)
  }

  // Deterministic fallback (Never uses random IDs)
  return `${entityType}_ROW_${rowNumber}`
}

/**
 * Core Parser & Mapper Pipeline:
 * Validates, parses, normalizes, maps, and generates staging record drafts.
 * Supports CSV, JSON, and heterogeneous Excel (.xlsx, .xls) files via registered format adapters.
 */
export async function parseImportFile(
  fileName: string,
  content: string | ArrayBuffer | Uint8Array,
  options: ParseImportOptions = {}
): Promise<ParseImportResult> {
  // 1. File Format Determination & Validation
  let format = options.format
  const ext = fileName.split('.').pop()?.toUpperCase()
  if (!format) {
    if (ext === 'CSV' || ext === 'JSON') {
      format = ext
    } else if (ext === 'XLSX' || ext === 'XLS') {
      format = 'XLSX'
    } else {
      throw new Error(
        `UNSUPPORTED_FORMAT: Unsupported file format ".${ext}". Only CSV, JSON, and XLSX are supported.`
      )
    }
  }

  if (format !== 'CSV' && format !== 'JSON' && format !== 'XLSX') {
    throw new Error(
      `UNSUPPORTED_FORMAT: Unsupported file format "${format}". Only CSV, JSON, and XLSX are supported.`
    )
  }

  // 2. Size & Resource Limit Checks
  const fileSizeBytes =
    typeof content === 'string'
      ? new TextEncoder().encode(content).length
      : content.byteLength

  const maxAllowedBytes =
    format === 'XLSX'
      ? EXCEL_READER_LIMITS.MAX_FILE_SIZE_BYTES
      : IMPORT_LIMITS.MAX_FILE_SIZE_BYTES

  if (fileSizeBytes > maxAllowedBytes) {
    throw new Error(
      `FILE_TOO_LARGE: File size of ${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB exceeds maximum allowed limit of ${maxAllowedBytes / (1024 * 1024)} MB.`
    )
  }

  // 3. Compute Deterministic File Hash
  const fileHash = await computeSha256(content)

  // 4. Excel File Route: Process via Excel Reader, Format Registry, and Registered Adapter
  if (format === 'XLSX') {
    const workbook: ExcelWorkbookData = await readExcelWorkbook(
      content as ArrayBuffer | Uint8Array,
      fileName
    )

    const registry = ExcelFormatRegistry.getInstance()
    const detected = registry.detect(workbook)

    if (!detected.formatId || detected.confidence === 'NONE') {
      const reasons =
        detected.unmatchedReasons && detected.unmatchedReasons.length > 0
          ? ` (${detected.unmatchedReasons.join('; ')})`
          : ''
      throw new Error(
        `UNSUPPORTED_EXCEL_FORMAT: Excel workbook does not match any approved format signature (KHATRISETU_V1, COMMUNITY_WEB_CMS_V1)${reasons}.`
      )
    }

    const formatDef = registry.get(detected.formatId as ApprovedExcelFormatId)
    if (!formatDef) {
      throw new Error(
        `UNREGISTERED_EXCEL_FORMAT: Format definition for "${detected.formatId}" not found in registry.`
      )
    }

    const adapterResult = await formatDef.adapter.adapt(workbook, {
      fileName,
      fileHash,
      notes: options.notes,
    })

    const records = adapterResult.records
    if (records.length === 0) {
      throw new Error('EMPTY_FILE: No data records found in the import file.')
    }

    if (records.length > IMPORT_LIMITS.MAX_RECORDS_PER_BATCH) {
      throw new Error(
        `RECORD_LIMIT_EXCEEDED: Record count (${records.length}) exceeds maximum allowed batch limit of ${IMPORT_LIMITS.MAX_RECORDS_PER_BATCH}.`
      )
    }

    const rowCounts: ImportBatchRowCounts = {
      persons: adapterResult.summary.persons,
      families: adapterResult.summary.families,
      relationships: adapterResult.summary.relationships,
    }

    const validationSummary: ImportBatchValidationSummary = {
      errors: 0,
      warnings: 0,
      valid: 0,
      duplicates: 0,
    }

    for (const draft of records) {
      if (draft.validation_status === 'ERROR') {
        validationSummary.errors++
      } else if (draft.validation_status === 'WARNING') {
        validationSummary.warnings++
        validationSummary.valid++
      } else {
        validationSummary.valid++
      }
    }

    // Database schema constraint import_batches_file_format_valid enforces CHECK (file_format IN ('CSV', 'JSON')).
    // Staged Excel records are represented as JSON payload drafts.
    return {
      fileName,
      fileFormat: 'JSON',
      fileHash,
      fileSizeBytes,
      totalRows: records.length,
      records,
      errors: adapterResult.errors,
      rowCounts,
      validationSummary,
      detectedFormat: {
        formatId: formatDef.formatId,
        displayName: formatDef.displayName,
        sourceSystem: formatDef.sourceSystem,
        confidence: detected.confidence,
      },
    }
  }

  // 5. CSV / JSON Content Validation
  if (typeof content !== 'string') {
    throw new Error('INVALID_INPUT: CSV and JSON content must be provided as text string.')
  }

  // 6. Parse Raw Records for CSV / JSON
  let rawRecords: Array<{
    rowNumber: number
    data: Record<string, unknown>
    errors: StructuredImportError[]
  }>
  const fileErrors: StructuredImportError[] = []

  if (format === 'CSV') {
    const csvResult = parseCsvRows(content)
    rawRecords = csvResult.rows
    fileErrors.push(...csvResult.fileErrors)
  } else {
    const jsonResult = parseJsonRecords(content)
    rawRecords = jsonResult.records
    fileErrors.push(...jsonResult.fileErrors)
  }

  if (fileErrors.some((e) => e.severity === 'ERROR')) {
    const firstErr = fileErrors.find((e) => e.severity === 'ERROR')!
    throw new Error(`${firstErr.code}: ${firstErr.message}`)
  }

  if (rawRecords.length === 0) {
    throw new Error('EMPTY_FILE: No data records found in the import file.')
  }

  if (rawRecords.length > IMPORT_LIMITS.MAX_RECORDS_PER_BATCH) {
    throw new Error(
      `RECORD_LIMIT_EXCEEDED: Record count (${rawRecords.length}) exceeds maximum allowed batch limit of ${IMPORT_LIMITS.MAX_RECORDS_PER_BATCH}.`
    )
  }

  // 5. Normalization, Mapping & Lineage Generation
  const stagedDrafts: StagingRecordDraft[] = []
  const rowCounts: ImportBatchRowCounts = { persons: 0, families: 0, relationships: 0 }
  const validationSummary: ImportBatchValidationSummary = {
    errors: 0,
    warnings: 0,
    valid: 0,
    duplicates: 0,
  }

  for (const rawItem of rawRecords) {
    const rowNumber = rawItem.rowNumber
    const sanitizedRaw = sanitizeSensitiveFields(rawItem.data)
    const entityType = detectEntityType(sanitizedRaw, options.defaultEntityType)
    const sourceRecordId = resolveSourceRecordId(sanitizedRaw, entityType, rowNumber)

    let parsedData: Record<string, unknown> = {}
    const rowErrors: StructuredImportError[] = [...rawItem.errors]

    if (entityType === 'PERSON') {
      const mapped = mapPersonEntity(sanitizedRaw)
      parsedData = mapped.parsedData
      rowErrors.push(...mapped.errors)
      rowCounts.persons++
    } else if (entityType === 'FAMILY') {
      const mapped = mapFamilyEntity(sanitizedRaw)
      parsedData = mapped.parsedData
      rowErrors.push(...mapped.errors)
      rowCounts.families++
    } else if (entityType === 'RELATIONSHIP') {
      const mapped = mapRelationshipEntity(sanitizedRaw)
      parsedData = mapped.parsedData
      rowErrors.push(...mapped.errors)
      rowCounts.relationships++
    }

    // Preserve unmapped attributes for zero data loss
    const unmapped = extractUnmappedFields(sanitizedRaw, parsedData)
    if (Object.keys(unmapped).length > 0) {
      parsedData.unmapped_fields = unmapped
    }

    // Determine validation status for newly staged record
    const hasError = rowErrors.some((e) => e.severity === 'ERROR')
    const hasWarning = rowErrors.some((e) => e.severity === 'WARNING')

    let validationStatus: StagingRecordDraft['validation_status'] = 'PENDING'
    if (hasError) {
      validationStatus = 'ERROR'
      validationSummary.errors++
    } else if (hasWarning) {
      validationSummary.warnings++
      validationSummary.valid++
    } else {
      validationSummary.valid++
    }

    stagedDrafts.push({
      entity_type: entityType,
      source_row_number: rowNumber,
      source_record_id: sourceRecordId,
      parsed_data: parsedData,
      raw_data: sanitizedRaw,
      validation_status: validationStatus,
      validation_errors: rowErrors,
      canonical_id: null,
    })
  }

  return {
    fileName,
    fileFormat: format,
    fileHash,
    fileSizeBytes,
    totalRows: stagedDrafts.length,
    records: stagedDrafts,
    errors: fileErrors,
    rowCounts,
    validationSummary,
  }
}

/**
 * Pure, deterministic record validator for import staging records.
 * Mirror of the server-authoritative RPC `validate_import_batch` rules for fast offline/client checks.
 *
 * Rules:
 * - PERSON: requires name (first or last), length <= 100, valid gender, DOB 1800-today, DOD <= today, DOD >= DOB.
 * - FAMILY: requires family_name (<= 200 chars), description <= 2000 chars.
 * - RELATIONSHIP: requires person_a_id, person_b_id, no self-relation, valid relationship_type.
 *
 * @param draft StagingRecordDraft to validate.
 * @returns Evaluated status ('VALID' | 'WARNING' | 'ERROR') and structured validation errors.
 */
export function validateDraftRecord(draft: StagingRecordDraft): {
  status: 'VALID' | 'WARNING' | 'ERROR'
  errors: StructuredImportError[]
} {
  const errors: StructuredImportError[] = [...draft.validation_errors]

  if (draft.entity_type === 'PERSON') {
    const firstName = draft.parsed_data.first_name as string | undefined
    const lastName = draft.parsed_data.last_name as string | undefined
    const gender = draft.parsed_data.gender as string | undefined
    const dobStr = draft.parsed_data.date_of_birth as string | undefined
    const dodStr = draft.parsed_data.date_of_death as string | undefined

    const isLivingRaw = draft.parsed_data.is_living
    let isLiving: boolean | null = null
    if (typeof isLivingRaw === 'boolean') {
      isLiving = isLivingRaw
    } else if (typeof isLivingRaw === 'string') {
      const s = isLivingRaw.trim().toLowerCase()
      if (['true', 'yes', 'y', 'living', 'alive', '1'].includes(s)) {
        isLiving = true
      } else if (['false', 'no', 'n', 'deceased', 'dead', '0'].includes(s)) {
        isLiving = false
      } else if (s.length > 0) {
        errors.push({
          code: 'INVALID_BOOLEAN_VALUE',
          field: 'is_living',
          severity: 'WARNING',
          message: `Value "${isLivingRaw}" for is_living is not a recognized boolean; expected true/false, living/deceased.`,
        })
      }
    }

    if (!firstName && !errors.some((e) => e.field === 'first_name')) {
      errors.push({
        code: 'MISSING_FIRST_NAME',
        field: 'first_name',
        severity: 'ERROR',
        message: 'Person record must have a first_name.',
      })
    }

    if (!lastName && !errors.some((e) => e.field === 'last_name')) {
      errors.push({
        code: 'MISSING_LAST_NAME',
        field: 'last_name',
        severity: 'ERROR',
        message: 'Person record must have a last_name.',
      })
    }

    if (firstName && firstName.length > 100) {
      errors.push({
        code: 'FIELD_TOO_LONG',
        field: 'first_name',
        severity: 'ERROR',
        message: 'first_name exceeds maximum length of 100 characters.',
      })
    }

    if (lastName && lastName.length > 100) {
      errors.push({
        code: 'FIELD_TOO_LONG',
        field: 'last_name',
        severity: 'ERROR',
        message: 'last_name exceeds maximum length of 100 characters.',
      })
    }

    if (gender && !['MALE', 'FEMALE', 'OTHER'].includes(gender.toUpperCase())) {
      errors.push({
        code: 'INVALID_GENDER',
        field: 'gender',
        severity: 'ERROR',
        message: 'gender must be MALE, FEMALE, or OTHER.',
      })
    }

    let dobDate: Date | null = null
    if (dobStr) {
      const d = new Date(dobStr)
      if (isNaN(d.getTime())) {
        errors.push({
          code: 'INVALID_DATE_FORMAT',
          field: 'date_of_birth',
          severity: 'ERROR',
          message: 'date_of_birth is not a valid date (expected YYYY-MM-DD).',
        })
      } else {
        dobDate = d
        const minDate = new Date('1800-01-01')
        const now = new Date()
        if (d < minDate) {
          errors.push({
            code: 'DOB_TOO_EARLY',
            field: 'date_of_birth',
            severity: 'ERROR',
            message: 'date_of_birth cannot be earlier than 1800-01-01.',
          })
        } else if (d > now) {
          errors.push({
            code: 'DOB_IN_FUTURE',
            field: 'date_of_birth',
            severity: 'ERROR',
            message: 'date_of_birth cannot be in the future.',
          })
        }
      }
    }

    let dodDate: Date | null = null
    if (dodStr) {
      const d = new Date(dodStr)
      if (isNaN(d.getTime())) {
        errors.push({
          code: 'INVALID_DATE_FORMAT',
          field: 'date_of_death',
          severity: 'ERROR',
          message: 'date_of_death is not a valid date (expected YYYY-MM-DD).',
        })
      } else {
        dodDate = d
        if (d > new Date()) {
          errors.push({
            code: 'DOD_IN_FUTURE',
            field: 'date_of_death',
            severity: 'ERROR',
            message: 'date_of_death cannot be in the future.',
          })
        }
      }
    }

    // Canonical persons status validation & normalization: ACTIVE | DECEASED
    // Source status = 'LIVING' is normalized to canonical 'ACTIVE'
    const statusRaw = draft.parsed_data.status
    let canonicalStatus: 'ACTIVE' | 'DECEASED' | null = null
    if (statusRaw !== undefined && statusRaw !== null && statusRaw !== '') {
      const s = String(statusRaw).trim().toUpperCase()
      if (s === 'ACTIVE' || s === 'LIVING') {
        canonicalStatus = 'ACTIVE'
      } else if (s === 'DECEASED') {
        canonicalStatus = 'DECEASED'
      } else {
        if (!errors.some((e) => e.code === 'INVALID_PERSON_STATUS')) {
          errors.push({
            code: 'INVALID_PERSON_STATUS',
            field: 'status',
            severity: 'WARNING',
            message: `Status "${s}" is not a recognized canonical person status; expected ACTIVE or DECEASED (source LIVING maps to ACTIVE).`,
          })
        }
      }
    }

    // Check contradiction between is_living and status
    if (isLiving !== null && canonicalStatus !== null) {
      if ((isLiving === true && canonicalStatus === 'DECEASED') || (isLiving === false && canonicalStatus === 'ACTIVE')) {
        errors.push({
          code: 'VITAL_STATUS_CONTRADICTION',
          field: 'status',
          severity: 'WARNING',
          message: `Contradiction detected: is_living=${isLiving} contradicts person status=${canonicalStatus}.`,
        })
      }
    }

    if (dobDate && dodDate && dodDate < dobDate) {
      errors.push({
        code: 'DEATH_BEFORE_BIRTH',
        field: 'date_of_death',
        severity: 'ERROR',
        message: 'date_of_death cannot precede date_of_birth.',
      })
    }

    if (dodDate && (isLiving === true || canonicalStatus === 'ACTIVE')) {
      errors.push({
        code: 'VITAL_STATUS_CONTRADICTION',
        field: 'is_living',
        severity: 'WARNING',
        message: 'Person has date_of_death but is represented as living/ACTIVE.',
      })
    }
  } else if (draft.entity_type === 'FAMILY') {
    const familyName = draft.parsed_data.family_name as string | undefined
    const description = draft.parsed_data.description as string | undefined
    const headId = draft.parsed_data.head_id as string | undefined

    if (!familyName) {
      if (!errors.some((e) => e.code === 'MISSING_REQUIRED_FIELD')) {
        errors.push({
          code: 'MISSING_REQUIRED_FIELD',
          field: 'family_name',
          severity: 'ERROR',
          message: 'Family record must have a family_name.',
        })
      }
    } else if (familyName.length > 200) {
      errors.push({
        code: 'FIELD_TOO_LONG',
        field: 'family_name',
        severity: 'ERROR',
        message: 'family_name exceeds maximum length of 200 characters.',
      })
    }

    if (description && description.length > 2000) {
      errors.push({
        code: 'FIELD_TOO_LONG',
        field: 'description',
        severity: 'ERROR',
        message: 'description exceeds maximum length of 2000 characters.',
      })
    }

    if (headId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headId)) {
      errors.push({
        code: 'INVALID_UUID_FORMAT',
        field: 'head_id',
        severity: 'WARNING',
        message: 'head_id is not a standard UUID format; will require lineage resolution.',
      })
    }
  } else if (draft.entity_type === 'RELATIONSHIP') {
    const personA = draft.parsed_data.person_a_id as string | undefined
    const personB = draft.parsed_data.person_b_id as string | undefined
    const relType = draft.parsed_data.relationship_type as string | undefined

    if (!personA && !errors.some((e) => e.field === 'person_a_id')) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        field: 'person_a_id',
        severity: 'ERROR',
        message: 'Relationship record must reference Person A (person_a_id).',
      })
    }

    if (!personB && !errors.some((e) => e.field === 'person_b_id')) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        field: 'person_b_id',
        severity: 'ERROR',
        message: 'Relationship record must reference Person B (person_b_id).',
      })
    }

    if (personA && personB && personA.toLowerCase() === personB.toLowerCase()) {
      errors.push({
        code: 'SELF_RELATIONSHIP',
        field: 'person_b_id',
        severity: 'ERROR',
        message: 'A relationship cannot connect a person to themselves.',
      })
    }

    if (relType && !['PARENT', 'SPOUSE', 'SIBLING'].includes(relType.toUpperCase())) {
      errors.push({
        code: 'INVALID_RELATIONSHIP_TYPE',
        field: 'relationship_type',
        severity: 'ERROR',
        message: 'relationship_type must be PARENT, SPOUSE, or SIBLING (canonical schema does not support CHILD; map to PARENT with reversed endpoints).',
      })
    }
  }

  const hasError = errors.some((e) => e.severity === 'ERROR')
  const hasWarning = errors.some((e) => e.severity === 'WARNING')

  let status: 'VALID' | 'WARNING' | 'ERROR' = 'VALID'
  if (hasError) status = 'ERROR'
  else if (hasWarning) status = 'WARNING'

  return { status, errors }
}

