-- =============================================================================
-- Migration: 20261004150000_create_relationships.sql
-- Purpose:   Create canonical public.relationships table, relationship_type enum,
--             canonical ordering constraints, indexes, RLS policies, and privileges.
-- Phase:     Phase 5 — Subtask 1 (Interpersonal Relationships Foundation)
-- =============================================================================
--
-- ARCHITECTURE & SECURITY RULES:
-- 1. PERSON != USER:
--    Relationships link public.persons records (human census entities).
--    They do NOT link auth.users records.
--    created_by tracks the authenticated actor who recorded the relationship.
--
-- 2. CANONICAL RELATIONSHIP MODEL:
--    - PARENT: Directional (person_a_id = parent, person_b_id = child).
--              The inverse "child of" is dynamically derived by queries.
--              Reciprocal CHILD rows are never stored.
--    - SPOUSE: Symmetric partnership. Exactly one canonical row is stored
--              enforcing person_a_id < person_b_id via CHECK constraint.
--    - SIBLING: Explicit canonical sibling edge asserted directly.
--               Enforces person_a_id < person_b_id via CHECK constraint.
--               Does not require known parent records.
--
-- 3. SOFT DELETION & LIFECYCLE:
--    - deleted_at TIMESTAMPTZ handles soft deletion.
--    - Active uniqueness is enforced on (person_a_id, person_b_id, relationship_type)
--      WHERE deleted_at IS NULL, allowing recreation if previously soft-deleted.
--    - Verification uses the existing public.verification_status enum.
--    - No separate relationship_status enum is introduced.
--
-- 4. TWO-GATE ACCESS CONTROL & DUAL-ENDPOINT PRIVACY:
--    - Gate 1: authenticated role granted SELECT, INSERT, UPDATE only.
--              Hard DELETE is intentionally denied (application lifecycle uses soft deletion via deleted_at).
--              anon and PUBLIC granted zero privileges (deny-by-default).
--    - Gate 2 (RLS): Dual-endpoint rule enforced on SELECT. A relationship row
--      is visible ONLY when the caller has authorization to view BOTH endpoint
--      persons under active public.persons RLS policies.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enum: public.relationship_type
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regtype('public.relationship_type') IS NULL THEN
    CREATE TYPE public.relationship_type AS ENUM (
      'PARENT',
      'SPOUSE',
      'SIBLING'
    );
  END IF;
END $$;

COMMENT ON TYPE public.relationship_type IS
  'Canonical MVP relationship types: '
  'PARENT (directional parent-to-child), '
  'SPOUSE (symmetric canonical person_a < person_b), '
  'SIBLING (explicit symmetric canonical person_a < person_b).';

-- -----------------------------------------------------------------------------
-- 2. Table: public.relationships
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Endpoints (referential integrity: RESTRICT prevents accidental cascade drops)
  person_a_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,
  person_b_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,

  -- Relationship Classification
  relationship_type public.relationship_type NOT NULL,

  -- Optional context & metadata
  notes TEXT,

  -- Verification (reuses existing Phase 1 verification_status enum)
  verification_status public.verification_status NOT NULL DEFAULT 'UNVERIFIED',

  -- Audit & Provenance
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  -- Invariant 1: Disallow self-referential relationship edges
  CONSTRAINT relationships_no_self_reference
    CHECK (person_a_id <> person_b_id),

  -- Invariant 2: Canonical lexical ordering for symmetric relationships (SPOUSE, SIBLING)
  CONSTRAINT relationships_symmetric_ordering
    CHECK (
      relationship_type = 'PARENT'
      OR (person_a_id < person_b_id)
    )
);

COMMENT ON TABLE public.relationships IS
  'Canonical interpersonal relationship graph connecting public.persons records. '
  'PERSON != USER: links human census entities, not auth accounts. Soft-deleted via deleted_at.';

COMMENT ON COLUMN public.relationships.person_a_id IS
  'First endpoint person. For PARENT, person_a is the parent. For SPOUSE and SIBLING, person_a < person_b.';

