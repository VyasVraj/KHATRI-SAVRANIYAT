-- =============================================================================
-- Migration: 20261002130005_create_families.sql
-- Purpose:   Family and family membership tables
-- Phase:     1 — Architecture & Database Foundation
-- =============================================================================
-- A FAMILY is a named family unit in the community.
-- A family has MEMBERS (persons) linked via the family_members junction table.
-- One person can belong to multiple families (e.g., birth family + married family).
-- A family can have at most one HEAD at any time (enforced by partial unique index).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLE: public.families
-- The census record for a family unit.
-- -----------------------------------------------------------------------------
CREATE TABLE public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- -------------------------------------------------------------------------
  -- Identity
  -- -------------------------------------------------------------------------
  family_name TEXT NOT NULL,
  description TEXT,

  -- -------------------------------------------------------------------------
  -- Community Identity
  -- -------------------------------------------------------------------------
  gotra TEXT,  -- Family's gotra / clan
  nukh TEXT,   -- Family's nukh / sub-lineage
  kul TEXT,    -- Family's kul / extended lineage

  -- -------------------------------------------------------------------------
  -- Location (freeform in Phase 1; structured in Phase 3+)
  -- -------------------------------------------------------------------------
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'India',

  -- -------------------------------------------------------------------------
  -- Status and verification
  -- -------------------------------------------------------------------------
  status public.family_status NOT NULL DEFAULT 'ACTIVE',
  verification_status public.verification_status NOT NULL DEFAULT 'UNVERIFIED',

  -- -------------------------------------------------------------------------
  -- Privacy
  -- -------------------------------------------------------------------------
  -- Controls who can see this family in directory search
  profile_privacy public.privacy_level NOT NULL DEFAULT 'COMMUNITY',

  -- Controls who can see the full member list
  members_privacy public.privacy_level NOT NULL DEFAULT 'COMMUNITY',

  -- -------------------------------------------------------------------------
  -- Record provenance
  -- -------------------------------------------------------------------------
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- -------------------------------------------------------------------------
  -- Constraints
  -- -------------------------------------------------------------------------
  CONSTRAINT families_name_not_empty
    CHECK (family_name != '' AND length(trim(family_name)) > 0),

  CONSTRAINT families_name_length
    CHECK (length(family_name) <= 200),

  CONSTRAINT families_description_length
    CHECK (description IS NULL OR length(description) <= 2000)
);

COMMENT ON TABLE public.families IS
  'Family unit in the community census. Contains demographic/location info. '
  'Members are linked via public.family_members. Soft-deleted via deleted_at.';

COMMENT ON COLUMN public.families.profile_privacy IS
  'Who can see this family in search/directory results. Enforced by RLS.';
COMMENT ON COLUMN public.families.members_privacy IS
  'Who can see the full member list of this family. Enforced in query layer.';

-- -----------------------------------------------------------------------------
-- TRIGGER: Auto-update updated_at
-- -----------------------------------------------------------------------------
CREATE TRIGGER families_handle_updated_at
  BEFORE UPDATE ON public.families
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- INDEXES for families
-- -----------------------------------------------------------------------------

-- Name search — case-insensitive
CREATE INDEX idx_families_name_lower
  ON public.families (lower(family_name))
  WHERE deleted_at IS NULL;

-- Full-text search on family name + description
CREATE INDEX idx_families_fts
  ON public.families
  USING GIN (to_tsvector('english', coalesce(family_name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(city, '')))
  WHERE deleted_at IS NULL;

-- Trigram for fuzzy name search
CREATE INDEX idx_families_name_trgm
  ON public.families
  USING GIN (family_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Community identity filters (heavily used in community directory)
CREATE INDEX idx_families_gotra
  ON public.families (lower(gotra))
  WHERE deleted_at IS NULL AND gotra IS NOT NULL;

CREATE INDEX idx_families_nukh
  ON public.families (lower(nukh))
  WHERE deleted_at IS NULL AND nukh IS NOT NULL;

CREATE INDEX idx_families_kul
  ON public.families (lower(kul))
  WHERE deleted_at IS NULL AND kul IS NOT NULL;

-- Location filters
CREATE INDEX idx_families_location
  ON public.families (lower(country), lower(state), lower(city))
  WHERE deleted_at IS NULL;

-- Status / admin queries
CREATE INDEX idx_families_status
  ON public.families (status, verification_status)
  WHERE deleted_at IS NULL;

-- Privacy filter
CREATE INDEX idx_families_privacy
  ON public.families (profile_privacy)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY: families
-- -----------------------------------------------------------------------------
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

-- Public families visible to everyone
CREATE POLICY "families_select_public"
  ON public.families
  FOR SELECT
  USING (
    profile_privacy = 'PUBLIC'
    AND deleted_at IS NULL
    AND status != 'ARCHIVED'
  );

-- Community/public families visible to authenticated users
CREATE POLICY "families_select_community"
  ON public.families
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND profile_privacy IN ('COMMUNITY', 'PUBLIC')
    AND deleted_at IS NULL
    AND status != 'ARCHIVED'
  );

-- Family members can see their own family regardless of privacy
-- PHASE 1 SIMPLIFICATION: Full family membership check added in Phase 3
-- For now: creator can see their created families
CREATE POLICY "families_select_creator"
  ON public.families
  FOR SELECT
  USING (
    auth.uid() = created_by
    AND deleted_at IS NULL
  );

-- Admins see all families
CREATE POLICY "families_select_admin"
  ON public.families
  FOR SELECT
  USING (public.is_community_moderator());

-- Authenticated users can create families
CREATE POLICY "families_insert_authenticated"
  ON public.families
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

-- Creator can update their own family (Phase 3: family heads also get this)
CREATE POLICY "families_update_creator"
  ON public.families
  FOR UPDATE
  USING (
    auth.uid() = created_by
    AND deleted_at IS NULL
  )
  WITH CHECK (auth.uid() = created_by);

-- Admins can update any family
CREATE POLICY "families_update_admin"
  ON public.families
  FOR UPDATE
  USING (public.is_community_moderator());

-- No hard deletes from client
CREATE POLICY "families_delete_deny"
  ON public.families
  FOR DELETE
  USING (FALSE);

-- =============================================================================
-- TABLE: public.family_members
-- Junction table: links persons to families with a role
-- =============================================================================
CREATE TABLE public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys — cascade delete: if family or person is deleted, remove membership
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,

  -- Role within this family
  role public.family_role NOT NULL DEFAULT 'EXTENDED',

  -- Is this person the head of this family?
  -- Only one head allowed per family (enforced by partial unique index below)
  is_head BOOLEAN NOT NULL DEFAULT FALSE,

  -- Temporal membership — supports historical family records
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When they joined this family
  left_at TIMESTAMPTZ,                            -- NULL if still a member; SET when they leave

  -- Record provenance
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A person can only appear once in a family at a time
  -- Soft membership history preserved via left_at
  UNIQUE (family_id, person_id)
);

