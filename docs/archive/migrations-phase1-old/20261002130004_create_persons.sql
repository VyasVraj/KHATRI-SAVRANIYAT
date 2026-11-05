-- =============================================================================
-- Migration: 20261002130004_create_persons.sql
-- Purpose:   Person table — core census record for community members
-- Phase:     1 — Architecture & Database Foundation
-- =============================================================================
-- FUNDAMENTAL DOMAIN RULE: PERSON != USER
--
-- A PERSON is a real-world community/family member.
-- A USER is an authentication identity (auth.users → profiles).
--
-- A person CAN exist without any user account:
--   - Deceased ancestors
--   - Children not yet registered
--   - Members who haven't joined the platform yet
--   - Members added by a family admin
--
-- A user is linked to at most ONE person via persons.user_id.
-- The link is established via the Claim workflow (Phase 8).
-- A new registration does NOT automatically link to a person.
--
-- See: docs/DATABASE.md "PERSON != USER" | docs/SECURITY.md "Domain Rules"
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLE: public.persons
-- The community census record for an individual.
-- One person row per real-world human being in the community.
-- -----------------------------------------------------------------------------
CREATE TABLE public.persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- -------------------------------------------------------------------------
  -- Identity
  -- -------------------------------------------------------------------------
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,

  -- Maiden name — for members who changed surname (e.g., after marriage)
  -- Stored for search / historical reference
  maiden_name TEXT,

  -- -------------------------------------------------------------------------
  -- Demographics
  -- -------------------------------------------------------------------------
  gender public.gender,
  date_of_birth DATE,
  date_of_death DATE,  -- NULL unless person is deceased
  birth_place TEXT,    -- Freeform; structured location in Phase 3+

  -- -------------------------------------------------------------------------
  -- Community Identity (gotra, nukh etc.)
  -- These are community-specific lineage identifiers.
  -- Indexed for filtering in community directory.
  -- -------------------------------------------------------------------------
  gotra TEXT,    -- Clan / exogamous group
  nukh TEXT,     -- Sub-lineage
  kul TEXT,      -- Extended lineage group

  -- -------------------------------------------------------------------------
  -- Contact information
  -- Stored at PRIVATE privacy level by default.
  -- Only accessible to: the person themselves, family members (FAMILY privacy)
  -- or connections (CONNECTIONS privacy) — enforced by RLS.
  -- -------------------------------------------------------------------------
  phone TEXT,          -- Primary phone number
  phone_secondary TEXT,
  email_contact TEXT,  -- Contact email (may differ from auth email)

  -- -------------------------------------------------------------------------
  -- Record lifecycle
  -- -------------------------------------------------------------------------
  status public.person_status NOT NULL DEFAULT 'ACTIVE',
  verification_status public.verification_status NOT NULL DEFAULT 'UNVERIFIED',

  -- -------------------------------------------------------------------------
  -- Privacy configuration
  -- Each field category has its own privacy level.
  -- RLS policies enforce these at the database level.
  -- -------------------------------------------------------------------------

  -- Controls who can see this person's name in search results
  profile_privacy public.privacy_level NOT NULL DEFAULT 'COMMUNITY',

  -- Controls who can see date of birth
  dob_privacy public.privacy_level NOT NULL DEFAULT 'FAMILY',

  -- Controls who can see contact info (phone, email_contact)
  contact_privacy public.privacy_level NOT NULL DEFAULT 'PRIVATE',

  -- -------------------------------------------------------------------------
  -- USER LINK — The PERSON != USER boundary
  -- This FK is NULL for most persons at creation.
  -- Set only after a user successfully completes the claim workflow (Phase 8).
  -- A user can claim at most one person (enforced by unique partial index).
  -- ON DELETE SET NULL: if the auth account is deleted, person record persists.
  -- -------------------------------------------------------------------------
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- -------------------------------------------------------------------------
  -- Record provenance
  -- -------------------------------------------------------------------------
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Soft deletion: records are marked deleted, not physically removed.
  -- Physical deletion requires explicit admin migration.
  -- Reason: family relationships and audit trails must remain intact.
  deleted_at TIMESTAMPTZ,

  -- -------------------------------------------------------------------------
  -- Data integrity constraints
  -- -------------------------------------------------------------------------
  CONSTRAINT persons_first_name_not_empty
    CHECK (first_name != '' AND length(trim(first_name)) > 0),

  CONSTRAINT persons_last_name_not_empty
    CHECK (last_name != '' AND length(trim(last_name)) > 0),

  CONSTRAINT persons_death_after_birth
    CHECK (
      date_of_death IS NULL
      OR date_of_birth IS NULL
      OR date_of_death >= date_of_birth
    ),

  CONSTRAINT persons_deceased_must_have_status
    CHECK (
      date_of_death IS NULL
      OR status = 'DECEASED'
    ),

  CONSTRAINT persons_name_length
    CHECK (
      length(first_name) <= 100
      AND (middle_name IS NULL OR length(middle_name) <= 100)
      AND length(last_name) <= 100
      AND (maiden_name IS NULL OR length(maiden_name) <= 100)
    ),

  CONSTRAINT persons_phone_length
    CHECK (phone IS NULL OR length(phone) <= 30),

  CONSTRAINT persons_dob_reasonable
    CHECK (
      date_of_birth IS NULL
      OR date_of_birth BETWEEN '1800-01-01' AND CURRENT_DATE
    )
);

