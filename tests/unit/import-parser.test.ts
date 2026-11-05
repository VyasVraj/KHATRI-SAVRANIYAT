/**
 * Unit Tests: Import Parser, Normalizer & Mapping (Phase 14 — Subtask 2)
 */

import { describe, it, expect } from 'vitest'
import {
  parseImportFile,
  parseCsvRows,
  parseJsonRecords,
  normalizeValue,
  normalizeGender,
  normalizeRelationshipType,
  normalizeDate,
  normalizeIsLiving,
  normalizePersonStatus,
  sanitizeSensitiveFields,
  detectEntityType,
  resolveSourceRecordId,
  computeSha256,
  stripBom,
  validateDraftRecord,
  IMPORT_LIMITS,
} from '@/features/admin/services/importParser.service'

describe('importParser.service unit tests', () => {
  describe('1. CSV Parsing (RFC 4180)', () => {
    it('parses a simple CSV with headers and data rows', () => {
      const csv = `first_name,last_name,gender\nAarav,Sharma,male\nPriya,Patel,female`
      const result = parseCsvRows(csv)

      expect(result.fileErrors).toHaveLength(0)
      expect(result.headers).toEqual(['first_name', 'last_name', 'gender'])
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0].data).toEqual({
        first_name: 'Aarav',
        last_name: 'Sharma',
        gender: 'male',
      })
      expect(result.rows[0].rowNumber).toBe(1)
      expect(result.rows[1].data).toEqual({
        first_name: 'Priya',
        last_name: 'Patel',
        gender: 'female',
      })
      expect(result.rows[1].rowNumber).toBe(2)
    })

    it('handles quoted fields with commas inside quotes', () => {
      const csv = `name,address,notes\n"Sharma, Aarav","123 Main St, Apt 4B","Verified member"`
      const result = parseCsvRows(csv)

      expect(result.headers).toEqual(['name', 'address', 'notes'])
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].data['name']).toBe('Sharma, Aarav')
      expect(result.rows[0].data['address']).toBe('123 Main St, Apt 4B')
    })

    it('handles escaped quotes ("") correctly', () => {
      const csv = `title,description\n"Book","He said ""Hello world"" to everyone"`
      const result = parseCsvRows(csv)

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].data['description']).toBe('He said "Hello world" to everyone')
    })

    it('handles UTF-8 with Byte Order Mark (BOM)', () => {
      const csvWithBom = `\uFEFFfirst_name,last_name\nDev,Mehta`
      expect(stripBom(csvWithBom)).not.toContain('\uFEFF')

      const result = parseCsvRows(csvWithBom)
      expect(result.headers[0]).toBe('first_name')
      expect(result.rows[0].data['first_name']).toBe('Dev')
    })

    it('safely skips empty lines without disrupting line numbers', () => {
      const csv = `first_name,last_name\n\nAarav,Sharma\n\n\nDiya,Sharma\n`
      const result = parseCsvRows(csv)

      expect(result.rows).toHaveLength(2)
      expect(result.rows[0].data['first_name']).toBe('Aarav')
      expect(result.rows[1].data['first_name']).toBe('Diya')
    })

    it('reports warning for rows with column count mismatch', () => {
      const csv = `col1,col2,col3\nval1,val2\nval1,val2,val3,val4`
      const result = parseCsvRows(csv)

      expect(result.rows).toHaveLength(2)
      expect(result.rows[0].errors).toContainEqual(
        expect.objectContaining({ code: 'COLUMN_COUNT_MISMATCH', severity: 'WARNING' })
      )
      expect(result.rows[1].errors).toContainEqual(
        expect.objectContaining({ code: 'COLUMN_COUNT_MISMATCH', severity: 'WARNING' })
      )
    })

    it('handles unclosed quotes with structured file error', () => {
      const csv = `col1,col2\n"unclosed,val2`
      const result = parseCsvRows(csv)

      expect(result.fileErrors).toContainEqual(
        expect.objectContaining({ code: 'UNCLOSED_QUOTE', severity: 'ERROR' })
      )
    })
  })

  describe('2. JSON Parsing', () => {
    it('parses a valid JSON array of records', () => {
      const json = JSON.stringify([
        { first_name: 'Rohan', last_name: 'Verma', gender: 'male' },
        { first_name: 'Ananya', last_name: 'Verma', gender: 'female' },
      ])
      const result = parseJsonRecords(json)

      expect(result.fileErrors).toHaveLength(0)
      expect(result.records).toHaveLength(2)
      expect(result.records[0].rowNumber).toBe(1)
      expect(result.records[0].data.first_name).toBe('Rohan')
      expect(result.records[1].rowNumber).toBe(2)
      expect(result.records[1].data.first_name).toBe('Ananya')
    })

    it('parses object-wrapped JSON records ({ "records": [...] })', () => {
      const json = JSON.stringify({
        records: [
          { first_name: 'Kabir', last_name: 'Kapoor' },
        ],
      })
      const result = parseJsonRecords(json)

      expect(result.fileErrors).toHaveLength(0)
      expect(result.records).toHaveLength(1)
      expect(result.records[0].data.first_name).toBe('Kabir')
    })

    it('parses object-wrapped JSON records with "data" key', () => {
      const json = JSON.stringify({
        data: [{ family_name: 'Kapoor Family', city: 'Mumbai' }],
      })
      const result = parseJsonRecords(json)

      expect(result.fileErrors).toHaveLength(0)
      expect(result.records).toHaveLength(1)
      expect(result.records[0].data.family_name).toBe('Kapoor Family')
    })

    it('reports controlled error on malformed JSON syntax', () => {
      const malformed = `[ { "first_name": "Incomplete"`
      const result = parseJsonRecords(malformed)

      expect(result.fileErrors).toContainEqual(
        expect.objectContaining({ code: 'MALFORMED_JSON', severity: 'ERROR' })
      )
    })

    it('reports error on unsupported top-level JSON structure', () => {
      const invalid = JSON.stringify({ metadata: { version: '1.0' } })
      const result = parseJsonRecords(invalid)

      expect(result.fileErrors).toContainEqual(
        expect.objectContaining({ code: 'UNSUPPORTED_JSON_STRUCTURE', severity: 'ERROR' })
      )
    })

    it('flags non-object items in JSON array with row-level error', () => {
      const json = JSON.stringify(['not an object', 42, null])
      const result = parseJsonRecords(json)

      expect(result.records).toHaveLength(3)
      expect(result.records[0].errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_ROW_STRUCTURE', severity: 'ERROR' })
      )
    })
  })

  describe('3. Normalization Rules', () => {
    it('trims surrounding whitespace and converts null representations to null', () => {
      expect(normalizeValue('  John  ')).toBe('John')
      expect(normalizeValue('')).toBeNull()
      expect(normalizeValue('   ')).toBeNull()
      expect(normalizeValue('null')).toBeNull()
      expect(normalizeValue('NULL')).toBeNull()
      expect(normalizeValue('N/A')).toBeNull()
      expect(normalizeValue('-')).toBeNull()
      expect(normalizeValue('None')).toBeNull()
      expect(normalizeValue(null)).toBeNull()
      expect(normalizeValue(undefined)).toBeNull()
      expect(normalizeValue(123)).toBe(123)
    })

    it('normalizes gender representations', () => {
      expect(normalizeGender('male')).toBe('male')
      expect(normalizeGender('M')).toBe('male')
      expect(normalizeGender('FEMALE')).toBe('female')
      expect(normalizeGender('f')).toBe('female')
      expect(normalizeGender('non-binary')).toBe('other')
      expect(normalizeGender('other')).toBe('other')
      expect(normalizeGender('unknown')).toBeNull()
      expect(normalizeGender(null)).toBeNull()
    })

    it('normalizes relationship types', () => {
      expect(normalizeRelationshipType('father')).toBe('parent')
      expect(normalizeRelationshipType('MOTHER')).toBe('parent')
      expect(normalizeRelationshipType('son')).toBe('child')
      expect(normalizeRelationshipType('daughter')).toBe('child')
      expect(normalizeRelationshipType('husband')).toBe('spouse')
      expect(normalizeRelationshipType('wife')).toBe('spouse')
      expect(normalizeRelationshipType('brother')).toBe('sibling')
      expect(normalizeRelationshipType('sister')).toBe('sibling')
      expect(normalizeRelationshipType('friend')).toBe('friend')
    })

    it('normalizes is_living representations', () => {
      expect(normalizeIsLiving(true)).toBe(true)
      expect(normalizeIsLiving(false)).toBe(false)
      expect(normalizeIsLiving('true')).toBe(true)
      expect(normalizeIsLiving('yes')).toBe(true)
      expect(normalizeIsLiving('y')).toBe(true)
      expect(normalizeIsLiving('living')).toBe(true)
      expect(normalizeIsLiving('alive')).toBe(true)
      expect(normalizeIsLiving('1')).toBe(true)
      expect(normalizeIsLiving('false')).toBe(false)
      expect(normalizeIsLiving('no')).toBe(false)
      expect(normalizeIsLiving('n')).toBe(false)
      expect(normalizeIsLiving('deceased')).toBe(false)
      expect(normalizeIsLiving('dead')).toBe(false)
      expect(normalizeIsLiving('0')).toBe(false)
      expect(normalizeIsLiving('unknown_status')).toBeNull()
      expect(normalizeIsLiving(null)).toBeNull()
      expect(normalizeIsLiving(undefined)).toBeNull()
    })

    it('normalizes person status to canonical ACTIVE | DECEASED and maps LIVING -> ACTIVE', () => {
      expect(normalizePersonStatus('ACTIVE')).toEqual({ status: 'ACTIVE' })
      expect(normalizePersonStatus('active')).toEqual({ status: 'ACTIVE' })
      expect(normalizePersonStatus('DECEASED')).toEqual({ status: 'DECEASED' })
      expect(normalizePersonStatus('deceased')).toEqual({ status: 'DECEASED' })
      expect(normalizePersonStatus('LIVING')).toEqual({ status: 'ACTIVE' })
      expect(normalizePersonStatus('living')).toEqual({ status: 'ACTIVE' })
      expect(normalizePersonStatus(null)).toEqual({ status: null })
      expect(normalizePersonStatus('')).toEqual({ status: null })

      const unsupported = normalizePersonStatus('ARCHIVED')
      expect(unsupported.status).toBeNull()
      expect(unsupported.rawStatus).toBe('ARCHIVED')
      expect(unsupported.warning).toEqual(
        expect.objectContaining({ code: 'INVALID_PERSON_STATUS', severity: 'WARNING' })
      )
    })

    it('normalizes date strings to ISO YYYY-MM-DD or flags warning', () => {
      expect(normalizeDate('2000-05-15')).toEqual({ date: '2000-05-15' })
      expect(normalizeDate('15/05/2000')).toEqual({ date: '2000-05-15' })
      expect(normalizeDate('15-05-2000')).toEqual({ date: '2000-05-15' })
      expect(normalizeDate('05/15/2000')).toEqual({ date: '2000-05-15' })
      expect(normalizeDate(null)).toEqual({ date: null })
      expect(normalizeDate('N/A')).toEqual({ date: null })

      const unparsed = normalizeDate('Around 1945')
      expect(unparsed.date).toBe('Around 1945')
      expect(unparsed.warning).toEqual(
        expect.objectContaining({ code: 'UNRECOGNIZED_DATE_FORMAT', severity: 'WARNING' })
      )
    })
  })

  describe('4. Security & Sensitive Field Sanitization', () => {
    it('redacts sensitive fields like passwords, tokens, and keys from raw data', () => {
      const record = {
        first_name: 'Vikram',
        password: 'superSecretPassword123',
        api_token: 'tok_live_abc123',
        auth_jwt: 'eyJhbGciOi...',
        nested: {
          secret_key: 'sk_test_999',
          city: 'Delhi',
        },
      }

      const sanitized = sanitizeSensitiveFields(record)
      expect(sanitized.password).toBe('[REDACTED_CREDENTIAL]')
      expect(sanitized.api_token).toBe('[REDACTED_CREDENTIAL]')
      expect(sanitized.auth_jwt).toBe('[REDACTED_CREDENTIAL]')
      expect((sanitized.nested as Record<string, unknown>).secret_key).toBe('[REDACTED_CREDENTIAL]')
      expect((sanitized.nested as Record<string, unknown>).city).toBe('Delhi')
      expect(sanitized.first_name).toBe('Vikram')
    })
  })

  describe('5. Entity Detection & Mapping', () => {
    it('detects explicit entity_type column', () => {
      expect(detectEntityType({ entity_type: 'FAMILY' })).toBe('FAMILY')
      expect(detectEntityType({ type: 'relationship' })).toBe('RELATIONSHIP')
      expect(detectEntityType({ record_type: 'PERSON' })).toBe('PERSON')
    })

    it('infers entity type from present fields when explicit column absent', () => {
      expect(detectEntityType({ person_a_id: 'P1', person_b_id: 'P2', relationship_type: 'spouse' })).toBe('RELATIONSHIP')
      expect(detectEntityType({ family_name: 'Malhotra Family', city: 'Jaipur' })).toBe('FAMILY')
      expect(detectEntityType({ first_name: 'Aarav', last_name: 'Malhotra' })).toBe('PERSON')
    })

    it('preserves unmapped fields in parsed_data.unmapped_fields with zero data loss', async () => {
      const csv = `first_name,last_name,custom_notes,donor_tier\nRaj,Patel,Founding family,Gold`
      const result = await parseImportFile('census.csv', csv)

      expect(result.records).toHaveLength(1)
      const record = result.records[0]
      expect(record.parsed_data.first_name).toBe('Raj')
      expect(record.parsed_data.last_name).toBe('Patel')
      expect(record.parsed_data.unmapped_fields).toEqual({
        custom_notes: 'Founding family',
        donor_tier: 'Gold',
      })
      // Raw data preserves original values
      expect(record.raw_data).toEqual({
        first_name: 'Raj',
        last_name: 'Patel',
        custom_notes: 'Founding family',
        donor_tier: 'Gold',
      })
    })

    it('flags validation ERROR when PERSON is missing first_name or last_name', async () => {
      const csv = `gender,city\nmale,Delhi`
      const result = await parseImportFile('persons.csv', csv, { defaultEntityType: 'PERSON' })

      expect(result.records).toHaveLength(1)
      expect(result.records[0].validation_status).toBe('ERROR')
      expect(result.records[0].validation_errors).toContainEqual(
        expect.objectContaining({ code: 'MISSING_FIRST_NAME', field: 'first_name' })
      )
      expect(result.records[0].validation_errors).toContainEqual(
        expect.objectContaining({ code: 'MISSING_LAST_NAME', field: 'last_name' })
      )
    })

    it('normalizes source CHILD relationship to canonical PARENT semantics with endpoints reversed', async () => {
      const json = JSON.stringify([
        {
          entity_type: 'RELATIONSHIP',
          person_a_id: 'CHILD_ID',
          person_b_id: 'PARENT_ID',
          relationship_type: 'child',
        },
      ])
      const result = await parseImportFile('relations.json', json)

      expect(result.records).toHaveLength(1)
      expect(result.records[0].validation_status).toBe('PENDING')
      expect(result.records[0].parsed_data.person_a_id).toBe('PARENT_ID')
      expect(result.records[0].parsed_data.person_b_id).toBe('CHILD_ID')
      expect(result.records[0].parsed_data.relationship_type).toBe('PARENT')
    })

    it('flags validation ERROR when FAMILY is missing family_name', async () => {
      const json = JSON.stringify([{ entity_type: 'FAMILY', city: 'Pune' }])
      const result = await parseImportFile('families.json', json)

      expect(result.records).toHaveLength(1)
      expect(result.records[0].validation_status).toBe('ERROR')
      expect(result.records[0].validation_errors).toContainEqual(
        expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD', field: 'family_name' })
      )
    })

    it('flags validation ERROR when RELATIONSHIP is missing required references or type', async () => {
      const json = JSON.stringify([{ entity_type: 'RELATIONSHIP', person_a_id: 'P1' }])
      const result = await parseImportFile('relations.json', json)

      expect(result.records).toHaveLength(1)
      expect(result.records[0].validation_status).toBe('ERROR')
      expect(result.records[0].validation_errors).toContainEqual(
        expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD', field: 'person_b_id' })
      )
      expect(result.records[0].validation_errors).toContainEqual(
        expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD', field: 'relationship_type' })
      )
    })
  })

  describe('6. Lineage & ID Generation', () => {
    it('uses source_record_id when provided in the input', () => {
      const id = resolveSourceRecordId({ person_id: 'CENSUS-2026-001' }, 'PERSON', 1)
      expect(id).toBe('CENSUS-2026-001')
    })

    it('derives deterministic source_record_id when missing (never random)', () => {
      const id1 = resolveSourceRecordId({}, 'PERSON', 5)
      const id2 = resolveSourceRecordId({}, 'PERSON', 5)
      expect(id1).toBe('PERSON_ROW_5')
      expect(id2).toBe('PERSON_ROW_5')
    })

    it('guarantees canonical_id is strictly null on all staged records', async () => {
      const csv = `first_name,last_name\nAarav,Gupta\nSunita,Gupta`
      const result = await parseImportFile('census.csv', csv)

      expect(result.records).toHaveLength(2)
      for (const rec of result.records) {
        expect(rec.canonical_id).toBeNull()
      }
    })
  })

  describe('7. Limits & Constraints', () => {
    it('rejects unsupported file formats', async () => {
      await expect(
        parseImportFile('census.xml', '<census></census>')
      ).rejects.toThrow('UNSUPPORTED_FORMAT: Unsupported file format ".XML"')
    })

    it('rejects oversized files exceeding limit', async () => {
      const bigContent = 'x'.repeat(IMPORT_LIMITS.MAX_FILE_SIZE_BYTES + 10)
      await expect(
        parseImportFile('large.csv', bigContent)
      ).rejects.toThrow('FILE_TOO_LARGE')
    })

    it('computes consistent SHA-256 hash across identical inputs', async () => {
      const content = `first_name,last_name\nTest,User`
      const hash1 = await computeSha256(content)
      const hash2 = await computeSha256(content)
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('8. Subtask 3 Validation Rules Engine (validateDraftRecord)', () => {
    it('validates valid PERSON draft record', () => {
      const res = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 1,
        source_record_id: 'P1',
        parsed_data: {
          first_name: 'Aarav',
          last_name: 'Sharma',
          gender: 'male',
          date_of_birth: '1990-05-15',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })

      expect(res.status).toBe('VALID')
      expect(res.errors).toHaveLength(0)
    })

    it('rejects PERSON draft missing first_name or last_name (both required by canonical schema)', () => {
      const missingFirst = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 2,
        source_record_id: 'P2',
        parsed_data: { last_name: 'Sharma', gender: 'female' },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(missingFirst.status).toBe('ERROR')
      expect(missingFirst.errors.some((e) => e.code === 'MISSING_FIRST_NAME')).toBe(true)

      const missingLast = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 3,
        source_record_id: 'P3',
        parsed_data: { first_name: 'Aarav', gender: 'male' },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(missingLast.status).toBe('ERROR')
      expect(missingLast.errors.some((e) => e.code === 'MISSING_LAST_NAME')).toBe(true)
    })

    it('flags WARNING for malformed is_living without aborting validation', () => {
      const res = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 4,
        source_record_id: 'P4',
        parsed_data: {
          first_name: 'Aarav',
          last_name: 'Sharma',
          is_living: 'not_a_boolean',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(res.status).toBe('WARNING')
      expect(res.errors.some((e) => e.code === 'INVALID_BOOLEAN_VALUE')).toBe(true)
    })

    it('rejects PERSON draft with invalid dates (future DOB or DOD before DOB)', () => {
      const futureRes = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 5,
        source_record_id: 'P5',
        parsed_data: {
          first_name: 'Future',
          last_name: 'Baby',
          date_of_birth: '2099-01-01',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(futureRes.status).toBe('ERROR')
      expect(futureRes.errors.some((e) => e.code === 'DOB_IN_FUTURE')).toBe(true)

      const invertedRes = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 6,
        source_record_id: 'P6',
        parsed_data: {
          first_name: 'Anomalous',
          last_name: 'Dating',
          date_of_birth: '1980-01-01',
          date_of_death: '1970-01-01',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(invertedRes.status).toBe('ERROR')
      expect(invertedRes.errors.some((e) => e.code === 'DEATH_BEFORE_BIRTH')).toBe(true)
    })

    it('accepts person status=ACTIVE and status=DECEASED', () => {
      const activeRes = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 7,
        source_record_id: 'P7_1',
        parsed_data: {
          first_name: 'Aarav',
          last_name: 'Sharma',
          status: 'ACTIVE',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(activeRes.status).toBe('VALID')
      expect(activeRes.errors).toHaveLength(0)

      const deceasedRes = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 7,
        source_record_id: 'P7_2',
        parsed_data: {
          first_name: 'Aarav',
          last_name: 'Sharma',
          status: 'DECEASED',
          is_living: false,
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(deceasedRes.status).toBe('VALID')
      expect(deceasedRes.errors).toHaveLength(0)
    })

    it('maps source status=LIVING to ACTIVE and accepts it', () => {
      const livingRes = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 7,
        source_record_id: 'P7_3',
        parsed_data: {
          first_name: 'Priya',
          last_name: 'Patel',
          status: 'LIVING',
          is_living: true,
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(livingRes.status).toBe('VALID')
      expect(livingRes.errors).toHaveLength(0)
    })

    it('produces a structured row-level WARNING for unsupported status while preserving record', () => {
      const unsupportedRes = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 7,
        source_record_id: 'P7_4',
        parsed_data: {
          first_name: 'Karan',
          last_name: 'Verma',
          status: 'RETIRED',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(unsupportedRes.status).toBe('WARNING')
      expect(unsupportedRes.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_PERSON_STATUS',
          field: 'status',
          severity: 'WARNING',
        })
      )
    })

    it('handles is_living=true, is_living=false, and malformed is_living as non-fatal WARNING', () => {
      const malformedRes = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 7,
        source_record_id: 'P7_5',
        parsed_data: {
          first_name: 'Meera',
          last_name: 'Joshi',
          is_living: 'not_a_boolean',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(malformedRes.status).toBe('WARNING')
      expect(malformedRes.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_BOOLEAN_VALUE',
          field: 'is_living',
          severity: 'WARNING',
        })
      )
    })

    it('flags WARNING for contradiction between is_living and status', () => {
      const contradictionRes = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 7,
        source_record_id: 'P7_6',
        parsed_data: {
          first_name: 'Amit',
          last_name: 'Kumar',
          is_living: true,
          status: 'DECEASED',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(contradictionRes.status).toBe('WARNING')
      expect(contradictionRes.errors).toContainEqual(
        expect.objectContaining({
          code: 'VITAL_STATUS_CONTRADICTION',
          field: 'status',
          severity: 'WARNING',
        })
      )
    })

    it('flags WARNING for vital status contradiction (DOD + living = true or status = ACTIVE/LIVING)', () => {
      const res = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 7,
        source_record_id: 'P7',
        parsed_data: {
          first_name: 'Living',
          last_name: 'Ghost',
          date_of_birth: '1950-01-01',
          date_of_death: '2020-01-01',
          is_living: true,
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })

      expect(res.status).toBe('WARNING')
      expect(res.errors.some((e) => e.code === 'VITAL_STATUS_CONTRADICTION')).toBe(true)

      const activeWithDodRes = validateDraftRecord({
        entity_type: 'PERSON',
        source_row_number: 7,
        source_record_id: 'P7_8',
        parsed_data: {
          first_name: 'Active',
          last_name: 'Ancestor',
          date_of_birth: '1950-01-01',
          date_of_death: '2020-01-01',
          status: 'ACTIVE',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(activeWithDodRes.status).toBe('WARNING')
      expect(activeWithDodRes.errors.some((e) => e.code === 'VITAL_STATUS_CONTRADICTION')).toBe(true)
    })

    it('validates FAMILY draft requirements', () => {
      const validFam = validateDraftRecord({
        entity_type: 'FAMILY',
        source_row_number: 8,
        source_record_id: 'F1',
        parsed_data: {
          family_name: 'Sharma Kutumb',
          city: 'Jaipur',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(validFam.status).toBe('VALID')

      const invalidFam = validateDraftRecord({
        entity_type: 'FAMILY',
        source_row_number: 9,
        source_record_id: 'F2',
        parsed_data: { city: 'Jaipur' },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(invalidFam.status).toBe('ERROR')
      expect(invalidFam.errors.some((e) => e.code === 'MISSING_REQUIRED_FIELD')).toBe(true)
    })

    it('validates RELATIONSHIP draft requirements', () => {
      const validRel = validateDraftRecord({
        entity_type: 'RELATIONSHIP',
        source_row_number: 10,
        source_record_id: 'R1',
        parsed_data: {
          person_a_id: 'P1',
          person_b_id: 'P2',
          relationship_type: 'PARENT',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(validRel.status).toBe('VALID')

      const selfRel = validateDraftRecord({
        entity_type: 'RELATIONSHIP',
        source_row_number: 11,
        source_record_id: 'R2',
        parsed_data: {
          person_a_id: 'P1',
          person_b_id: 'P1',
          relationship_type: 'SPOUSE',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(selfRel.status).toBe('ERROR')
      expect(selfRel.errors.some((e) => e.code === 'SELF_RELATIONSHIP')).toBe(true)

      const childRel = validateDraftRecord({
        entity_type: 'RELATIONSHIP',
        source_row_number: 12,
        source_record_id: 'R3',
        parsed_data: {
          person_a_id: 'P1',
          person_b_id: 'P2',
          relationship_type: 'CHILD',
        },
        raw_data: {},
        validation_status: 'PENDING',
        validation_errors: [],
        canonical_id: null,
      })
      expect(childRel.status).toBe('ERROR')
      expect(childRel.errors.some((e) => e.code === 'INVALID_RELATIONSHIP_TYPE')).toBe(true)
    })
  })
})