COMMENT ON TABLE public.family_members IS
  'Junction table linking persons to families. Supports one person in multiple families '
  '(e.g., birth family + married family). Temporal: left_at tracks membership history.';

COMMENT ON COLUMN public.family_members.is_head IS
  'TRUE if this person is the current head of this family. '
  'At most one head per family — enforced by partial unique index.';
COMMENT ON COLUMN public.family_members.left_at IS
  'NULL = current active member. SET = former member (preserved for history).';

-- -----------------------------------------------------------------------------
-- INDEXES for family_members
-- -----------------------------------------------------------------------------

-- All members of a family — the most common query
CREATE INDEX idx_family_members_family_id
  ON public.family_members (family_id)
  WHERE left_at IS NULL;

-- All families a person belongs to
CREATE INDEX idx_family_members_person_id
  ON public.family_members (person_id)
  WHERE left_at IS NULL;

-- Find the head of a family
CREATE INDEX idx_family_members_head
  ON public.family_members (family_id, is_head)
  WHERE is_head = TRUE AND left_at IS NULL;

-- Role-based queries within a family
CREATE INDEX idx_family_members_role
  ON public.family_members (family_id, role)
  WHERE left_at IS NULL;

-- Only one head per family at any time
CREATE UNIQUE INDEX idx_family_members_one_head
  ON public.family_members (family_id)
  WHERE is_head = TRUE AND left_at IS NULL;

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY: family_members
-- -----------------------------------------------------------------------------
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- Authenticated users can see family members of COMMUNITY/PUBLIC families
-- PHASE 1 SIMPLIFICATION: Phase 3 will add member-specific visibility based
-- on the families.members_privacy field and the requesting user's membership.
CREATE POLICY "family_members_select_community"
  ON public.family_members
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_members.family_id
        AND f.profile_privacy IN ('COMMUNITY', 'PUBLIC')
        AND f.deleted_at IS NULL
        AND f.status != 'ARCHIVED'
    )
  );

-- A person's own user can see their own family memberships
CREATE POLICY "family_members_select_own"
  ON public.family_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = family_members.person_id
        AND p.user_id = auth.uid()
    )
  );

-- Admins see all family memberships
CREATE POLICY "family_members_select_admin"
  ON public.family_members
  FOR SELECT
  USING (public.is_community_moderator());

-- Family creators can add members (Phase 3: family heads also get this)
CREATE POLICY "family_members_insert_creator"
  ON public.family_members
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_members.family_id
        AND f.created_by = auth.uid()
        AND f.deleted_at IS NULL
    )
    AND added_by = auth.uid()
  );

-- Admins can insert family members
CREATE POLICY "family_members_insert_admin"
  ON public.family_members
  FOR INSERT
  WITH CHECK (public.is_community_moderator());

-- Family creators can update memberships
CREATE POLICY "family_members_update_creator"
  ON public.family_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_members.family_id
        AND f.created_by = auth.uid()
        AND f.deleted_at IS NULL
    )
  );

-- Admins can update any membership
CREATE POLICY "family_members_update_admin"
  ON public.family_members
  FOR UPDATE
  USING (public.is_community_moderator());

-- Family creators can remove members (soft: set left_at, hard: admin only)
CREATE POLICY "family_members_delete_creator"
  ON public.family_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_members.family_id
        AND f.created_by = auth.uid()
    )
  );

-- Admins can delete membership rows
CREATE POLICY "family_members_delete_admin"
  ON public.family_members
  FOR DELETE
  USING (public.is_community_moderator());