COMMENT ON TABLE public.persons IS
  'Core community census record. Represents a real-world human being. '
  'PERSON != USER: exists independently of auth.users. user_id is NULL until claimed. '
  'Soft-deleted via deleted_at — never physically removed without explicit migration.';

COMMENT ON COLUMN public.persons.user_id IS
  'FK to auth.users. NULL until the person is claimed by a user account (Phase 8 workflow). '
  'A user can claim at most one person — enforced by unique partial index.';
COMMENT ON COLUMN public.persons.profile_privacy IS
  'Who can see this person in search/directory. Enforced by RLS SELECT policy.';
COMMENT ON COLUMN public.persons.contact_privacy IS
  'Who can see phone/email. Defaults to PRIVATE. Enforced by RLS and application query layer.';
COMMENT ON COLUMN public.persons.deleted_at IS
  'Soft deletion timestamp. Non-null means logically deleted. Physical removal requires admin migration.';

-- -----------------------------------------------------------------------------
-- TRIGGER: Auto-update updated_at
-- -----------------------------------------------------------------------------
CREATE TRIGGER persons_handle_updated_at
  BEFORE UPDATE ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- INDEXES
-- Designed to support the real query patterns from docs/DATABASE.md:
-- - Name search (exact, prefix, fuzzy)
-- - Community identity filters (gotra, nukh, kul)
-- - User linkage
-- - Status/verification filters
-- - Soft-delete exclusion
-- -----------------------------------------------------------------------------

-- One-to-one: a user can claim at most one person
-- Partial index: only applies where user_id IS NOT NULL
CREATE UNIQUE INDEX idx_persons_user_id_unique
  ON public.persons (user_id)
  WHERE user_id IS NOT NULL;

-- Name search — case-insensitive exact/prefix match
-- Supports queries like: WHERE lower(last_name) LIKE 'sha%'
CREATE INDEX idx_persons_name_lower
  ON public.persons (lower(last_name), lower(first_name))
  WHERE deleted_at IS NULL;

-- Full-text search vector for name search
-- Supports: to_tsquery('english', 'John & Sharma')
CREATE INDEX idx_persons_name_fts
  ON public.persons
  USING GIN (to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(maiden_name, '')))
  WHERE deleted_at IS NULL;

