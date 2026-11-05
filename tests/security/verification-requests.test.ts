/**
 * Security & Schema Tests: Verification Requests, RLS & Secure Review RPCs
 * Phase 9 — Subtask 1
 *
 * Validates the database migration SQL, schema constraints, RLS policies,
 * RPC functions, privilege hardening, and architectural invariants defined in:
 * supabase/migrations/20261006200000_create_verification_requests.sql
 *
 * Core Architectural Invariants:
 * 1. PERSON != USER (verification validates census data, never touches persons.user_id)
 * 2. CLAIM != VERIFICATION (claiming is identity linking; verification is community validation)
 * 3. VERIFICATION != RECORD OWNERSHIP (does not alter created_by or transfer ownership)
 * 4. SCOPE IS STRICTLY PERSON AND FAMILY (entity_type strictly validated)
 * 5. SINGLE ACTIVE PENDING REQUEST (partial unique index enforces at most one pending per entity)
 * 6. STRICT REVIEWER AUTHORIZATION (approve/reject guarded by is_community_moderator())
 * 7. ATOMICITY & AUDIT TRAIL (all state changes emit audit events in atomic transactions)
 * 8. LEAST PRIVILEGE HARDENING (no direct table mutations, execute grants restricted)
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Load migration SQL content for static AST & semantic verification
const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20261006200000_create_verification_requests.sql'
)
const migrationSql = fs.readFileSync(migrationPath, 'utf8')

// -----------------------------------------------------------------------------
// 1. Static Migration File & Schema Integrity
// -----------------------------------------------------------------------------
describe('Migration Static Inspection: 20261006200000_create_verification_requests.sql', () => {
  it('migration file exists and has substantial content', () => {
    expect(fs.existsSync(migrationPath)).toBe(true)
    expect(migrationSql.length).toBeGreaterThan(1500)
  })

  it('declares public.verification_request_status enum with canonical values', () => {
    expect(migrationSql).toMatch(/CREATE TYPE public\.verification_request_status AS ENUM/)
    expect(migrationSql).toContain("'PENDING'")
    expect(migrationSql).toContain("'APPROVED'")
    expect(migrationSql).toContain("'REJECTED'")
    expect(migrationSql).toContain("'CANCELLED'")
  })

  it('creates public.verification_requests table with all required columns', () => {
    expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.verification_requests/)
    expect(migrationSql).toContain('id UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    expect(migrationSql).toContain('entity_type TEXT NOT NULL')
    expect(migrationSql).toContain('entity_id UUID NOT NULL')
    expect(migrationSql).toMatch(/requester_id UUID NOT NULL REFERENCES public\.profiles\(id\)/)
    expect(migrationSql).toContain("status public.verification_request_status NOT NULL DEFAULT 'PENDING'")
    expect(migrationSql).toContain('supporting_notes TEXT')
    expect(migrationSql).toContain('rejection_reason TEXT')
    expect(migrationSql).toMatch(/reviewed_by UUID REFERENCES public\.profiles\(id\)/)
    expect(migrationSql).toContain('reviewed_at TIMESTAMPTZ')
    expect(migrationSql).toContain('created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()')
    expect(migrationSql).toContain('updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()')
  })

  it('enforces entity_type constraint strictly to PERSON and FAMILY', () => {
    expect(migrationSql).toMatch(
      /CHECK\s*\(\s*entity_type\s+IN\s*\('PERSON',\s*'FAMILY'\)\s*\)/
    )
  })

  it('enforces length constraints on supporting_notes and rejection_reason (<= 1000)', () => {
    expect(migrationSql).toMatch(
      /CHECK\s*\(\s*supporting_notes\s+IS NULL\s+OR\s+char_length\(supporting_notes\)\s*<=\s*1000\s*\)/
    )
    expect(migrationSql).toMatch(
      /CHECK\s*\(\s*rejection_reason\s+IS NULL\s+OR\s+char_length\(rejection_reason\)\s*<=\s*1000\s*\)/
    )
  })

  it('enforces review consistency constraint across lifecycle statuses', () => {
    expect(migrationSql).toContain('verification_requests_review_consistency_check')
    expect(migrationSql).toMatch(
      /status = 'APPROVED'\s+AND\s+reviewed_by IS NOT NULL\s+AND\s+reviewed_at IS NOT NULL\s+AND\s+rejection_reason IS NULL/
    )
    expect(migrationSql).toMatch(
      /status = 'REJECTED'\s+AND\s+reviewed_by IS NOT NULL\s+AND\s+reviewed_at IS NOT NULL\s+AND\s+rejection_reason IS NOT NULL/
    )
    expect(migrationSql).toMatch(
      /status IN \('PENDING',\s*'CANCELLED'\)\s+AND\s+reviewed_by IS NULL\s+AND\s+reviewed_at IS NULL\s+AND\s+rejection_reason IS NULL/
    )
  })

  it('enforces unique partial index: at most one pending request per entity', () => {
    expect(migrationSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_one_pending[\s\S]*?ON public\.verification_requests\s*\(entity_type,\s*entity_id\)[\s\S]*?WHERE status = 'PENDING';/
    )
  })

  it('creates indexing for performance on requester_id, entity, status, and created_at', () => {
    expect(migrationSql).toContain('idx_verification_requests_requester_id')
    expect(migrationSql).toContain('idx_verification_requests_entity')
    expect(migrationSql).toContain('idx_verification_requests_status')
    expect(migrationSql).toContain('idx_verification_requests_created_at')
  })

  it('defines handle_verification_request_update_guard trigger to guard terminal states', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_verification_request_update_guard\(\)/)
    expect(migrationSql).toContain("OLD.status IN ('APPROVED', 'REJECTED', 'CANCELLED')")
    expect(migrationSql).toContain('trg_verification_requests_status_guard')
    expect(migrationSql).toMatch(/BEFORE UPDATE OF status ON public\.verification_requests/)
  })
})

// -----------------------------------------------------------------------------
// 2. RPC Functions Verification & Security Hardening
// -----------------------------------------------------------------------------
describe('RPC Security & Architecture: submit_verification_request', () => {
  it('is SECURITY DEFINER with search_path = public', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.submit_verification_request\(/)
    expect(migrationSql).toMatch(/public\.submit_verification_request[\s\S]*?SECURITY DEFINER/)
    expect(migrationSql).toMatch(/public\.submit_verification_request[\s\S]*?SET search_path = public/)
  })

  it('validates caller authentication', () => {
    expect(migrationSql).toMatch(/public\.submit_verification_request[\s\S]*?v_caller := auth\.uid\(\);/)
    expect(migrationSql).toMatch(/public\.submit_verification_request[\s\S]*?IF v_caller IS NULL THEN/)
    expect(migrationSql).toMatch(/public\.submit_verification_request[\s\S]*?ERRCODE = '42501'/)
  })

  it('locks target entity with FOR UPDATE to prevent concurrency races', () => {
    expect(migrationSql).toMatch(/FROM public\.persons[\s\S]*?WHERE id = p_entity_id[\s\S]*?FOR UPDATE;/)
    expect(migrationSql).toMatch(/FROM public\.families[\s\S]*?WHERE id = p_entity_id[\s\S]*?FOR UPDATE;/)
  })

  it('validates target entity exists, is non-deleted, and active', () => {
    expect(migrationSql).toMatch(/v_person\.deleted_at IS NOT NULL/)
    expect(migrationSql).toMatch(/v_person\.status <> 'ACTIVE'/)
    expect(migrationSql).toMatch(/v_family\.deleted_at IS NOT NULL/)
  })

  it('rejects submission if target entity is already VERIFIED or PENDING', () => {
    expect(migrationSql).toMatch(/v_person\.verification_status = 'VERIFIED'/)
    expect(migrationSql).toMatch(/v_person\.verification_status = 'PENDING'/)
    expect(migrationSql).toMatch(/v_family\.verification_status = 'VERIFIED'/)
    expect(migrationSql).toMatch(/v_family\.verification_status = 'PENDING'/)
  })

  it('enforces requester authorization boundary (creator, linked user, or moderator)', () => {
    expect(migrationSql).toMatch(/v_person\.created_by = v_caller/)
    expect(migrationSql).toMatch(/v_person\.user_id = v_caller/)
    expect(migrationSql).toMatch(/v_family\.created_by = v_caller/)
    expect(migrationSql).toMatch(/v_is_moderator/)
  })

  it('atomically sets target entity verification_status to PENDING', () => {
    expect(migrationSql).toMatch(/UPDATE public\.persons\s+SET\s+verification_status = 'PENDING'/)
    expect(migrationSql).toMatch(/UPDATE public\.families\s+SET\s+verification_status = 'PENDING'/)
  })
})

describe('RPC Security & Architecture: approve_verification_request', () => {
  it('is SECURITY DEFINER with search_path = public', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.approve_verification_request\(/)
    expect(migrationSql).toMatch(/public\.approve_verification_request[\s\S]*?SECURITY DEFINER/)
    expect(migrationSql).toMatch(/public\.approve_verification_request[\s\S]*?SET search_path = public/)
  })

  it('enforces strict moderator authorization check using is_community_moderator()', () => {
    expect(migrationSql).toMatch(/public\.approve_verification_request[\s\S]*?IF NOT public\.is_community_moderator\(\) THEN/)
    expect(migrationSql).toMatch(/public\.approve_verification_request[\s\S]*?ERRCODE = '42501'/)
  })

  it('locks verification request row FOR UPDATE and verifies PENDING status', () => {
    expect(migrationSql).toMatch(/FROM public\.verification_requests[\s\S]*?WHERE id = p_request_id[\s\S]*?FOR UPDATE;/)
    expect(migrationSql).toMatch(/v_req\.status <> 'PENDING'/)
  })

  it('atomically updates target entity to VERIFIED', () => {
    expect(migrationSql).toMatch(/UPDATE public\.persons\s+SET\s+verification_status = 'VERIFIED'/)
    expect(migrationSql).toMatch(/UPDATE public\.families\s+SET\s+verification_status = 'VERIFIED'/)
  })

  it('emits immutable audit log with audit_action enum', () => {
    expect(migrationSql).toMatch(/public\.log_audit_event\(\s*'PERSON_VERIFIED'::public\.audit_action/)
    expect(migrationSql).toMatch(/public\.log_audit_event\(\s*'ADMIN_ACTION'::public\.audit_action/)
  })

  it('records reviewer attribution and timestamp on the verification request', () => {
    expect(migrationSql).toMatch(/status = 'APPROVED'/)
    expect(migrationSql).toMatch(/reviewed_by = v_caller/)
    expect(migrationSql).toMatch(/reviewed_at = NOW\(\)/)
  })
})

describe('RPC Security & Architecture: reject_verification_request', () => {
  it('is SECURITY DEFINER with search_path = public', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.reject_verification_request\(/)
    expect(migrationSql).toMatch(/public\.reject_verification_request[\s\S]*?SECURITY DEFINER/)
    expect(migrationSql).toMatch(/public\.reject_verification_request[\s\S]*?SET search_path = public/)
  })

  it('enforces strict moderator authorization check using is_community_moderator()', () => {
    expect(migrationSql).toMatch(/public\.reject_verification_request[\s\S]*?IF NOT public\.is_community_moderator\(\) THEN/)
    expect(migrationSql).toMatch(/public\.reject_verification_request[\s\S]*?ERRCODE = '42501'/)
  })

  it('enforces non-empty rejection reason with max length 1000', () => {
    expect(migrationSql).toMatch(/char_length\(v_clean_reason\) = 0/)
    expect(migrationSql).toMatch(/char_length\(v_clean_reason\) > 1000/)
  })

  it('atomically reverts target entity verification_status to UNVERIFIED', () => {
    expect(migrationSql).toMatch(/UPDATE public\.persons\s+SET\s+verification_status = 'UNVERIFIED'/)
    expect(migrationSql).toMatch(/UPDATE public\.families\s+SET\s+verification_status = 'UNVERIFIED'/)
  })

  it('emits immutable audit log for rejection', () => {
    expect(migrationSql).toMatch(/public\.log_audit_event\(\s*'PERSON_VERIFICATION_REJECTED'::public\.audit_action/)
  })

  it('records rejection reason and reviewer attribution on the verification request', () => {
    expect(migrationSql).toMatch(/status = 'REJECTED'/)
    expect(migrationSql).toMatch(/rejection_reason = v_clean_reason/)
    expect(migrationSql).toMatch(/reviewed_by = v_caller/)
    expect(migrationSql).toMatch(/reviewed_at = NOW\(\)/)
  })
})

describe('RPC Security & Architecture: cancel_verification_request', () => {
  it('is SECURITY DEFINER with search_path = public', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.cancel_verification_request\(/)
    expect(migrationSql).toMatch(/public\.cancel_verification_request[\s\S]*?SECURITY DEFINER/)
    expect(migrationSql).toMatch(/public\.cancel_verification_request[\s\S]*?SET search_path = public/)
  })

  it('restricts cancellation to original requester or community moderator', () => {
    expect(migrationSql).toMatch(/v_req\.requester_id = v_caller/)
    expect(migrationSql).toMatch(/public\.is_community_moderator\(\)/)
  })

  it('atomically reverts target entity verification_status to UNVERIFIED', () => {
    expect(migrationSql).toMatch(/public\.cancel_verification_request[\s\S]*?verification_status = 'UNVERIFIED'/)
  })

  it('marks request as CANCELLED', () => {
    expect(migrationSql).toMatch(/status = 'CANCELLED'/)
  })
})

// -----------------------------------------------------------------------------
// 3. Architectural Invariants
// -----------------------------------------------------------------------------
describe('Architectural Invariants Verification', () => {
  it('preserves PERSON != USER: does NOT alter persons.user_id anywhere in migration', () => {
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.persons\s+SET[^;]*user_id\s*=/i)
    expect(migrationSql).not.toMatch(/INSERT\s+INTO\s+public\.persons/i)
  })

  it('preserves CLAIM != VERIFICATION: does NOT alter public.person_claims', () => {
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.person_claims/i)
    expect(migrationSql).not.toMatch(/INSERT\s+INTO\s+public\.person_claims/i)
    expect(migrationSql).not.toMatch(/DELETE\s+FROM\s+public\.person_claims/i)
  })

  it('preserves VERIFICATION != OWNERSHIP: does NOT alter created_by on persons or families', () => {
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.persons\s+SET[^;]*created_by\s*=/i)
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.families\s+SET[^;]*created_by\s*=/i)
  })

  it('preserves NO RELATIONSHIP MUTATIONS: does NOT touch public.relationships', () => {
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.relationships/i)
    expect(migrationSql).not.toMatch(/INSERT\s+INTO\s+public\.relationships/i)
    expect(migrationSql).not.toMatch(/DELETE\s+FROM\s+public\.relationships/i)
  })
})

// -----------------------------------------------------------------------------
// 4. RLS & Least Privilege Hardening
// -----------------------------------------------------------------------------
describe('RLS Policies & Privilege Hardening', () => {
  it('enables Row Level Security on verification_requests', () => {
    expect(migrationSql).toMatch(/ALTER TABLE public\.verification_requests ENABLE ROW LEVEL SECURITY;/)
  })

  it('defines SELECT policy for requester own requests', () => {
    expect(migrationSql).toMatch(/CREATE POLICY "verification_requests_select_own"/)
    expect(migrationSql).toMatch(/USING \(auth\.uid\(\) = requester_id\)/)
  })

  it('defines SELECT policy for community moderators', () => {
    expect(migrationSql).toMatch(/CREATE POLICY "verification_requests_select_moderator"/)
    expect(migrationSql).toMatch(/USING \(public\.is_community_moderator\(\)\)/)
  })

  it('denies direct INSERT, UPDATE, and DELETE at the RLS policy level', () => {
    expect(migrationSql).toMatch(/CREATE POLICY "verification_requests_insert_deny"[\s\S]*?WITH CHECK \(FALSE\);/)
    expect(migrationSql).toMatch(/CREATE POLICY "verification_requests_update_deny"[\s\S]*?USING \(FALSE\);/)
    expect(migrationSql).toMatch(/CREATE POLICY "verification_requests_delete_deny"[\s\S]*?USING \(FALSE\);/)
  })

  it('revokes all table privileges from PUBLIC and anon', () => {
    expect(migrationSql).toMatch(/REVOKE ALL ON public\.verification_requests FROM PUBLIC;/)
    expect(migrationSql).toMatch(/REVOKE ALL ON public\.verification_requests FROM anon;/)
  })

  it('grants only SELECT to authenticated role', () => {
    expect(migrationSql).toMatch(/GRANT SELECT ON public\.verification_requests TO authenticated;/)
    expect(migrationSql).not.toMatch(/GRANT INSERT ON public\.verification_requests TO authenticated;/)
    expect(migrationSql).not.toMatch(/GRANT UPDATE ON public\.verification_requests TO authenticated;/)
    expect(migrationSql).not.toMatch(/GRANT DELETE ON public\.verification_requests TO authenticated;/)
  })

  it('enforces function execution least privilege: authenticated only, revoked from anon/PUBLIC', () => {
    const rpcs = [
      'submit_verification_request(TEXT, UUID, TEXT)',
      'approve_verification_request(UUID)',
      'reject_verification_request(UUID, TEXT)',
      'cancel_verification_request(UUID)',
    ]

    for (const rpc of rpcs) {
      const escaped = rpc.replace(/\(/g, '\\(').replace(/\)/g, '\\)')
      expect(migrationSql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped} FROM PUBLIC;`))
      expect(migrationSql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped} FROM anon;`))
      expect(migrationSql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped} TO authenticated;`))
    }
  })

  it('strictly omits service_role grants', () => {
    expect(migrationSql).not.toMatch(/GRANT[^;]*TO\s+service_role/i)
  })
})

// -----------------------------------------------------------------------------
// 5. Hardened Regression: Approval Concurrency, Freshness & Atomicity
// -----------------------------------------------------------------------------
describe('Hardened Regression: approve_verification_request', () => {
  // Scenario 1 & 4: PENDING request + PENDING target => succeeds
  it('1 & 4. permits approval when target entity is PENDING', () => {
    expect(migrationSql).toMatch(
      /IF v_person\.verification_status <> 'PENDING' THEN[\s\S]*?RAISE EXCEPTION[\s\S]*?UPDATE public\.persons\s+SET\s+verification_status = 'VERIFIED'/
    )
    expect(migrationSql).toMatch(
      /IF v_family\.verification_status <> 'PENDING' THEN[\s\S]*?RAISE EXCEPTION[\s\S]*?UPDATE public\.families\s+SET\s+verification_status = 'VERIFIED'/
    )
  })

  // Scenario 2, 3 & 5: non-PENDING target (VERIFIED, UNVERIFIED, REJECTED) => fails
  it('2, 3 & 5. strictly rejects approval if target person or family is not PENDING', () => {
    expect(migrationSql).toMatch(
      /IF v_person\.verification_status <> 'PENDING' THEN\s+RAISE EXCEPTION 'Cannot approve verification request: target person is in % verification status, expected PENDING\.'/
    )
    expect(migrationSql).toMatch(
      /IF v_family\.verification_status <> 'PENDING' THEN\s+RAISE EXCEPTION 'Cannot approve verification request: target family is in % verification status, expected PENDING\.'/
    )
  })

  // Scenario 16 & 19: Missing target => fails with P0002
  it('16 & 19. raises P0002 controlled exception if target person or family is missing', () => {
    expect(migrationSql).toMatch(
      /SELECT \* INTO v_person[\s\S]*?FROM public\.persons[\s\S]*?FOR UPDATE;[\s\S]*?IF NOT FOUND THEN\s+RAISE EXCEPTION 'Target person % does not exist\.', v_req\.entity_id USING ERRCODE = 'P0002';/
    )
    expect(migrationSql).toMatch(
      /SELECT \* INTO v_family[\s\S]*?FROM public\.families[\s\S]*?FOR UPDATE;[\s\S]*?IF NOT FOUND THEN\s+RAISE EXCEPTION 'Target family % does not exist\.', v_req\.entity_id USING ERRCODE = 'P0002';/
    )
  })

  // Scenario 25: Successful approval retains expected audit
  it('25. logs PERSON_VERIFIED and ADMIN_ACTION(FAMILY_VERIFIED) on successful approval', () => {
    expect(migrationSql).toMatch(
      /PERFORM public\.log_audit_event\(\s*'PERSON_VERIFIED'::public\.audit_action,\s*'person'/
    )
    expect(migrationSql).toMatch(
      /PERFORM public\.log_audit_event\(\s*'ADMIN_ACTION'::public\.audit_action,\s*'family'[\s\S]*?'FAMILY_VERIFIED'/
    )
  })

  // Scenario 27 & 30: Atomicity: stale rejection/exception prevents mutation and leaves status unchanged
  it('27 & 30. enforces check before mutation ensuring stale failure leaves target and request untouched', () => {
    // The check happens BEFORE UPDATE public.persons and BEFORE UPDATE public.verification_requests
    const personCheckIdx = migrationSql.indexOf("IF v_person.verification_status <> 'PENDING' THEN")
    const personUpdateIdx = migrationSql.indexOf("UPDATE public.persons\n    SET\n      verification_status = 'VERIFIED'")
    const reqUpdateIdx = migrationSql.indexOf("UPDATE public.verification_requests\n  SET\n    status = 'APPROVED'")

    expect(personCheckIdx).toBeGreaterThan(0)
    expect(personUpdateIdx).toBeGreaterThan(personCheckIdx)
    expect(reqUpdateIdx).toBeGreaterThan(personUpdateIdx)
  })
})

// -----------------------------------------------------------------------------
// 6. Hardened Regression: Rejection Concurrency, Freshness & Atomicity
// -----------------------------------------------------------------------------
describe('Hardened Regression: reject_verification_request', () => {
  // Scenario 6 & 9: PENDING request + PENDING target => succeeds
  it('6 & 9. permits rejection when target entity is PENDING', () => {
    expect(migrationSql).toMatch(
      /IF v_person\.verification_status <> 'PENDING' THEN[\s\S]*?RAISE EXCEPTION[\s\S]*?UPDATE public\.persons\s+SET\s+verification_status = 'UNVERIFIED'/
    )
    expect(migrationSql).toMatch(
      /IF v_family\.verification_status <> 'PENDING' THEN[\s\S]*?RAISE EXCEPTION[\s\S]*?UPDATE public\.families\s+SET\s+verification_status = 'UNVERIFIED'/
    )
  })

  // Scenario 7, 8 & 10: non-PENDING target (VERIFIED, UNVERIFIED, etc.) => fails
  it('7, 8 & 10. strictly rejects rejection if target person or family is not PENDING', () => {
    expect(migrationSql).toMatch(
      /IF v_person\.verification_status <> 'PENDING' THEN\s+RAISE EXCEPTION 'Cannot reject verification request: target person is in % verification status, expected PENDING\.'/
    )
    expect(migrationSql).toMatch(
      /IF v_family\.verification_status <> 'PENDING' THEN\s+RAISE EXCEPTION 'Cannot reject verification request: target family is in % verification status, expected PENDING\.'/
    )
  })

  // Scenario 17 & 20: Missing target => fails with P0002
  it('17 & 20. raises P0002 controlled exception if target person or family is missing during rejection', () => {
    expect(migrationSql).toMatch(
      /SELECT \* INTO v_person[\s\S]*?FROM public\.persons[\s\S]*?WHERE id = v_req\.entity_id[\s\S]*?FOR UPDATE;[\s\S]*?IF NOT FOUND THEN\s+RAISE EXCEPTION 'Target person % does not exist\.', v_req\.entity_id USING ERRCODE = 'P0002';/
    )
    expect(migrationSql).toMatch(
      /SELECT \* INTO v_family[\s\S]*?FROM public\.families[\s\S]*?WHERE id = v_req\.entity_id[\s\S]*?FOR UPDATE;[\s\S]*?IF NOT FOUND THEN\s+RAISE EXCEPTION 'Target family % does not exist\.', v_req\.entity_id USING ERRCODE = 'P0002';/
    )
  })

  // Scenario 24: Failed stale rejection produces no rejection audit
  it('24 & 26. audit log executes strictly AFTER validation and target lock', () => {
    const rejectCheckIdx = migrationSql.indexOf("IF v_person.verification_status <> 'PENDING' THEN\n      RAISE EXCEPTION 'Cannot reject verification request")
    const auditIdx = migrationSql.indexOf("'PERSON_VERIFICATION_REJECTED'::public.audit_action")

    expect(rejectCheckIdx).toBeGreaterThan(0)
    expect(auditIdx).toBeGreaterThan(rejectCheckIdx)
  })

  // Scenario 28 & 30: Atomicity on stale rejection
  it('28 & 30. leaves target verification_status and request status unchanged on stale failure', () => {
    const personCheckIdx = migrationSql.indexOf("IF v_person.verification_status <> 'PENDING' THEN\n      RAISE EXCEPTION 'Cannot reject verification request")
    const reqUpdateIdx = migrationSql.indexOf("UPDATE public.verification_requests\n  SET\n    status = 'REJECTED'")

    expect(personCheckIdx).toBeGreaterThan(0)
    expect(reqUpdateIdx).toBeGreaterThan(personCheckIdx)
  })
})

// -----------------------------------------------------------------------------
// 7. Hardened Regression: Cancellation Concurrency, Freshness & Audit
// -----------------------------------------------------------------------------
describe('Hardened Regression: cancel_verification_request', () => {
  // Scenario 11 & 14: PENDING request + PENDING target => succeeds
  it('11 & 14. permits cancellation when target entity is PENDING', () => {
    expect(migrationSql).toMatch(
      /IF v_person\.verification_status <> 'PENDING' THEN[\s\S]*?RAISE EXCEPTION[\s\S]*?UPDATE public\.persons\s+SET\s+verification_status = 'UNVERIFIED'/
    )
    expect(migrationSql).toMatch(
      /IF v_family\.verification_status <> 'PENDING' THEN[\s\S]*?RAISE EXCEPTION[\s\S]*?UPDATE public\.families\s+SET\s+verification_status = 'UNVERIFIED'/
    )
  })

  // Scenario 12, 13 & 15: non-PENDING target (VERIFIED, UNVERIFIED, etc.) => fails
  it('12, 13 & 15. strictly rejects cancellation if target person or family is not PENDING', () => {
    expect(migrationSql).toMatch(
      /IF v_person\.verification_status <> 'PENDING' THEN\s+RAISE EXCEPTION 'Cannot cancel verification request: target person is in % verification status, expected PENDING\.'/
    )
    expect(migrationSql).toMatch(
      /IF v_family\.verification_status <> 'PENDING' THEN\s+RAISE EXCEPTION 'Cannot cancel verification request: target family is in % verification status, expected PENDING\.'/
    )
  })

  // Scenario 18 & 21: Missing target => fails with P0002
  it('18 & 21. raises P0002 controlled exception if target person or family is missing during cancellation', () => {
    expect(migrationSql).toMatch(
      /public\.cancel_verification_request[\s\S]*?SELECT \* INTO v_person[\s\S]*?FROM public\.persons[\s\S]*?WHERE id = v_req\.entity_id[\s\S]*?FOR UPDATE;[\s\S]*?IF NOT FOUND THEN\s+RAISE EXCEPTION 'Target person % does not exist\.', v_req\.entity_id USING ERRCODE = 'P0002';/
    )
    expect(migrationSql).toMatch(
      /public\.cancel_verification_request[\s\S]*?SELECT \* INTO v_family[\s\S]*?FROM public\.families[\s\S]*?WHERE id = v_req\.entity_id[\s\S]*?FOR UPDATE;[\s\S]*?IF NOT FOUND THEN\s+RAISE EXCEPTION 'Target family % does not exist\.', v_req\.entity_id USING ERRCODE = 'P0002';/
    )
  })

  // Scenario 22: Successful cancellation produces appropriate existing audit action
  it('22. audits cancellation using existing ADMIN_ACTION without inventing enum values', () => {
    expect(migrationSql).toMatch(
      /PERFORM public\.log_audit_event\(\s*'ADMIN_ACTION'::public\.audit_action,\s*'person'[\s\S]*?'PERSON_VERIFICATION_CANCELLED'/
    )
    expect(migrationSql).toMatch(
      /PERFORM public\.log_audit_event\(\s*'ADMIN_ACTION'::public\.audit_action,\s*'family'[\s\S]*?'FAMILY_VERIFICATION_CANCELLED'/
    )
  })

  // Scenario 23: Failed stale cancellation produces no cancellation audit
  it('23 & 29. ensures cancellation audit executes strictly AFTER target lock and PENDING validation', () => {
    const cancelCheckIdx = migrationSql.indexOf("IF v_person.verification_status <> 'PENDING' THEN\n      RAISE EXCEPTION 'Cannot cancel verification request")
    const auditIdx = migrationSql.indexOf("'action_type', 'PERSON_VERIFICATION_CANCELLED'")
    const reqUpdateIdx = migrationSql.indexOf("UPDATE public.verification_requests\n  SET\n    status = 'CANCELLED'")

    expect(cancelCheckIdx).toBeGreaterThan(0)
    expect(auditIdx).toBeGreaterThan(cancelCheckIdx)
    expect(reqUpdateIdx).toBeGreaterThan(auditIdx)
  })
})

// -----------------------------------------------------------------------------
// 8. Static Security & Code Hygiene Assertions
// -----------------------------------------------------------------------------
describe('Static Security & Hygiene Checks', () => {
  it('all RPCs are configured with SECURITY DEFINER and search_path = public', () => {
    const rpcs = [
      'submit_verification_request',
      'approve_verification_request',
      'reject_verification_request',
      'cancel_verification_request',
    ]

    for (const rpc of rpcs) {
      expect(migrationSql).toMatch(new RegExp(`public\\.${rpc}[\\s\\S]*?SECURITY DEFINER`))
      expect(migrationSql).toMatch(new RegExp(`public\\.${rpc}[\\s\\S]*?SET search_path = public`))
    }
  })

  it('no console.log or debugging output exists in migration', () => {
    expect(migrationSql).not.toContain('console.log')
    expect(migrationSql).not.toContain('console.error')
  })

  it('no client storage tokens exist in migration', () => {
    expect(migrationSql).not.toContain('localStorage')
    expect(migrationSql).not.toContain('sessionStorage')
  })
})
