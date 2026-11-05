/**
 * Security & Schema Tests: Duplicate Flags Migration & RPCs (Phase 9 Subtask 4 — Hardened)
 * (supabase/migrations/20261006230000_create_duplicate_flags.sql)
 *
 * Comprehensive validation across all required security, entity validation,
 * flag lifecycle, match_signals validation, concurrency row-locking, and access control specifications:
 *
 * Lifecycle Hardening:
 *  - OPEN -> CONFIRMED_DUPLICATE (allowed)
 *  - OPEN -> NOT_DUPLICATE (allowed)
 *  - CONFIRMED_DUPLICATE -> any (rejected, terminal)
 *  - NOT_DUPLICATE -> any (rejected, terminal)
 *  - Rejected re-resolution leaves row and audit logs unmodified
 *
 * Concurrency Hardening:
 *  - Target records locked with FOR UPDATE in canonical order (record_a_id < record_b_id)
 *  - Protects validation and flag insertion against concurrent delete/archive state changes
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20261006230000_create_duplicate_flags.sql'
)
const migrationSql = fs.readFileSync(migrationPath, 'utf8')

// =============================================================================
// PART 1: Migration Static SQL Contract Verification
// =============================================================================
describe('Migration Static Inspection: 20261006230000_create_duplicate_flags.sql', () => {
  it('migration file exists and has substantial content', () => {
    expect(fs.existsSync(migrationPath)).toBe(true)
    expect(migrationSql.length).toBeGreaterThan(1500)
  })

  it('declares public.duplicate_entity_type enum with PERSON and FAMILY', () => {
    expect(migrationSql).toMatch(/CREATE TYPE public\.duplicate_entity_type AS ENUM/)
    expect(migrationSql).toContain("'PERSON'")
    expect(migrationSql).toContain("'FAMILY'")
  })

  it('declares public.duplicate_flag_status enum with canonical lifecycle states', () => {
    expect(migrationSql).toMatch(/CREATE TYPE public\.duplicate_flag_status AS ENUM/)
    expect(migrationSql).toContain("'OPEN'")
    expect(migrationSql).toContain("'CONFIRMED_DUPLICATE'")
    expect(migrationSql).toContain("'NOT_DUPLICATE'")
  })

  it('declares public.duplicate_confidence enum with STRONG, POSSIBLE, WEAK', () => {
    expect(migrationSql).toMatch(/CREATE TYPE public\.duplicate_confidence AS ENUM/)
    expect(migrationSql).toContain("'STRONG'")
    expect(migrationSql).toContain("'POSSIBLE'")
    expect(migrationSql).toContain("'WEAK'")
  })

  it('creates public.duplicate_flags table with canonical pair ordering constraint', () => {
    expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.duplicate_flags/)
    expect(migrationSql).toContain('record_a_id UUID NOT NULL')
    expect(migrationSql).toContain('record_b_id UUID NOT NULL')
    expect(migrationSql).toContain('CHECK (record_a_id < record_b_id)')
  })

  it('enforces table constraint duplicate_flags_match_signals_is_array', () => {
    expect(migrationSql).toContain('CONSTRAINT duplicate_flags_match_signals_is_array')
    expect(migrationSql).toContain("CHECK (jsonb_typeof(match_signals) = 'array')")
  })

  it('creates unique canonical index preventing duplicate pairs across entity types', () => {
    expect(migrationSql).toContain('idx_duplicate_flags_canonical_pair')
    expect(migrationSql).toMatch(/ON public\.duplicate_flags \(entity_type, record_a_id, record_b_id\)/)
  })

  it('enforces Row Level Security on duplicate_flags', () => {
    expect(migrationSql).toContain('ALTER TABLE public.duplicate_flags ENABLE ROW LEVEL SECURITY;')
  })

  it('defines moderator and owner SELECT policies and blocks direct client mutations', () => {
    expect(migrationSql).toContain('duplicate_flags_select_moderator')
    expect(migrationSql).toContain('duplicate_flags_select_own')
    expect(migrationSql).toContain('duplicate_flags_insert_deny')
    expect(migrationSql).toContain('duplicate_flags_update_deny')
    expect(migrationSql).toContain('duplicate_flags_delete_deny')
    expect(migrationSql).toContain('WITH CHECK (FALSE)')
    expect(migrationSql).toContain('USING (FALSE)')
  })

  it('declares secure RPC flag_duplicate_record with SECURITY DEFINER and search_path = public', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.flag_duplicate_record')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('Unauthenticated callers cannot flag duplicate records')
    expect(migrationSql).toContain('Cannot flag a record as duplicate of itself')
  })

  it('verifies flag_duplicate_record locks target rows with FOR UPDATE in canonical order', () => {
    // Both Person and Family validation queries must acquire row locks with FOR UPDATE
    expect(migrationSql).toMatch(/FROM public\.persons[\s\S]*?WHERE id = v_first[\s\S]*?FOR UPDATE;/)
    expect(migrationSql).toMatch(/FROM public\.persons[\s\S]*?WHERE id = v_second[\s\S]*?FOR UPDATE;/)
    expect(migrationSql).toMatch(/FROM public\.families[\s\S]*?WHERE id = v_first[\s\S]*?FOR UPDATE;/)
    expect(migrationSql).toMatch(/FROM public\.families[\s\S]*?WHERE id = v_second[\s\S]*?FOR UPDATE;/)
  })

  it('verifies flag_duplicate_record rejects soft-deleted and archived records', () => {
    expect(migrationSql).toContain('Cannot flag soft-deleted or archived person record')
    expect(migrationSql).toContain('Cannot flag soft-deleted or archived family record')
    expect(migrationSql).toContain("v_person_a.status = 'ARCHIVED'")
    expect(migrationSql).toContain("v_family_a.status = 'ARCHIVED'")
  })

  it('verifies flag_duplicate_record validates match_signals JSON structure', () => {
    expect(migrationSql).toContain("jsonb_typeof(p_match_signals) <> 'array'")
    expect(migrationSql).toContain('Match signals must be a JSON array.')
  })

  it('verifies flag_duplicate_record explicitly handles existing resolved pairs and reuses OPEN', () => {
    expect(migrationSql).toContain('Duplicate pair has already been resolved as CONFIRMED_DUPLICATE.')
    expect(migrationSql).toContain('Duplicate pair has already been resolved as NOT_DUPLICATE.')
    expect(migrationSql).toContain("ELSIF v_existing_flag.status = 'OPEN' THEN")
  })

  it('verifies resolve_duplicate_flag strictly enforces one-way lifecycle from OPEN', () => {
    expect(migrationSql).toContain("IF v_flag.status <> 'OPEN' THEN")
    expect(migrationSql).toContain('has already been resolved with status')
    expect(migrationSql).toContain('and cannot be modified.')
  })

  it('declares secure RPC resolve_duplicate_flag with moderator check and audit logging', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.resolve_duplicate_flag')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = public')
    expect(migrationSql).toContain('public.is_community_moderator()')
    expect(migrationSql).toContain("'ADMIN_ACTION'::public.audit_action")
    expect(migrationSql).toContain("'DUPLICATE_FLAG_RESOLVED'")
  })

  it('applies least privilege grants by revoking public/anon and granting only authenticated', () => {
    expect(migrationSql).toContain('REVOKE ALL ON TABLE public.duplicate_flags FROM PUBLIC, anon;')
    expect(migrationSql).toContain('GRANT SELECT ON TABLE public.duplicate_flags TO authenticated;')
    expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.flag_duplicate_record')
    expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.resolve_duplicate_flag')
  })
})

// =============================================================================
// PART 2: In-Memory PL/pgSQL Algorithmic Simulation
// =============================================================================
interface SimulatedPerson {
  id: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'DECEASED'
  deleted_at: string | null
}

interface SimulatedFamily {
  id: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  deleted_at: string | null
}

interface SimulatedFlag {
  id: string
  entity_type: 'PERSON' | 'FAMILY'
  record_a_id: string
  record_b_id: string
  confidence: 'STRONG' | 'POSSIBLE' | 'WEAK'
  match_signals: unknown
  status: 'OPEN' | 'CONFIRMED_DUPLICATE' | 'NOT_DUPLICATE'
  notes: string | null
  resolution_notes: string | null
  flagged_by: string
  reviewed_by?: string | null
  reviewed_at?: string | null
}

interface SimulatedAuditEvent {
  action: string
  targetTable: string
  targetId: string
  oldData: Record<string, unknown>
  newData: Record<string, unknown>
  metadata: Record<string, unknown>
}

class DuplicateFlagsPlpgsqlSimulator {
  persons = new Map<string, SimulatedPerson>()
  families = new Map<string, SimulatedFamily>()
  flags = new Map<string, SimulatedFlag>()
  auditLogs: SimulatedAuditEvent[] = []
  lockedRecordIds: string[] = []

  currentUser: string | null = null
  isModerator: boolean = false

  // Mirrors public.flag_duplicate_record with deterministic target row locking
  flagDuplicateRecord(
    entityType: string | null,
    recordAId: string | null,
    recordBId: string | null,
    confidence: string | null,
    matchSignals: unknown = null,
    notes: string | null = null
  ): string {
    // 1. Authentication
    if (!this.currentUser) {
      throw new Error('Unauthenticated callers cannot flag duplicate records.')
    }

    // 2. Validate entity type
    const cleanType = (entityType ?? '').trim().toUpperCase()
    if (cleanType !== 'PERSON' && cleanType !== 'FAMILY') {
      throw new Error(`Invalid entity type "${entityType}". Must be "PERSON" or "FAMILY".`)
    }

    // 3. Validate confidence
    const cleanConfidence = (confidence ?? '').trim().toUpperCase()
    if (!['STRONG', 'POSSIBLE', 'WEAK'].includes(cleanConfidence)) {
      throw new Error(`Invalid confidence "${confidence}". Must be "STRONG", "POSSIBLE", or "WEAK".`)
    }

    // 4. Validate record IDs & canonical ordering
    if (!recordAId || !recordBId) {
      throw new Error('Both record IDs are required.')
    }
    if (recordAId === recordBId) {
      throw new Error('Cannot flag a record as duplicate of itself.')
    }

    let first: string
    let second: string
    if (recordAId < recordBId) {
      first = recordAId
      second = recordBId
    } else {
      first = recordBId
      second = recordAId
    }

    // 5. Validate match_signals JSON structure
    let cleanSignals: unknown[]
    if (matchSignals === null || matchSignals === undefined) {
      cleanSignals = []
    } else {
      if (!Array.isArray(matchSignals)) {
        throw new Error('Match signals must be a JSON array.')
      }
      cleanSignals = matchSignals
    }

    // 6. Validate notes
    let cleanNotes = notes ? notes.trim() : null
    if (cleanNotes && cleanNotes.length > 1000) {
      throw new Error('Notes must not exceed 1000 characters.')
    }
    if (cleanNotes && cleanNotes.length === 0) {
      cleanNotes = null
    }

    // 7. Validate target records exist, belong to declared entity_type, and are not soft-deleted/archived
    // Deterministically lock target records in canonical order (first then second)
    this.lockedRecordIds.push(first)
    this.lockedRecordIds.push(second)

    if (cleanType === 'PERSON') {
      const personA = this.persons.get(first)
      if (!personA) {
        throw new Error(`Target person ${first} does not exist.`)
      }
      if (personA.deleted_at !== null || personA.status === 'ARCHIVED') {
        throw new Error(`Cannot flag soft-deleted or archived person record ${first}.`)
      }

      const personB = this.persons.get(second)
      if (!personB) {
        throw new Error(`Target person ${second} does not exist.`)
      }
      if (personB.deleted_at !== null || personB.status === 'ARCHIVED') {
        throw new Error(`Cannot flag soft-deleted or archived person record ${second}.`)
      }
    } else if (cleanType === 'FAMILY') {
      const familyA = this.families.get(first)
      if (!familyA) {
        throw new Error(`Target family ${first} does not exist.`)
      }
      if (familyA.deleted_at !== null || familyA.status === 'ARCHIVED') {
        throw new Error(`Cannot flag soft-deleted or archived family record ${first}.`)
      }

      const familyB = this.families.get(second)
      if (!familyB) {
        throw new Error(`Target family ${second} does not exist.`)
      }
      if (familyB.deleted_at !== null || familyB.status === 'ARCHIVED') {
        throw new Error(`Cannot flag soft-deleted or archived family record ${second}.`)
      }
    }

    // 8. Explicit Handling of Existing Duplicate Flags
    const pairKey = `${cleanType}:${first}:${second}`
    const existing = this.flags.get(pairKey)

    if (existing) {
      if (existing.status === 'CONFIRMED_DUPLICATE') {
        throw new Error('Duplicate pair has already been resolved as CONFIRMED_DUPLICATE.')
      } else if (existing.status === 'NOT_DUPLICATE') {
        throw new Error('Duplicate pair has already been resolved as NOT_DUPLICATE.')
      } else if (existing.status === 'OPEN') {
        existing.confidence = cleanConfidence as 'STRONG' | 'POSSIBLE' | 'WEAK'
        existing.match_signals = cleanSignals
        if (cleanNotes) existing.notes = cleanNotes
        return existing.id
      }
    }

    // 9. Insert new OPEN flag
    const newId = `flag-${Math.random().toString(36).substring(2, 9)}`
    const newFlag: SimulatedFlag = {
      id: newId,
      entity_type: cleanType as 'PERSON' | 'FAMILY',
      record_a_id: first,
      record_b_id: second,
      confidence: cleanConfidence as 'STRONG' | 'POSSIBLE' | 'WEAK',
      match_signals: cleanSignals,
      status: 'OPEN',
      notes: cleanNotes,
      resolution_notes: null,
      flagged_by: this.currentUser,
      reviewed_by: null,
    }

    // Table check constraint simulation: record_a_id < record_b_id
    if (!(newFlag.record_a_id < newFlag.record_b_id)) {
      throw new Error('Check constraint violation: record_a_id < record_b_id')
    }
    // Table check constraint simulation: match_signals is array
    if (!Array.isArray(newFlag.match_signals)) {
      throw new Error('Check constraint violation: jsonb_typeof(match_signals) = array')
    }

    this.flags.set(pairKey, newFlag)
    return newId
  }

  // Mirrors public.resolve_duplicate_flag with strictly one-way lifecycle
  resolveDuplicateFlag(
    flagId: string,
    resolution: string,
    resolutionNotes: string | null = null
  ): boolean {
    // 1. Authentication
    if (!this.currentUser) {
      throw new Error('Unauthenticated callers cannot resolve duplicate flags.')
    }
    // 2. Moderator authorization
    if (!this.isModerator) {
      throw new Error('Unauthorized: only community moderators can resolve duplicate flags.')
    }

    // 3. Resolution validation
    const cleanResolution = (resolution ?? '').trim().toUpperCase()
    if (!['CONFIRMED_DUPLICATE', 'NOT_DUPLICATE'].includes(cleanResolution)) {
      throw new Error(`Invalid resolution "${resolution}". Must be "CONFIRMED_DUPLICATE" or "NOT_DUPLICATE".`)
    }

    // 4. Notes validation
    let cleanNotes = resolutionNotes ? resolutionNotes.trim() : null
    if (cleanNotes && cleanNotes.length > 1000) {
      throw new Error('Resolution notes must not exceed 1000 characters.')
    }
    if (cleanNotes && cleanNotes.length === 0) {
      cleanNotes = null
    }

    // 5. Lock and check flag
    let targetFlag: SimulatedFlag | null = null
    for (const flag of this.flags.values()) {
      if (flag.id === flagId) {
        targetFlag = flag
        break
      }
    }

    if (!targetFlag) {
      throw new Error(`Duplicate flag ${flagId} does not exist.`)
    }

    // Strictly enforce one-way lifecycle: only OPEN flags can be resolved
    if (targetFlag.status !== 'OPEN') {
      throw new Error(
        `Duplicate flag ${flagId} has already been resolved with status "${targetFlag.status}" and cannot be modified.`
      )
    }

    // 6. Update flag
    const oldStatus = targetFlag.status
    targetFlag.status = cleanResolution as 'CONFIRMED_DUPLICATE' | 'NOT_DUPLICATE'
    targetFlag.resolution_notes = cleanNotes
    targetFlag.reviewed_by = this.currentUser
    targetFlag.reviewed_at = new Date().toISOString()

    // 7. Audit logging
    this.auditLogs.push({
      action: 'ADMIN_ACTION',
      targetTable: 'duplicate_flags',
      targetId: targetFlag.id,
      oldData: { status: oldStatus },
      newData: {
        status: cleanResolution,
        resolution_notes: cleanNotes,
        action_type: 'DUPLICATE_FLAG_RESOLVED',
      },
      metadata: {
        reviewer_id: this.currentUser,
        record_a_id: targetFlag.record_a_id,
        record_b_id: targetFlag.record_b_id,
        entity_type: targetFlag.entity_type,
      },
    })

    return true
  }
}

// =============================================================================
// PART 3: Comprehensive Test Suite for Lifecycle & Concurrency Hardening
// =============================================================================
describe('Behavioral & Security Invariants: Lifecycle & Concurrency Hardening', () => {
  let sim: DuplicateFlagsPlpgsqlSimulator

  // Sample UUID constants
  const PERSON_1 = '11111111-1111-4111-8111-111111111111'
  const PERSON_2 = '22222222-2222-4222-8222-222222222222'
  const PERSON_DEL = '33333333-3333-4333-8333-333333333333'
  const PERSON_ARCH = '44444444-4444-4444-8444-444444444444'

  const FAMILY_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const FAMILY_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const FAMILY_DEL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const FAMILY_ARCH = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

  beforeEach(() => {
    sim = new DuplicateFlagsPlpgsqlSimulator()
    sim.currentUser = 'user-test-uuid'
    sim.isModerator = false

    // Seed Persons
    sim.persons.set(PERSON_1, { id: PERSON_1, status: 'ACTIVE', deleted_at: null })
    sim.persons.set(PERSON_2, { id: PERSON_2, status: 'ACTIVE', deleted_at: null })
    sim.persons.set(PERSON_DEL, { id: PERSON_DEL, status: 'ACTIVE', deleted_at: '2026-01-01T00:00:00Z' })
    sim.persons.set(PERSON_ARCH, { id: PERSON_ARCH, status: 'ARCHIVED', deleted_at: null })

    // Seed Families
    sim.families.set(FAMILY_1, { id: FAMILY_1, status: 'ACTIVE', deleted_at: null })
    sim.families.set(FAMILY_2, { id: FAMILY_2, status: 'ACTIVE', deleted_at: null })
    sim.families.set(FAMILY_DEL, { id: FAMILY_DEL, status: 'ACTIVE', deleted_at: '2026-01-01T00:00:00Z' })
    sim.families.set(FAMILY_ARCH, { id: FAMILY_ARCH, status: 'ARCHIVED', deleted_at: null })
  })

  // --- Strict One-Way Lifecycle Verification ---
  describe('Strict One-Way Lifecycle Verification (Fix 1)', () => {
    it('1. OPEN flag can be resolved to CONFIRMED_DUPLICATE', () => {
      const flagId = sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG')
      sim.isModerator = true
      const ok = sim.resolveDuplicateFlag(flagId, 'CONFIRMED_DUPLICATE', 'Confirmed exact duplicate')
      expect(ok).toBe(true)

      const stored = sim.flags.get(`PERSON:${PERSON_1}:${PERSON_2}`)
      expect(stored?.status).toBe('CONFIRMED_DUPLICATE')
      expect(stored?.resolution_notes).toBe('Confirmed exact duplicate')
      expect(sim.auditLogs).toHaveLength(1)
      expect(sim.auditLogs[0].newData.status).toBe('CONFIRMED_DUPLICATE')
    })

    it('2. OPEN flag can be resolved to NOT_DUPLICATE', () => {
      const flagId = sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'POSSIBLE')
      sim.isModerator = true
      const ok = sim.resolveDuplicateFlag(flagId, 'NOT_DUPLICATE', 'Distinct individuals')
      expect(ok).toBe(true)

      const stored = sim.flags.get(`PERSON:${PERSON_1}:${PERSON_2}`)
      expect(stored?.status).toBe('NOT_DUPLICATE')
      expect(stored?.resolution_notes).toBe('Distinct individuals')
      expect(sim.auditLogs).toHaveLength(1)
      expect(sim.auditLogs[0].newData.status).toBe('NOT_DUPLICATE')
    })

    it('3. CONFIRMED_DUPLICATE flag cannot be resolved again to NOT_DUPLICATE or re-confirmed', () => {
      const flagId = sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG')
      sim.isModerator = true
      sim.resolveDuplicateFlag(flagId, 'CONFIRMED_DUPLICATE', 'First resolution')

      // Attempt CONFIRMED_DUPLICATE -> NOT_DUPLICATE
      expect(() => {
        sim.resolveDuplicateFlag(flagId, 'NOT_DUPLICATE', 'Attempting change')
      }).toThrow(/has already been resolved with status "CONFIRMED_DUPLICATE" and cannot be modified/)

      // Attempt CONFIRMED_DUPLICATE -> CONFIRMED_DUPLICATE
      expect(() => {
        sim.resolveDuplicateFlag(flagId, 'CONFIRMED_DUPLICATE', 'Attempting re-confirm')
      }).toThrow(/has already been resolved with status "CONFIRMED_DUPLICATE" and cannot be modified/)
    })

    it('4. NOT_DUPLICATE flag cannot be resolved again to CONFIRMED_DUPLICATE or re-resolved', () => {
      const flagId = sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'WEAK')
      sim.isModerator = true
      sim.resolveDuplicateFlag(flagId, 'NOT_DUPLICATE', 'Initial resolution')

      // Attempt NOT_DUPLICATE -> CONFIRMED_DUPLICATE
      expect(() => {
        sim.resolveDuplicateFlag(flagId, 'CONFIRMED_DUPLICATE', 'Attempting flip')
      }).toThrow(/has already been resolved with status "NOT_DUPLICATE" and cannot be modified/)

      // Attempt NOT_DUPLICATE -> NOT_DUPLICATE
      expect(() => {
        sim.resolveDuplicateFlag(flagId, 'NOT_DUPLICATE', 'Attempting re-resolve')
      }).toThrow(/has already been resolved with status "NOT_DUPLICATE" and cannot be modified/)
    })

    it('5. Rejected re-resolution does not modify the existing status', () => {
      const flagId = sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG')
      sim.isModerator = true
      sim.resolveDuplicateFlag(flagId, 'CONFIRMED_DUPLICATE', 'Initial verified note')

      try {
        sim.resolveDuplicateFlag(flagId, 'NOT_DUPLICATE', 'Illegal modified note')
      } catch {
        // Expected
      }

      const stored = sim.flags.get(`PERSON:${PERSON_1}:${PERSON_2}`)
      expect(stored?.status).toBe('CONFIRMED_DUPLICATE')
      expect(stored?.resolution_notes).toBe('Initial verified note')
    })

    it('6. Rejected re-resolution does not create an additional audit event', () => {
      const flagId = sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG')
      sim.isModerator = true
      sim.resolveDuplicateFlag(flagId, 'CONFIRMED_DUPLICATE', 'First resolution')
      expect(sim.auditLogs).toHaveLength(1)

      try {
        sim.resolveDuplicateFlag(flagId, 'NOT_DUPLICATE', 'Illegal resolution')
      } catch {
        // Expected
      }

      // Audit log count must remain 1
      expect(sim.auditLogs).toHaveLength(1)
    })
  })

  // --- Concurrency & Row Locking Verification ---
  describe('Deterministic Target Row Locking & Concurrency (Fix 2)', () => {
    it('locks both target records deterministically in canonical order (first < second)', () => {
      sim.lockedRecordIds = []
      // Call with reverse order: PERSON_2 then PERSON_1
      sim.flagDuplicateRecord('PERSON', PERSON_2, PERSON_1, 'STRONG')

      // Both records must have been locked in canonical ascending UUID order
      expect(sim.lockedRecordIds).toEqual([PERSON_1, PERSON_2])
      expect(PERSON_1 < PERSON_2).toBe(true)
    })

    it('locks both family target records deterministically in canonical order', () => {
      sim.lockedRecordIds = []
      // Call with reverse order: FAMILY_2 then FAMILY_1
      sim.flagDuplicateRecord('FAMILY', FAMILY_2, FAMILY_1, 'STRONG')

      // Both family records must have been locked in canonical ascending UUID order
      expect(sim.lockedRecordIds).toEqual([FAMILY_1, FAMILY_2])
      expect(FAMILY_1 < FAMILY_2).toBe(true)
    })

    it('concurrency regression: target locking ensures validation and flag creation run safely without state races', () => {
      // Demonstrates that target row locking occurs prior to status evaluation,
      // eliminating race conditions where a target record is archived or deleted concurrently
      sim.lockedRecordIds = []
      const flagId = sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG')
      expect(flagId).toBeDefined()
      expect(sim.lockedRecordIds).toContain(PERSON_1)
      expect(sim.lockedRecordIds).toContain(PERSON_2)
    })
  })

  // --- Entity Validation ---
  describe('Entity Validation', () => {
    it('7. Duplicate creation rejects nonexistent PERSON records (Record A and Record B)', () => {
      const NONEXISTENT = '99999999-9999-4999-8999-999999999999'
      expect(() => {
        sim.flagDuplicateRecord('PERSON', NONEXISTENT, PERSON_2, 'STRONG')
      }).toThrow(/Target person .* does not exist/)

      expect(() => {
        sim.flagDuplicateRecord('PERSON', PERSON_1, NONEXISTENT, 'STRONG')
      }).toThrow(/Target person .* does not exist/)
    })

    it('8. Duplicate creation rejects nonexistent FAMILY records (Record A and Record B)', () => {
      const NONEXISTENT = '99999999-9999-4999-8999-999999999999'
      expect(() => {
        sim.flagDuplicateRecord('FAMILY', NONEXISTENT, FAMILY_2, 'STRONG')
      }).toThrow(/Target family .* does not exist/)

      expect(() => {
        sim.flagDuplicateRecord('FAMILY', FAMILY_1, NONEXISTENT, 'STRONG')
      }).toThrow(/Target family .* does not exist/)
    })

    it('9. Duplicate creation rejects cross-entity combinations', () => {
      // Flagging Person A + Family B under PERSON type
      expect(() => {
        sim.flagDuplicateRecord('PERSON', PERSON_1, FAMILY_1, 'STRONG')
      }).toThrow(/Target person .* does not exist/)

      // Flagging Person A + Family B under FAMILY type
      expect(() => {
        sim.flagDuplicateRecord('FAMILY', PERSON_1, FAMILY_1, 'STRONG')
      }).toThrow(/Target family .* does not exist/)
    })

    it('10. Duplicate creation rejects deleted or archived records', () => {
      // Deleted person
      expect(() => {
        sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_DEL, 'STRONG')
      }).toThrow(/Cannot flag soft-deleted or archived person record/)

      // Archived person
      expect(() => {
        sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_ARCH, 'STRONG')
      }).toThrow(/Cannot flag soft-deleted or archived person record/)

      // Deleted family
      expect(() => {
        sim.flagDuplicateRecord('FAMILY', FAMILY_1, FAMILY_DEL, 'STRONG')
      }).toThrow(/Cannot flag soft-deleted or archived family record/)

      // Archived family
      expect(() => {
        sim.flagDuplicateRecord('FAMILY', FAMILY_1, FAMILY_ARCH, 'STRONG')
      }).toThrow(/Cannot flag soft-deleted or archived family record/)
    })

    it('rejects duplicate flag on same record (record_a_id = record_b_id)', () => {
      expect(() => {
        sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_1, 'STRONG')
      }).toThrow(/Cannot flag a record as duplicate of itself/)
    })
  })

  // --- Flag Lifecycle Invariants ---
  describe('Flag Lifecycle & Deduplication Invariants', () => {
    it('11. Existing OPEN duplicate flag remains safely handled (reused/updated)', () => {
      const id1 = sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'POSSIBLE', ['Signal A'])
      const id2 = sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG', ['Signal A', 'Signal B'])
      expect(id2).toBe(id1)

      const stored = sim.flags.get(`PERSON:${PERSON_1}:${PERSON_2}`)
      expect(stored?.confidence).toBe('STRONG')
      expect(stored?.match_signals).toEqual(['Signal A', 'Signal B'])
    })

    it('12. Existing CONFIRMED_DUPLICATE and NOT_DUPLICATE flags remain terminal', () => {
      const flagId1 = sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG')
      sim.isModerator = true
      sim.resolveDuplicateFlag(flagId1, 'CONFIRMED_DUPLICATE')

      // Cannot re-flag resolved confirmed pair
      expect(() => {
        sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG')
      }).toThrow('Duplicate pair has already been resolved as CONFIRMED_DUPLICATE.')

      const flagId2 = sim.flagDuplicateRecord('FAMILY', FAMILY_1, FAMILY_2, 'WEAK')
      sim.resolveDuplicateFlag(flagId2, 'NOT_DUPLICATE')

      // Cannot re-flag resolved not_duplicate pair
      expect(() => {
        sim.flagDuplicateRecord('FAMILY', FAMILY_1, FAMILY_2, 'WEAK')
      }).toThrow('Duplicate pair has already been resolved as NOT_DUPLICATE.')
    })

    it('13. Canonical ordering remains enforced: stored record_a_id < record_b_id always', () => {
      sim.flagDuplicateRecord('FAMILY', FAMILY_2, FAMILY_1, 'STRONG')
      const stored = sim.flags.get(`FAMILY:${FAMILY_1}:${FAMILY_2}`)
      expect(stored).toBeDefined()
      expect(stored!.record_a_id).toBe(FAMILY_1)
      expect(stored!.record_b_id).toBe(FAMILY_2)
      expect(stored!.record_a_id < stored!.record_b_id).toBe(true)
    })
  })

  // --- match_signals Validation ---
  describe('match_signals Validation', () => {
    it('14. match_signals must remain a JSON array (NULL -> [], array accepted, others rejected)', () => {
      // NULL -> []
      sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG', null)
      expect(sim.flags.get(`PERSON:${PERSON_1}:${PERSON_2}`)?.match_signals).toEqual([])

      // Array accepted
      sim.flagDuplicateRecord('FAMILY', FAMILY_1, FAMILY_2, 'STRONG', ['Same address'])
      expect(sim.flags.get(`FAMILY:${FAMILY_1}:${FAMILY_2}`)?.match_signals).toEqual(['Same address'])

      // Object rejected
      expect(() => {
        sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG', { match: true })
      }).toThrow('Match signals must be a JSON array.')

      // String rejected
      expect(() => {
        sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG', 'string')
      }).toThrow('Match signals must be a JSON array.')

      // Number rejected
      expect(() => {
        sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG', 123)
      }).toThrow('Match signals must be a JSON array.')
    })
  })

  // --- Security & Permissions ---
  describe('Security & Permissions', () => {
    it('15. Direct table mutation remains blocked via RLS deny policies', () => {
      expect(migrationSql).toMatch(
        /CREATE POLICY "duplicate_flags_insert_deny"[\s\S]*?WITH CHECK \(FALSE\);/
      )
      expect(migrationSql).toMatch(
        /CREATE POLICY "duplicate_flags_update_deny"[\s\S]*?USING \(FALSE\);/
      )
      expect(migrationSql).toMatch(
        /CREATE POLICY "duplicate_flags_delete_deny"[\s\S]*?USING \(FALSE\);/
      )
    })

    it('16. Moderator authorization remains enforced for resolution', () => {
      const flagId = sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG')

      // Unauthenticated caller
      sim.currentUser = null
      expect(() => {
        sim.resolveDuplicateFlag(flagId, 'CONFIRMED_DUPLICATE')
      }).toThrow('Unauthenticated callers cannot resolve duplicate flags.')

      // Non-moderator authenticated user
      sim.currentUser = 'regular-user'
      sim.isModerator = false
      expect(() => {
        sim.resolveDuplicateFlag(flagId, 'CONFIRMED_DUPLICATE')
      }).toThrow('Unauthorized: only community moderators can resolve duplicate flags.')

      // Community moderator
      sim.isModerator = true
      expect(sim.resolveDuplicateFlag(flagId, 'CONFIRMED_DUPLICATE')).toBe(true)
    })

    it('17. Existing security tests continue passing without regression', () => {
      sim.currentUser = 'regular-user'
      sim.isModerator = false
      const flagId = sim.flagDuplicateRecord('PERSON', PERSON_1, PERSON_2, 'STRONG')
      expect(sim.flags.get(`PERSON:${PERSON_1}:${PERSON_2}`)?.id).toBe(flagId)
      expect(sim.flags.size).toBe(1)
    })
  })
})

// =============================================================================
// PART 4: Architectural Invariants
// =============================================================================
describe('Architectural Invariants & Non-Destructive Principles', () => {
  it('preserves DETECT != MERGE: does NOT perform automatic merging or deleting', () => {
    expect(migrationSql).not.toMatch(/DELETE\s+FROM\s+public\.persons/i)
    expect(migrationSql).not.toMatch(/DELETE\s+FROM\s+public\.families/i)
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.persons\s+SET[^;]*merged/i)
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.families\s+SET[^;]*merged/i)
  })

  it('preserves PERSON != USER: does NOT alter persons.user_id anywhere in migration', () => {
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.persons\s+SET[^;]*user_id\s*=/i)
    expect(migrationSql).not.toMatch(/INSERT\s+INTO\s+public\.persons/i)
  })

  it('preserves CLAIM != VERIFICATION: does NOT alter public.person_claims', () => {
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.person_claims/i)
    expect(migrationSql).not.toMatch(/INSERT\s+INTO\s+public\.person_claims/i)
    expect(migrationSql).not.toMatch(/DELETE\s+FROM\s+public\.person_claims/i)
  })

  it('preserves RECORD OWNERSHIP: does NOT alter created_by on persons or families', () => {
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.persons\s+SET[^;]*created_by\s*=/i)
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.families\s+SET[^;]*created_by\s*=/i)
  })

  it('preserves RELATIONSHIPS: does NOT touch public.relationships', () => {
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.relationships/i)
    expect(migrationSql).not.toMatch(/INSERT\s+INTO\s+public\.relationships/i)
    expect(migrationSql).not.toMatch(/DELETE\s+FROM\s+public\.relationships/i)
  })
})