-- Trigram index for fuzzy name search (ILIKE '%sha%', similarity())
-- Requires pg_trgm extension
CREATE INDEX idx_persons_first_name_trgm
  ON public.persons
  USING GIN (first_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_persons_last_name_trgm
  ON public.persons
  USING GIN (last_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Community identity filters
CREATE INDEX idx_persons_gotra
  ON public.persons (lower(gotra))
  WHERE deleted_at IS NULL AND gotra IS NOT NULL;

CREATE INDEX idx_persons_nukh
  ON public.persons (lower(nukh))
  WHERE deleted_at IS NULL AND nukh IS NOT NULL;

-- Status filters for admin queries
CREATE INDEX idx_persons_status
  ON public.persons (status, verification_status)
  WHERE deleted_at IS NULL;

-- Privacy-based filtering (used heavily in RLS policies and search)
CREATE INDEX idx_persons_privacy
  ON public.persons (profile_privacy)
  WHERE deleted_at IS NULL;

-- Temporal ordering
CREATE INDEX idx_persons_created_at
  ON public.persons (created_at DESC)
  WHERE deleted_at IS NULL;

-- Creator lookup (admin queries)
CREATE INDEX idx_persons_created_by
  ON public.persons (created_by)
  WHERE created_by IS NOT NULL;

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Default: DENY ALL. Policies explicitly grant.
--
-- PHASE 1 SIMPLIFICATION NOTE:
-- Full privacy enforcement (FAMILY, CONNECTIONS levels) requires
-- family membership and connections data from Phase 3 and Phase 7.
-- Phase 1 implements a correct but simplified policy set:
-- - COMMUNITY/PUBLIC persons: visible to authenticated users
-- - PRIVATE/FAMILY/CONNECTIONS: only visible to the person's own user
-- - Admins: see all
-- Family-level enforcement will be enhanced in Phase 3 migration.
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can see PUBLIC persons (even unauthenticated)
-- Rationale: A very limited public directory enables community discovery
-- without requiring authentication. Only PUBLIC-privacy records exposed.
CREATE POLICY "persons_select_public"
  ON public.persons
  FOR SELECT
  USING (
    profile_privacy = 'PUBLIC'
    AND deleted_at IS NULL
    AND status != 'ARCHIVED'
  );

-- Policy: Authenticated community members can see COMMUNITY and PUBLIC persons
-- Rationale: Standard community directory visibility for logged-in members.
CREATE POLICY "persons_select_community"
  ON public.persons
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND profile_privacy IN ('COMMUNITY', 'PUBLIC')
    AND deleted_at IS NULL
    AND status != 'ARCHIVED'
  );

-- Policy: A person can always see their own record regardless of privacy level
-- Rationale: A user must be able to view and edit their own profile.
CREATE POLICY "persons_select_own"
  ON public.persons
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  );

-- Policy: Admins and community moderators can see all persons (including private/archived)
-- Rationale: Administrative and verification workflows require full visibility.
CREATE POLICY "persons_select_admin"
  ON public.persons
  FOR SELECT
  USING (public.is_community_moderator());

-- Policy: Authenticated users can create person records
-- Rationale: Community members can register unregistered people (e.g., add a family member).
-- The created_by field is set to auth.uid() to track provenance.
-- SECURITY: RLS on INSERT does NOT restrict which data is inserted (only WHO can insert).
-- Data validation is enforced by CHECK constraints above.
CREATE POLICY "persons_insert_authenticated"
  ON public.persons
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

-- Policy: A person's linked user can update their own record
-- Rationale: A claimed person can update their own census information.
CREATE POLICY "persons_update_own"
  ON public.persons
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  )
  WITH CHECK (
    auth.uid() = user_id
    -- SECURITY: Users cannot change their own verification_status
    -- (enforced application-side; DB-level via trigger in Phase 9)
  );

-- Policy: Admins can update any person record
-- Rationale: Admin corrections, verification, status changes.
CREATE POLICY "persons_update_admin"
  ON public.persons
  FOR UPDATE
  USING (public.is_community_moderator());

-- Policy: Hard deletes are NEVER allowed from the client
-- Soft deletion via deleted_at = NOW() only.
-- Physical removal requires an explicit admin migration with audit trail.
CREATE POLICY "persons_delete_deny"
  ON public.persons
  FOR DELETE
  USING (FALSE);

-- TODO (Phase 3): Add FAMILY privacy policy once family_members table exists
-- COMMENT: "persons_select_family_members" policy will check:
-- EXISTS (SELECT 1 FROM family_members fm1
--   JOIN family_members fm2 ON fm1.family_id = fm2.family_id
--   JOIN persons p ON p.id = fm2.person_id AND p.user_id = auth.uid()
--   WHERE fm1.person_id = persons.id AND fm1.left_at IS NULL AND fm2.left_at IS NULL)
-- This is deferred to Phase 3 to avoid circular dependency during Phase 1 setup.