COMMENT ON COLUMN public.relationships.person_b_id IS
  'Second endpoint person. For PARENT, person_b is the child. For SPOUSE and SIBLING, person_b > person_a.';

COMMENT ON COLUMN public.relationships.relationship_type IS
  'Relationship type: PARENT (directional), SPOUSE (symmetric canonical), SIBLING (symmetric canonical).';

COMMENT ON COLUMN public.relationships.deleted_at IS
  'Soft deletion timestamp. Non-null means logically deleted / departed relationship.';

-- -----------------------------------------------------------------------------
-- 3. Indexes
-- -----------------------------------------------------------------------------

-- Partial unique index for active relationships (allows re-creating soft-deleted edges)
CREATE UNIQUE INDEX IF NOT EXISTS idx_relationships_active_unique
  ON public.relationships (person_a_id, person_b_id, relationship_type)
  WHERE deleted_at IS NULL;

-- Fast graph traversals by endpoint persons
CREATE INDEX IF NOT EXISTS idx_relationships_person_a
  ON public.relationships (person_a_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_relationships_person_b
  ON public.relationships (person_b_id)
  WHERE deleted_at IS NULL;

-- Fast filtering by relationship type
CREATE INDEX IF NOT EXISTS idx_relationships_type
  ON public.relationships (relationship_type)
  WHERE deleted_at IS NULL;

-- Provenance lookup
CREATE INDEX IF NOT EXISTS idx_relationships_created_by
  ON public.relationships (created_by)
  WHERE created_by IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. Triggers: handle_updated_at & handle_relationship_update_guard
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS relationships_handle_updated_at ON public.relationships;
CREATE TRIGGER relationships_handle_updated_at
  BEFORE UPDATE ON public.relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Database-level protection against unauthorized mutation of protected fields
-- (id, person_a_id, person_b_id, relationship_type, created_by, created_at, verification_status)
CREATE OR REPLACE FUNCTION public.handle_relationship_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Trusted administrators and community moderators retain elevated management authority
  IF public.is_community_moderator() THEN
    RETURN NEW;
  END IF;

  -- 1. Identity & Classification Immutability: normal callers cannot alter
  IF OLD.id <> NEW.id THEN
    RAISE EXCEPTION 'Cannot modify relationship id'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.person_a_id <> NEW.person_a_id OR OLD.person_b_id <> NEW.person_b_id THEN
    RAISE EXCEPTION 'Cannot modify relationship endpoints'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.relationship_type <> NEW.relationship_type THEN
    RAISE EXCEPTION 'Cannot modify relationship_type'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'Cannot modify created_by'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'Cannot modify created_at'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Verification Status Authority: normal callers cannot alter verification_status
  IF OLD.verification_status <> NEW.verification_status THEN
    RAISE EXCEPTION 'Cannot modify verification_status'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Lifecycle Guard: cannot alter or un-delete an already soft-deleted record
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot modify an already soft-deleted relationship'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Soft-delete transition isolation: cannot alter notes during soft-deletion
  IF NEW.deleted_at IS NOT NULL THEN
    IF OLD.notes IS DISTINCT FROM NEW.notes THEN
      RAISE EXCEPTION 'Cannot alter notes during soft-deletion'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_relationship_update_guard() IS
  'Enforces database-level immutability for protected identity fields (id, person_a_id, person_b_id, '
  'relationship_type, created_by, created_at), restricts verification_status mutation to moderators, '
  'and protects the soft-deletion lifecycle.';

DROP TRIGGER IF EXISTS relationships_update_guard ON public.relationships;
CREATE TRIGGER relationships_update_guard
  BEFORE UPDATE ON public.relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_relationship_update_guard();

-- -----------------------------------------------------------------------------
-- 5. Row Level Security (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

-- SELECT 1: Dual-Endpoint Visibility
-- Caller can read relationship edge ONLY if caller is authorized to view BOTH endpoint persons.
-- Subqueries execute under caller security context, automatically applying public.persons RLS policies.
DROP POLICY IF EXISTS "relationships_select_dual_endpoint" ON public.relationships;
CREATE POLICY "relationships_select_dual_endpoint"
  ON public.relationships
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.persons pa
      WHERE pa.id = relationships.person_a_id
    )
    AND EXISTS (
      SELECT 1 FROM public.persons pb
      WHERE pb.id = relationships.person_b_id
    )
  );

