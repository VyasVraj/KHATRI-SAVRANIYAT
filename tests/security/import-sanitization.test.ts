/**
 * Security & Provenance Tests: Import Pipeline Sanitization & XSS Mitigation
 *
 * Phase 15 — Subtask 2 Remediation
 *
 * Strict Architectural Invariants Verified:
 * 1. PROVENANCE INTEGRITY: raw_data remains the unmodified, authentic representation
 *    of the uploaded file (excluding redacted credentials). It is NEVER sanitized or mutated.
 * 2. SANITIZED PARSED_DATA: All parsed free-text fields destined for display and canonical
 *    promotion are systematically sanitized against HTML tags, executable scripts, and control characters.
 * 3. MULTILINGUAL & SCRIPT PRESERVATION: Indian and regional scripts (Gujarati, Devanagari,
 *    Sindhi, Urdu, accented Latin) and orthographic ligatures (ZWJ/ZWNJ) are preserved intact.
 * 4. SYSTEMATIC ENTITY COVERAGE: Covers PERSON, FAMILY, and RELATIONSHIP entities across CSV and JSON inputs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseImportFile,
  mapPersonEntity,
  mapFamilyEntity,
  mapRelationshipEntity,
  normalizeFreeText,
  normalizeMultilineFreeText,
} from '@/features/admin/services/importParser.service'
import {
  createImportBatch,
  cancelImportBatch,
  setStagingRecordStatus,
} from '@/features/admin/services/import.service'
import { supabase } from '@/lib/supabase'

describe('Phase 15 Subtask 2: Import Pipeline Sanitization & Provenance Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Normalization & Sanitization Primitives', () => {
    it('normalizeFreeText strips HTML tags and dangerous protocols while trimming whitespace', () => {
      expect(normalizeFreeText('  <b>Rajesh</b> <script>alert(1)</script>  ')).toBe('Rajesh')
      expect(normalizeFreeText('<img src="x" onerror="evil()" />Patel')).toBe('Patel')
      expect(normalizeFreeText('javascript:alert(1)')).toBeNull()
      expect(normalizeFreeText('   ')).toBeNull()
      expect(normalizeFreeText('<script>evil()</script>')).toBeNull()
      expect(normalizeFreeText(null)).toBeNull()
      expect(normalizeFreeText(undefined)).toBeNull()
    })

    it('normalizeMultilineFreeText strips tags while preserving valid newlines and Unicode', () => {
      const input = 'First paragraph with <b>bold</b> text.\n\nSecond paragraph with <script>evil()</script>.\nThird line.'
      const expected = 'First paragraph with bold text.\n\nSecond paragraph with .\nThird line.'
      expect(normalizeMultilineFreeText(input)).toBe(expected)
      expect(normalizeMultilineFreeText('   \n\n   ')).toBeNull()
      expect(normalizeMultilineFreeText(null)).toBeNull()
    })

    it('preserves legitimate multilingual Unicode and ligatures in free-text fields', () => {
      // Gujarati
      expect(normalizeFreeText('પટેલ (અમદાવાદ)')).toBe('પટેલ (અમદાવાદ)')
      // Devanagari / Hindi
      expect(normalizeFreeText('कश्यप गोत्र')).toBe('कश्यप गोत्र')
      // Complex Hindi conjunct with ZWJ / ZWNJ
      expect(normalizeFreeText('विद्या\u200Dलय')).toBe('विद्या\u200Dलय')
      expect(normalizeFreeText('क\u200Cश')).toBe('क\u200Cश')
      // Sindhi / Urdu (Arabic script)
      expect(normalizeFreeText('سنڌي ٻولي')).toBe('سنڌي ٻولي')
      expect(normalizeFreeText('احمد خان')).toBe('احمد خان')
      // Accented Latin
      expect(normalizeFreeText('Zoë René-García')).toBe('Zoë René-García')
    })
  })

  describe('2. Provenance Integrity: raw_data MUST Remain Unmodified', () => {
    it('preserves raw source text with HTML/XSS vectors in raw_data while sanitizing parsed_data for CSV', async () => {
      const maliciousCsv = [
        'first_name,last_name,birth_place,gotra',
        '"Aarav <script>alert(\'xss\')</script>","Sharma <img onerror=evil()>","Surat <b>City</b>","Kashyap <style>body{display:none}</style>"',
      ].join('\n')

      const result = await parseImportFile('census_test.csv', maliciousCsv, {
        defaultEntityType: 'PERSON',
      })

      expect(result.records).toHaveLength(1)
      const record = result.records[0]

      // 1. RAW DATA PROVENANCE: Exactly matches the source input (unmodified)
      expect(record.raw_data['first_name']).toBe("Aarav <script>alert('xss')</script>")
      expect(record.raw_data['last_name']).toBe('Sharma <img onerror=evil()>')
      expect(record.raw_data['birth_place']).toBe('Surat <b>City</b>')
      expect(record.raw_data['gotra']).toBe('Kashyap <style>body{display:none}</style>')

      // 2. PARSED DATA SANITIZATION: All malicious tags and style blocks stripped
      expect(record.parsed_data['first_name']).toBe('Aarav')
      expect(record.parsed_data['last_name']).toBe('Sharma')
      expect(record.parsed_data['birth_place']).toBe('Surat City')
      expect(record.parsed_data['gotra']).toBe('Kashyap')
    })

    it('preserves raw source text with HTML/XSS vectors in raw_data while sanitizing parsed_data for JSON', async () => {
      const jsonRecords = [
        {
          first_name: 'Priya <iframe src="evil.com"></iframe>',
          last_name: 'Patel <!-- comment -->',
          current_address: '123 Main St <marquee>scrolling</marquee>, Apt 4',
          city: 'Vadodara <script>bad()</script>',
          state: 'Gujarat',
          country: 'India',
        },
      ]

      const result = await parseImportFile('census_test.json', JSON.stringify(jsonRecords), {
        defaultEntityType: 'PERSON',
      })

      expect(result.records).toHaveLength(1)
      const record = result.records[0]

      // 1. RAW DATA PROVENANCE: Retains source exactly
      expect(record.raw_data['first_name']).toBe('Priya <iframe src="evil.com"></iframe>')
      expect(record.raw_data['last_name']).toBe('Patel <!-- comment -->')
      expect(record.raw_data['current_address']).toBe('123 Main St <marquee>scrolling</marquee>, Apt 4')
      expect(record.raw_data['city']).toBe('Vadodara <script>bad()</script>')

      // 2. PARSED DATA SANITIZATION: Clean of all markup
      expect(record.parsed_data['first_name']).toBe('Priya')
      expect(record.parsed_data['last_name']).toBe('Patel')
      expect(record.parsed_data['current_address']).toBe('123 Main St scrolling, Apt 4')
      expect(record.parsed_data['city']).toBe('Vadodara')
    })
  })

  describe('3. PERSON Entity Sanitization', () => {
    it('sanitizes all 13 canonical demographic and location free-text fields', () => {
      const raw = {
        first_name: 'Aarav <script>alert(1)</script>',
        middle_name: 'Kumar <b>Jr.</b>',
        last_name: 'Sharma <img src=x onerror=alert(2)>',
        maiden_name: 'Verma <svg onload=alert(3)>',
        birth_place: 'Jaipur <i>Pink City</i>',
        death_place: 'Delhi <a href="javascript:steal()">Hospital</a>',
        gotra: 'Bharadwaj <style>body{color:red}</style>',
        nukh: 'NukhOne <!-- comment -->',
        kul: 'KulTwo <blink>test</blink>',
        current_address: '42 MG Road, <object data="evil.swf"></object>Suite 5',
        city: 'Mumbai <embed src="evil.swf">',
        state: 'Maharashtra',
        country: 'India',
        // Non-free-text fields must NOT be mangled
        gender: 'male',
        date_of_birth: '1985-05-15',
        date_of_death: '2020-01-01',
        is_living: 'false',
        email: 'aarav@example.com',
        phone: '+91-9876543210',
        postal_code: '400001',
      }

      const { parsedData, errors } = mapPersonEntity(raw)

      expect(errors).toHaveLength(0)
      expect(parsedData['first_name']).toBe('Aarav')
      expect(parsedData['middle_name']).toBe('Kumar Jr.')
      expect(parsedData['last_name']).toBe('Sharma')
      expect(parsedData['maiden_name']).toBe('Verma')
      expect(parsedData['birth_place']).toBe('Jaipur Pink City')
      expect(parsedData['death_place']).toBe('Delhi Hospital')
      expect(parsedData['gotra']).toBe('Bharadwaj')
      expect(parsedData['nukh']).toBe('NukhOne')
      expect(parsedData['kul']).toBe('KulTwo test')
      expect(parsedData['current_address']).toBe('42 MG Road, Suite 5')
      expect(parsedData['city']).toBe('Mumbai')
      expect(parsedData['state']).toBe('Maharashtra')
      expect(parsedData['country']).toBe('India')

      // Non-free text preserved
      expect(parsedData['gender']).toBe('male')
      expect(parsedData['date_of_birth']).toBe('1985-05-15')
      expect(parsedData['date_of_death']).toBe('2020-01-01')
      expect(parsedData['is_living']).toBe(false)
      expect(parsedData['email']).toBe('aarav@example.com')
      expect(parsedData['phone']).toBe('+91-9876543210')
      expect(parsedData['postal_code']).toBe('400001')
    })

    it('flags error if first_name or last_name consists solely of stripped HTML tags', () => {
      const raw = {
        first_name: '<script>alert(1)</script>',
        last_name: '<img src=x onerror=bad()>',
      }

      const { parsedData, errors } = mapPersonEntity(raw)

      expect(parsedData['first_name']).toBeNull()
      expect(parsedData['last_name']).toBeNull()
      expect(errors.some((e) => e.code === 'MISSING_FIRST_NAME')).toBe(true)
      expect(errors.some((e) => e.code === 'MISSING_LAST_NAME')).toBe(true)
    })
  })

  describe('4. FAMILY Entity Sanitization', () => {
    it('sanitizes family free-text fields and multiline description', () => {
      const raw = {
        family_name: 'The Sharma Family <script>alert("family")</script>',
        head_id: '11111111-2222-3333-4444-555555555555',
        head_name: 'Aarav Sharma <img onerror=evil()>',
        city: 'Jaipur <b>Fort</b>',
        state: 'Rajasthan',
        country: 'India',
        postal_code: '302001',
        description: 'Ancestral roots in Jaipur.\nEstablished in 1920 with <script>evil()</script>honor.\nProminent community members.',
        gotra: 'Kashyap <style>x</style>',
        nukh: 'NukhAlpha',
        kul: 'KulBeta',
      }

      const { parsedData, errors } = mapFamilyEntity(raw)

      expect(errors).toHaveLength(0)
      expect(parsedData['family_name']).toBe('The Sharma Family')
      expect(parsedData['head_id']).toBe('11111111-2222-3333-4444-555555555555')
      expect(parsedData['head_name']).toBe('Aarav Sharma')
      expect(parsedData['city']).toBe('Jaipur Fort')
      expect(parsedData['state']).toBe('Rajasthan')
      expect(parsedData['country']).toBe('India')
      expect(parsedData['postal_code']).toBe('302001')
      expect(parsedData['description']).toBe(
        'Ancestral roots in Jaipur.\nEstablished in 1920 with honor.\nProminent community members.'
      )
      expect(parsedData['gotra']).toBe('Kashyap')
      expect(parsedData['nukh']).toBe('NukhAlpha')
      expect(parsedData['kul']).toBe('KulBeta')
    })

    it('flags error if family_name consists solely of stripped HTML tags', () => {
      const raw = {
        family_name: '<script>alert(1)</script>',
      }

      const { parsedData, errors } = mapFamilyEntity(raw)

      expect(parsedData['family_name']).toBeNull()
      expect(errors.some((e) => e.code === 'MISSING_REQUIRED_FIELD' && e.field === 'family_name')).toBe(true)
    })
  })

  describe('5. RELATIONSHIP Entity Sanitization', () => {
    it('sanitizes relationship notes while preserving linebreaks and identifiers', () => {
      const raw = {
        person_a_id: 'P1',
        person_b_id: 'P2',
        relationship_type: 'PARENT',
        notes: 'Biological parent relationship confirmed by elder records.<script>bad()</script>\nLine 2: verified.',
      }

      const { parsedData, errors } = mapRelationshipEntity(raw)

      expect(errors).toHaveLength(0)
      expect(parsedData['person_a_id']).toBe('P1')
      expect(parsedData['person_b_id']).toBe('P2')
      expect(parsedData['relationship_type']).toBe('PARENT')
      expect(parsedData['notes']).toBe(
        'Biological parent relationship confirmed by elder records.\nLine 2: verified.'
      )
    })
  })

  describe('6. Import Service RPC Arguments Sanitization', () => {
    it('sanitizes batch notes in createImportBatch RPC argument', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: '11111111-2222-3333-4444-555555555555',
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await createImportBatch({
        fileName: 'census.csv',
        fileFormat: 'CSV',
        fileHash: 'a'.repeat(64),
        notes: 'Batch uploaded for 2026 census.<script>alert("batch")</script>\nVerified by admin.',
      })

      expect(supabase.rpc).toHaveBeenCalledWith(
        'create_import_batch',
        expect.objectContaining({
          p_notes: 'Batch uploaded for 2026 census.\nVerified by admin.',
        })
      )
    })

    it('sanitizes cancellation reason in cancelImportBatch RPC argument', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: true,
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await cancelImportBatch({
        batchId: '22222222-3333-4444-5555-666666666666',
        reason: 'Duplicate upload detected. <img src=x onerror=evil()>',
      })

      expect(supabase.rpc).toHaveBeenCalledWith(
        'cancel_import_batch',
        expect.objectContaining({
          p_reason: 'Duplicate upload detected.',
        })
      )
    })

    it('sanitizes review notes in setStagingRecordStatus RPC argument', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          record_id: '33333333-4444-5555-6666-777777777777',
          batch_id: 'batch-1',
          status: 'VALID',
        },
        error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      await setStagingRecordStatus({
        recordId: '33333333-4444-5555-6666-777777777777',
        status: 'VALID',
        notes: 'Manually verified via community elder phone interview.<script>alert(1)</script>',
      })

      expect(supabase.rpc).toHaveBeenCalledWith(
        'set_staging_record_status',
        expect.objectContaining({
          p_notes: 'Manually verified via community elder phone interview.',
        })
      )
    })
  })
})
