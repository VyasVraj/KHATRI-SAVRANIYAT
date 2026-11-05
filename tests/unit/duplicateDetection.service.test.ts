/**
 * Unit Tests: Duplicate Detection Service (Phase 9 — Subtask 4)
 * (src/features/verification/services/duplicateDetection.service.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  findPersonDuplicateCandidates,
  findFamilyDuplicateCandidates,
  flagDuplicateRecord,
  resolveDuplicateFlag,
  listDuplicateFlags,
} from '@/features/verification/services/duplicateDetection.service'
import { supabase } from '@/lib/supabase'
import type { PersonRow, FamilyRow } from '@/types'

vi.mock('@/lib/supabase', () => {
  const fromMock = vi.fn()
  return {
    supabase: {
      from: fromMock,
      rpc: vi.fn(),
      auth: {
        getUser: vi.fn(),
      },
    },
  }
})

describe('Duplicate Detection Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('findPersonDuplicateCandidates', () => {
    const targetPerson: Partial<PersonRow> = {
      id: '11111111-1111-4111-8111-111111111111',
      first_name: 'Aarav',
      last_name: 'Patel',
      gender: 'MALE',
      date_of_birth: '1990-05-15',
      gotra: 'Kashyap',
      nukh: 'Dhol',
      birth_place: 'Ahmedabad',
      phone: '+919876543210',
    }

    it('excludes target person itself even if identical in pool', () => {
      const pool = [
        { ...targetPerson } as PersonRow,
      ]

      const candidates = findPersonDuplicateCandidates(targetPerson, pool)
      expect(candidates).toHaveLength(0)
    })

    it('identifies STRONG duplicate candidate with identical name and birth date', () => {
      const candidate: PersonRow = {
        id: '22222222-2222-4222-8222-222222222222',
        first_name: 'Aarav',
        last_name: 'Patel',
        gender: 'MALE',
        date_of_birth: '1990-05-15',
        gotra: 'Kashyap',
        nukh: 'Dhol',
        birth_place: 'Ahmedabad',
        phone: '+919876543210',
        status: 'ACTIVE',
      } as PersonRow

      const candidates = findPersonDuplicateCandidates(targetPerson, [candidate])
      expect(candidates).toHaveLength(1)
      expect(candidates[0].confidence).toBe('STRONG')
      expect(candidates[0].score).toBeGreaterThanOrEqual(75)
      expect(candidates[0].matchSignals).toContain('Identical full name')
      expect(candidates[0].matchSignals).toContain('Identical birth date (1990-05-15)')
    })

    it('reduces score and differentiates when gender or birth date conflicts', () => {
      const conflictingCandidate: PersonRow = {
        id: '33333333-3333-4333-8333-333333333333',
        first_name: 'Aarav',
        last_name: 'Patel',
        gender: 'FEMALE',
        date_of_birth: '1970-01-01',
        status: 'ACTIVE',
      } as PersonRow

      const candidates = findPersonDuplicateCandidates(targetPerson, [conflictingCandidate])
      expect(candidates.length === 0 || candidates[0].confidence === 'WEAK').toBe(true)
    })

    it('excludes soft-deleted and archived records from matching', () => {
      const deletedCandidate: PersonRow = {
        id: '44444444-4444-4444-8444-444444444444',
        first_name: 'Aarav',
        last_name: 'Patel',
        deleted_at: '2026-01-01T00:00:00Z',
        status: 'ACTIVE',
      } as PersonRow

      const archivedCandidate: PersonRow = {
        id: '55555555-5555-4555-8555-555555555555',
        first_name: 'Aarav',
        last_name: 'Patel',
        status: 'ARCHIVED',
      } as PersonRow

      const candidates = findPersonDuplicateCandidates(targetPerson, [deletedCandidate, archivedCandidate])
      expect(candidates).toHaveLength(0)
    })
  })

  describe('findFamilyDuplicateCandidates', () => {
    const targetFamily: Partial<FamilyRow> = {
      id: '11111111-1111-4111-8111-111111111111',
      family_name: 'Patel Family',
      gotra: 'Kashyap',
      nukh: 'Dhol',
      city: 'Ahmedabad',
      state: 'Gujarat',
    }

    it('identifies STRONG duplicate candidate with identical name, gotra, and location', () => {
      const candidate: FamilyRow = {
        id: '22222222-2222-4222-8222-222222222222',
        family_name: 'Patel Family',
        gotra: 'Kashyap',
        nukh: 'Dhol',
        city: 'Ahmedabad',
        state: 'Gujarat',
      } as FamilyRow

      const candidates = findFamilyDuplicateCandidates(targetFamily, [candidate])
      expect(candidates).toHaveLength(1)
      expect(candidates[0].confidence).toBe('STRONG')
      expect(candidates[0].score).toBeGreaterThanOrEqual(75)
    })

    it('excludes same family record', () => {
      const candidates = findFamilyDuplicateCandidates(targetFamily, [targetFamily as FamilyRow])
      expect(candidates).toHaveLength(0)
    })
  })

  describe('flagDuplicateRecord', () => {
    it('returns UNAUTHORIZED when caller is not signed in', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      const res = await flagDuplicateRecord({
        entityType: 'PERSON',
        recordAId: '11111111-1111-4111-8111-111111111111',
        recordBId: '22222222-2222-4222-8222-222222222222',
        confidence: 'STRONG',
        matchReasons: ['Same name'],
      })

      expect(res.data).toBeNull()
      expect(res.error?.code).toBe('UNAUTHORIZED')
    })

    it('invokes RPC flag_duplicate_record when authorized', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: 'flag-uuid-123',
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await flagDuplicateRecord({
        entityType: 'PERSON',
        recordAId: '11111111-1111-4111-8111-111111111111',
        recordBId: '22222222-2222-4222-8222-222222222222',
        confidence: 'STRONG',
        matchReasons: ['Same name'],
      })

      expect(res.data).toBe('flag-uuid-123')
      expect(res.error).toBeNull()
      expect(supabase.rpc).toHaveBeenCalledWith('flag_duplicate_record', {
        p_entity_type: 'PERSON',
        p_record_a_id: '11111111-1111-4111-8111-111111111111',
        p_record_b_id: '22222222-2222-4222-8222-222222222222',
        p_confidence: 'STRONG',
        p_match_signals: ['Same name'],
      })
    })
  })

  describe('resolveDuplicateFlag', () => {
    it('invokes RPC resolve_duplicate_flag correctly', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: 'mod-1' } },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>)

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: true,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const res = await resolveDuplicateFlag({
        flagId: 'flag-uuid-123',
        resolution: 'CONFIRMED_DUPLICATE',
        resolutionNotes: 'Verified duplicate census entries.',
      })

      expect(res.data).toBe(true)
      expect(res.error).toBeNull()
      expect(supabase.rpc).toHaveBeenCalledWith('resolve_duplicate_flag', {
        p_flag_id: 'flag-uuid-123',
        p_resolution: 'CONFIRMED_DUPLICATE',
        p_resolution_notes: 'Verified duplicate census entries.',
      })
    })
  })

  describe('listDuplicateFlags', () => {
    it('returns empty array when no flags exist', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((fn) => Promise.resolve(fn({ data: [], error: null }))),
      }
      vi.mocked(supabase.from).mockReturnValue(mockQuery as unknown as ReturnType<typeof supabase.from>)

      const res = await listDuplicateFlags()
      expect(res.data).toEqual([])
      expect(res.error).toBeNull()
    })
  })
})