-- SELECT 2: Admin/Moderator full visibility (including soft-deleted relationships)
DROP POLICY IF EXISTS "relationships_select_admin" ON public.relationships;
CREATE POLICY "relationships_select_admin"
  ON public.relationships
  FOR SELECT
  USING (public.is_community_moderator());

-- INSERT 1: Authenticated users can insert relationships between persons they can view
DROP POLICY IF EXISTS "relationships_insert_authenticated" ON public.relationships;
CREATE POLICY "relationships_insert_authenticated"
  ON public.relationships
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.persons pa
      WHERE pa.id = relationships.person_a_id
    )
    AND EXISTS (
      SELECT 1 FROM public.persons pb
      WHERE pb.id = relationships.person_b_id
    )
  );

-- INSERT 2: Administrators / moderators can insert relationships with verified provenance
DROP POLICY IF EXISTS "relationships_insert_admin" ON public.relationships;
CREATE POLICY "relationships_insert_admin"
  ON public.relationships
  FOR INSERT
  WITH CHECK (
    public.is_community_moderator()
    AND created_by = auth.uid()
  );

-- UPDATE 1: Creator can update active relationship records (e.g. notes)
-- WITH CHECK strictly enforces that the record remains active (deleted_at IS NULL)
-- and creator cannot be reassigned.
DROP POLICY IF EXISTS "relationships_update_creator" ON public.relationships;
CREATE POLICY "relationships_update_creator"
  ON public.relationships
  FOR UPDATE
  USING (
    auth.uid() = created_by
    AND deleted_at IS NULL
  )
  WITH CHECK (
    auth.uid() = created_by
    AND deleted_at IS NULL
  );

-- UPDATE 2: Creator can soft-delete their own active relationship (sets deleted_at)
-- Narrowly scoped dedicated policy: old row must be active, new row must have deleted_at set.
-- Prevents un-deleting, altering created_by, or updating soft-deleted records.
DROP POLICY IF EXISTS "relationships_soft_delete_creator" ON public.relationships;
CREATE POLICY "relationships_soft_delete_creator"
  ON public.relationships
  FOR UPDATE
  USING (
    auth.uid() = created_by
    AND deleted_at IS NULL
  )
  WITH CHECK (
    auth.uid() = created_by
    AND deleted_at IS NOT NULL
  );

-- UPDATE 3: Administrators / moderators can update any relationship
DROP POLICY IF EXISTS "relationships_update_admin" ON public.relationships;
CREATE POLICY "relationships_update_admin"
  ON public.relationships
  FOR UPDATE
  USING (public.is_community_moderator());

-- DELETE 1: Normal application hard DELETE is strictly denied (lifecycle is soft deletion via deleted_at)
DROP POLICY IF EXISTS "relationships_delete_admin" ON public.relationships;
DROP POLICY IF EXISTS "relationships_delete_deny" ON public.relationships;
CREATE POLICY "relationships_delete_deny"
  ON public.relationships
  FOR DELETE
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 6. Table Privileges (Two-Gate Access Control — Gate 1)
-- -----------------------------------------------------------------------------
-- Revoke all privileges from PUBLIC and anon (deny-by-default at Gate 1)
REVOKE ALL ON TABLE public.relationships FROM PUBLIC;
REVOKE ALL ON TABLE public.relationships FROM anon;

-- Grant required operational privileges to authenticated role (SELECT, INSERT, UPDATE only)
-- Hard DELETE is strictly prohibited; application lifecycle is soft-deletion via deleted_at.
REVOKE ALL ON TABLE public.relationships FROM authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.relationships
TO authenticated;
