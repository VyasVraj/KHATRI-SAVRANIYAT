-- =============================================================================
-- COMMUNITY ROOTS (KHATRI SARVANIYAT) — MASTER CONSOLIDATED DATABASE SCHEMA
-- Backend: Supabase PostgreSQL (Project: aodbcxpzpxyatiikqeic)
-- Generated: 2026-11-05T07:11:02.210Z
-- Authoritative 29 Brahm Kshatriya Gotras and 147 Nukhs included
-- =============================================================================



-- =============================================================================
-- >>> MIGRATION FILE: 20261002140000_phase1_foundation.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261002140000_phase1_foundation.sql
-- Purpose:   Canonical Phase 1 Database Foundation (Consolidated Baseline)
-- Phase:     1 — Architecture & Database Foundation
-- =============================================================================
-- This canonical baseline consolidates all Phase 1 schema, security, and
-- indexing requirements into a single, dependency-safe, deterministic migration:
--
--  1. PostgreSQL Extensions (uuid-ossp, pgcrypto, pg_trgm, unaccent)
--  2. Domain Enums (privacy_level, user_role, person_status, family_status,
--                   verification_status, gender, family_role, audit_action)
--  3. Foundational Trigger Functions (handle_updated_at)
--  4. User Profile Domain (public.profiles, indexes, updated_at trigger)
--  5. Role & Security Helpers (is_admin, is_community_moderator, get_my_role)
--  6. Supabase Auth Triggers (handle_new_user, handle_user_email_confirmed)
--  7. Profiles Row Level Security (all 6 policies, role-escalation protected)
--  8. Community Persons Domain (public.persons, indexes, RLS, PERSON != USER)
--  9. Families Domain (public.families, public.family_members, indexes, RLS)
-- 10. Audit Logging Domain (public.audit_logs, append-only RLS, log_audit_event)
-- =============================================================================

-- =============================================================================
-- SECTION 1: EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- =============================================================================
-- SECTION 2: DOMAIN ENUMS
-- (Idempotent DO-blocks prevent failures if enums already exist remotely)
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'privacy_level' AND n.nspname = 'public') THEN
    CREATE TYPE public.privacy_level AS ENUM (
      'PRIVATE',      -- Only the record owner / the person themselves
      'FAMILY',       -- Members of the person's families
      'CONNECTIONS',  -- Accepted connections only (Phase 7)
      'COMMUNITY',    -- All verified community members
      'PUBLIC'        -- Everyone including unauthenticated visitors
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'user_role' AND n.nspname = 'public') THEN
    CREATE TYPE public.user_role AS ENUM (
      'SUPER_ADMIN',          -- Full system access, can do anything
      'ADMIN',                -- Community administration
      'COMMUNITY_MODERATOR',  -- Content moderation and verification
      'COMMITTEE_MEMBER',     -- Committee-specific access
      'FAMILY_HEAD',          -- Manage their family's records
      'MEMBER',               -- Standard authenticated community member
      'GUEST'                 -- Limited access (e.g., invited but not verified)
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'person_status' AND n.nspname = 'public') THEN
    CREATE TYPE public.person_status AS ENUM (
      'DRAFT',    -- Being entered, not yet fully complete
      'ACTIVE',   -- Normal active record
      'ARCHIVED', -- Removed from active views but preserved
      'DECEASED'  -- Person is deceased (still preserved for family history)
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'family_status' AND n.nspname = 'public') THEN
    CREATE TYPE public.family_status AS ENUM (
      'DRAFT',    -- Being created via wizard
      'ACTIVE',   -- Fully created and active
      'ARCHIVED'  -- No longer active in directory
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'verification_status' AND n.nspname = 'public') THEN
    CREATE TYPE public.verification_status AS ENUM (
      'UNVERIFIED', -- Default, not yet submitted for verification
      'PENDING',    -- Submitted, awaiting review
      'VERIFIED',   -- Verified by admin/community moderator
      'REJECTED'    -- Verification rejected
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'gender' AND n.nspname = 'public') THEN
    CREATE TYPE public.gender AS ENUM (
      'MALE',
      'FEMALE',
      'OTHER',
      'PREFER_NOT_TO_SAY'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'family_role' AND n.nspname = 'public') THEN
    CREATE TYPE public.family_role AS ENUM (
      'HEAD',         -- Family head / principal member
      'SPOUSE',       -- Spouse of the head or another member
      'CHILD',        -- Child of head/spouse
      'PARENT',       -- Parent of head (e.g., living with family)
      'SIBLING',      -- Sibling of head
      'GRANDPARENT',  -- Grandparent
      'GRANDCHILD',   -- Grandchild
      'EXTENDED'      -- Any other extended family member
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'audit_action' AND n.nspname = 'public') THEN
    CREATE TYPE public.audit_action AS ENUM (
      'USER_REGISTERED',
      'USER_ROLE_CHANGED',
      'USER_DEACTIVATED',
      'USER_REACTIVATED',
      'PROFILE_UPDATED',
      'PERSON_CREATED',
      'PERSON_UPDATED',
      'PERSON_DELETED',
      'PERSON_CLAIMED',
      'PERSON_CLAIM_APPROVED',
      'PERSON_CLAIM_REJECTED',
      'PERSON_VERIFIED',
      'PERSON_VERIFICATION_REJECTED',
      'FAMILY_CREATED',
      'FAMILY_UPDATED',
      'FAMILY_DELETED',
      'FAMILY_MEMBER_ADDED',
      'FAMILY_MEMBER_REMOVED',
      'FAMILY_HEAD_CHANGED',
      'PRIVACY_CHANGED',
      'ADMIN_ACTION'
    );
  END IF;
END $$;

-- =============================================================================
-- SECTION 3: FOUNDATIONAL UTILITY FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_updated_at() IS
  'Trigger function: auto-sets updated_at = NOW() on UPDATE operations.';

-- =============================================================================
-- SECTION 4: USER PROFILES DOMAIN (public.profiles)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  -- Primary key is the auth.users UUID — enforces 1:1 relationship
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Auth-sync fields (kept in sync by triggers)
  email TEXT NOT NULL UNIQUE,

  -- Display preferences
  display_name TEXT,
  avatar_url TEXT,

  -- Application role — enforces RBAC
  role public.user_role NOT NULL DEFAULT 'MEMBER',

  -- Account state
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT profiles_display_name_length
    CHECK (display_name IS NULL OR (length(display_name) BETWEEN 1 AND 100)),
  CONSTRAINT profiles_avatar_url_format
    CHECK (avatar_url IS NULL OR avatar_url ~ '^https?://')
);

COMMENT ON TABLE public.profiles IS
  'One-to-one extension of auth.users. Stores display preferences and application role. '
  'NOT a person census record — see public.persons for census data. '
  'Created automatically by handle_new_user() trigger on auth.users INSERT.';

COMMENT ON COLUMN public.profiles.id IS 'FK to auth.users.id — enforces 1:1 relationship';
COMMENT ON COLUMN public.profiles.role IS 'Application RBAC role. Only admins can change this — enforced by RLS.';
COMMENT ON COLUMN public.profiles.is_active IS 'FALSE = suspended/deactivated account. Enforced in RLS and auth checks.';

-- Profiles Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles (lower(email));

CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles (role)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_profiles_is_active
  ON public.profiles (is_active)
  WHERE is_active = TRUE;

COMMENT ON INDEX idx_profiles_role IS 'Partial index on active profiles by role — used by admin check functions.';

-- Profiles Updated-At Trigger
DROP TRIGGER IF EXISTS profiles_handle_updated_at ON public.profiles;
CREATE TRIGGER profiles_handle_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- =============================================================================
-- SECTION 5: ROLE & SECURITY HELPERS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
      AND is_active = TRUE
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'RLS helper: returns TRUE if auth.uid() belongs to an ADMIN or SUPER_ADMIN. '
  'SECURITY DEFINER to bypass profiles RLS for this specific admin check.';

CREATE OR REPLACE FUNCTION public.is_community_moderator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MODERATOR')
      AND is_active = TRUE
  );
$$;

COMMENT ON FUNCTION public.is_community_moderator() IS
  'RLS helper: returns TRUE if auth.uid() is ADMIN, SUPER_ADMIN, or COMMUNITY_MODERATOR.';

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role::TEXT
  FROM public.profiles
  WHERE id = auth.uid()
    AND is_active = TRUE;
$$;

COMMENT ON FUNCTION public.get_my_role() IS
  'Returns the role string for the current auth.uid(). Returns NULL if not authenticated or inactive.';

-- =============================================================================
-- SECTION 6: SUPABASE AUTH TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    display_name,
    role,
    is_active,
    email_verified
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    'MEMBER',
    TRUE,
    COALESCE((NEW.email_confirmed_at IS NOT NULL), FALSE)
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auth trigger: creates a public.profiles row when auth.users receives a new user. '
  'Does NOT link to any person record — PERSON != USER boundary is maintained.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
      AND tgrelid = 'auth.users'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_user_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public.profiles
    SET
      email_verified = TRUE,
      email = NEW.email,
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_user_email_confirmed() IS
  'Auth trigger: marks email_verified = TRUE on the profile when email is confirmed.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_email_confirmed'
      AND tgrelid = 'auth.users'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER on_auth_user_email_confirmed
      AFTER UPDATE ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_user_email_confirmed();
  END IF;
END;
$$;

-- =============================================================================
-- SECTION 7: PROFILES ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role::TEXT = public.get_my_role()
    AND is_active = TRUE
  );

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin"
  ON public.profiles
  FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "profiles_insert_trigger_only" ON public.profiles;
CREATE POLICY "profiles_insert_trigger_only"
  ON public.profiles
  FOR INSERT
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "profiles_delete_deny" ON public.profiles;
CREATE POLICY "profiles_delete_deny"
  ON public.profiles
  FOR DELETE
  USING (FALSE);

-- =============================================================================
-- SECTION 8: COMMUNITY PERSONS DOMAIN (public.persons)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  maiden_name TEXT,

  -- Demographics
  gender public.gender,
  date_of_birth DATE,
  date_of_death DATE,
  birth_place TEXT,

  -- Community Lineage Identity
  gotra TEXT,
  nukh TEXT,
  kul TEXT,

  -- Contact Information (Default PRIVATE)
  phone TEXT,
  phone_secondary TEXT,
  email_contact TEXT,

  -- Record Lifecycle
  status public.person_status NOT NULL DEFAULT 'ACTIVE',
  verification_status public.verification_status NOT NULL DEFAULT 'UNVERIFIED',

  -- Privacy Configuration
  profile_privacy public.privacy_level NOT NULL DEFAULT 'COMMUNITY',
  dob_privacy public.privacy_level NOT NULL DEFAULT 'FAMILY',
  contact_privacy public.privacy_level NOT NULL DEFAULT 'PRIVATE',

  -- USER LINK — The PERSON != USER boundary
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Provenance & Soft-deletion
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- Constraints
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
  'FK to auth.users. NULL until the person is claimed by a user account. '
  'A user can claim at most one person — enforced by unique partial index.';
COMMENT ON COLUMN public.persons.profile_privacy IS
  'Who can see this person in search/directory. Enforced by RLS SELECT policy.';
COMMENT ON COLUMN public.persons.contact_privacy IS
  'Who can see phone/email. Defaults to PRIVATE. Enforced by RLS and application query layer.';
COMMENT ON COLUMN public.persons.deleted_at IS
  'Soft deletion timestamp. Non-null means logically deleted.';

-- Persons Updated-At Trigger
DROP TRIGGER IF EXISTS persons_handle_updated_at ON public.persons;
CREATE TRIGGER persons_handle_updated_at
  BEFORE UPDATE ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Persons Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_persons_user_id_unique
  ON public.persons (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_persons_name_lower
  ON public.persons (lower(last_name), lower(first_name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_persons_name_fts
  ON public.persons
  USING GIN (to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(maiden_name, '')))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_persons_first_name_trgm
  ON public.persons
  USING GIN (first_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_persons_last_name_trgm
  ON public.persons
  USING GIN (last_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_persons_gotra
  ON public.persons (lower(gotra))
  WHERE deleted_at IS NULL AND gotra IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_persons_nukh
  ON public.persons (lower(nukh))
  WHERE deleted_at IS NULL AND nukh IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_persons_status
  ON public.persons (status, verification_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_persons_privacy
  ON public.persons (profile_privacy)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_persons_created_at
  ON public.persons (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_persons_created_by
  ON public.persons (created_by)
  WHERE created_by IS NOT NULL;

-- Persons Row Level Security
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "persons_select_public" ON public.persons;
CREATE POLICY "persons_select_public"
  ON public.persons
  FOR SELECT
  USING (
    profile_privacy = 'PUBLIC'
    AND deleted_at IS NULL
    AND status != 'ARCHIVED'
  );

DROP POLICY IF EXISTS "persons_select_community" ON public.persons;
CREATE POLICY "persons_select_community"
  ON public.persons
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND profile_privacy IN ('COMMUNITY', 'PUBLIC')
    AND deleted_at IS NULL
    AND status != 'ARCHIVED'
  );

DROP POLICY IF EXISTS "persons_select_own" ON public.persons;
CREATE POLICY "persons_select_own"
  ON public.persons
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "persons_select_admin" ON public.persons;
CREATE POLICY "persons_select_admin"
  ON public.persons
  FOR SELECT
  USING (public.is_community_moderator());

DROP POLICY IF EXISTS "persons_insert_authenticated" ON public.persons;
CREATE POLICY "persons_insert_authenticated"
  ON public.persons
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND user_id IS NULL
  );

DROP POLICY IF EXISTS "persons_update_own" ON public.persons;
CREATE POLICY "persons_update_own"
  ON public.persons
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  )
  WITH CHECK (
    auth.uid() = user_id
  );

DROP POLICY IF EXISTS "persons_update_admin" ON public.persons;
CREATE POLICY "persons_update_admin"
  ON public.persons
  FOR UPDATE
  USING (public.is_community_moderator());

DROP POLICY IF EXISTS "persons_delete_deny" ON public.persons;
CREATE POLICY "persons_delete_deny"
  ON public.persons
  FOR DELETE
  USING (FALSE);

-- =============================================================================
-- SECTION 9: FAMILIES & MEMBERSHIP DOMAIN (public.families, family_members)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  family_name TEXT NOT NULL,
  description TEXT,

  -- Community Identity
  gotra TEXT,
  nukh TEXT,
  kul TEXT,

  -- Location
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'India',

  -- Status and Verification
  status public.family_status NOT NULL DEFAULT 'ACTIVE',
  verification_status public.verification_status NOT NULL DEFAULT 'UNVERIFIED',

  -- Privacy
  profile_privacy public.privacy_level NOT NULL DEFAULT 'COMMUNITY',
  members_privacy public.privacy_level NOT NULL DEFAULT 'COMMUNITY',

  -- Provenance & Soft-deletion
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT families_name_not_empty
    CHECK (family_name != '' AND length(trim(family_name)) > 0),
  CONSTRAINT families_name_length
    CHECK (length(family_name) <= 200),
  CONSTRAINT families_description_length
    CHECK (description IS NULL OR length(description) <= 2000)
);

COMMENT ON TABLE public.families IS
  'Family unit in the community census. Members are linked via public.family_members.';

COMMENT ON COLUMN public.families.profile_privacy IS 'Who can see this family in directory search.';
COMMENT ON COLUMN public.families.members_privacy IS 'Who can see the full member list of this family.';

-- Families Updated-At Trigger
DROP TRIGGER IF EXISTS families_handle_updated_at ON public.families;
CREATE TRIGGER families_handle_updated_at
  BEFORE UPDATE ON public.families
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Families Indexes
CREATE INDEX IF NOT EXISTS idx_families_name_lower
  ON public.families (lower(family_name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_families_fts
  ON public.families
  USING GIN (to_tsvector('english', coalesce(family_name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(city, '')))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_families_name_trgm
  ON public.families
  USING GIN (family_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_families_gotra
  ON public.families (lower(gotra))
  WHERE deleted_at IS NULL AND gotra IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_families_nukh
  ON public.families (lower(nukh))
  WHERE deleted_at IS NULL AND nukh IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_families_kul
  ON public.families (lower(kul))
  WHERE deleted_at IS NULL AND kul IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_families_location
  ON public.families (lower(country), lower(state), lower(city))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_families_status
  ON public.families (status, verification_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_families_privacy
  ON public.families (profile_privacy)
  WHERE deleted_at IS NULL;

-- Families Row Level Security
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "families_select_public" ON public.families;
CREATE POLICY "families_select_public"
  ON public.families
  FOR SELECT
  USING (
    profile_privacy = 'PUBLIC'
    AND deleted_at IS NULL
    AND status != 'ARCHIVED'
  );

DROP POLICY IF EXISTS "families_select_community" ON public.families;
CREATE POLICY "families_select_community"
  ON public.families
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND profile_privacy IN ('COMMUNITY', 'PUBLIC')
    AND deleted_at IS NULL
    AND status != 'ARCHIVED'
  );

DROP POLICY IF EXISTS "families_select_creator" ON public.families;
CREATE POLICY "families_select_creator"
  ON public.families
  FOR SELECT
  USING (
    auth.uid() = created_by
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "families_select_admin" ON public.families;
CREATE POLICY "families_select_admin"
  ON public.families
  FOR SELECT
  USING (public.is_community_moderator());

DROP POLICY IF EXISTS "families_insert_authenticated" ON public.families;
CREATE POLICY "families_insert_authenticated"
  ON public.families
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "families_update_creator" ON public.families;
CREATE POLICY "families_update_creator"
  ON public.families
  FOR UPDATE
  USING (
    auth.uid() = created_by
    AND deleted_at IS NULL
  )
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "families_update_admin" ON public.families;
CREATE POLICY "families_update_admin"
  ON public.families
  FOR UPDATE
  USING (public.is_community_moderator());

DROP POLICY IF EXISTS "families_delete_deny" ON public.families;
CREATE POLICY "families_delete_deny"
  ON public.families
  FOR DELETE
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- Junction Table: public.family_members
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role public.family_role NOT NULL DEFAULT 'EXTENDED',
  is_head BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (family_id, person_id)
);

COMMENT ON TABLE public.family_members IS
  'Junction table linking persons to families. Supports temporal membership via left_at.';

COMMENT ON COLUMN public.family_members.is_head IS
  'TRUE if this person is current head of family. At most one head per family.';

-- Family Members Indexes
CREATE INDEX IF NOT EXISTS idx_family_members_family_id
  ON public.family_members (family_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_family_members_person_id
  ON public.family_members (person_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_family_members_head
  ON public.family_members (family_id, is_head)
  WHERE is_head = TRUE AND left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_family_members_role
  ON public.family_members (family_id, role)
  WHERE left_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_family_members_one_head
  ON public.family_members (family_id)
  WHERE is_head = TRUE AND left_at IS NULL;

-- Family Members Row Level Security
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_members_select_community" ON public.family_members;
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

DROP POLICY IF EXISTS "family_members_select_own" ON public.family_members;
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

DROP POLICY IF EXISTS "family_members_select_admin" ON public.family_members;
CREATE POLICY "family_members_select_admin"
  ON public.family_members
  FOR SELECT
  USING (public.is_community_moderator());

DROP POLICY IF EXISTS "family_members_insert_creator" ON public.family_members;
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

DROP POLICY IF EXISTS "family_members_insert_admin" ON public.family_members;
CREATE POLICY "family_members_insert_admin"
  ON public.family_members
  FOR INSERT
  WITH CHECK (public.is_community_moderator());

DROP POLICY IF EXISTS "family_members_update_creator" ON public.family_members;
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
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.families f
      WHERE f.id = family_members.family_id
        AND f.created_by = auth.uid()
        AND f.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "family_members_update_admin" ON public.family_members;
CREATE POLICY "family_members_update_admin"
  ON public.family_members
  FOR UPDATE
  USING (public.is_community_moderator());

DROP POLICY IF EXISTS "family_members_delete_creator" ON public.family_members;
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

DROP POLICY IF EXISTS "family_members_delete_admin" ON public.family_members;
CREATE POLICY "family_members_delete_admin"
  ON public.family_members
  FOR DELETE
  USING (public.is_community_moderator());

-- =============================================================================
-- SECTION 10: AUDIT LOGS DOMAIN (public.audit_logs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action public.audit_action NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type TEXT,
  target_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_logs_target_type_length
    CHECK (target_type IS NULL OR length(target_type) <= 50),
  CONSTRAINT audit_logs_user_agent_length
    CHECK (user_agent IS NULL OR length(user_agent) <= 512)
);

COMMENT ON TABLE public.audit_logs IS
  'Immutable append-only security and compliance audit log. '
  'No UPDATE or DELETE allowed by any RLS policy.';

COMMENT ON COLUMN public.audit_logs.actor_id IS 'The authenticated user who performed the action.';
COMMENT ON COLUMN public.audit_logs.created_at IS 'Server-side timestamp — always NOW().';

-- Audit Logs Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON public.audit_logs (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON public.audit_logs (target_type, target_id, created_at DESC)
  WHERE target_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs (created_at DESC);

-- Audit Logs Row Level Security (APPEND-ONLY)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin"
  ON public.audit_logs
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "audit_logs_insert_trigger_only" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_trigger_only"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (FALSE);

-- NO UPDATE POLICY (Denied by default)
-- NO DELETE POLICY (Denied by default)

-- Audit Event Logging Utility Function
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action public.audit_action,
  p_target_type TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    action,
    actor_id,
    target_type,
    target_id,
    old_data,
    new_data,
    metadata,
    created_at
  ) VALUES (
    p_action,
    auth.uid(),
    p_target_type,
    p_target_id,
    p_old_data,
    p_new_data,
    p_metadata,
    NOW()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_audit_event IS
  'SECURITY DEFINER helper to insert audit entries. '
  'Restricted to trusted server-side code and database triggers — direct client execution revoked.';

-- Restrict function execution: prevent direct invocation by untrusted clients via RPC
REVOKE EXECUTE ON FUNCTION public.log_audit_event(public.audit_action, TEXT, UUID, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(public.audit_action, TEXT, UUID, JSONB, JSONB, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(public.audit_action, TEXT, UUID, JSONB, JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(public.audit_action, TEXT, UUID, JSONB, JSONB, JSONB) TO service_role;



-- =============================================================================
-- >>> MIGRATION FILE: 20261003100000_grant_authenticated_table_privileges.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261003100000_grant_authenticated_table_privileges.sql
-- Purpose:   Grant minimum table-level privileges to the authenticated role
-- Phase:     Foundation Hotfix (PostgREST Access Control Gate 1)
-- =============================================================================
--
-- ARCHITECTURE & SECURITY EXPLANATION:
--
-- 1. TWO-GATE ACCESS CONTROL:
--    PostgreSQL evaluates authorization in two sequential steps:
--      Gate 1 (Table Privileges): Discretionary table grants (GRANT SELECT, ...)
--      Gate 2 (Row Level Security): RLS policies (USING / WITH CHECK clauses)
--    Without Gate 1 table grants, PostgREST requests immediately fail with
--    error 42501 (insufficient_privilege / permission denied) before Gate 2
--    RLS policies can be evaluated.
--
-- 2. RLS POLICIES REMAIN THE SOURCE OF TRUTH:
--    RLS is enabled on all tables (profiles, persons, families, family_members,
--    audit_logs) and remains fully active. These table grants DO NOT bypass RLS.
--    Every query executed by an authenticated user is still strictly governed
--    by existing RLS policies (e.g., profiles_select_own, persons_select_community).
--
-- 3. STRICT LEAST PRIVILEGE:
--    - NO table privileges are granted to `anon`. Anonymous visitors cannot
--      access private application tables directly.
--    - NO `GRANT ALL` or schema-level wildcards are used.
--    - `profiles`: SELECT + UPDATE only. INSERT is reserved for the
--      SECURITY DEFINER trigger `handle_new_user()`. DELETE is prohibited.
--    - `persons`: SELECT + INSERT + UPDATE only. DELETE is soft-deletion
--      managed via UPDATE on `deleted_at`. Physical DELETE is prohibited.
--    - `families`: SELECT + INSERT + UPDATE only. DELETE is soft-deletion
--      managed via UPDATE on `deleted_at`. Physical DELETE is prohibited.
--    - `family_members`: SELECT + INSERT + UPDATE + DELETE. Family creators
--      and moderators are permitted to remove members per existing RLS.
--    - `audit_logs`: SELECT only (for administrators via is_admin() RLS).
--      INSERT is handled exclusively by SECURITY DEFINER function
--      `log_audit_event()`. UPDATE and DELETE are strictly prohibited.
--
-- =============================================================================

-- 1. Profiles
-- Authenticated users can read permitted profiles (own/admin) and update
-- permitted fields under existing profiles RLS policies.
GRANT SELECT, UPDATE
ON TABLE public.profiles
TO authenticated;

-- 2. Persons
-- Authenticated users can search/view active community records, draft/create
-- new person records, and update records they own or moderate under existing RLS.
GRANT SELECT, INSERT, UPDATE
ON TABLE public.persons
TO authenticated;

-- 3. Families
-- Authenticated users can view community families, create families via the wizard,
-- and update families they created or moderate under existing families RLS.
GRANT SELECT, INSERT, UPDATE
ON TABLE public.families
TO authenticated;

-- 4. Family Members
-- Authenticated creators and moderators can view memberships, add members,
-- update membership roles, and remove member records under existing RLS.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.family_members
TO authenticated;

-- 5. Audit Logs
-- Authenticated administrators can read audit entries governed by audit_logs_select_admin.
-- Direct table INSERT remains blocked by audit_logs_insert_trigger_only WITH CHECK (FALSE);
-- all audit logging occurs via the SECURITY DEFINER function public.log_audit_event().
GRANT SELECT
ON TABLE public.audit_logs
TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261004150000_create_relationships.sql <<<
-- =============================================================================

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



-- =============================================================================
-- >>> MIGRATION FILE: 20261005170000_create_connections.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261005170000_create_connections.sql
-- Purpose:   Create canonical public.connections table, connection_status enum,
--             canonical ordering constraints, indexes, RLS policies, trigger,
--             and table privileges.
-- Phase:     Phase 7 — Subtask 1 (Connections Foundation)
-- =============================================================================
--
-- ARCHITECTURE & SECURITY RULES:
-- 1. USER ↔ USER CONNECTION MODEL:
--    Connections operate strictly between authenticated user profiles (public.profiles.id).
--    They represent social links between living users of the platform.
--    PERSON != USER:
--    Connections do NOT link public.persons records directly.
--    Linking to census individuals is governed by profiles.person_id / claims (Phase 8).
--
-- 2. ONE CANONICAL ROW PER PAIR (NO BIDIRECTIONAL DUPLICATION):
--    A connection between User A and User B is stored in exactly ONE row.
--    To ensure absolute uniqueness at the database level regardless of who initiates,
--    an expression-based unique index on (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))
--    guarantees that (A, B) and (B, A) can never coexist simultaneously.
--
-- 3. STATUS LIFECYCLE:
--    - PENDING: Request initiated by requester_id; awaiting decision by addressee_id.
--    - ACCEPTED: Accepted by addressee_id; mutual connection established.
--    - REJECTED: Declined by addressee_id.
--    - BLOCKED: Established by either participant; disables connection visibility.
--
-- 4. TWO-GATE ACCESS CONTROL (LEAST PRIVILEGE):
--    - Gate 1: authenticated role granted SELECT, INSERT, UPDATE, DELETE.
--              anon and PUBLIC are granted zero privileges (revoked, deny-by-default).
--    - Gate 2 (RLS): Strict row-level isolation:
--      - SELECT: User must be requester_id OR addressee_id.
--      - INSERT: auth.uid() must equal requester_id, status must be 'PENDING',
--                and requester_id != addressee_id.
--      - UPDATE:
--          * Addressee can transition PENDING -> ACCEPTED or PENDING -> REJECTED.
--          * Either participant can transition to BLOCKED.
--          * Identity fields (id, requester_id, addressee_id, created_at) are immutable.
--      - DELETE: Either participant can delete an existing connection row.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enum: public.connection_status
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regtype('public.connection_status') IS NULL THEN
    CREATE TYPE public.connection_status AS ENUM (
      'PENDING',
      'ACCEPTED',
      'REJECTED',
      'BLOCKED'
    );
  END IF;
END $$;

COMMENT ON TYPE public.connection_status IS
  'Connection lifecycle states: '
  'PENDING (initiated by requester), '
  'ACCEPTED (approved by addressee), '
  'REJECTED (declined by addressee), '
  'BLOCKED (blocked by either participant).';

-- -----------------------------------------------------------------------------
-- 2. Table: public.connections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Participants (Foreign keys reference public.profiles.id)
  -- ON DELETE CASCADE ensures account deletion cleans up social graph edges
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Status & Lifecycle
  status public.connection_status NOT NULL DEFAULT 'PENDING',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Integrity Constraints
  -- 1. Disallow self-connections
  CONSTRAINT connections_no_self_connection
    CHECK (requester_id <> addressee_id)
);

COMMENT ON TABLE public.connections IS
  'Social connections between authenticated users (public.profiles.id). '
  'Represents user-to-user networking and relationship verification. '
  'Enforces exactly one row per unordered user pair.';

COMMENT ON COLUMN public.connections.requester_id IS 'UUID of the user who initiated the connection request.';
COMMENT ON COLUMN public.connections.addressee_id IS 'UUID of the user receiving the connection request.';
COMMENT ON COLUMN public.connections.status IS 'Current lifecycle status (PENDING, ACCEPTED, REJECTED, BLOCKED).';

-- -----------------------------------------------------------------------------
-- 3. Indexes & Unordered Pair Uniqueness
-- -----------------------------------------------------------------------------

-- 3.1 Unordered Canonical Pair Uniqueness
-- Prevents duplicate opposing or concurrent rows: e.g. (A, B) and (B, A)
CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_canonical_pair
  ON public.connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

-- 3.2 Requester queries (outgoing requests, sent connections)
CREATE INDEX IF NOT EXISTS idx_connections_requester_id
  ON public.connections (requester_id);

-- 3.3 Addressee queries (incoming requests, pending approvals)
CREATE INDEX IF NOT EXISTS idx_connections_addressee_id
  ON public.connections (addressee_id);

-- 3.4 Status filter queries
CREATE INDEX IF NOT EXISTS idx_connections_status
  ON public.connections (status);

-- 3.5 Composite status + participant queries
CREATE INDEX IF NOT EXISTS idx_connections_requester_status
  ON public.connections (requester_id, status);

CREATE INDEX IF NOT EXISTS idx_connections_addressee_status
  ON public.connections (addressee_id, status);

-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------

-- 4.1 Updated-At Trigger (reuses existing public.handle_updated_at function)
DROP TRIGGER IF EXISTS connections_handle_updated_at ON public.connections;
CREATE TRIGGER connections_handle_updated_at
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4.2 Immutability Guard: Prevent altering participants, id, or created_at
CREATE OR REPLACE FUNCTION public.handle_connection_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Disallow mutating core identity fields
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'connections.id is immutable';
  END IF;

  IF NEW.requester_id <> OLD.requester_id THEN
    RAISE EXCEPTION 'connections.requester_id is immutable';
  END IF;

  IF NEW.addressee_id <> OLD.addressee_id THEN
    RAISE EXCEPTION 'connections.addressee_id is immutable';
  END IF;

  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'connections.created_at is immutable';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_connection_update_guard() IS
  'Integrity trigger: blocks mutations to id, requester_id, addressee_id, and created_at.';

DROP TRIGGER IF EXISTS connections_update_guard ON public.connections;
CREATE TRIGGER connections_update_guard
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_connection_update_guard();

-- 4.3 Lifecycle Guard Trigger: Enforces authoritative state machine transitions
-- Rules for normal participants:
-- - PENDING  -> ACCEPTED or REJECTED (only addressee)
-- - PENDING  -> BLOCKED (either participant)
-- - ACCEPTED -> BLOCKED (either participant)
-- - REJECTED -> BLOCKED (either participant)
-- - All other participant transitions are rejected (e.g. ACCEPTED -> REJECTED, REJECTED -> ACCEPTED, BLOCKED mutations)
-- - Community moderators/administrators retain discretion to correct status
CREATE OR REPLACE FUNCTION public.handle_connection_status_transition_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- 1. If caller is an active community moderator or administrator, permit moderation overrides
  IF public.is_community_moderator() THEN
    RETURN NEW;
  END IF;

  -- 2. Normal participant transition matrix:
  IF OLD.status = 'PENDING' THEN
    IF NEW.status IN ('ACCEPTED', 'REJECTED') THEN
      -- Only the addressee can accept or reject a pending request
      IF auth.uid() <> OLD.addressee_id THEN
        RAISE EXCEPTION 'Only the addressee can accept or reject a pending connection request';
      END IF;
      RETURN NEW;
    ELSIF NEW.status = 'BLOCKED' THEN
      -- Either participant can transition PENDING -> BLOCKED
      IF auth.uid() <> OLD.requester_id AND auth.uid() <> OLD.addressee_id THEN
        RAISE EXCEPTION 'Only connection participants can block';
      END IF;
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Invalid connection status transition from PENDING to %', NEW.status;
    END IF;

  ELSIF OLD.status = 'ACCEPTED' THEN
    IF NEW.status = 'BLOCKED' THEN
      -- Either participant can transition ACCEPTED -> BLOCKED
      IF auth.uid() <> OLD.requester_id AND auth.uid() <> OLD.addressee_id THEN
        RAISE EXCEPTION 'Only connection participants can block';
      END IF;
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Invalid connection status transition from ACCEPTED to %', NEW.status;
    END IF;

  ELSIF OLD.status = 'REJECTED' THEN
    IF NEW.status = 'BLOCKED' THEN
      -- Either participant can transition REJECTED -> BLOCKED
      IF auth.uid() <> OLD.requester_id AND auth.uid() <> OLD.addressee_id THEN
        RAISE EXCEPTION 'Only connection participants can block';
      END IF;
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Invalid connection status transition from REJECTED to %', NEW.status;
    END IF;

  ELSIF OLD.status = 'BLOCKED' THEN
    -- Participants cannot mutate BLOCKED connections (including BLOCKED -> BLOCKED)
    RAISE EXCEPTION 'Participants cannot modify a BLOCKED connection';

  ELSE
    RAISE EXCEPTION 'Unknown connection status %', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_connection_status_transition_guard() IS
  'Authoritative lifecycle trigger enforcing valid state machine transitions: '
  'PENDING -> ACCEPTED/REJECTED (addressee only), '
  'PENDING/ACCEPTED/REJECTED -> BLOCKED (participants), '
  'and blocking all invalid transitions (ACCEPTED -> REJECTED, REJECTED -> ACCEPTED, BLOCKED mutations).';

DROP TRIGGER IF EXISTS connections_status_transition_guard ON public.connections;
CREATE TRIGGER connections_status_transition_guard
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_connection_status_transition_guard();

-- -----------------------------------------------------------------------------
-- 5. Row Level Security (Two-Gate Access Control — Gate 2)
-- -----------------------------------------------------------------------------

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

-- 5.1 SELECT: Participant-only visibility
-- Users can only read connection records in which they are either the requester or addressee.
-- Administrators can inspect all records for community safety and moderation.
DROP POLICY IF EXISTS "connections_select_participants" ON public.connections;
CREATE POLICY "connections_select_participants"
  ON public.connections
  FOR SELECT
  USING (
    auth.uid() = requester_id
    OR auth.uid() = addressee_id
    OR public.is_community_moderator()
  );

-- 5.2 INSERT: Requester-only insertion of PENDING connections
-- An authenticated user can only send requests where:
-- - They are the requester (auth.uid() = requester_id)
-- - Initial status is strictly 'PENDING'
-- - Self-connection is rejected
DROP POLICY IF EXISTS "connections_insert_requester" ON public.connections;
CREATE POLICY "connections_insert_requester"
  ON public.connections
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = requester_id
    AND requester_id <> addressee_id
    AND status = 'PENDING'
  );

-- 5.3 UPDATE: Addressee response or participant blocking
-- Rules:
-- - The addressee can update a PENDING request to ACCEPTED or REJECTED.
-- - Either participant (requester or addressee) can transition the connection to BLOCKED.
-- - An active moderator can update connection status for moderation purposes.
DROP POLICY IF EXISTS "connections_update_participants" ON public.connections;
CREATE POLICY "connections_update_participants"
  ON public.connections
  FOR UPDATE
  USING (
    auth.uid() = requester_id
    OR auth.uid() = addressee_id
    OR public.is_community_moderator()
  )
  WITH CHECK (
    -- Moderators can update to any valid state
    public.is_community_moderator()
    OR
    -- Either participant can set BLOCKED
    (status = 'BLOCKED' AND (auth.uid() = requester_id OR auth.uid() = addressee_id))
    OR
    -- Only addressee can accept or reject a pending request
    (
      auth.uid() = addressee_id
      AND status IN ('ACCEPTED', 'REJECTED')
    )
  );

-- 5.4 DELETE: Participant cancellation/removal (BLOCKED deletion restricted to moderators/admins)
-- Rules:
-- - Active community moderators/administrators can delete any connection row, including BLOCKED, for moderation.
-- - Participants can delete/cancel PENDING, remove ACCEPTED, or clean up REJECTED connections.
-- - Participants MUST NOT delete BLOCKED connections (prevents bypassing block by deleting & re-requesting).
DROP POLICY IF EXISTS "connections_delete_participants" ON public.connections;
CREATE POLICY "connections_delete_participants"
  ON public.connections
  FOR DELETE
  USING (
    public.is_community_moderator()
    OR (
      (auth.uid() = requester_id OR auth.uid() = addressee_id)
      AND status <> 'BLOCKED'
    )
  );

COMMENT ON POLICY "connections_delete_participants" ON public.connections IS
  'Allows participants to delete PENDING, ACCEPTED, or REJECTED connections. '
  'BLOCKED connections can ONLY be deleted by community moderators or administrators.';

-- -----------------------------------------------------------------------------
-- 6. Helper Function: are_users_connected (SECURITY DEFINER)
-- -----------------------------------------------------------------------------
-- Used by mutual connection calculations and subsequent Phase 7 Subtask 3 privacy checks.
-- STABLE and sets search_path = public to prevent SQL injection.
-- Enforces caller authorization to prevent arbitrary social-graph probing (oracle attack):
-- - Unauthenticated callers return FALSE.
-- - Authenticated caller must be user_a, user_b, or an active community moderator/admin.
-- - Only status = 'ACCEPTED' returns TRUE.
CREATE OR REPLACE FUNCTION public.are_users_connected(user_a UUID, user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    -- 1. Unauthenticated callers or null arguments: return FALSE safely
    WHEN auth.uid() IS NULL OR user_a IS NULL OR user_b IS NULL THEN FALSE

    -- 2. Caller authorization: caller must be user_a, user_b, or an active community moderator/admin
    -- Prevents arbitrary third-party probing of the social graph
    WHEN auth.uid() <> user_a AND auth.uid() <> user_b AND NOT public.is_community_moderator() THEN FALSE

    -- 3. Check for active ACCEPTED connection between user_a and user_b
    ELSE EXISTS (
      SELECT 1
      FROM public.connections
      WHERE status = 'ACCEPTED'
        AND (
          (requester_id = user_a AND addressee_id = user_b)
          OR
          (requester_id = user_b AND addressee_id = user_a)
        )
    )
  END;
$$;

COMMENT ON FUNCTION public.are_users_connected(UUID, UUID) IS
  'Returns TRUE if user_a and user_b share an active ACCEPTED connection. '
  'Enforces caller authorization: caller must be user_a, user_b, or an active moderator/admin.';

-- -----------------------------------------------------------------------------
-- 7. Table Privileges (Two-Gate Access Control — Gate 1)
-- -----------------------------------------------------------------------------
-- Revoke all privileges from PUBLIC and anon (deny-by-default at Gate 1)
REVOKE ALL ON TABLE public.connections FROM PUBLIC;
REVOKE ALL ON TABLE public.connections FROM anon;

-- Grant required operational privileges to authenticated role (SELECT, INSERT, UPDATE, DELETE)
REVOKE ALL ON TABLE public.connections FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.connections
TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261005180000_add_connections_privacy_to_persons.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261005180000_add_connections_privacy_to_persons.sql
-- Purpose:   Add connection-aware RLS SELECT policy to public.persons and harden
--             execution privileges on public.are_users_connected helper function.
-- Phase:     Phase 7 — Subtask 3 (Connection-Aware Privacy & Cross-Domain Integration)
-- =============================================================================
--
-- ARCHITECTURE & SECURITY RULES:
-- 1. PERSON != USER BOUNDARY:
--    A person record (public.persons) represents a human census entity.
--    A user record (auth.users / public.profiles) represents an authenticated account.
--    Connections operate strictly USER ↔ USER (public.connections).
--    The bridge between a person and a user is exclusively persons.user_id.
--    If persons.user_id IS NULL (unlinked/unclaimed person), connections-based
--    visibility can NEVER be satisfied. No heuristic or name matching is allowed.
--
-- 2. CONNECTIONS PRIVACY TIER:
--    When persons.profile_privacy = 'CONNECTIONS', the record is visible ONLY to:
--    - The linked owner account itself (auth.uid() = persons.user_id via persons_select_own)
--    - An authenticated user who shares an active, ACCEPTED connection with the linked user
--      (public.are_users_connected(auth.uid(), persons.user_id) = TRUE)
--    - Community moderators/administrators (via persons_select_admin)
--
-- 3. STRICT STATE VALIDATION:
--    Only status = 'ACCEPTED' in public.connections grants access.
--    PENDING, REJECTED, and BLOCKED statuses MUST NEVER satisfy connections privacy.
--    Soft-deleted persons (deleted_at IS NOT NULL) and ARCHIVED persons (status = 'ARCHIVED')
--    remain strictly inaccessible.
--
-- 4. LEAST PRIVILEGE FUNCTION HARDENING:
--    public.are_users_connected(UUID, UUID) is SECURITY DEFINER with search_path = public.
--    Revoke all execution privileges from PUBLIC and anon.
--    Grant execution exclusively to authenticated users.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Function Privilege Hardening & Caller Authorization: public.are_users_connected
-- -----------------------------------------------------------------------------
-- Enforces caller authorization to prevent arbitrary social-graph probing (oracle attack):
-- - Unauthenticated callers return FALSE.
-- - Authenticated caller must be user_a, user_b, or an active community moderator/admin.
-- - Only status = 'ACCEPTED' returns TRUE.
CREATE OR REPLACE FUNCTION public.are_users_connected(user_a UUID, user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    -- 1. Unauthenticated callers or null arguments: return FALSE safely
    WHEN auth.uid() IS NULL OR user_a IS NULL OR user_b IS NULL THEN FALSE

    -- 2. Caller authorization: caller must be user_a, user_b, or an active community moderator/admin
    -- Prevents arbitrary third-party probing of the social graph
    WHEN auth.uid() <> user_a AND auth.uid() <> user_b AND NOT public.is_community_moderator() THEN FALSE

    -- 3. Check for active ACCEPTED connection between user_a and user_b
    ELSE EXISTS (
      SELECT 1
      FROM public.connections
      WHERE status = 'ACCEPTED'
        AND (
          (requester_id = user_a AND addressee_id = user_b)
          OR
          (requester_id = user_b AND addressee_id = user_a)
        )
    )
  END;
$$;

COMMENT ON FUNCTION public.are_users_connected(UUID, UUID) IS
  'Returns TRUE if user_a and user_b share an active ACCEPTED connection. '
  'Enforces caller authorization: caller must be user_a, user_b, or an active moderator/admin.';

-- Ensure unauthenticated visitors (anon) and the PUBLIC pseudo-role cannot execute
-- the helper function directly. Only authenticated sessions may invoke it.
REVOKE ALL ON FUNCTION public.are_users_connected(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.are_users_connected(UUID, UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.are_users_connected(UUID, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Row Level Security Policy: persons_select_connections
-- -----------------------------------------------------------------------------
-- Allows authenticated members to read census persons with profile_privacy = 'CONNECTIONS'
-- if the person is linked to a user account, not soft-deleted, not archived,
-- and the viewer has an active ACCEPTED connection with the linked account.
DROP POLICY IF EXISTS "persons_select_connections" ON public.persons;

CREATE POLICY "persons_select_connections"
  ON public.persons
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND profile_privacy = 'CONNECTIONS'
    AND user_id IS NOT NULL
    AND deleted_at IS NULL
    AND status != 'ARCHIVED'
    AND public.are_users_connected(auth.uid(), user_id)
  );

COMMENT ON POLICY "persons_select_connections" ON public.persons IS
  'Grants SELECT on persons with profile_privacy = ''CONNECTIONS'' to authenticated users '
  'who share an active ACCEPTED connection with the linked user account (persons.user_id). '
  'Requires active status and non-deleted state.';



-- =============================================================================
-- >>> MIGRATION FILE: 20261006090000_create_claims_and_invitations.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261006090000_create_claims_and_invitations.sql
-- Purpose:   Create canonical person_claims and invitations tables, enums,
--             lifecycle transition guards, immutability guards, atomic claim
--             approval and rejection functions, RLS policies, and privileges.
-- Phase:     Phase 8 — Subtask 1 (Claim & Invitation Foundation)
-- =============================================================================
--
-- ARCHITECTURE & SECURITY RULES:
-- 1. PERSON != USER BOUNDARY:
--    A person record (public.persons) represents a real-world human census entity.
--    A user record (auth.users / public.profiles) represents an authenticated account.
--    Claiming bridges a person to a user via persons.user_id.
--    Normal users MUST NEVER directly update persons.user_id.
--    Linkage occurs strictly via verified, authoritative workflows (approve_person_claim).
--
-- 2. ONE-TO-ONE IDENTITY INVARIANT:
--    A user account can be linked to at most ONE person record.
--    A person record can be linked to at most ONE user account.
--    Enforced at DB level by idx_persons_user_id_unique, partial unique indexes
--    on person_claims (at most 1 PENDING claim per person, at most 1 PENDING claim
--    per claimant), and atomic checks in approve_person_claim across ALL person
--    records (regardless of soft-deletion/archival status).
--
-- 3. CLAIM LIFECYCLE STATE MACHINE:
--    - PENDING: Claim submitted by claimant; awaiting review.
--    - APPROVED: Verified by authorized reviewer; atomically links persons.user_id.
--    - REJECTED: Denied by reviewer with mandatory rejection reason.
--    - CANCELLED: Withdrawn by claimant prior to review (reviewed_by, reviewed_at,
--      and rejection_reason are strictly NULL).
--    - Terminal states (APPROVED, REJECTED, CANCELLED) are strictly immutable.
--    - NO DIRECT UPDATE BYPASS: Moderators/admins MUST use approve_person_claim()
--      or reject_person_claim(); direct table UPDATE by moderators is completely blocked.
--
-- 4. HISTORICAL CLAIM PRESERVATION & TARGET INVARIANTS:
--    - person_claims.person_id uses ON DELETE RESTRICT to guarantee claim audit
--      history is never silently wiped by a cascading deletion.
--    - A claim can ONLY target an eligible census person:
--      - Must have user_id IS NULL (unclaimed).
--      - Must have deleted_at IS NULL (not soft-deleted).
--      - Must have status = 'ACTIVE' (not ARCHIVED or DRAFT).
--      - Must have date_of_death IS NULL (deceased individuals cannot be claimed).
--
-- 5. TWO-GATE ACCESS CONTROL & INVITATION TOKEN PROTECTION:
--    - Gate 1: authenticated role granted SELECT, INSERT, UPDATE on person_claims.
--      On invitations, authenticated role is granted column-level SELECT and column-level
--      INSERT strictly on metadata columns — token_hash is withheld from client SELECT
--      and INSERT queries. Token generation and secure hash storage are managed by
--      the server-side workflow.
--      anon and PUBLIC are revoked all table and function privileges (deny-by-default).
--    - Gate 2 (RLS): Strict row-level isolation for claimants, inviters, and moderators.
--
-- 6. IMMUTABLE AUDIT LOGGING:
--    All claim approvals and rejections record immutable events in public.audit_logs
--    via public.log_audit_event() with server-verified actor IDs and timestamps.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums: public.claim_status and public.invitation_status
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regtype('public.claim_status') IS NULL THEN
    CREATE TYPE public.claim_status AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'CANCELLED'
    );
  END IF;
END $$;

COMMENT ON TYPE public.claim_status IS
  'Lifecycle states for person record ownership claims: '
  'PENDING (submitted, awaiting review), '
  'APPROVED (verified by moderator, person linked), '
  'REJECTED (denied with reason), '
  'CANCELLED (withdrawn by claimant).';

DO $$
BEGIN
  IF to_regtype('public.invitation_status') IS NULL THEN
    CREATE TYPE public.invitation_status AS ENUM (
      'PENDING',
      'ACCEPTED',
      'REVOKED',
      'EXPIRED'
    );
  END IF;
END $$;

COMMENT ON TYPE public.invitation_status IS
  'Lifecycle states for family and platform invitations: '
  'PENDING (active, awaiting redemption), '
  'ACCEPTED (redeemed by invitee), '
  'REVOKED (cancelled by inviter), '
  'EXPIRED (past expiration date).';

-- -----------------------------------------------------------------------------
-- 2. Table: public.person_claims
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.person_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target person census record (ON DELETE RESTRICT preserves claim audit trail)
  person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,

  -- Claimant user account
  claimant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Claim workflow status
  status public.claim_status NOT NULL DEFAULT 'PENDING',

  -- Evidence and reasoning submitted by claimant
  evidence_notes TEXT,

  -- Reviewer notes on rejection
  rejection_reason TEXT,

  -- Reviewer attribution
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT person_claims_evidence_length
    CHECK (evidence_notes IS NULL OR char_length(evidence_notes) <= 1000),

  CONSTRAINT person_claims_rejection_reason_length
    CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),

  CONSTRAINT person_claims_reviewed_consistency
    CHECK (
      (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
      OR (status = 'CANCELLED' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
      OR (status = 'APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL)
      OR (status = 'REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NOT NULL)
    )
);

COMMENT ON TABLE public.person_claims IS
  'Formal claims by authenticated users to link their user account to an existing census person record. '
  'PERSON != USER: Claim workflow controls the assignment of persons.user_id.';

COMMENT ON COLUMN public.person_claims.person_id IS 'UUID of the census person record being claimed.';
COMMENT ON COLUMN public.person_claims.claimant_id IS 'UUID of the authenticated user requesting the claim.';
COMMENT ON COLUMN public.person_claims.status IS 'Current lifecycle state (PENDING, APPROVED, REJECTED, CANCELLED).';
COMMENT ON COLUMN public.person_claims.evidence_notes IS 'Explanation or proof of relationship submitted by claimant.';
COMMENT ON COLUMN public.person_claims.rejection_reason IS 'Mandatory rationale provided by reviewer if rejected.';
COMMENT ON COLUMN public.person_claims.reviewed_by IS 'Moderator or administrator who reviewed the claim.';

-- Unique partial indexes ensuring concurrency safety:
-- 1. At most ONE pending claim per person record
CREATE UNIQUE INDEX IF NOT EXISTS idx_person_claims_pending_person
  ON public.person_claims (person_id)
  WHERE status = 'PENDING';

-- 2. At most ONE pending claim per claimant account
CREATE UNIQUE INDEX IF NOT EXISTS idx_person_claims_pending_claimant
  ON public.person_claims (claimant_id)
  WHERE status = 'PENDING';

-- Lookup and sorting indexes
CREATE INDEX IF NOT EXISTS idx_person_claims_person_id
  ON public.person_claims (person_id);

CREATE INDEX IF NOT EXISTS idx_person_claims_claimant_id
  ON public.person_claims (claimant_id);

CREATE INDEX IF NOT EXISTS idx_person_claims_status
  ON public.person_claims (status);

CREATE INDEX IF NOT EXISTS idx_person_claims_created_at
  ON public.person_claims (created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Table: public.invitations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Optional family scoping (family join invitation)
  family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,

  -- Optional person pre-assignment (seat claim invitation)
  person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,

  -- Invitee contact (stored normalized lowercase)
  invited_email TEXT NOT NULL,

  -- Inviter attribution
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Proposed family role if family-scoped
  role public.family_role NOT NULL DEFAULT 'EXTENDED',

  -- Cryptographically secure token hash (SHA-256)
  token_hash TEXT NOT NULL UNIQUE,

  -- Lifecycle status
  status public.invitation_status NOT NULL DEFAULT 'PENDING',

  -- Expiration and redemption
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT invitations_email_format
    CHECK (invited_email = lower(trim(invited_email)) AND char_length(invited_email) >= 3),

  CONSTRAINT invitations_expires_after_creation
    CHECK (expires_at > created_at),

  CONSTRAINT invitations_accepted_consistency
    CHECK (
      (status = 'ACCEPTED' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
      OR (status <> 'ACCEPTED' AND accepted_by IS NULL AND accepted_at IS NULL)
    )
);

COMMENT ON TABLE public.invitations IS
  'Invitations sent to email addresses to join a family unit or claim a census person record. '
  'Tokens are stored as secure hashes; plain tokens are never persisted in the database.';

COMMENT ON COLUMN public.invitations.invited_email IS 'Recipient email address (normalized to lowercase).';
COMMENT ON COLUMN public.invitations.token_hash IS 'SHA-256 hash of the secure secret invitation token.';
COMMENT ON COLUMN public.invitations.status IS 'Current lifecycle status (PENDING, ACCEPTED, REVOKED, EXPIRED).';
COMMENT ON COLUMN public.invitations.expires_at IS 'Expiration timestamp beyond which invitation cannot be accepted.';

-- Indexes for invitation queries
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash_pending
  ON public.invitations (token_hash)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_invitations_family_id
  ON public.invitations (family_id)
  WHERE family_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_person_id
  ON public.invitations (person_id)
  WHERE person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_invited_email
  ON public.invitations (lower(invited_email));

CREATE INDEX IF NOT EXISTS idx_invitations_invited_by
  ON public.invitations (invited_by);

-- -----------------------------------------------------------------------------
-- 4. Triggers: Updated-At & Immutability / Lifecycle Guards
-- -----------------------------------------------------------------------------

-- 4.1 Updated-at triggers
DROP TRIGGER IF EXISTS person_claims_handle_updated_at ON public.person_claims;
CREATE TRIGGER person_claims_handle_updated_at
  BEFORE UPDATE ON public.person_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS invitations_handle_updated_at ON public.invitations;
CREATE TRIGGER invitations_handle_updated_at
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4.2 person_claims Immutability Guard
CREATE OR REPLACE FUNCTION public.handle_claim_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Identity and creation provenance fields are strictly immutable
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Field "id" on person_claims is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.person_id <> OLD.person_id THEN
    RAISE EXCEPTION 'Field "person_id" on person_claims is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.claimant_id <> OLD.claimant_id THEN
    RAISE EXCEPTION 'Field "claimant_id" on person_claims is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Field "created_at" on person_claims is immutable.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_claim_update_guard() IS
  'Trigger function: enforces immutability of id, person_id, claimant_id, and created_at on person_claims.';

DROP TRIGGER IF EXISTS trg_person_claims_update_guard ON public.person_claims;
CREATE TRIGGER trg_person_claims_update_guard
  BEFORE UPDATE ON public.person_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_claim_update_guard();

-- 4.3 person_claims Status Transition Guard
CREATE OR REPLACE FUNCTION public.handle_claim_status_transition_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- If status is not changing, permit the update (e.g. updated_at timestamp)
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states cannot be transitioned to any other state
  IF OLD.status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Claim status cannot be changed from terminal state % to %.',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  -- From PENDING, only valid transitions are APPROVED, REJECTED, CANCELLED
  IF OLD.status = 'PENDING' AND NEW.status NOT IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid claim status transition: % -> %.',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_claim_status_transition_guard() IS
  'Trigger function: enforces claim state machine. Only PENDING -> APPROVED/REJECTED/CANCELLED is allowed. Terminal states are immutable.';

DROP TRIGGER IF EXISTS trg_person_claims_status_guard ON public.person_claims;
CREATE TRIGGER trg_person_claims_status_guard
  BEFORE UPDATE OF status ON public.person_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_claim_status_transition_guard();

-- 4.4 invitations Immutability Guard
CREATE OR REPLACE FUNCTION public.handle_invitation_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Field "id" on invitations is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.family_id IS DISTINCT FROM OLD.family_id THEN
    RAISE EXCEPTION 'Field "family_id" on invitations is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.person_id IS DISTINCT FROM OLD.person_id THEN
    RAISE EXCEPTION 'Field "person_id" on invitations is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.invited_by <> OLD.invited_by THEN
    RAISE EXCEPTION 'Field "invited_by" on invitations is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.token_hash <> OLD.token_hash THEN
    RAISE EXCEPTION 'Field "token_hash" on invitations is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Field "created_at" on invitations is immutable.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_invitation_update_guard() IS
  'Trigger function: enforces immutability of id, family_id, person_id, invited_by, token_hash, and created_at on invitations.';

DROP TRIGGER IF EXISTS trg_invitations_update_guard ON public.invitations;
CREATE TRIGGER trg_invitations_update_guard
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invitation_update_guard();

-- 4.5 invitations Status Transition Guard
CREATE OR REPLACE FUNCTION public.handle_invitation_status_transition_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('ACCEPTED', 'REVOKED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Invitation status cannot be changed from terminal state % to %.',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'PENDING' AND NEW.status NOT IN ('ACCEPTED', 'REVOKED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Invalid invitation status transition: % -> %.',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_invitation_status_transition_guard() IS
  'Trigger function: enforces invitation state machine. Only PENDING -> ACCEPTED/REVOKED/EXPIRED is allowed.';

DROP TRIGGER IF EXISTS trg_invitations_status_guard ON public.invitations;
CREATE TRIGGER trg_invitations_status_guard
  BEFORE UPDATE OF status ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invitation_status_transition_guard();

-- -----------------------------------------------------------------------------
-- 5. Privileged Functions: approve_person_claim & reject_person_claim
-- -----------------------------------------------------------------------------

-- 5.1 approve_person_claim
CREATE OR REPLACE FUNCTION public.approve_person_claim(p_claim_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_person RECORD;
  v_caller UUID;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot approve claims.' USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: must be community moderator or administrator
  IF NOT public.is_community_moderator() THEN
    RAISE EXCEPTION 'Unauthorized: only community moderators and administrators can approve claims.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Lock and fetch claim row
  SELECT * INTO v_claim
  FROM public.person_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim % does not exist.', p_claim_id USING ERRCODE = 'P0002';
  END IF;

  IF v_claim.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Cannot approve claim: claim is in % state, expected PENDING.', v_claim.status
      USING ERRCODE = '23514';
  END IF;

  -- 4. Lock and validate target person record
  SELECT * INTO v_person
  FROM public.persons
  WHERE id = v_claim.person_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target person % does not exist.', v_claim.person_id USING ERRCODE = 'P0002';
  END IF;

  -- Invariant: target person must not already be linked
  IF v_person.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Target person is already linked to user account %.', v_person.user_id
      USING ERRCODE = '23514';
  END IF;

  -- Invariant: target person must not be soft-deleted
  IF v_person.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot claim a soft-deleted person record.' USING ERRCODE = '23514';
  END IF;

  -- Invariant: target person must be active
  IF v_person.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Cannot claim a person with status %; must be ACTIVE.', v_person.status
      USING ERRCODE = '23514';
  END IF;

  -- Invariant: deceased persons cannot be claimed
  IF v_person.date_of_death IS NOT NULL THEN
    RAISE EXCEPTION 'Deceased person records cannot be claimed.' USING ERRCODE = '23514';
  END IF;

  -- 5. Invariant: claimant must not already have ANY linked person record
  -- ONE USER = AT MOST ONE PERSON: A previously linked person (even soft-deleted)
  -- prevents claiming another person.
  IF EXISTS (
    SELECT 1 FROM public.persons
    WHERE user_id = v_claim.claimant_id
  ) THEN
    RAISE EXCEPTION 'Claimant % is already linked to an existing person record.', v_claim.claimant_id
      USING ERRCODE = '23514';
  END IF;

  -- 6. Atomically update person record to link the claimant
  UPDATE public.persons
  SET
    user_id = v_claim.claimant_id,
    updated_at = NOW()
  WHERE id = v_claim.person_id;

  -- 7. Atomically update claim record to APPROVED
  UPDATE public.person_claims
  SET
    status = 'APPROVED',
    reviewed_by = v_caller,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_claim.id;

  -- 8. Record immutable audit log
  PERFORM public.log_audit_event(
    'PERSON_CLAIM_APPROVED'::public.audit_action,
    'person',
    v_claim.person_id,
    jsonb_build_object('user_id', NULL),
    jsonb_build_object('user_id', v_claim.claimant_id),
    jsonb_build_object(
      'claim_id', v_claim.id,
      'claimant_id', v_claim.claimant_id,
      'reviewer_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.approve_person_claim(UUID) IS
  'Atomically approves a pending person claim, linking the claimant user ID to the target census person record. '
  'Requires community moderator or admin role. Emits an immutable audit log event.';

-- 5.2 reject_person_claim
CREATE OR REPLACE FUNCTION public.reject_person_claim(p_claim_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_caller UUID;
  v_clean_reason TEXT;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot reject claims.' USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: must be community moderator or administrator
  IF NOT public.is_community_moderator() THEN
    RAISE EXCEPTION 'Unauthorized: only community moderators and administrators can reject claims.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate rejection reason
  v_clean_reason := trim(COALESCE(p_reason, ''));
  IF char_length(v_clean_reason) = 0 THEN
    RAISE EXCEPTION 'Rejection reason is required and cannot be empty.' USING ERRCODE = '23514';
  END IF;

  IF char_length(v_clean_reason) > 1000 THEN
    RAISE EXCEPTION 'Rejection reason must not exceed 1000 characters.' USING ERRCODE = '23514';
  END IF;

  -- 4. Lock and fetch claim row
  SELECT * INTO v_claim
  FROM public.person_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim % does not exist.', p_claim_id USING ERRCODE = 'P0002';
  END IF;

  IF v_claim.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Cannot reject claim: claim is in % state, expected PENDING.', v_claim.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Atomically update claim record to REJECTED
  UPDATE public.person_claims
  SET
    status = 'REJECTED',
    rejection_reason = v_clean_reason,
    reviewed_by = v_caller,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_claim.id;

  -- 6. Record immutable audit log
  PERFORM public.log_audit_event(
    'PERSON_CLAIM_REJECTED'::public.audit_action,
    'person',
    v_claim.person_id,
    jsonb_build_object('status', 'PENDING'),
    jsonb_build_object('status', 'REJECTED', 'rejection_reason', v_clean_reason),
    jsonb_build_object(
      'claim_id', v_claim.id,
      'claimant_id', v_claim.claimant_id,
      'reviewer_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.reject_person_claim(UUID, TEXT) IS
  'Atomically rejects a pending person claim with a mandatory reason. '
  'Requires community moderator or admin role. Emits an immutable audit log event.';

-- -----------------------------------------------------------------------------
-- 6. Row Level Security Policies
-- -----------------------------------------------------------------------------

-- 6.1 Enable RLS on person_claims
ALTER TABLE public.person_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "person_claims_select_own" ON public.person_claims;
CREATE POLICY "person_claims_select_own"
  ON public.person_claims
  FOR SELECT
  USING (auth.uid() = claimant_id);

DROP POLICY IF EXISTS "person_claims_select_admin" ON public.person_claims;
CREATE POLICY "person_claims_select_admin"
  ON public.person_claims
  FOR SELECT
  USING (public.is_community_moderator());

DROP POLICY IF EXISTS "person_claims_insert_authenticated" ON public.person_claims;
CREATE POLICY "person_claims_insert_authenticated"
  ON public.person_claims
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND claimant_id = auth.uid()
    AND status = 'PENDING'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND rejection_reason IS NULL
    -- Target person must exist, be unclaimed, active, non-deleted, and living
    AND EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_claims.person_id
        AND p.user_id IS NULL
        AND p.deleted_at IS NULL
        AND p.status = 'ACTIVE'
        AND p.date_of_death IS NULL
    )
    -- Claimant must not already be linked to ANY person record (even soft-deleted)
    AND NOT EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "person_claims_update_cancel" ON public.person_claims;
CREATE POLICY "person_claims_update_cancel"
  ON public.person_claims
  FOR UPDATE
  USING (
    auth.uid() = claimant_id
    AND status = 'PENDING'
  )
  WITH CHECK (
    auth.uid() = claimant_id
    AND status = 'CANCELLED'
  );

-- Note: No direct UPDATE policy for moderators/admins exists on person_claims.
-- Claim approval and rejection MUST proceed strictly through the controlled
-- SECURITY DEFINER functions approve_person_claim() and reject_person_claim().
DROP POLICY IF EXISTS "person_claims_update_admin" ON public.person_claims;

DROP POLICY IF EXISTS "person_claims_delete_deny" ON public.person_claims;
CREATE POLICY "person_claims_delete_deny"
  ON public.person_claims
  FOR DELETE
  USING (FALSE);

-- 6.2 Enable RLS on invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations_select_inviter" ON public.invitations;
CREATE POLICY "invitations_select_inviter"
  ON public.invitations
  FOR SELECT
  USING (auth.uid() = invited_by);

DROP POLICY IF EXISTS "invitations_select_family_creator" ON public.invitations;
CREATE POLICY "invitations_select_family_creator"
  ON public.invitations
  FOR SELECT
  USING (
    family_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = invitations.family_id
        AND f.created_by = auth.uid()
        AND f.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "invitations_select_admin" ON public.invitations;
CREATE POLICY "invitations_select_admin"
  ON public.invitations
  FOR SELECT
  USING (public.is_community_moderator());

DROP POLICY IF EXISTS "invitations_insert_authorized" ON public.invitations;
CREATE POLICY "invitations_insert_authorized"
  ON public.invitations
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND invited_by = auth.uid()
    AND status = 'PENDING'
    AND accepted_by IS NULL
    AND accepted_at IS NULL
    AND (
      public.is_community_moderator()
      OR (
        family_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.families f
          WHERE f.id = invitations.family_id
            AND f.created_by = auth.uid()
            AND f.deleted_at IS NULL
        )
      )
    )
  );

DROP POLICY IF EXISTS "invitations_update_inviter" ON public.invitations;
CREATE POLICY "invitations_update_inviter"
  ON public.invitations
  FOR UPDATE
  USING (
    auth.uid() = invited_by
    AND status = 'PENDING'
  )
  WITH CHECK (
    auth.uid() = invited_by
    AND status = 'REVOKED'
  );

DROP POLICY IF EXISTS "invitations_update_admin" ON public.invitations;
CREATE POLICY "invitations_update_admin"
  ON public.invitations
  FOR UPDATE
  USING (
    public.is_community_moderator()
    AND status = 'PENDING'
  )
  WITH CHECK (
    public.is_community_moderator()
    AND status = 'REVOKED'
  );

DROP POLICY IF EXISTS "invitations_delete_deny" ON public.invitations;
CREATE POLICY "invitations_delete_deny"
  ON public.invitations
  FOR DELETE
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 7. Gate 1 Discretionary Privileges
-- -----------------------------------------------------------------------------

-- Revoke all table privileges from PUBLIC and anon
REVOKE ALL ON public.person_claims FROM PUBLIC;
REVOKE ALL ON public.person_claims FROM anon;

REVOKE ALL ON public.invitations FROM PUBLIC;
REVOKE ALL ON public.invitations FROM anon;

-- Grant least privilege to authenticated role
GRANT SELECT, INSERT, UPDATE ON public.person_claims TO authenticated;

-- Hardened invitation privileges:
-- Ordinary authenticated clients can SELECT metadata columns on invitations,
-- but token_hash is excluded from client-level SELECT.
-- Similarly, authenticated clients are granted INSERT strictly on metadata
-- columns (excluding token_hash) so clients cannot supply arbitrary token hashes.
-- Token generation and secure hash storage will be controlled by the future
-- secure server-side workflow.
REVOKE SELECT, INSERT ON public.invitations FROM authenticated;
GRANT SELECT (
  id,
  family_id,
  person_id,
  invited_email,
  invited_by,
  role,
  status,
  expires_at,
  accepted_by,
  accepted_at,
  created_at,
  updated_at
) ON public.invitations TO authenticated;
GRANT INSERT (
  id,
  family_id,
  person_id,
  invited_email,
  invited_by,
  role,
  status,
  expires_at,
  created_at,
  updated_at
) ON public.invitations TO authenticated;
GRANT UPDATE ON public.invitations TO authenticated;

-- Hardened function execution privileges
REVOKE ALL ON FUNCTION public.approve_person_claim(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_person_claim(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_person_claim(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_person_claim(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_person_claim(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_person_claim(UUID, TEXT) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261006120000_create_invitation_rpcs.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261006120000_create_invitation_rpcs.sql
-- Purpose:   Create secure, atomic server-side RPC functions for the family
--             invitation lifecycle:
--             1. public.create_family_invitation
--             2. public.get_invitation_by_token
--             3. public.accept_invitation
-- Phase:     Phase 8 — Subtask 4A (Invitation RPC Hardening & Migration)
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. PERSON != USER BOUNDARY:
--    A census Person record represents a real-world human census entity.
--    A user account (auth.users / public.profiles) represents an authenticated account.
--    Accepting a family invitation adds the specified person to family_members.
--    Accepting an invitation DOES NOT claim the Person record.
--    persons.user_id is NEVER modified as part of invitation acceptance.
--    The claim workflow (approve_person_claim) remains the ONLY path to link user_id.
--
-- 2. FAMILY MEMBERSHIP != PERSON OWNERSHIP:
--    Adding a person to family_members does not grant ownership of that Person record.
--
-- 3. INVITATION != CLAIM:
--    Invitations are family-scoped membership mechanisms, not identity claims.
--
-- 4. FAMILY MEMBERSHIP != GENEALOGICAL RELATIONSHIP:
--    Invitations do not create or alter rows in public.relationships.
--
-- 5. NO SYNTHETIC PEOPLE:
--    A family invitation requires an existing, active, living census Person record.
--    No Person records are fabricated.
--
-- 6. TOKEN SECURITY & PRIVILEGE HARDENING:
--    Plaintext tokens are NEVER stored in the database.
--    Clients generate a 256-bit cryptographically secure token, compute its
--    SHA-256 hash, and pass only the 64-character hex hash to the database.
--    The stored token_hash is NEVER exposed to clients or returned by functions.
--
-- 7. ATOMICITY:
--    Acceptance validates, locks, handles family membership, marks the invitation
--    ACCEPTED, and logs audit events in a single atomic transaction.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Database Integrity: Unique Active Pending Invitation Constraint
-- -----------------------------------------------------------------------------
-- Enforces at the database engine level that at most one active PENDING
-- invitation can exist for any (family_id, person_id) pair.
-- Historical invitations (ACCEPTED, REVOKED, EXPIRED) are excluded from the index
-- predicate and do not block subsequent invitations.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_one_pending_per_person
  ON public.invitations (family_id, person_id)
  WHERE status = 'PENDING';

-- -----------------------------------------------------------------------------
-- 1. Function: public.create_family_invitation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_family_invitation(
  p_family_id UUID,
  p_person_id UUID,
  p_invited_email TEXT,
  p_role public.family_role,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_invitation_id UUID;
  v_clean_email TEXT;
  v_family RECORD;
  v_person RECORD;
  v_existing_pending RECORD;
BEGIN
  -- 1. Authenticate caller
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a family invitation.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate family_id is supplied (family-scoped invitation requirement)
  IF p_family_id IS NULL THEN
    RAISE EXCEPTION 'family_id is required for family invitations.'
      USING ERRCODE = '23514';
  END IF;

  -- 3. Validate target family exists, is active, and caller is authorized
  SELECT id, family_name, created_by, status, deleted_at INTO v_family
  FROM public.families
  WHERE id = p_family_id;

  IF v_family.id IS NULL OR v_family.deleted_at IS NOT NULL OR v_family.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Target family % does not exist or is not active.', p_family_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Authorization check: caller must be community moderator or family creator
  IF NOT (
    public.is_community_moderator()
    OR v_family.created_by = v_caller
  ) THEN
    RAISE EXCEPTION 'You are not authorized to create invitations for family %.', p_family_id
      USING ERRCODE = '42501';
  END IF;

  -- 4. Validate person_id is supplied (concrete census seat requirement)
  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'person_id is required for family invitations.'
      USING ERRCODE = '23514';
  END IF;

  SELECT id, status, deleted_at, date_of_death INTO v_person
  FROM public.persons
  WHERE id = p_person_id;

  IF v_person.id IS NULL OR v_person.deleted_at IS NOT NULL OR v_person.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Target person % does not exist or is not an active census record.', p_person_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_person.date_of_death IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot issue an invitation for a deceased person record.'
      USING ERRCODE = '23514';
  END IF;

  -- 5. Validate existing family membership
  -- If person already has an active membership in the family, reject duplicate invitation
  IF EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = p_family_id
      AND person_id = p_person_id
      AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Person % is already an active member of family %.', p_person_id, p_family_id
      USING ERRCODE = '23505';
  END IF;

  -- 6. Check for duplicate pending invitation for this person in this family
  -- Lock any existing pending invitation FOR UPDATE to handle expiration safely under concurrency
  SELECT id, expires_at INTO v_existing_pending
  FROM public.invitations
  WHERE family_id = p_family_id
    AND person_id = p_person_id
    AND status = 'PENDING'
  FOR UPDATE;

  IF v_existing_pending.id IS NOT NULL THEN
    IF v_existing_pending.expires_at > NOW() THEN
      -- A. Active pending invitation exists -> reject as duplicate
      RAISE EXCEPTION 'An active pending invitation already exists for person % in family %.', p_person_id, p_family_id
        USING ERRCODE = '23505';
    ELSE
      -- B. Expired pending invitation exists -> transition to EXPIRED to free the unique constraint and allow replacement
      UPDATE public.invitations
      SET status = 'EXPIRED', updated_at = NOW()
      WHERE id = v_existing_pending.id;
    END IF;
  END IF;

  -- 7. Validate email format
  v_clean_email := lower(trim(p_invited_email));
  IF v_clean_email IS NULL OR char_length(v_clean_email) < 3 OR position('@' in v_clean_email) = 0 THEN
    RAISE EXCEPTION 'A valid recipient email address is required.'
      USING ERRCODE = '23514';
  END IF;

  -- 8. Validate role
  IF p_role IS NULL THEN
    RAISE EXCEPTION 'family_role is required.'
      USING ERRCODE = '23514';
  END IF;

  -- 9. Validate token hash format (must be 64 lowercase hex characters for SHA-256)
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Token hash must be a valid 64-character SHA-256 hexadecimal string.'
      USING ERRCODE = '23514';
  END IF;

  -- 10. Validate expiration timestamp
  IF p_expires_at IS NULL OR p_expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation expiration must be in the future.'
      USING ERRCODE = '23514';
  END IF;

  -- 11. Insert invitation row with secure token_hash under SECURITY DEFINER
  -- Guarded by idx_invitations_one_pending_per_person unique index against concurrent races
  BEGIN
    INSERT INTO public.invitations (
      family_id,
      person_id,
      invited_email,
      invited_by,
      role,
      token_hash,
      status,
      expires_at
    ) VALUES (
      p_family_id,
      p_person_id,
      v_clean_email,
      v_caller,
      p_role,
      p_token_hash,
      'PENDING'::public.invitation_status,
      p_expires_at
    )
    RETURNING id INTO v_invitation_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'A pending invitation already exists for person % in family %.', p_person_id, p_family_id
        USING ERRCODE = '23505';
  END;

  -- 12. Record audit event (token hash and plain tokens are NEVER logged)
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'invitation',
    v_invitation_id,
    NULL,
    jsonb_build_object(
      'family_id', p_family_id,
      'person_id', p_person_id,
      'invited_email', v_clean_email,
      'role', p_role,
      'expires_at', p_expires_at,
      'status', 'PENDING'
    ),
    jsonb_build_object(
      'action_type', 'CREATE_FAMILY_INVITATION',
      'invited_by', v_caller
    )
  );

  RETURN v_invitation_id;
END;
$$;

COMMENT ON FUNCTION public.create_family_invitation(UUID, UUID, TEXT, public.family_role, TEXT, TIMESTAMPTZ) IS
  'Securely creates a family-scoped member invitation with a validated SHA-256 token hash. '
  'Requires caller to be family creator or community moderator. Plain tokens are never stored.';

-- -----------------------------------------------------------------------------
-- 2. Function: public.get_invitation_by_token
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token_hash TEXT)
RETURNS TABLE (
  id UUID,
  family_id UUID,
  family_name TEXT,
  person_id UUID,
  person_name TEXT,
  invited_email TEXT,
  role public.family_role,
  status public.invitation_status,
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Strict input validation on hash format
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN; -- Return 0 rows for malformed or empty token hashes
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.family_id,
    f.family_name,
    i.person_id,
    TRIM(CONCAT_WS(' ', p.first_name, p.middle_name, p.last_name)) AS person_name,
    i.invited_email,
    i.role,
    i.status,
    i.expires_at,
    (i.expires_at <= NOW()) AS is_expired
  FROM public.invitations i
  LEFT JOIN public.families f ON f.id = i.family_id
  LEFT JOIN public.persons p ON p.id = i.person_id
  WHERE i.token_hash = p_token_hash;
END;
$$;

COMMENT ON FUNCTION public.get_invitation_by_token(TEXT) IS
  'Resolves an invitation token hash for redemption preview. '
  'Exposes only safe preview fields without returning the token hash or sensitive census data.';

-- -----------------------------------------------------------------------------
-- 3. Function: public.accept_invitation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_inv RECORD;
  v_family RECORD;
  v_person RECORD;
  v_existing_member RECORD;
BEGIN
  -- 1. Caller authentication
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required to accept an invitation.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Token hash format validation
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid invitation token.'
      USING ERRCODE = '23514';
  END IF;

  -- 3. Lock invitation row FOR UPDATE to prevent concurrent redemptions
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found.'
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Status validation
  IF v_inv.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Invitation is no longer active (status: %).', v_inv.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Expiration validation
  IF v_inv.expires_at <= NOW() THEN
    -- Transition status to EXPIRED
    UPDATE public.invitations
    SET status = 'EXPIRED', updated_at = NOW()
    WHERE id = v_inv.id;

    RAISE EXCEPTION 'Invitation has expired.'
      USING ERRCODE = '23514';
  END IF;

  -- 6. Family validation
  SELECT id, family_name, status, deleted_at INTO v_family
  FROM public.families
  WHERE id = v_inv.family_id;

  IF v_family.id IS NULL OR v_family.deleted_at IS NOT NULL OR v_family.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Target family does not exist or is inactive.'
      USING ERRCODE = 'P0002';
  END IF;

  -- 7. Person validation (PERSON != USER: person is NOT claimed by this operation)
  SELECT id, status, deleted_at, date_of_death INTO v_person
  FROM public.persons
  WHERE id = v_inv.person_id;

  IF v_person.id IS NULL OR v_person.deleted_at IS NOT NULL OR v_person.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Target person record does not exist or is inactive.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_person.date_of_death IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot accept an invitation for a deceased person record.'
      USING ERRCODE = '23514';
  END IF;

  -- 8. Existing family membership handling (family_members uses UNIQUE (family_id, person_id))
  SELECT id, role, is_head, joined_at, left_at, added_by INTO v_existing_member
  FROM public.family_members
  WHERE family_id = v_inv.family_id
    AND person_id = v_inv.person_id;

  IF v_existing_member.id IS NOT NULL THEN
    IF v_existing_member.left_at IS NULL THEN
      -- Case A: Active membership already exists.
      -- Person is already an active member. Satisfy invitation without inserting duplicate.
      NULL;
    ELSE
      -- Case B: Historical membership exists with left_at set.
      -- Re-activate membership under the invited role while respecting UNIQUE constraint
      -- and ensuring is_head = FALSE so active-head uniqueness cannot be violated.
      UPDATE public.family_members
      SET
        role = v_inv.role,
        is_head = FALSE,
        left_at = NULL,
        joined_at = NOW(),
        added_by = v_caller
      WHERE id = v_existing_member.id;
    END IF;
  ELSE
    -- Case C: No prior membership exists. Insert new family member row.
    INSERT INTO public.family_members (
      family_id,
      person_id,
      role,
      is_head,
      joined_at,
      left_at,
      added_by
    ) VALUES (
      v_inv.family_id,
      v_inv.person_id,
      v_inv.role,
      FALSE,
      NOW(),
      NULL,
      v_caller
    );
  END IF;

  -- 9. Atomically mark invitation ACCEPTED
  UPDATE public.invitations
  SET
    status = 'ACCEPTED',
    accepted_by = v_caller,
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = v_inv.id;

  -- 10. Record immutable audit log
  PERFORM public.log_audit_event(
    'FAMILY_MEMBER_ADDED'::public.audit_action,
    'family',
    v_inv.family_id,
    NULL,
    jsonb_build_object(
      'invitation_id', v_inv.id,
      'person_id', v_inv.person_id,
      'role', v_inv.role,
      'accepted_by', v_caller
    ),
    jsonb_build_object(
      'action_type', 'INVITATION_ACCEPTED',
      'accepted_by', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.accept_invitation(TEXT) IS
  'Atomically accepts an invitation and adds the target person to family_members. '
  'Requires authenticated session. PERSON != USER: does NOT modify persons.user_id.';

-- -----------------------------------------------------------------------------
-- 4. Gate 1 Privilege Hardening on Invitation RPCs & Tables
-- -----------------------------------------------------------------------------

-- 4.1 Direct client insertion on invitations table is revoked in favor of the RPC.
-- All invitation creation MUST route through public.create_family_invitation.
REVOKE INSERT ON public.invitations FROM authenticated;

-- 4.2 create_family_invitation: authenticated only (least privilege: service_role omitted)
REVOKE ALL ON FUNCTION public.create_family_invitation(UUID, UUID, TEXT, public.family_role, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_family_invitation(UUID, UUID, TEXT, public.family_role, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.create_family_invitation(UUID, UUID, TEXT, public.family_role, TEXT, TIMESTAMPTZ) FROM service_role;
GRANT EXECUTE ON FUNCTION public.create_family_invitation(UUID, UUID, TEXT, public.family_role, TEXT, TIMESTAMPTZ) TO authenticated;

-- 4.3 get_invitation_by_token: anon and authenticated can resolve token hashes for redemption preview
-- (least privilege: service_role omitted)
REVOKE ALL ON FUNCTION public.get_invitation_by_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_invitation_by_token(TEXT) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(TEXT) TO authenticated;

-- 4.4 accept_invitation: authenticated only (least privilege: service_role omitted)
REVOKE ALL ON FUNCTION public.accept_invitation(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invitation(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.accept_invitation(TEXT) FROM service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261006200000_create_verification_requests.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261006200000_create_verification_requests.sql
-- Purpose:   Create verification requests schema, RLS policies, and secure
--             server-side RPC functions for record verification lifecycle:
--             1. public.verification_request_status enum
--             2. public.verification_requests table with indexes & constraints
--             3. public.handle_verification_request_update_guard trigger
--             4. public.submit_verification_request RPC
--             5. public.approve_verification_request RPC
--             6. public.reject_verification_request RPC
--             7. public.cancel_verification_request RPC
--             8. Row Level Security policies and privilege hardening
-- Phase:     Phase 9 — Subtask 1 (Verification Requests Schema, RLS & Secure Review RPCs)
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. PERSON != USER BOUNDARY:
--    A census Person record represents an immutable genealogical census identity.
--    Verification validates the authenticity and accuracy of census data.
--    Verification DOES NOT claim or link a user account to the Person record.
--    persons.user_id is NEVER modified as part of the verification lifecycle.
--
-- 2. CLAIM != VERIFICATION:
--    Claiming (public.person_claims) links user identity to a person record.
--    Verification (public.verification_requests) attests to community accuracy.
--    These are completely independent domain workflows.
--
-- 3. VERIFICATION != RECORD OWNERSHIP:
--    Verifying a person or family marks it community-approved.
--    It does not transfer ownership, change created_by, or alter family roles.
--
-- 4. SCOPE IS STRICTLY PERSON AND FAMILY:
--    entity_type is restricted to ('PERSON', 'FAMILY').
--    No synthetic entities or arbitrary types are permitted.
--
-- 5. SINGLE ACTIVE PENDING REQUEST PER ENTITY:
--    A partial unique index guarantees that at most one PENDING verification
--    request can exist per (entity_type, entity_id) target.
--
-- 6. STRICT REVIEWER AUTHORIZATION:
--    Review actions (approve/reject) are strictly guarded by public.is_community_moderator()
--    (COMMUNITY_MODERATOR, ADMIN, SUPER_ADMIN).
--
-- 7. ATOMICITY & AUDIT TRAIL:
--    All state transitions, target entity updates, and audit logging occur
--    within atomic database transactions.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enum: public.verification_request_status
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'verification_request_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.verification_request_status AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'CANCELLED'
    );
  END IF;
END $$;

COMMENT ON TYPE public.verification_request_status IS
  'Lifecycle status for verification requests: PENDING, APPROVED, REJECTED, CANCELLED.';

-- -----------------------------------------------------------------------------
-- 2. Table: public.verification_requests
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target entity boundary: strictly PERSON or FAMILY
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,

  -- Requester attribution
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Lifecycle status
  status public.verification_request_status NOT NULL DEFAULT 'PENDING',

  -- Optional requester explanation
  supporting_notes TEXT,

  -- Mandatory reviewer explanation on rejection
  rejection_reason TEXT,

  -- Reviewer attribution and timestamp
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT verification_requests_entity_type_check
    CHECK (entity_type IN ('PERSON', 'FAMILY')),

  CONSTRAINT verification_requests_notes_length_check
    CHECK (supporting_notes IS NULL OR char_length(supporting_notes) <= 1000),

  CONSTRAINT verification_requests_rejection_reason_length_check
    CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),

  CONSTRAINT verification_requests_review_consistency_check
    CHECK (
      (status = 'APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL)
      OR (status = 'REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NOT NULL)
      OR (status IN ('PENDING', 'CANCELLED') AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
    )
);

COMMENT ON TABLE public.verification_requests IS
  'Verification requests submitted by community members to verify Person or Family census records.';

COMMENT ON COLUMN public.verification_requests.entity_type IS 'Target entity type: strictly PERSON or FAMILY.';
COMMENT ON COLUMN public.verification_requests.entity_id IS 'Target entity UUID (persons.id or families.id).';
COMMENT ON COLUMN public.verification_requests.requester_id IS 'User ID of the community member requesting verification.';
COMMENT ON COLUMN public.verification_requests.status IS 'Current lifecycle status (PENDING, APPROVED, REJECTED, CANCELLED).';
COMMENT ON COLUMN public.verification_requests.supporting_notes IS 'Optional rationale or context provided by requester (max 1000 chars).';
COMMENT ON COLUMN public.verification_requests.rejection_reason IS 'Mandatory rationale provided by reviewer if rejected (max 1000 chars).';
COMMENT ON COLUMN public.verification_requests.reviewed_by IS 'Moderator or administrator who reviewed the request.';
COMMENT ON COLUMN public.verification_requests.reviewed_at IS 'Timestamp when the request was reviewed.';

-- -----------------------------------------------------------------------------
-- 3. Indexes for Performance & Concurrency Safety
-- -----------------------------------------------------------------------------

-- Partial unique index: at most ONE pending request per target entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_one_pending
  ON public.verification_requests (entity_type, entity_id)
  WHERE status = 'PENDING';

-- Foreign key & lookup indexes
CREATE INDEX IF NOT EXISTS idx_verification_requests_requester_id
  ON public.verification_requests (requester_id);

CREATE INDEX IF NOT EXISTS idx_verification_requests_entity
  ON public.verification_requests (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_verification_requests_status
  ON public.verification_requests (status);

CREATE INDEX IF NOT EXISTS idx_verification_requests_created_at
  ON public.verification_requests (created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Trigger: Enforce Terminal State Machine Integrity
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_verification_request_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Terminal status cannot be transitioned
  IF OLD.status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Verification request status cannot be changed from terminal state % to %.',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  -- Only PENDING -> APPROVED, REJECTED, CANCELLED is allowed
  IF OLD.status = 'PENDING' AND NEW.status NOT IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid verification request status transition: % -> %.',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_verification_request_update_guard() IS
  'Trigger function: enforces verification request state machine. Only PENDING -> APPROVED/REJECTED/CANCELLED is allowed.';

DROP TRIGGER IF EXISTS trg_verification_requests_status_guard ON public.verification_requests;
CREATE TRIGGER trg_verification_requests_status_guard
  BEFORE UPDATE OF status ON public.verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_verification_request_update_guard();

-- -----------------------------------------------------------------------------
-- 5. RPC Functions
-- -----------------------------------------------------------------------------

-- 5.1 public.submit_verification_request
CREATE OR REPLACE FUNCTION public.submit_verification_request(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_supporting_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_clean_type TEXT;
  v_clean_notes TEXT;
  v_person RECORD;
  v_family RECORD;
  v_request_id UUID;
  v_is_moderator BOOLEAN;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot submit verification requests.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate entity type
  v_clean_type := upper(trim(COALESCE(p_entity_type, '')));
  IF v_clean_type NOT IN ('PERSON', 'FAMILY') THEN
    RAISE EXCEPTION 'Invalid entity type "%". Must be "PERSON" or "FAMILY".', p_entity_type
      USING ERRCODE = '23514';
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Entity ID is required.' USING ERRCODE = '23514';
  END IF;

  -- 3. Validate notes length
  v_clean_notes := trim(COALESCE(p_supporting_notes, ''));
  IF char_length(v_clean_notes) > 1000 THEN
    RAISE EXCEPTION 'Supporting notes must not exceed 1000 characters.' USING ERRCODE = '23514';
  END IF;
  IF char_length(v_clean_notes) = 0 THEN
    v_clean_notes := NULL;
  END IF;

  v_is_moderator := public.is_community_moderator();

  -- 4. Entity-specific validation and authorization
  IF v_clean_type = 'PERSON' THEN
    -- Lock and validate person row
    SELECT * INTO v_person
    FROM public.persons
    WHERE id = p_entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Person % does not exist.', p_entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_person.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot verify a soft-deleted person record.' USING ERRCODE = '23514';
    END IF;

    IF v_person.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Cannot verify a person with status %; must be ACTIVE.', v_person.status
        USING ERRCODE = '23514';
    END IF;

    IF v_person.verification_status = 'VERIFIED' THEN
      RAISE EXCEPTION 'Person is already verified.' USING ERRCODE = '23514';
    END IF;

    IF v_person.verification_status = 'PENDING' THEN
      RAISE EXCEPTION 'Person already has a pending verification.' USING ERRCODE = '23514';
    END IF;

    -- Authorization check: creator, linked individual, or moderator
    IF NOT (
      v_person.created_by = v_caller
      OR (v_person.user_id IS NOT NULL AND v_person.user_id = v_caller)
      OR v_is_moderator
    ) THEN
      RAISE EXCEPTION 'Unauthorized: only the record creator, linked individual, or moderator can request verification.'
        USING ERRCODE = '42501';
    END IF;

    -- Update target entity verification status to PENDING
    UPDATE public.persons
    SET
      verification_status = 'PENDING',
      updated_at = NOW()
    WHERE id = v_person.id;

  ELSIF v_clean_type = 'FAMILY' THEN
    -- Lock and validate family row
    SELECT * INTO v_family
    FROM public.families
    WHERE id = p_entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Family % does not exist.', p_entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_family.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot verify a soft-deleted family record.' USING ERRCODE = '23514';
    END IF;

    IF v_family.verification_status = 'VERIFIED' THEN
      RAISE EXCEPTION 'Family is already verified.' USING ERRCODE = '23514';
    END IF;

    IF v_family.verification_status = 'PENDING' THEN
      RAISE EXCEPTION 'Family already has a pending verification.' USING ERRCODE = '23514';
    END IF;

    -- Authorization check: creator or moderator
    IF NOT (
      v_family.created_by = v_caller
      OR v_is_moderator
    ) THEN
      RAISE EXCEPTION 'Unauthorized: only the family creator or moderator can request verification.'
        USING ERRCODE = '42501';
    END IF;

    -- Update target entity verification status to PENDING
    UPDATE public.families
    SET
      verification_status = 'PENDING',
      updated_at = NOW()
    WHERE id = v_family.id;
  END IF;

  -- 5. Insert verification request row
  INSERT INTO public.verification_requests (
    entity_type,
    entity_id,
    requester_id,
    status,
    supporting_notes
  ) VALUES (
    v_clean_type,
    p_entity_id,
    v_caller,
    'PENDING',
    v_clean_notes
  ) RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.submit_verification_request(TEXT, UUID, TEXT) IS
  'Submits a verification request for a Person or Family census record. Atomically sets target entity to PENDING.';

-- 5.2 public.approve_verification_request
CREATE OR REPLACE FUNCTION public.approve_verification_request(
  p_request_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_req RECORD;
  v_person RECORD;
  v_family RECORD;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot approve verification requests.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: must be community moderator or administrator
  IF NOT public.is_community_moderator() THEN
    RAISE EXCEPTION 'Unauthorized: only community moderators and administrators can approve verification requests.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Lock and fetch request row
  SELECT * INTO v_req
  FROM public.verification_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification request % does not exist.', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Cannot approve verification request: request is in % state, expected PENDING.', v_req.status
      USING ERRCODE = '23514';
  END IF;

  -- 4. Target entity validation and state transition
  IF v_req.entity_type = 'PERSON' THEN
    -- Lock target person row
    SELECT * INTO v_person
    FROM public.persons
    WHERE id = v_req.entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target person % does not exist.', v_req.entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_person.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot verify a soft-deleted person record.' USING ERRCODE = '23514';
    END IF;

    IF v_person.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Cannot verify a person with status %; must be ACTIVE.', v_person.status
        USING ERRCODE = '23514';
    END IF;

    -- Concurrency & freshness guard: target must still be PENDING
    IF v_person.verification_status <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot approve verification request: target person is in % verification status, expected PENDING.',
        v_person.verification_status
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.persons
    SET
      verification_status = 'VERIFIED',
      updated_at = NOW()
    WHERE id = v_person.id;

    -- Audit log event for person verification
    PERFORM public.log_audit_event(
      'PERSON_VERIFIED'::public.audit_action,
      'person',
      v_req.entity_id,
      jsonb_build_object('verification_status', v_person.verification_status),
      jsonb_build_object('verification_status', 'VERIFIED'),
      jsonb_build_object(
        'request_id', v_req.id,
        'requester_id', v_req.requester_id,
        'reviewer_id', v_caller
      )
    );

  ELSIF v_req.entity_type = 'FAMILY' THEN
    -- Lock target family row
    SELECT * INTO v_family
    FROM public.families
    WHERE id = v_req.entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target family % does not exist.', v_req.entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_family.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot verify a soft-deleted family record.' USING ERRCODE = '23514';
    END IF;

    -- Concurrency & freshness guard: target must still be PENDING
    IF v_family.verification_status <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot approve verification request: target family is in % verification status, expected PENDING.',
        v_family.verification_status
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.families
    SET
      verification_status = 'VERIFIED',
      updated_at = NOW()
    WHERE id = v_family.id;

    -- Audit log event for family verification
    PERFORM public.log_audit_event(
      'ADMIN_ACTION'::public.audit_action,
      'family',
      v_req.entity_id,
      jsonb_build_object('verification_status', v_family.verification_status),
      jsonb_build_object('verification_status', 'VERIFIED'),
      jsonb_build_object(
        'action_type', 'FAMILY_VERIFIED',
        'request_id', v_req.id,
        'requester_id', v_req.requester_id,
        'reviewer_id', v_caller
      )
    );
  END IF;

  -- 5. Update verification request record
  UPDATE public.verification_requests
  SET
    status = 'APPROVED',
    reviewed_by = v_caller,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_req.id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.approve_verification_request(UUID) IS
  'Atomically approves a verification request, updating target entity to VERIFIED and logging an audit event. Requires moderator role.';

-- 5.3 public.reject_verification_request
CREATE OR REPLACE FUNCTION public.reject_verification_request(
  p_request_id UUID,
  p_rejection_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_req RECORD;
  v_person RECORD;
  v_family RECORD;
  v_clean_reason TEXT;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot reject verification requests.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: must be community moderator or administrator
  IF NOT public.is_community_moderator() THEN
    RAISE EXCEPTION 'Unauthorized: only community moderators and administrators can reject verification requests.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate rejection reason
  v_clean_reason := trim(COALESCE(p_rejection_reason, ''));
  IF char_length(v_clean_reason) = 0 THEN
    RAISE EXCEPTION 'Rejection reason is required and cannot be empty.' USING ERRCODE = '23514';
  END IF;

  IF char_length(v_clean_reason) > 1000 THEN
    RAISE EXCEPTION 'Rejection reason must not exceed 1000 characters.' USING ERRCODE = '23514';
  END IF;

  -- 4. Lock and fetch request row
  SELECT * INTO v_req
  FROM public.verification_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification request % does not exist.', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Cannot reject verification request: request is in % state, expected PENDING.', v_req.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Revert target entity verification status back to UNVERIFIED
  IF v_req.entity_type = 'PERSON' THEN
    -- Lock target person row
    SELECT * INTO v_person
    FROM public.persons
    WHERE id = v_req.entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target person % does not exist.', v_req.entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_person.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot reject verification for a soft-deleted person record.' USING ERRCODE = '23514';
    END IF;

    IF v_person.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Cannot reject verification for a person with status %; must be ACTIVE.', v_person.status
        USING ERRCODE = '23514';
    END IF;

    -- Concurrency & freshness guard: target must still be PENDING
    IF v_person.verification_status <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot reject verification request: target person is in % verification status, expected PENDING.',
        v_person.verification_status
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.persons
    SET
      verification_status = 'UNVERIFIED',
      updated_at = NOW()
    WHERE id = v_person.id;

    -- Audit log event for person verification rejection
    PERFORM public.log_audit_event(
      'PERSON_VERIFICATION_REJECTED'::public.audit_action,
      'person',
      v_req.entity_id,
      jsonb_build_object('verification_status', 'PENDING'),
      jsonb_build_object('verification_status', 'UNVERIFIED', 'rejection_reason', v_clean_reason),
      jsonb_build_object(
        'request_id', v_req.id,
        'requester_id', v_req.requester_id,
        'reviewer_id', v_caller
      )
    );

  ELSIF v_req.entity_type = 'FAMILY' THEN
    -- Lock target family row
    SELECT * INTO v_family
    FROM public.families
    WHERE id = v_req.entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target family % does not exist.', v_req.entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_family.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot reject verification for a soft-deleted family record.' USING ERRCODE = '23514';
    END IF;

    -- Concurrency & freshness guard: target must still be PENDING
    IF v_family.verification_status <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot reject verification request: target family is in % verification status, expected PENDING.',
        v_family.verification_status
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.families
    SET
      verification_status = 'UNVERIFIED',
      updated_at = NOW()
    WHERE id = v_family.id;

    -- Audit log event for family verification rejection
    PERFORM public.log_audit_event(
      'ADMIN_ACTION'::public.audit_action,
      'family',
      v_req.entity_id,
      jsonb_build_object('verification_status', 'PENDING'),
      jsonb_build_object('verification_status', 'UNVERIFIED', 'rejection_reason', v_clean_reason),
      jsonb_build_object(
        'action_type', 'FAMILY_VERIFICATION_REJECTED',
        'request_id', v_req.id,
        'requester_id', v_req.requester_id,
        'reviewer_id', v_caller
      )
    );
  END IF;

  -- 6. Update verification request record
  UPDATE public.verification_requests
  SET
    status = 'REJECTED',
    rejection_reason = v_clean_reason,
    reviewed_by = v_caller,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_req.id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.reject_verification_request(UUID, TEXT) IS
  'Atomically rejects a verification request with a mandatory reason, reverting target entity to UNVERIFIED. Requires moderator role.';

-- 5.4 public.cancel_verification_request
CREATE OR REPLACE FUNCTION public.cancel_verification_request(
  p_request_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_req RECORD;
  v_person RECORD;
  v_family RECORD;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot cancel verification requests.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Lock and fetch request row
  SELECT * INTO v_req
  FROM public.verification_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification request % does not exist.', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Cannot cancel verification request: request is in % state, expected PENDING.', v_req.status
      USING ERRCODE = '23514';
  END IF;

  -- 3. Authorization check: original requester or community moderator
  IF NOT (
    v_req.requester_id = v_caller
    OR public.is_community_moderator()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only the original requester or a community moderator can cancel a verification request.'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Revert target entity verification status back to UNVERIFIED
  IF v_req.entity_type = 'PERSON' THEN
    -- Lock target person row
    SELECT * INTO v_person
    FROM public.persons
    WHERE id = v_req.entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target person % does not exist.', v_req.entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_person.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot cancel verification request for a soft-deleted person record.' USING ERRCODE = '23514';
    END IF;

    IF v_person.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Cannot cancel verification request for a person with status %; must be ACTIVE.', v_person.status
        USING ERRCODE = '23514';
    END IF;

    -- Concurrency & freshness guard: target must still be PENDING
    IF v_person.verification_status <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot cancel verification request: target person is in % verification status, expected PENDING.',
        v_person.verification_status
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.persons
    SET
      verification_status = 'UNVERIFIED',
      updated_at = NOW()
    WHERE id = v_person.id;

    -- Audit log event for person verification cancellation (using existing ADMIN_ACTION)
    PERFORM public.log_audit_event(
      'ADMIN_ACTION'::public.audit_action,
      'person',
      v_req.entity_id,
      jsonb_build_object('verification_status', 'PENDING'),
      jsonb_build_object('verification_status', 'UNVERIFIED'),
      jsonb_build_object(
        'action_type', 'PERSON_VERIFICATION_CANCELLED',
        'request_id', v_req.id,
        'requester_id', v_req.requester_id,
        'cancelled_by', v_caller,
        'entity_type', 'PERSON',
        'entity_id', v_req.entity_id,
        'previous_status', 'PENDING',
        'resulting_status', 'UNVERIFIED'
      )
    );

  ELSIF v_req.entity_type = 'FAMILY' THEN
    -- Lock target family row
    SELECT * INTO v_family
    FROM public.families
    WHERE id = v_req.entity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target family % does not exist.', v_req.entity_id USING ERRCODE = 'P0002';
    END IF;

    IF v_family.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot cancel verification request for a soft-deleted family record.' USING ERRCODE = '23514';
    END IF;

    -- Concurrency & freshness guard: target must still be PENDING
    IF v_family.verification_status <> 'PENDING' THEN
      RAISE EXCEPTION 'Cannot cancel verification request: target family is in % verification status, expected PENDING.',
        v_family.verification_status
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.families
    SET
      verification_status = 'UNVERIFIED',
      updated_at = NOW()
    WHERE id = v_family.id;

    -- Audit log event for family verification cancellation (using existing ADMIN_ACTION)
    PERFORM public.log_audit_event(
      'ADMIN_ACTION'::public.audit_action,
      'family',
      v_req.entity_id,
      jsonb_build_object('verification_status', 'PENDING'),
      jsonb_build_object('verification_status', 'UNVERIFIED'),
      jsonb_build_object(
        'action_type', 'FAMILY_VERIFICATION_CANCELLED',
        'request_id', v_req.id,
        'requester_id', v_req.requester_id,
        'cancelled_by', v_caller,
        'entity_type', 'FAMILY',
        'entity_id', v_req.entity_id,
        'previous_status', 'PENDING',
        'resulting_status', 'UNVERIFIED'
      )
    );
  END IF;

  -- 5. Update verification request record
  UPDATE public.verification_requests
  SET
    status = 'CANCELLED',
    updated_at = NOW()
  WHERE id = v_req.id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.cancel_verification_request(UUID) IS
  'Atomically cancels a pending verification request by the requester or moderator, reverting target entity to UNVERIFIED and logging an audit event.';

-- -----------------------------------------------------------------------------
-- 6. Row Level Security Policies
-- -----------------------------------------------------------------------------
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- 6.1 SELECT policies: requester can read own requests; moderators can read all
DROP POLICY IF EXISTS "verification_requests_select_own" ON public.verification_requests;
CREATE POLICY "verification_requests_select_own"
  ON public.verification_requests
  FOR SELECT
  USING (auth.uid() = requester_id);

DROP POLICY IF EXISTS "verification_requests_select_moderator" ON public.verification_requests;
CREATE POLICY "verification_requests_select_moderator"
  ON public.verification_requests
  FOR SELECT
  USING (public.is_community_moderator());

-- 6.2 Direct client mutations denied (all mutations must proceed via secure RPCs)
DROP POLICY IF EXISTS "verification_requests_insert_deny" ON public.verification_requests;
CREATE POLICY "verification_requests_insert_deny"
  ON public.verification_requests
  FOR INSERT
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "verification_requests_update_deny" ON public.verification_requests;
CREATE POLICY "verification_requests_update_deny"
  ON public.verification_requests
  FOR UPDATE
  USING (FALSE);

DROP POLICY IF EXISTS "verification_requests_delete_deny" ON public.verification_requests;
CREATE POLICY "verification_requests_delete_deny"
  ON public.verification_requests
  FOR DELETE
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 7. Privilege Hardening
-- -----------------------------------------------------------------------------

-- Revoke all table privileges from PUBLIC and anon
REVOKE ALL ON public.verification_requests FROM PUBLIC;
REVOKE ALL ON public.verification_requests FROM anon;

-- Grant SELECT only to authenticated role (subject to RLS)
GRANT SELECT ON public.verification_requests TO authenticated;

-- Function execution privileges: authenticated only; anon and PUBLIC revoked
REVOKE ALL ON FUNCTION public.submit_verification_request(TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_verification_request(TEXT, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_verification_request(TEXT, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_verification_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_verification_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_verification_request(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_verification_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_verification_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_verification_request(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_verification_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_verification_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_verification_request(UUID) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261006230000_create_duplicate_flags.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261006230000_create_duplicate_flags.sql
-- Description: Duplicate Detection Flags & Review Queue (Phase 9 Subtask 4 — Hardened)
--
-- CRITICAL ARCHITECTURAL PRINCIPLES:
-- 1. DETECT != MERGE:
--    Duplicate detection identifies and flags potential duplicate records for human review.
--    This migration NEVER performs automatic merges, overwrites, deletions, or transfers.
-- 2. PERSON != USER:
--    Duplicate flags operate strictly on public.persons and public.families census entities.
--    Never mutates persons.user_id, auth.users, or identity claim records.
-- 3. CANONICAL PAIR ORDERING:
--    Enforces record_a_id < record_b_id via CHECK constraint and unique index,
--    guaranteeing that pair (A, B) and pair (B, A) are identical and cannot produce duplicate flags.
-- 4. NON-DESTRUCTIVE AUDITING:
--    Resolving flags records reviewer identity and resolution timestamp.
--    Uses existing public.audit_action 'ADMIN_ACTION' for zero-downtime audit logging.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Custom Types
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'duplicate_entity_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.duplicate_entity_type AS ENUM ('PERSON', 'FAMILY');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'duplicate_flag_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.duplicate_flag_status AS ENUM (
      'OPEN',
      'CONFIRMED_DUPLICATE',
      'NOT_DUPLICATE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'duplicate_confidence' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.duplicate_confidence AS ENUM (
      'STRONG',
      'POSSIBLE',
      'WEAK'
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Table: public.duplicate_flags
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.duplicate_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target Entity Scoping
  entity_type public.duplicate_entity_type NOT NULL,
  record_a_id UUID NOT NULL,
  record_b_id UUID NOT NULL,

  -- Detection Metadata
  confidence public.duplicate_confidence NOT NULL,
  match_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  status public.duplicate_flag_status NOT NULL DEFAULT 'OPEN',

  -- Notes & Context
  notes TEXT,
  resolution_notes TEXT,

  -- Provenance & Review
  flagged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Invariant Constraints
  CONSTRAINT duplicate_flags_canonical_order
    CHECK (record_a_id < record_b_id),
  CONSTRAINT duplicate_flags_match_signals_is_array
    CHECK (jsonb_typeof(match_signals) = 'array'),
  CONSTRAINT duplicate_flags_notes_len
    CHECK (notes IS NULL OR length(notes) <= 1000),
  CONSTRAINT duplicate_flags_resolution_notes_len
    CHECK (resolution_notes IS NULL OR length(resolution_notes) <= 1000)
);

COMMENT ON TABLE public.duplicate_flags IS
  'Non-destructive duplicate detection flags for census Person and Family records. Never triggers automatic merging.';

COMMENT ON COLUMN public.duplicate_flags.record_a_id IS
  'First record in the pair. Canonical ordering ensures record_a_id < record_b_id.';

COMMENT ON COLUMN public.duplicate_flags.record_b_id IS
  'Second record in the pair. Canonical ordering ensures record_a_id < record_b_id.';

COMMENT ON COLUMN public.duplicate_flags.match_signals IS
  'JSON array of explainable match reasons (e.g. name, dob, gotra, location).';

-- -----------------------------------------------------------------------------
-- 3. Indexes
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_duplicate_flags_canonical_pair
  ON public.duplicate_flags (entity_type, record_a_id, record_b_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_flags_status_confidence
  ON public.duplicate_flags (status, confidence, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_duplicate_flags_record_a
  ON public.duplicate_flags (record_a_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_flags_record_b
  ON public.duplicate_flags (record_b_id);

-- Updated-at trigger
DROP TRIGGER IF EXISTS duplicate_flags_handle_updated_at ON public.duplicate_flags;
CREATE TRIGGER duplicate_flags_handle_updated_at
  BEFORE UPDATE ON public.duplicate_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Secure RPCs
-- -----------------------------------------------------------------------------

-- 4.1 public.flag_duplicate_record
CREATE OR REPLACE FUNCTION public.flag_duplicate_record(
  p_entity_type TEXT,
  p_record_a_id UUID,
  p_record_b_id UUID,
  p_confidence TEXT,
  p_match_signals JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_clean_type public.duplicate_entity_type;
  v_clean_confidence public.duplicate_confidence;
  v_first UUID;
  v_second UUID;
  v_flag_id UUID;
  v_clean_notes TEXT;
  v_clean_signals JSONB;
  v_person_a RECORD;
  v_person_b RECORD;
  v_family_a RECORD;
  v_family_b RECORD;
  v_existing_flag RECORD;
BEGIN
  -- 1. Authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot flag duplicate records.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate entity type
  IF upper(trim(COALESCE(p_entity_type, ''))) NOT IN ('PERSON', 'FAMILY') THEN
    RAISE EXCEPTION 'Invalid entity type "%". Must be "PERSON" or "FAMILY".', p_entity_type
      USING ERRCODE = '23514';
  END IF;
  v_clean_type := upper(trim(p_entity_type))::public.duplicate_entity_type;

  -- 3. Validate confidence
  IF upper(trim(COALESCE(p_confidence, ''))) NOT IN ('STRONG', 'POSSIBLE', 'WEAK') THEN
    RAISE EXCEPTION 'Invalid confidence "%". Must be "STRONG", "POSSIBLE", or "WEAK".', p_confidence
      USING ERRCODE = '23514';
  END IF;
  v_clean_confidence := upper(trim(p_confidence))::public.duplicate_confidence;

  -- 4. Validate record IDs & canonical ordering
  IF p_record_a_id IS NULL OR p_record_b_id IS NULL THEN
    RAISE EXCEPTION 'Both record IDs are required.' USING ERRCODE = '23514';
  END IF;

  IF p_record_a_id = p_record_b_id THEN
    RAISE EXCEPTION 'Cannot flag a record as duplicate of itself.' USING ERRCODE = '23514';
  END IF;

  IF p_record_a_id < p_record_b_id THEN
    v_first := p_record_a_id;
    v_second := p_record_b_id;
  ELSE
    v_first := p_record_b_id;
    v_second := p_record_a_id;
  END IF;

  -- 5. Validate match_signals JSON structure (NULL or JSON array)
  IF p_match_signals IS NULL THEN
    v_clean_signals := '[]'::jsonb;
  ELSE
    IF jsonb_typeof(p_match_signals) <> 'array' THEN
      RAISE EXCEPTION 'Match signals must be a JSON array.' USING ERRCODE = '23514';
    END IF;
    v_clean_signals := p_match_signals;
  END IF;

  -- 6. Validate notes length
  v_clean_notes := trim(COALESCE(p_notes, ''));
  IF char_length(v_clean_notes) > 1000 THEN
    RAISE EXCEPTION 'Notes must not exceed 1000 characters.' USING ERRCODE = '23514';
  END IF;
  IF char_length(v_clean_notes) = 0 THEN
    v_clean_notes := NULL;
  END IF;

  -- 7. Validate target records exist, belong to declared entity_type, and are not soft-deleted/archived
  -- Deterministically lock targets in canonical order (v_first then v_second) to prevent validation/insertion races
  IF v_clean_type = 'PERSON' THEN
    -- Lock and check Record A
    SELECT id, status, deleted_at INTO v_person_a
    FROM public.persons
    WHERE id = v_first
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target person % does not exist.', v_first USING ERRCODE = 'P0002';
    END IF;

    IF v_person_a.deleted_at IS NOT NULL OR v_person_a.status = 'ARCHIVED' THEN
      RAISE EXCEPTION 'Cannot flag soft-deleted or archived person record %.', v_first
        USING ERRCODE = '23514';
    END IF;

    -- Lock and check Record B
    SELECT id, status, deleted_at INTO v_person_b
    FROM public.persons
    WHERE id = v_second
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target person % does not exist.', v_second USING ERRCODE = 'P0002';
    END IF;

    IF v_person_b.deleted_at IS NOT NULL OR v_person_b.status = 'ARCHIVED' THEN
      RAISE EXCEPTION 'Cannot flag soft-deleted or archived person record %.', v_second
        USING ERRCODE = '23514';
    END IF;

  ELSIF v_clean_type = 'FAMILY' THEN
    -- Lock and check Record A
    SELECT id, status, deleted_at INTO v_family_a
    FROM public.families
    WHERE id = v_first
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target family % does not exist.', v_first USING ERRCODE = 'P0002';
    END IF;

    IF v_family_a.deleted_at IS NOT NULL OR v_family_a.status = 'ARCHIVED' THEN
      RAISE EXCEPTION 'Cannot flag soft-deleted or archived family record %.', v_first
        USING ERRCODE = '23514';
    END IF;

    -- Lock and check Record B
    SELECT id, status, deleted_at INTO v_family_b
    FROM public.families
    WHERE id = v_second
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target family % does not exist.', v_second USING ERRCODE = 'P0002';
    END IF;

    IF v_family_b.deleted_at IS NOT NULL OR v_family_b.status = 'ARCHIVED' THEN
      RAISE EXCEPTION 'Cannot flag soft-deleted or archived family record %.', v_second
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 8. Explicit Handling of Existing Duplicate Flags
  SELECT id, status INTO v_existing_flag
  FROM public.duplicate_flags
  WHERE entity_type = v_clean_type
    AND record_a_id = v_first
    AND record_b_id = v_second
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_flag.status = 'CONFIRMED_DUPLICATE' THEN
      RAISE EXCEPTION 'Duplicate pair has already been resolved as CONFIRMED_DUPLICATE.'
        USING ERRCODE = '23514';
    ELSIF v_existing_flag.status = 'NOT_DUPLICATE' THEN
      RAISE EXCEPTION 'Duplicate pair has already been resolved as NOT_DUPLICATE.'
        USING ERRCODE = '23514';
    ELSIF v_existing_flag.status = 'OPEN' THEN
      -- Re-use / update existing OPEN flag and return its ID
      UPDATE public.duplicate_flags
      SET
        confidence = v_clean_confidence,
        match_signals = v_clean_signals,
        notes = COALESCE(v_clean_notes, public.duplicate_flags.notes),
        updated_at = NOW()
      WHERE id = v_existing_flag.id
      RETURNING id INTO v_flag_id;

      RETURN v_flag_id;
    END IF;
  END IF;

  -- 9. Insert new OPEN flag with concurrency protection
  BEGIN
    INSERT INTO public.duplicate_flags (
      entity_type,
      record_a_id,
      record_b_id,
      confidence,
      match_signals,
      status,
      notes,
      flagged_by
    ) VALUES (
      v_clean_type,
      v_first,
      v_second,
      v_clean_confidence,
      v_clean_signals,
      'OPEN',
      v_clean_notes,
      v_caller
    )
    RETURNING id INTO v_flag_id;

    RETURN v_flag_id;
  EXCEPTION WHEN unique_violation THEN
    -- Another transaction inserted concurrently: fetch and re-check status
    SELECT id, status INTO v_existing_flag
    FROM public.duplicate_flags
    WHERE entity_type = v_clean_type
      AND record_a_id = v_first
      AND record_b_id = v_second
    FOR UPDATE;

    IF v_existing_flag.status = 'CONFIRMED_DUPLICATE' THEN
      RAISE EXCEPTION 'Duplicate pair has already been resolved as CONFIRMED_DUPLICATE.'
        USING ERRCODE = '23514';
    ELSIF v_existing_flag.status = 'NOT_DUPLICATE' THEN
      RAISE EXCEPTION 'Duplicate pair has already been resolved as NOT_DUPLICATE.'
        USING ERRCODE = '23514';
    ELSIF v_existing_flag.status = 'OPEN' THEN
      UPDATE public.duplicate_flags
      SET
        confidence = v_clean_confidence,
        match_signals = v_clean_signals,
        notes = COALESCE(v_clean_notes, public.duplicate_flags.notes),
        updated_at = NOW()
      WHERE id = v_existing_flag.id
      RETURNING id INTO v_flag_id;

      RETURN v_flag_id;
    END IF;
  END;
END;
$$;

COMMENT ON FUNCTION public.flag_duplicate_record(TEXT, UUID, UUID, TEXT, JSONB, TEXT) IS
  'Non-destructive duplicate flagging RPC. Validates entity existence, status, signal array, canonical pair order, and lifecycle states.';

-- 4.2 public.resolve_duplicate_flag
CREATE OR REPLACE FUNCTION public.resolve_duplicate_flag(
  p_flag_id UUID,
  p_resolution TEXT,
  p_resolution_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_flag RECORD;
  v_clean_resolution public.duplicate_flag_status;
  v_clean_notes TEXT;
BEGIN
  -- 1. Authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot resolve duplicate flags.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization (Moderator only)
  IF NOT public.is_community_moderator() THEN
    RAISE EXCEPTION 'Unauthorized: only community moderators can resolve duplicate flags.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate resolution status
  IF upper(trim(COALESCE(p_resolution, ''))) NOT IN ('CONFIRMED_DUPLICATE', 'NOT_DUPLICATE') THEN
    RAISE EXCEPTION 'Invalid resolution "%". Must be "CONFIRMED_DUPLICATE" or "NOT_DUPLICATE".', p_resolution
      USING ERRCODE = '23514';
  END IF;
  v_clean_resolution := upper(trim(p_resolution))::public.duplicate_flag_status;

  -- 4. Validate notes length
  v_clean_notes := trim(COALESCE(p_resolution_notes, ''));
  IF char_length(v_clean_notes) > 1000 THEN
    RAISE EXCEPTION 'Resolution notes must not exceed 1000 characters.' USING ERRCODE = '23514';
  END IF;
  IF char_length(v_clean_notes) = 0 THEN
    v_clean_notes := NULL;
  END IF;

  -- 5. Lock and check flag
  SELECT * INTO v_flag
  FROM public.duplicate_flags
  WHERE id = p_flag_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duplicate flag % does not exist.', p_flag_id USING ERRCODE = 'P0002';
  END IF;

  -- Strictly enforce one-way lifecycle: only OPEN flags can be resolved
  IF v_flag.status <> 'OPEN' THEN
    RAISE EXCEPTION 'Duplicate flag % has already been resolved with status "%" and cannot be modified.',
      p_flag_id, v_flag.status
      USING ERRCODE = '23514';
  END IF;

  -- 6. Update flag
  UPDATE public.duplicate_flags
  SET
    status = v_clean_resolution,
    resolution_notes = v_clean_notes,
    reviewed_by = v_caller,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_flag.id;

  -- 7. Audit logging via existing ADMIN_ACTION
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'duplicate_flag',
    v_flag.id,
    jsonb_build_object('status', v_flag.status),
    jsonb_build_object(
      'status', v_clean_resolution,
      'resolution_notes', v_clean_notes,
      'action_type', 'DUPLICATE_FLAG_RESOLVED'
    ),
    jsonb_build_object(
      'reviewer_id', v_caller,
      'record_a_id', v_flag.record_a_id,
      'record_b_id', v_flag.record_b_id,
      'entity_type', v_flag.entity_type
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.resolve_duplicate_flag(UUID, TEXT, TEXT) IS
  'Resolves a duplicate flag as CONFIRMED_DUPLICATE or NOT_DUPLICATE. Never merges or deletes records.';

-- -----------------------------------------------------------------------------
-- 5. Row Level Security (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.duplicate_flags ENABLE ROW LEVEL SECURITY;

-- 5.1 SELECT: Moderators can view all flags
DROP POLICY IF EXISTS "duplicate_flags_select_moderator" ON public.duplicate_flags;
CREATE POLICY "duplicate_flags_select_moderator"
  ON public.duplicate_flags
  FOR SELECT
  USING (public.is_community_moderator());

-- 5.2 SELECT: Flagger can view their own reported flags
DROP POLICY IF EXISTS "duplicate_flags_select_own" ON public.duplicate_flags;
CREATE POLICY "duplicate_flags_select_own"
  ON public.duplicate_flags
  FOR SELECT
  USING (flagged_by = auth.uid());

-- 5.3 Direct client mutations denied (all mutations proceed via secure RPCs)
DROP POLICY IF EXISTS "duplicate_flags_insert_deny" ON public.duplicate_flags;
CREATE POLICY "duplicate_flags_insert_deny"
  ON public.duplicate_flags
  FOR INSERT
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "duplicate_flags_update_deny" ON public.duplicate_flags;
CREATE POLICY "duplicate_flags_update_deny"
  ON public.duplicate_flags
  FOR UPDATE
  USING (FALSE);

DROP POLICY IF EXISTS "duplicate_flags_delete_deny" ON public.duplicate_flags;
CREATE POLICY "duplicate_flags_delete_deny"
  ON public.duplicate_flags
  FOR DELETE
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 6. Table & RPC Privileges (Least Privilege)
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.duplicate_flags FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.duplicate_flags TO authenticated;

REVOKE ALL ON FUNCTION public.flag_duplicate_record(TEXT, UUID, UUID, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flag_duplicate_record(TEXT, UUID, UUID, TEXT, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_duplicate_flag(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_duplicate_flag(UUID, TEXT, TEXT) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261007100000_create_community_groups.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261007100000_create_community_groups.sql
-- Purpose:   Create Community Groups foundation schema, hardened RLS policies,
--             triggers, and authoritative RPC functions:
--             1. public.group_type and public.group_role enums
--             2. public.groups table with indexes, constraints & updated_at trigger
--             3. public.group_members table with unique constraints & indexes
--             4. Invariant Triggers:
--                - public.handle_group_update_guard (immutable fields & verification guard)
--                - public.handle_group_member_update_guard (role integrity & sole admin demotion guard)
--                - public.handle_group_member_delete_guard (sole admin removal / leave guard)
--             5. Authoritative RPCs (SECURITY DEFINER):
--                - public.create_community_group (atomic group + admin membership)
--                - public.join_community_group (self-join as MEMBER into public active group)
--                - public.leave_community_group (self-leave with sole-admin protection)
--                - public.add_group_member (admin/moderator adding members without privilege escalation)
--                - public.remove_group_member (admin/moderator member removal)
--                - public.update_group_member_role (role lifecycle with sole-admin protection)
--                - public.archive_community_group (group archival by admin or moderator)
--                - public.verify_community_group (moderator verification)
--             6. Hardened Row Level Security policies (RPC-authoritative mutations)
--             7. Explicit least-privilege table grants (zero anon, mutations via RPCs only)
-- Phase:     Phase 10 — Subtask 1 (Community Groups Schema, RLS, Services & Catalog UI)
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. PERSON != USER:
--    A group member is an interactive user account (public.profiles / auth.users),
--    NOT a census Person record. Joining a group reflects personal participation.
--    No census Person records are created, modified, or linked by group operations.
--
-- 2. FAMILY != GROUP:
--    A community group represents a civic, regional, or cultural association
--    (e.g., village association, Panchayat committee, youth council), completely
--    decoupled from genealogical families (public.families).
--
-- 3. ANY AUTHENTICATED USER MAY CREATE A GROUP:
--    When created, the creator atomically becomes the initial group ADMIN.
--    Creating a group does NOT alter profiles.user_role or grant global privileges.
--    Direct table INSERT into public.groups is DENIED to prevent orphaned groups.
--    Group creation is strictly RPC-authoritative (create_community_group).
--
-- 4. ROLE INTEGRITY & SOLE ADMIN PROTECTION:
--    Direct INSERT, UPDATE, and DELETE on public.group_members are DENIED.
--    All membership operations route through authoritative RPCs.
--    Database triggers additionally guarantee that an active group can NEVER
--    lose its sole ADMIN through demotion, deletion, or self-leave.
--
-- 5. VERIFICATION SEPARATION:
--    Groups initialize with is_verified = FALSE.
--    Only authorized community moderators (is_community_moderator()) can modify
--    group verification status.
--
-- 6. ATOMICITY & AUDIT TRAIL:
--    Group creation and administrative lifecycle operations are tracked via
--    public.log_audit_event using existing ADMIN_ACTION.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums: public.group_type & public.group_role
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'group_type' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.group_type AS ENUM (
      'VILLAGE_ASSOCIATION', -- Native place / Watan / village council
      'COMMITTEE',           -- Panchayat, executive, or organizing committee
      'CULTURAL',            -- Cultural, literary, or festival group
      'YOUTH',               -- Youth wing or sports organization
      'OTHER'                -- General or interest-based community group
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'group_role' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.group_role AS ENUM (
      'ADMIN',     -- Group creator or designated manager (can edit group, manage members)
      'MODERATOR', -- Group moderator (can moderate content/roster)
      'MEMBER'     -- Standard group participant
    );
  END IF;
END $$;

COMMENT ON TYPE public.group_type IS 'Categories of community groups beyond genealogical family units.';
COMMENT ON TYPE public.group_role IS 'Roles within a community group. Distinct from global public.user_role.';

-- -----------------------------------------------------------------------------
-- 2. Table: public.groups
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  group_type public.group_type NOT NULL DEFAULT 'OTHER',
  location TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT groups_name_not_empty
    CHECK (length(trim(name)) > 0 AND length(name) <= 150),
  CONSTRAINT groups_slug_format
    CHECK (slug ~ '^[a-z0-9-]+$' AND length(slug) >= 3 AND length(slug) <= 100),
  CONSTRAINT groups_description_length
    CHECK (description IS NULL OR length(description) <= 2000),
  CONSTRAINT groups_location_length
    CHECK (location IS NULL OR length(location) <= 200),
  CONSTRAINT groups_slug_unique
    UNIQUE (slug)
);

COMMENT ON TABLE public.groups IS
  'Community groups, committees, and village associations. Distinct from family units.';
COMMENT ON COLUMN public.groups.slug IS
  'URL-friendly unique identifier (lowercase alphanumeric and hyphens).';
COMMENT ON COLUMN public.groups.is_verified IS
  'Whether verified by global community moderators. Defaults to FALSE.';
COMMENT ON COLUMN public.groups.is_private IS
  'Whether group is restricted to members only. Public groups are open for discovery.';
COMMENT ON COLUMN public.groups.deleted_at IS
  'Soft-deletion timestamp. Soft-deleted groups are hidden from standard catalog queries.';

-- Indexes for public.groups
CREATE INDEX IF NOT EXISTS idx_groups_slug
  ON public.groups (slug);

CREATE INDEX IF NOT EXISTS idx_groups_group_type
  ON public.groups (group_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_groups_is_verified
  ON public.groups (is_verified)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_groups_is_private
  ON public.groups (is_private)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_groups_name_lower
  ON public.groups (lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_groups_created_by
  ON public.groups (created_by)
  WHERE deleted_at IS NULL;

-- Groups Updated-At Trigger
DROP TRIGGER IF EXISTS groups_handle_updated_at ON public.groups;
CREATE TRIGGER groups_handle_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Table: public.group_members
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.group_role NOT NULL DEFAULT 'MEMBER',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_group_member
    UNIQUE (group_id, user_id)
);

COMMENT ON TABLE public.group_members IS
  'Membership link between public.groups and interactive user accounts (auth.users).';
COMMENT ON COLUMN public.group_members.role IS
  'Role within this specific group: ADMIN, MODERATOR, or MEMBER.';

-- Indexes for public.group_members
CREATE INDEX IF NOT EXISTS idx_group_members_group_id
  ON public.group_members (group_id);

CREATE INDEX IF NOT EXISTS idx_group_members_user_id
  ON public.group_members (user_id);

CREATE INDEX IF NOT EXISTS idx_group_members_group_role
  ON public.group_members (group_id, role);

-- -----------------------------------------------------------------------------
-- 4. Invariant Triggers & Defense-in-Depth Guards
-- -----------------------------------------------------------------------------

-- Trigger 4A: public.handle_group_update_guard
-- Protects immutable fields and restricts verification mutation strictly to moderators.
CREATE OR REPLACE FUNCTION public.handle_group_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- 1. Guard immutable fields
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Field id is immutable on groups.' USING ERRCODE = '23514';
  END IF;

  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Field created_at is immutable on groups.' USING ERRCODE = '23514';
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Field created_by is immutable on groups.' USING ERRCODE = '23514';
  END IF;

  -- 2. Guard is_verified: Only community moderators can alter verification status
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    IF NOT public.is_community_moderator() THEN
      RAISE EXCEPTION 'Unauthorized: Only community moderators can modify group verification status.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS groups_update_guard ON public.groups;
CREATE TRIGGER groups_update_guard
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_group_update_guard();

-- Trigger 4B: public.handle_group_member_update_guard
-- Protects immutable membership attributes and prevents demoting the sole ADMIN of an active group.
CREATE OR REPLACE FUNCTION public.handle_group_member_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_admin_count INTEGER;
  v_group_is_deleted BOOLEAN;
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Field id is immutable on group_members.' USING ERRCODE = '23514';
  END IF;

  IF NEW.group_id <> OLD.group_id THEN
    RAISE EXCEPTION 'Field group_id is immutable on group_members.' USING ERRCODE = '23514';
  END IF;

  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Field user_id is immutable on group_members.' USING ERRCODE = '23514';
  END IF;

  IF NEW.joined_at <> OLD.joined_at THEN
    RAISE EXCEPTION 'Field joined_at is immutable on group_members.' USING ERRCODE = '23514';
  END IF;

  -- Sole-admin demotion protection:
  IF OLD.role = 'ADMIN' AND NEW.role <> 'ADMIN' THEN
    SELECT (deleted_at IS NOT NULL) INTO v_group_is_deleted
    FROM public.groups
    WHERE id = OLD.group_id;

    IF v_group_is_deleted IS NOT TRUE THEN
      SELECT COUNT(*) INTO v_other_admin_count
      FROM public.group_members
      WHERE group_id = OLD.group_id
        AND role = 'ADMIN'
        AND id <> OLD.id;

      IF v_other_admin_count = 0 THEN
        RAISE EXCEPTION 'Cannot demote the sole administrator of an active group. Designate another administrator first.'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_members_update_guard ON public.group_members;
CREATE TRIGGER group_members_update_guard
  BEFORE UPDATE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_group_member_update_guard();

-- Trigger 4C: public.handle_group_member_delete_guard
-- Prevents removal or self-leave of the sole ADMIN of an active group.
CREATE OR REPLACE FUNCTION public.handle_group_member_delete_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_admin_count INTEGER;
  v_group_is_deleted BOOLEAN;
BEGIN
  IF OLD.role = 'ADMIN' THEN
    SELECT (deleted_at IS NOT NULL) INTO v_group_is_deleted
    FROM public.groups
    WHERE id = OLD.group_id;

    -- If group is still active, verify at least one other ADMIN remains
    IF v_group_is_deleted IS NOT TRUE THEN
      SELECT COUNT(*) INTO v_other_admin_count
      FROM public.group_members
      WHERE group_id = OLD.group_id
        AND role = 'ADMIN'
        AND id <> OLD.id;

      IF v_other_admin_count = 0 THEN
        RAISE EXCEPTION 'Sole group administrator cannot be removed or leave an active group. Transfer admin role first or archive the group.'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS group_members_delete_guard ON public.group_members;
CREATE TRIGGER group_members_delete_guard
  BEFORE DELETE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_group_member_delete_guard();

-- -----------------------------------------------------------------------------
-- 5. Authoritative Server RPC Functions (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- 5A. RPC: public.create_community_group
-- Atomically creates a group and assigns the authenticated creator as initial ADMIN.
CREATE OR REPLACE FUNCTION public.create_community_group(
  p_name TEXT,
  p_slug TEXT,
  p_description TEXT DEFAULT NULL,
  p_group_type public.group_type DEFAULT 'OTHER',
  p_location TEXT DEFAULT NULL,
  p_is_private BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group_id UUID;
  v_clean_name TEXT;
  v_clean_slug TEXT;
  v_clean_desc TEXT;
  v_clean_loc TEXT;
BEGIN
  -- 1. Authenticated caller check
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required to create a community group.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Clean and validate inputs
  v_clean_name := trim(p_name);
  IF v_clean_name IS NULL OR length(v_clean_name) = 0 OR length(v_clean_name) > 150 THEN
    RAISE EXCEPTION 'Group name must be between 1 and 150 characters.' USING ERRCODE = '23514';
  END IF;

  v_clean_slug := lower(trim(p_slug));
  IF v_clean_slug IS NULL OR length(v_clean_slug) < 3 OR length(v_clean_slug) > 100 OR NOT (v_clean_slug ~ '^[a-z0-9-]+$') THEN
    RAISE EXCEPTION 'Group slug must be 3-100 characters containing only lowercase letters, numbers, and hyphens.'
      USING ERRCODE = '23514';
  END IF;

  -- Check slug uniqueness early with clear error
  IF EXISTS (SELECT 1 FROM public.groups WHERE slug = v_clean_slug) THEN
    RAISE EXCEPTION 'A group with this slug already exists.' USING ERRCODE = '23505';
  END IF;

  v_clean_desc := NULLIF(trim(p_description), '');
  IF v_clean_desc IS NOT NULL AND length(v_clean_desc) > 2000 THEN
    RAISE EXCEPTION 'Group description must not exceed 2000 characters.' USING ERRCODE = '23514';
  END IF;

  v_clean_loc := NULLIF(trim(p_location), '');
  IF v_clean_loc IS NOT NULL AND length(v_clean_loc) > 200 THEN
    RAISE EXCEPTION 'Group location must not exceed 200 characters.' USING ERRCODE = '23514';
  END IF;

  -- 3. Insert group record (starts unverified)
  INSERT INTO public.groups (
    name,
    slug,
    description,
    group_type,
    location,
    is_verified,
    is_private,
    created_by
  ) VALUES (
    v_clean_name,
    v_clean_slug,
    v_clean_desc,
    COALESCE(p_group_type, 'OTHER'),
    v_clean_loc,
    FALSE,
    COALESCE(p_is_private, FALSE),
    v_caller
  ) RETURNING id INTO v_group_id;

  -- 4. Atomically insert creator as group ADMIN
  INSERT INTO public.group_members (
    group_id,
    user_id,
    role,
    joined_at
  ) VALUES (
    v_group_id,
    v_caller,
    'ADMIN',
    NOW()
  );

  -- 5. Audit log event
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'group',
    v_group_id,
    NULL,
    jsonb_build_object(
      'name', v_clean_name,
      'slug', v_clean_slug,
      'group_type', p_group_type,
      'is_private', p_is_private
    ),
    jsonb_build_object(
      'action', 'CREATE_COMMUNITY_GROUP',
      'creator_id', v_caller
    )
  );

  RETURN v_group_id;
END;
$$;

COMMENT ON FUNCTION public.create_community_group(TEXT, TEXT, TEXT, public.group_type, TEXT, BOOLEAN) IS
  'Atomically creates a community group and sets the authenticated caller as initial ADMIN.';

-- 5B. RPC: public.join_community_group
-- Allows an authenticated user to join a public active group as a MEMBER.
CREATE OR REPLACE FUNCTION public.join_community_group(
  p_group_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group public.groups%ROWTYPE;
  v_member_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required to join a group.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_group
  FROM public.groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group does not exist.' USING ERRCODE = 'P0002';
  END IF;

  IF v_group.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot join an archived or deleted group.' USING ERRCODE = '23514';
  END IF;

  IF v_group.is_private THEN
    RAISE EXCEPTION 'Cannot directly join a private group. An invitation or admin approval is required.'
      USING ERRCODE = '42501';
  END IF;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'User is already a member of this group.' USING ERRCODE = '23505';
  END IF;

  -- Forces role to MEMBER strictly
  INSERT INTO public.group_members (
    group_id,
    user_id,
    role,
    joined_at
  ) VALUES (
    p_group_id,
    v_caller,
    'MEMBER',
    NOW()
  ) RETURNING id INTO v_member_id;

  RETURN v_member_id;
END;
$$;

COMMENT ON FUNCTION public.join_community_group(UUID) IS
  'Allows an authenticated user to join an active public group strictly as a MEMBER.';

-- 5C. RPC: public.leave_community_group
-- Allows an authenticated member to leave a group.
CREATE OR REPLACE FUNCTION public.leave_community_group(
  p_group_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_membership public.group_members%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_membership
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = v_caller;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a member of this group.' USING ERRCODE = 'P0002';
  END IF;

  -- DELETE trigger handle_group_member_delete_guard validates sole-admin invariant
  DELETE FROM public.group_members
  WHERE id = v_membership.id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.leave_community_group(UUID) IS
  'Allows an authenticated member to leave a group, protected by sole-admin guard trigger.';

-- 5D. RPC: public.add_group_member
-- Allows group ADMIN or MODERATOR to add members without arbitrary role escalation.
CREATE OR REPLACE FUNCTION public.add_group_member(
  p_group_id UUID,
  p_target_user_id UUID,
  p_role public.group_role DEFAULT 'MEMBER'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_caller_role public.group_role;
  v_is_mod BOOLEAN;
  v_new_member_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  SELECT role INTO v_caller_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = v_caller;

  IF NOT (v_caller_role IN ('ADMIN', 'MODERATOR') OR v_is_mod) THEN
    RAISE EXCEPTION 'Unauthorized: Only group managers or community moderators can add members.'
      USING ERRCODE = '42501';
  END IF;

  -- Group MODERATOR can only add MEMBERs (cannot assign ADMIN or MODERATOR)
  IF v_caller_role = 'MODERATOR' AND NOT v_is_mod AND p_role <> 'MEMBER' THEN
    RAISE EXCEPTION 'Unauthorized: Group moderators can only add standard members.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this group.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.group_members (
    group_id,
    user_id,
    role,
    joined_at
  ) VALUES (
    p_group_id,
    p_target_user_id,
    p_role,
    NOW()
  ) RETURNING id INTO v_new_member_id;

  -- Audit log event
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'group_member',
    v_new_member_id,
    NULL,
    jsonb_build_object('role', p_role, 'user_id', p_target_user_id),
    jsonb_build_object(
      'action', 'ADD_GROUP_MEMBER',
      'group_id', p_group_id,
      'actor_id', v_caller
    )
  );

  RETURN v_new_member_id;
END;
$$;

COMMENT ON FUNCTION public.add_group_member(UUID, UUID, public.group_role) IS
  'Adds a member to a group. Guarded against unauthorized role escalation.';

-- 5E. RPC: public.remove_group_member
-- Allows group ADMIN or global community moderators to remove a member.
CREATE OR REPLACE FUNCTION public.remove_group_member(
  p_group_id UUID,
  p_target_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_caller_role public.group_role;
  v_is_mod BOOLEAN;
  v_target_membership public.group_members%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  SELECT role INTO v_caller_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = v_caller;

  IF NOT (v_caller_role = 'ADMIN' OR v_is_mod) THEN
    RAISE EXCEPTION 'Unauthorized: Only group administrators or community moderators can remove members.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target_membership
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a member of this group.' USING ERRCODE = 'P0002';
  END IF;

  -- DELETE trigger handle_group_member_delete_guard validates sole-admin invariant
  DELETE FROM public.group_members
  WHERE id = v_target_membership.id;

  -- Audit log event
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'group_member',
    v_target_membership.id,
    jsonb_build_object('role', v_target_membership.role, 'user_id', p_target_user_id),
    NULL,
    jsonb_build_object(
      'action', 'REMOVE_GROUP_MEMBER',
      'group_id', p_group_id,
      'actor_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.remove_group_member(UUID, UUID) IS
  'Removes a group member. Restricted to group ADMIN or global moderators.';

-- 5F. RPC: public.update_group_member_role
-- Allows group ADMIN or global community moderators to update a member''s role.
CREATE OR REPLACE FUNCTION public.update_group_member_role(
  p_group_id UUID,
  p_target_user_id UUID,
  p_new_role public.group_role
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_caller_role public.group_role;
  v_is_mod BOOLEAN;
  v_target_membership public.group_members%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  SELECT role INTO v_caller_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = v_caller;

  IF NOT (v_caller_role = 'ADMIN' OR v_is_mod) THEN
    RAISE EXCEPTION 'Unauthorized: Only a group administrator or community moderator can update member roles.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target_membership
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a member of this group.' USING ERRCODE = 'P0002';
  END IF;

  -- UPDATE trigger handle_group_member_update_guard enforces sole-admin demotion protection
  UPDATE public.group_members
  SET role = p_new_role
  WHERE id = v_target_membership.id;

  -- Audit log event
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'group_member',
    v_target_membership.id,
    jsonb_build_object('role', v_target_membership.role),
    jsonb_build_object('role', p_new_role),
    jsonb_build_object(
      'action', 'UPDATE_GROUP_MEMBER_ROLE',
      'group_id', p_group_id,
      'target_user_id', p_target_user_id,
      'actor_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.update_group_member_role(UUID, UUID, public.group_role) IS
  'Updates a group member role. Strictly restricted to group ADMIN or global moderators.';

-- 5G. RPC: public.archive_community_group
-- Allows group ADMIN or global community moderators to soft-delete/archive a group.
CREATE OR REPLACE FUNCTION public.archive_community_group(
  p_group_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_caller_role public.group_role;
  v_is_mod BOOLEAN;
  v_group public.groups%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  SELECT role INTO v_caller_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = v_caller;

  IF NOT (v_caller_role = 'ADMIN' OR v_is_mod) THEN
    RAISE EXCEPTION 'Unauthorized: Only a group administrator or community moderator can archive a group.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_group
  FROM public.groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group does not exist.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.groups
  SET
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_group_id;

  -- Audit log event
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'group',
    p_group_id,
    jsonb_build_object('deleted_at', v_group.deleted_at),
    jsonb_build_object('deleted_at', NOW()),
    jsonb_build_object(
      'action', 'ARCHIVE_COMMUNITY_GROUP',
      'actor_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.archive_community_group(UUID) IS
  'Soft-deletes/archives a community group. Restricted to group ADMIN or global moderators.';

-- 5H. RPC: public.verify_community_group
-- Allows global community moderators to grant or revoke group verification.
CREATE OR REPLACE FUNCTION public.verify_community_group(
  p_group_id UUID,
  p_is_verified BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group public.groups%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_community_moderator() THEN
    RAISE EXCEPTION 'Unauthorized: Only community moderators can verify groups.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_group
  FROM public.groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group does not exist.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.groups
  SET
    is_verified = p_is_verified,
    updated_at = NOW()
  WHERE id = p_group_id;

  -- Audit log event
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'group',
    p_group_id,
    jsonb_build_object('is_verified', v_group.is_verified),
    jsonb_build_object('is_verified', p_is_verified),
    jsonb_build_object(
      'action', 'VERIFY_COMMUNITY_GROUP',
      'moderator_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.verify_community_group(UUID, BOOLEAN) IS
  'Grants or revokes community group verification. Guarded strictly by is_community_moderator().';

-- -----------------------------------------------------------------------------
-- 5I. Narrowly Scoped RLS Helper Functions (SECURITY DEFINER, Non-Recursive)
-- -----------------------------------------------------------------------------

-- Helper 1: Checks whether a user is an active member of a group.
-- SECURITY DEFINER breaks RLS recursion when evaluated inside groups RLS policies.
CREATE OR REPLACE FUNCTION public.is_group_member(
  p_group_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.is_group_member(UUID, UUID) IS
  'SECURITY DEFINER helper checking group membership without triggering recursive RLS evaluation.';

-- Helper 2: Checks whether a user is an ADMIN of a group.
-- SECURITY DEFINER breaks RLS recursion when evaluated inside groups UPDATE policies.
CREATE OR REPLACE FUNCTION public.is_group_admin(
  p_group_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
      AND role = 'ADMIN'
  );
$$;

COMMENT ON FUNCTION public.is_group_admin(UUID, UUID) IS
  'SECURITY DEFINER helper checking group admin role without triggering recursive RLS evaluation.';

-- Helper 3: Checks whether a group is visible to a user.
-- SECURITY DEFINER breaks RLS recursion when evaluated inside group_members RLS policies.
CREATE OR REPLACE FUNCTION public.can_view_group(
  p_group_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group public.groups%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_community_moderator() THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO v_group
  FROM public.groups
  WHERE id = p_group_id;

  IF NOT FOUND OR v_group.deleted_at IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT v_group.is_private OR v_group.created_by = p_user_id THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.can_view_group(UUID, UUID) IS
  'SECURITY DEFINER helper checking parent group visibility for members without recursive RLS evaluation.';

-- -----------------------------------------------------------------------------
-- 6. Hardened Row Level Security Policies
-- -----------------------------------------------------------------------------

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- GROUPS POLICIES
-- -----------------------------------------------------------------------------

-- SELECT: Active public groups discoverable by authenticated users.
-- Active private groups require membership or moderator role.
-- Soft-deleted groups are visible only to moderators.
-- Uses is_group_member() helper to eliminate recursive RLS query into group_members.
DROP POLICY IF EXISTS "groups_select_authenticated" ON public.groups;
CREATE POLICY "groups_select_authenticated"
  ON public.groups
  FOR SELECT
  TO authenticated
  USING (
    (
      deleted_at IS NULL
      AND (
        NOT is_private
        OR created_by = auth.uid()
        OR public.is_group_member(id, auth.uid())
      )
    )
    OR public.is_community_moderator()
  );

-- INSERT: Direct insert denied. Group creation must occur via create_community_group() RPC.
DROP POLICY IF EXISTS "groups_insert_authenticated" ON public.groups;
DROP POLICY IF EXISTS "groups_insert_deny" ON public.groups;
CREATE POLICY "groups_insert_deny"
  ON public.groups
  FOR INSERT
  TO authenticated
  WITH CHECK (FALSE);

-- UPDATE: Group admin or global community moderator can update group metadata.
-- Uses is_group_admin() helper to eliminate recursive RLS query into group_members.
DROP POLICY IF EXISTS "groups_update_admin" ON public.groups;
CREATE POLICY "groups_update_admin"
  ON public.groups
  FOR UPDATE
  TO authenticated
  USING (
    public.is_group_admin(id, auth.uid())
    OR public.is_community_moderator()
  )
  WITH CHECK (
    public.is_group_admin(id, auth.uid())
    OR public.is_community_moderator()
  );

-- DELETE: Hard physical DELETE is denied. Soft-deletion is managed via deleted_at.
DROP POLICY IF EXISTS "groups_delete_deny" ON public.groups;
CREATE POLICY "groups_delete_deny"
  ON public.groups
  FOR DELETE
  TO authenticated
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- GROUP MEMBERS POLICIES
-- -----------------------------------------------------------------------------

-- SELECT: Visible to authenticated users if the parent group is visible.
-- Uses can_view_group() helper to eliminate recursive RLS query back into groups.
DROP POLICY IF EXISTS "group_members_select_authenticated" ON public.group_members;
CREATE POLICY "group_members_select_authenticated"
  ON public.group_members
  FOR SELECT
  TO authenticated
  USING (
    public.can_view_group(group_id, auth.uid())
  );

-- INSERT: Direct insert denied. Additions must occur via join_community_group() or add_group_member() RPCs.
DROP POLICY IF EXISTS "group_members_insert_authorized" ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert_deny" ON public.group_members;
CREATE POLICY "group_members_insert_deny"
  ON public.group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (FALSE);

-- UPDATE: Direct update denied. Role changes must route through update_group_member_role() RPC.
DROP POLICY IF EXISTS "group_members_update_admin" ON public.group_members;
DROP POLICY IF EXISTS "group_members_update_deny" ON public.group_members;
CREATE POLICY "group_members_update_deny"
  ON public.group_members
  FOR UPDATE
  TO authenticated
  WITH CHECK (FALSE);

-- DELETE: Direct delete denied. Removals must route through leave_community_group() or remove_group_member() RPCs.
DROP POLICY IF EXISTS "group_members_delete_authorized" ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete_deny" ON public.group_members;
CREATE POLICY "group_members_delete_deny"
  ON public.group_members
  FOR DELETE
  TO authenticated
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 7. Explicit Least-Privilege Table & RPC Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.groups FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.group_members FROM PUBLIC, anon;

-- Direct mutations denied; SELECT and UPDATE granted on groups for metadata management
GRANT SELECT, UPDATE ON TABLE public.groups TO authenticated;

-- Direct mutations on group_members denied; read access granted to authenticated
GRANT SELECT ON TABLE public.group_members TO authenticated;

-- Internal RLS helper functions:
-- Deny EXECUTE from PUBLIC, anon, and authenticated.
-- Used internally by RLS evaluation context; never directly callable by clients.
REVOKE EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_group_admin(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_view_group(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Authoritative Application RPCs:
-- Revoke execution privileges from PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.create_community_group(TEXT, TEXT, TEXT, public.group_type, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_community_group(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leave_community_group(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_group_member(UUID, UUID, public.group_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_group_member_role(UUID, UUID, public.group_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.archive_community_group(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_community_group(UUID, BOOLEAN) FROM PUBLIC, anon;

-- Grant execution on authoritative application RPCs to authenticated users
GRANT EXECUTE ON FUNCTION public.create_community_group(TEXT, TEXT, TEXT, public.group_type, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_community_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_community_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_group_member(UUID, UUID, public.group_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_group_member_role(UUID, UUID, public.group_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_community_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_community_group(UUID, BOOLEAN) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261007120000_create_community_announcements.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261007120000_create_community_announcements.sql
-- Purpose:   Create Community Announcements foundation schema, hardened RLS policies,
--             triggers, and authoritative RPC functions:
--             1. public.announcement_type and public.announcement_status enums
--             2. public.announcements table with indexes, constraints & updated_at trigger
--             3. Invariant Triggers:
--                - public.handle_announcement_update_guard (immutable fields guard)
--             4. Authoritative RPCs (SECURITY DEFINER):
--                - public.create_community_announcement (group or global announcement creation)
--                - public.update_community_announcement (authoritative metadata updates)
--                - public.archive_community_announcement (soft-archive announcement)
--                - public.delete_community_announcement (soft-delete announcement)
--             5. Hardened Row Level Security policies (RPC-authoritative mutations)
--             6. Explicit least-privilege table grants (zero anon, mutations via RPCs only)
-- Phase:     Phase 10 — Subtask 2 (Community Announcements / Notice Board)
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. PERSON != USER:
--    An announcement author is an interactive user account (public.profiles / auth.users),
--    NOT a census Person record. Author identity is linked strictly via auth.users(id).
--
-- 2. FAMILY != GROUP:
--    Announcements may optionally be associated with a civic community group
--    (public.groups), or be community-wide (group_id IS NULL), completely
--    independent of genealogical families.
--
-- 3. SCOPED BROADCAST AUTHORIZATION:
--    - Group announcements (group_id IS NOT NULL) require group ADMIN/MODERATOR or global moderator.
--    - Global community announcements (group_id IS NULL) require global community moderator.
--    - Regular members cannot post unauthorized community-wide notices.
--
-- 4. RPC-AUTHORITATIVE MUTATIONS & AUDIT LOGGING:
--    Direct INSERT, UPDATE, and DELETE on public.announcements are DENIED.
--    All mutations route through SECURITY DEFINER RPCs with fixed search_path = public
--    and record immutable audit events using ADMIN_ACTION.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums: public.announcement_type & public.announcement_status
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'announcement_type' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.announcement_type AS ENUM (
      'GENERAL',     -- General community notices & circulars
      'URGENT',      -- Urgent advisories & alerts
      'EVENT',       -- Upcoming festival or gathering notice
      'BEREAVEMENT', -- Obituary / Besnu / Shraddhanjali notice
      'CELEBRATION'  -- Community achievements, births & felicitation
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'announcement_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.announcement_status AS ENUM (
      'DRAFT',     -- Work-in-progress announcement
      'PUBLISHED', -- Active and visible to authorized audience
      'ARCHIVED'   -- Historical or expired announcement
    );
  END IF;
END $$;

COMMENT ON TYPE public.announcement_type IS 'Categories of community announcements and notices.';
COMMENT ON TYPE public.announcement_status IS 'Lifecycle statuses for community announcements.';

-- -----------------------------------------------------------------------------
-- 2. Table: public.announcements
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  announcement_type public.announcement_type NOT NULL DEFAULT 'GENERAL',
  status public.announcement_status NOT NULL DEFAULT 'PUBLISHED',
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT announcements_title_length
    CHECK (length(trim(title)) > 0 AND length(title) <= 200),
  CONSTRAINT announcements_content_length
    CHECK (length(trim(content)) > 0 AND length(content) <= 10000)
);

COMMENT ON TABLE public.announcements IS
  'Community announcements and notice board posts for groups or community-wide broadcasts.';
COMMENT ON COLUMN public.announcements.group_id IS
  'Optional group association. NULL indicates a community-wide global announcement.';
COMMENT ON COLUMN public.announcements.author_id IS
  'User identity of author (auth.users). PERSON != USER invariant preserved.';
COMMENT ON COLUMN public.announcements.is_pinned IS
  'Whether this notice is pinned to the top of the board.';
COMMENT ON COLUMN public.announcements.published_at IS
  'Timestamp when the announcement was first published.';
COMMENT ON COLUMN public.announcements.deleted_at IS
  'Soft-deletion timestamp. Soft-deleted announcements are hidden from standard queries.';

-- Indexes for public.announcements
CREATE INDEX IF NOT EXISTS idx_announcements_group_id
  ON public.announcements (group_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_status
  ON public.announcements (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_type
  ON public.announcements (announcement_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_published_at
  ON public.announcements (published_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_pinned_published
  ON public.announcements (is_pinned DESC, published_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_author_id
  ON public.announcements (author_id)
  WHERE deleted_at IS NULL;

-- Trigger: auto-update updated_at timestamp
DROP TRIGGER IF EXISTS announcements_handle_updated_at ON public.announcements;
CREATE TRIGGER announcements_handle_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Invariant Triggers
-- -----------------------------------------------------------------------------

-- Trigger 3A: public.handle_announcement_update_guard
-- Protects immutable identity fields on announcements (id, created_at, author_id, group_id).
CREATE OR REPLACE FUNCTION public.handle_announcement_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Field id is immutable on announcements.' USING ERRCODE = '23514';
  END IF;

  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Field created_at is immutable on announcements.' USING ERRCODE = '23514';
  END IF;

  IF NEW.author_id <> OLD.author_id THEN
    RAISE EXCEPTION 'Field author_id is immutable on announcements.' USING ERRCODE = '23514';
  END IF;

  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'Field group_id cannot be changed once an announcement is created.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_announcement_update_guard() IS
  'Guards immutable fields (id, created_at, author_id, group_id) on announcements.';

DROP TRIGGER IF EXISTS announcements_update_guard ON public.announcements;
CREATE TRIGGER announcements_update_guard
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_announcement_update_guard();

-- -----------------------------------------------------------------------------
-- 4. Authoritative Server RPC Functions (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- 4A. RPC: public.create_community_announcement
-- Creates an announcement with strict authorization checks and audit logging.
CREATE OR REPLACE FUNCTION public.create_community_announcement(
  p_title TEXT,
  p_content TEXT,
  p_announcement_type public.announcement_type DEFAULT 'GENERAL',
  p_group_id UUID DEFAULT NULL,
  p_status public.announcement_status DEFAULT 'PUBLISHED',
  p_is_pinned BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_announcement_id UUID;
  v_clean_title TEXT;
  v_clean_content TEXT;
  v_is_mod BOOLEAN;
  v_caller_role public.group_role;
  v_published_at TIMESTAMPTZ;
  v_effective_type public.announcement_type;
  v_effective_status public.announcement_status;
  v_effective_pinned BOOLEAN;
BEGIN
  -- 1. Authenticated caller check
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required to post an announcement.'
      USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  -- 2. Input validation
  v_clean_title := trim(p_title);
  IF v_clean_title IS NULL OR length(v_clean_title) = 0 OR length(v_clean_title) > 200 THEN
    RAISE EXCEPTION 'Announcement title must be between 1 and 200 characters.' USING ERRCODE = '23514';
  END IF;

  v_clean_content := trim(p_content);
  IF v_clean_content IS NULL OR length(v_clean_content) = 0 OR length(v_clean_content) > 10000 THEN
    RAISE EXCEPTION 'Announcement content must be between 1 and 10000 characters.' USING ERRCODE = '23514';
  END IF;

  -- 3. Scope authorization
  IF p_group_id IS NOT NULL THEN
    -- Verify target group exists and is active
    IF NOT EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = p_group_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Target community group does not exist or has been archived.' USING ERRCODE = 'P0002';
    END IF;

    -- Verify caller is group ADMIN, MODERATOR, or global moderator
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_caller;

    IF NOT (v_caller_role IN ('ADMIN', 'MODERATOR') OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only group administrators or community moderators can post announcements for this group.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Global community-wide announcement requires global moderator role
    IF NOT v_is_mod THEN
      RAISE EXCEPTION 'Unauthorized: Only community moderators can post global community announcements.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Determine effective attributes and published_at
  -- Invariant: PUBLISHED announcements must always have published_at populated.
  -- DRAFT announcements have published_at = NULL until explicitly published.
  v_effective_type := COALESCE(p_announcement_type, 'GENERAL');
  v_effective_status := COALESCE(p_status, 'PUBLISHED');
  v_effective_pinned := COALESCE(p_is_pinned, FALSE);

  IF v_effective_status = 'PUBLISHED' THEN
    v_published_at := NOW();
  ELSE
    v_published_at := NULL;
  END IF;

  -- 4. Insert announcement
  INSERT INTO public.announcements (
    title,
    content,
    announcement_type,
    status,
    group_id,
    author_id,
    is_pinned,
    published_at
  ) VALUES (
    v_clean_title,
    v_clean_content,
    v_effective_type,
    v_effective_status,
    p_group_id,
    v_caller,
    v_effective_pinned,
    v_published_at
  ) RETURNING id INTO v_announcement_id;

  -- 5. Audit log event
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'announcement',
    v_announcement_id,
    NULL,
    jsonb_build_object(
      'title', v_clean_title,
      'announcement_type', v_effective_type,
      'status', v_effective_status,
      'group_id', p_group_id,
      'is_pinned', v_effective_pinned
    ),
    jsonb_build_object(
      'action', 'CREATE_ANNOUNCEMENT',
      'author_id', v_caller
    )
  );

  RETURN v_announcement_id;
END;
$$;

COMMENT ON FUNCTION public.create_community_announcement(TEXT, TEXT, public.announcement_type, UUID, public.announcement_status, BOOLEAN) IS
  'Authoritatively creates a community announcement with scope checks and audit logging.';

-- 4B. RPC: public.update_community_announcement
-- Authoritatively updates an existing announcement with ownership/manager checks.
CREATE OR REPLACE FUNCTION public.update_community_announcement(
  p_announcement_id UUID,
  p_title TEXT,
  p_content TEXT,
  p_announcement_type public.announcement_type,
  p_status public.announcement_status,
  p_is_pinned BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_is_mod BOOLEAN;
  v_announcement public.announcements%ROWTYPE;
  v_caller_role public.group_role;
  v_clean_title TEXT;
  v_clean_content TEXT;
  v_published_at TIMESTAMPTZ;
  v_effective_type public.announcement_type;
  v_effective_status public.announcement_status;
  v_effective_pinned BOOLEAN;
BEGIN
  -- 1. Authenticated caller check
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required to update an announcement.'
      USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  -- 2. Select target announcement
  SELECT * INTO v_announcement
  FROM public.announcements
  WHERE id = p_announcement_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement does not exist or has been deleted.' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Authorization check
  IF v_announcement.group_id IS NOT NULL THEN
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = v_announcement.group_id AND user_id = v_caller;

    IF NOT (v_caller = v_announcement.author_id OR v_caller_role = 'ADMIN' OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only the announcement author, group administrators, or community moderators can update this announcement.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT v_is_mod THEN
      RAISE EXCEPTION 'Unauthorized: Only community moderators can update global community announcements.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 4. Clean inputs
  v_clean_title := trim(p_title);
  IF v_clean_title IS NULL OR length(v_clean_title) = 0 OR length(v_clean_title) > 200 THEN
    RAISE EXCEPTION 'Announcement title must be between 1 and 200 characters.' USING ERRCODE = '23514';
  END IF;

  v_clean_content := trim(p_content);
  IF v_clean_content IS NULL OR length(v_clean_content) = 0 OR length(v_clean_content) > 10000 THEN
    RAISE EXCEPTION 'Announcement content must be between 1 and 10000 characters.' USING ERRCODE = '23514';
  END IF;

  -- Determine effective attributes
  -- Lifecycle policy:
  -- - DRAFT -> PUBLISHED: sets published_at = NOW() upon initial publication.
  -- - Existing PUBLISHED: retains original published_at timestamp across updates.
  -- - PUBLISHED -> ARCHIVED: retains original published_at.
  -- - ARCHIVED -> PUBLISHED: reopening an archived announcement is permitted for authorized
  --   editors to correct accidental archiving or recirculate notices, retaining the original published_at.
  v_effective_type := COALESCE(p_announcement_type, v_announcement.announcement_type);
  v_effective_status := COALESCE(p_status, v_announcement.status);
  v_effective_pinned := COALESCE(p_is_pinned, v_announcement.is_pinned);

  v_published_at := v_announcement.published_at;
  IF v_effective_status = 'PUBLISHED' AND v_published_at IS NULL THEN
    v_published_at := NOW();
  END IF;

  -- 5. Perform update
  UPDATE public.announcements
  SET
    title = v_clean_title,
    content = v_clean_content,
    announcement_type = v_effective_type,
    status = v_effective_status,
    is_pinned = v_effective_pinned,
    published_at = v_published_at,
    updated_at = NOW()
  WHERE id = p_announcement_id;

  -- 6. Audit log
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'announcement',
    p_announcement_id,
    jsonb_build_object(
      'title', v_announcement.title,
      'status', v_announcement.status,
      'is_pinned', v_announcement.is_pinned
    ),
    jsonb_build_object(
      'title', v_clean_title,
      'status', v_effective_status,
      'is_pinned', v_effective_pinned
    ),
    jsonb_build_object(
      'action', 'UPDATE_ANNOUNCEMENT',
      'actor_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.update_community_announcement(UUID, TEXT, TEXT, public.announcement_type, public.announcement_status, BOOLEAN) IS
  'Authoritatively updates an announcement with authorization checks and audit logging.';

-- 4C. RPC: public.archive_community_announcement
-- Authoritatively transitions an announcement to ARCHIVED status.
CREATE OR REPLACE FUNCTION public.archive_community_announcement(
  p_announcement_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_is_mod BOOLEAN;
  v_announcement public.announcements%ROWTYPE;
  v_caller_role public.group_role;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  SELECT * INTO v_announcement
  FROM public.announcements
  WHERE id = p_announcement_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement does not exist or has been deleted.' USING ERRCODE = 'P0002';
  END IF;

  IF v_announcement.group_id IS NOT NULL THEN
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = v_announcement.group_id AND user_id = v_caller;

    IF NOT (v_caller = v_announcement.author_id OR v_caller_role IN ('ADMIN', 'MODERATOR') OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only the author, group managers, or community moderators can archive this announcement.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT v_is_mod THEN
      RAISE EXCEPTION 'Unauthorized: Only community moderators can archive global community announcements.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.announcements
  SET
    status = 'ARCHIVED',
    updated_at = NOW()
  WHERE id = p_announcement_id;

  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'announcement',
    p_announcement_id,
    jsonb_build_object('status', v_announcement.status),
    jsonb_build_object('status', 'ARCHIVED'),
    jsonb_build_object(
      'action', 'ARCHIVE_ANNOUNCEMENT',
      'actor_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.archive_community_announcement(UUID) IS
  'Archives an announcement with authorization checks and audit logging.';

-- 4D. RPC: public.delete_community_announcement
-- Authoritatively soft-deletes an announcement.
CREATE OR REPLACE FUNCTION public.delete_community_announcement(
  p_announcement_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_is_mod BOOLEAN;
  v_announcement public.announcements%ROWTYPE;
  v_caller_role public.group_role;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  SELECT * INTO v_announcement
  FROM public.announcements
  WHERE id = p_announcement_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement does not exist or has already been deleted.' USING ERRCODE = 'P0002';
  END IF;

  IF v_announcement.group_id IS NOT NULL THEN
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = v_announcement.group_id AND user_id = v_caller;

    IF NOT (v_caller = v_announcement.author_id OR v_caller_role = 'ADMIN' OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only the author, group administrators, or community moderators can delete this announcement.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT v_is_mod THEN
      RAISE EXCEPTION 'Unauthorized: Only community moderators can delete global community announcements.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.announcements
  SET
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_announcement_id;

  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'announcement',
    p_announcement_id,
    jsonb_build_object('deleted_at', v_announcement.deleted_at),
    jsonb_build_object('deleted_at', NOW()),
    jsonb_build_object(
      'action', 'DELETE_ANNOUNCEMENT',
      'actor_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.delete_community_announcement(UUID) IS
  'Soft-deletes an announcement with authorization checks and audit logging.';

-- -----------------------------------------------------------------------------
-- 5. Hardened Row Level Security Policies
-- -----------------------------------------------------------------------------

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- ANNOUNCEMENTS SELECT POLICY
-- -----------------------------------------------------------------------------

-- SELECT:
-- 1. Active Published & Archived announcements:
--    - Global (group_id IS NULL) visible to all authenticated users.
--    - Group announcements visible if parent group is visible (active and not private, or user is member/creator).
-- 2. Active Draft announcements:
--    - Visible to author, group managers, or global moderators.
-- 3. Soft-deleted announcements:
--    - Visible only to global community moderators.
DROP POLICY IF EXISTS "announcements_select_authenticated" ON public.announcements;
CREATE POLICY "announcements_select_authenticated"
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (
    (
      deleted_at IS NULL
      AND (
        (
          status IN ('PUBLISHED', 'ARCHIVED')
          AND (
            group_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.groups g
              WHERE g.id = announcements.group_id
                AND g.deleted_at IS NULL
                AND (
                  NOT g.is_private
                  OR g.created_by = auth.uid()
                  OR EXISTS (
                    SELECT 1 FROM public.group_members gm
                    WHERE gm.group_id = g.id
                      AND gm.user_id = auth.uid()
                  )
                )
            )
          )
        )
        OR (
          status = 'DRAFT'
          AND (
            author_id = auth.uid()
            OR (
              group_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM public.group_members gm
                WHERE gm.group_id = announcements.group_id
                  AND gm.user_id = auth.uid()
                  AND gm.role IN ('ADMIN', 'MODERATOR')
              )
            )
          )
        )
      )
    )
    OR public.is_community_moderator()
  );

-- Direct INSERT denied: creations route strictly through create_community_announcement() RPC.
DROP POLICY IF EXISTS "announcements_insert_deny" ON public.announcements;
CREATE POLICY "announcements_insert_deny"
  ON public.announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (FALSE);

-- Direct UPDATE denied: updates route strictly through update/archive/delete RPCs.
DROP POLICY IF EXISTS "announcements_update_deny" ON public.announcements;
CREATE POLICY "announcements_update_deny"
  ON public.announcements
  FOR UPDATE
  TO authenticated
  WITH CHECK (FALSE);

-- Direct DELETE denied: physical deletions strictly blocked; soft-delete via delete RPC.
DROP POLICY IF EXISTS "announcements_delete_deny" ON public.announcements;
CREATE POLICY "announcements_delete_deny"
  ON public.announcements
  FOR DELETE
  TO authenticated
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 6. Explicit Least-Privilege Table & RPC Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.announcements FROM PUBLIC, anon;

-- Direct mutations denied; SELECT granted on announcements to authenticated
GRANT SELECT ON TABLE public.announcements TO authenticated;

-- Authoritative Application RPCs:
-- Revoke execution privileges from PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.create_community_announcement(TEXT, TEXT, public.announcement_type, UUID, public.announcement_status, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_community_announcement(UUID, TEXT, TEXT, public.announcement_type, public.announcement_status, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.archive_community_announcement(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_community_announcement(UUID) FROM PUBLIC, anon;

-- Grant execution on authoritative application RPCs to authenticated users
GRANT EXECUTE ON FUNCTION public.create_community_announcement(TEXT, TEXT, public.announcement_type, UUID, public.announcement_status, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_community_announcement(UUID, TEXT, TEXT, public.announcement_type, public.announcement_status, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_community_announcement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_community_announcement(UUID) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261007140000_create_community_events.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261007140000_create_community_events.sql
-- Purpose:   Create Community Events & RSVP foundation schema, hardened RLS policies,
--             triggers, and authoritative RPC functions:
--             1. public.event_type, public.event_status, and public.event_rsvp_status enums
--             2. public.events table with constraints, indexes & updated_at trigger
--             3. public.event_rsvps table with unique constraint, guest count checks & updated_at trigger
--             4. Invariant Triggers:
--                - public.handle_event_update_guard (immutable fields id, created_at, creator_id, group_id)
--                - public.handle_event_rsvp_update_guard (immutable fields id, created_at, event_id, user_id)
--             5. Internal RLS Helper Functions (SECURITY DEFINER):
--                - public.can_view_event(UUID, UUID)
--                - public.can_manage_event(UUID, UUID)
--             6. Authoritative Application RPCs (SECURITY DEFINER):
--                - public.create_community_event (scope-validated event creation + audit log)
--                - public.update_community_event (organizer-authorized update + audit log)
--                - public.cancel_community_event (organizer-authorized cancellation + audit log)
--                - public.archive_community_event (organizer-authorized archival + audit log)
--                - public.delete_community_event (soft-deletion + audit log)
--                - public.set_event_rsvp (atomic row-locked capacity check & upsert)
--                - public.cancel_event_rsvp (releases capacity)
--             7. Hardened Row Level Security policies (RPC-authoritative mutations)
--             8. Explicit least-privilege table & RPC grants (zero anon mutations)
-- Phase:     Phase 10 — Subtask 3 (Community Events + RSVP)
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. PERSON != USER:
--    Event creators and RSVP attendees are authenticated user accounts
--    (public.profiles / auth.users), NOT census Person records.
--    No census Person records are linked, created, or modified by event operations.
--
-- 2. FAMILY != GROUP:
--    Events belong either to a community group (public.groups) or to the community
--    at large (group_id IS NULL), completely decoupled from genealogical families.
--
-- 3. CAPACITY IS DATABASE-AUTHORITATIVE:
--    Row-level locking (SELECT ... FOR UPDATE) on public.events inside set_event_rsvp()
--    guarantees serial execution during seat reservation, eliminating concurrent overbooking.
--
-- 4. PRIVACY-FIRST ATTENDEE VISIBILITY:
--    Regular users receive aggregate counts; detailed guest notes and full rosters
--    are restricted to organizers (creator, group admin/moderator, global moderator).
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'event_type' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.event_type AS ENUM (
      'GENERAL',     -- General community gathering
      'FESTIVAL',    -- Cultural or religious celebration
      'MEETING',     -- Committee, AGM, or executive meeting
      'SPORTS',      -- Tournament, match, or recreation
      'YOUTH',       -- Youth wing program or workshop
      'CULTURAL',    -- Drama, music, or heritage event
      'WORKSHOP',    -- Training or educational session
      'OTHER'        -- Other community gatherings
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'event_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.event_status AS ENUM (
      'DRAFT',       -- Visible only to organizers
      'PUBLISHED',   -- Active and discoverable
      'CANCELLED',   -- Event called off; RSVPs closed
      'COMPLETED',   -- Event has concluded
      'ARCHIVED'     -- Retained in historical record
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'event_rsvp_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.event_rsvp_status AS ENUM (
      'GOING',       -- Confirmed attending (consumes 1 + guest_count seats)
      'MAYBE',       -- Tentative attendance (does not reserve capacity)
      'NOT_GOING'    -- Declined attendance (releases capacity)
    );
  END IF;
END $$;

COMMENT ON TYPE public.event_type IS 'Categories of community gatherings and programs.';
COMMENT ON TYPE public.event_status IS 'Lifecycle states of community events.';
COMMENT ON TYPE public.event_rsvp_status IS 'User attendance declaration for an event.';

-- -----------------------------------------------------------------------------
-- 2. Tables: public.events & public.event_rsvps
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  event_type public.event_type NOT NULL DEFAULT 'GENERAL',
  status public.event_status NOT NULL DEFAULT 'PUBLISHED',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  location TEXT,
  location_url TEXT,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  capacity INTEGER,
  published_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT events_title_length
    CHECK (length(trim(title)) > 0 AND length(title) <= 200),
  CONSTRAINT events_description_length
    CHECK (description IS NULL OR length(description) <= 10000),
  CONSTRAINT events_location_length
    CHECK (location IS NULL OR length(location) <= 300),
  CONSTRAINT events_location_url_length
    CHECK (location_url IS NULL OR length(location_url) <= 500),
  CONSTRAINT events_capacity_positive
    CHECK (capacity IS NULL OR capacity > 0),
  CONSTRAINT events_time_window
    CHECK (end_time IS NULL OR end_time >= start_time),
  CONSTRAINT events_cancellation_reason_length
    CHECK (cancellation_reason IS NULL OR length(cancellation_reason) <= 1000)
);

COMMENT ON TABLE public.events IS
  'Community events, festivals, meetings, and programs. Decoupled from family census records.';
COMMENT ON COLUMN public.events.group_id IS
  'Nullable FK to public.groups; NULL indicates a community-wide event.';
COMMENT ON COLUMN public.events.creator_id IS
  'FK to auth.users; identifies the event organizer. Preserves PERSON != USER.';
COMMENT ON COLUMN public.events.capacity IS
  'Maximum attendee seat capacity. NULL indicates unlimited capacity.';
COMMENT ON COLUMN public.events.deleted_at IS
  'Soft-deletion timestamp. Soft-deleted events are hidden from standard queries.';

CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.event_rsvp_status NOT NULL DEFAULT 'GOING',
  guest_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT event_rsvps_unique_user_event
    UNIQUE (event_id, user_id),
  CONSTRAINT event_rsvps_guest_count_range
    CHECK (guest_count >= 0 AND guest_count <= 5),
  CONSTRAINT event_rsvps_notes_length
    CHECK (notes IS NULL OR length(notes) <= 300)
);

COMMENT ON TABLE public.event_rsvps IS
  'User attendance declarations for events. Tied to auth.users, preserving PERSON != USER.';
COMMENT ON COLUMN public.event_rsvps.guest_count IS
  'Additional guests brought by the user (0 to 5). Total seats consumed = 1 + guest_count.';

-- -----------------------------------------------------------------------------
-- 3. Indexes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_events_start_time
  ON public.events (start_time ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_pinned_upcoming
  ON public.events (is_pinned DESC, start_time ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_group_upcoming
  ON public.events (group_id, start_time ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_status
  ON public.events (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_creator
  ON public.events (creator_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_status
  ON public.event_rsvps (event_id, status);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_user
  ON public.event_rsvps (user_id);

-- -----------------------------------------------------------------------------
-- 4. Triggers: Updated-At & Invariant Guards
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_events_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_handle_updated_at ON public.events;
CREATE TRIGGER events_handle_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_events_updated_at();

CREATE OR REPLACE FUNCTION public.handle_event_rsvps_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_rsvps_handle_updated_at ON public.event_rsvps;
CREATE TRIGGER event_rsvps_handle_updated_at
  BEFORE UPDATE ON public.event_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_event_rsvps_updated_at();

-- Events Immutability Guard Trigger
CREATE OR REPLACE FUNCTION public.handle_event_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Field id is immutable on events.' USING ERRCODE = '23514';
  END IF;

  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Field created_at is immutable on events.' USING ERRCODE = '23514';
  END IF;

  IF NEW.creator_id <> OLD.creator_id THEN
    RAISE EXCEPTION 'Field creator_id is immutable on events.' USING ERRCODE = '23514';
  END IF;

  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'Field group_id cannot be changed once an event is created.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_update_guard ON public.events;
CREATE TRIGGER events_update_guard
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_event_update_guard();

-- RSVPs Immutability Guard Trigger
CREATE OR REPLACE FUNCTION public.handle_event_rsvp_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Field id is immutable on event RSVPs.' USING ERRCODE = '23514';
  END IF;

  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Field created_at is immutable on event RSVPs.' USING ERRCODE = '23514';
  END IF;

  IF NEW.event_id <> OLD.event_id THEN
    RAISE EXCEPTION 'Field event_id is immutable on event RSVPs.' USING ERRCODE = '23514';
  END IF;

  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Field user_id is immutable on event RSVPs.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_rsvps_update_guard ON public.event_rsvps;
CREATE TRIGGER event_rsvps_update_guard
  BEFORE UPDATE ON public.event_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_event_rsvp_update_guard();

-- -----------------------------------------------------------------------------
-- 5. Internal RLS Helper Functions (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- Helper: can_view_event(p_event_id, p_user_id)
CREATE OR REPLACE FUNCTION public.can_view_event(
  p_event_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_is_mod BOOLEAN;
BEGIN
  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Global moderator can view all non-deleted (or even deleted) events
  v_is_mod := public.is_community_moderator();
  IF v_is_mod THEN
    RETURN TRUE;
  END IF;

  -- Soft-deleted events are hidden from non-moderators
  IF v_event.deleted_at IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  -- Draft events visible only to creator or group managers
  IF v_event.status = 'DRAFT' THEN
    IF p_user_id IS NULL THEN
      RETURN FALSE;
    END IF;

    IF v_event.creator_id = p_user_id THEN
      RETURN TRUE;
    END IF;

    IF v_event.group_id IS NOT NULL THEN
      RETURN EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = v_event.group_id
          AND gm.user_id = p_user_id
          AND gm.role IN ('ADMIN', 'MODERATOR')
      );
    END IF;

    RETURN FALSE;
  END IF;

  -- Published, cancelled, completed, or archived events:
  -- Global community events are visible to any authenticated user
  IF v_event.group_id IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Group-scoped events respect group visibility
  RETURN EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = v_event.group_id
      AND g.deleted_at IS NULL
      AND (
        NOT g.is_private
        OR g.created_by = p_user_id
        OR EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = g.id
            AND gm.user_id = p_user_id
        )
      )
  );
END;
$$;

-- Helper: can_manage_event(p_event_id, p_user_id)
CREATE OR REPLACE FUNCTION public.can_manage_event(
  p_event_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_community_moderator() THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_event.creator_id = p_user_id THEN
    RETURN TRUE;
  END IF;

  IF v_event.group_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = v_event.group_id
        AND gm.user_id = p_user_id
        AND gm.role IN ('ADMIN', 'MODERATOR')
    );
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.can_view_event(UUID, UUID) IS
  'Internal RLS helper checking whether a user may view a community event.';
COMMENT ON FUNCTION public.can_manage_event(UUID, UUID) IS
  'Internal RLS helper checking whether a user may manage an event or view attendee notes.';

-- -----------------------------------------------------------------------------
-- 6. Authoritative Server RPC Functions (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- 6A. RPC: public.create_community_event
CREATE OR REPLACE FUNCTION public.create_community_event(
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_event_type public.event_type DEFAULT 'GENERAL',
  p_start_time TIMESTAMPTZ DEFAULT NULL,
  p_end_time TIMESTAMPTZ DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_location_url TEXT DEFAULT NULL,
  p_group_id UUID DEFAULT NULL,
  p_capacity INTEGER DEFAULT NULL,
  p_status public.event_status DEFAULT 'PUBLISHED',
  p_is_pinned BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_is_mod BOOLEAN;
  v_caller_role public.group_role;
  v_event_id UUID;
  v_clean_title TEXT;
  v_clean_desc TEXT;
  v_clean_loc TEXT;
  v_clean_url TEXT;
  v_effective_type public.event_type;
  v_effective_status public.event_status;
  v_effective_pinned BOOLEAN;
  v_published_at TIMESTAMPTZ;
BEGIN
  -- 1. Caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required to create an event.'
      USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  -- 2. Input validation
  v_clean_title := trim(p_title);
  IF v_clean_title IS NULL OR length(v_clean_title) = 0 OR length(v_clean_title) > 200 THEN
    RAISE EXCEPTION 'Event title must be between 1 and 200 characters.' USING ERRCODE = '23514';
  END IF;

  v_clean_desc := NULLIF(trim(p_description), '');
  IF v_clean_desc IS NOT NULL AND length(v_clean_desc) > 10000 THEN
    RAISE EXCEPTION 'Event description must not exceed 10000 characters.' USING ERRCODE = '23514';
  END IF;

  v_clean_loc := NULLIF(trim(p_location), '');
  IF v_clean_loc IS NOT NULL AND length(v_clean_loc) > 300 THEN
    RAISE EXCEPTION 'Event location must not exceed 300 characters.' USING ERRCODE = '23514';
  END IF;

  v_clean_url := NULLIF(trim(p_location_url), '');
  IF v_clean_url IS NOT NULL AND length(v_clean_url) > 500 THEN
    RAISE EXCEPTION 'Event location URL must not exceed 500 characters.' USING ERRCODE = '23514';
  END IF;

  IF p_start_time IS NULL THEN
    RAISE EXCEPTION 'Event start time is required.' USING ERRCODE = '23514';
  END IF;

  IF p_end_time IS NOT NULL AND p_end_time < p_start_time THEN
    RAISE EXCEPTION 'Event end time cannot be earlier than start time.' USING ERRCODE = '23514';
  END IF;

  IF p_capacity IS NOT NULL AND p_capacity <= 0 THEN
    RAISE EXCEPTION 'Event capacity must be greater than zero.' USING ERRCODE = '23514';
  END IF;

  -- 3. Scope authorization
  IF p_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = p_group_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Target community group does not exist or has been archived.' USING ERRCODE = 'P0002';
    END IF;

    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_caller;

    IF NOT (v_caller_role IN ('ADMIN', 'MODERATOR') OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only group managers or community moderators can post events for this group.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT v_is_mod THEN
      RAISE EXCEPTION 'Unauthorized: Only community moderators can post global community events.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 4. Effective attributes & publication timestamp
  v_effective_type := COALESCE(p_event_type, 'GENERAL');
  v_effective_status := COALESCE(p_status, 'PUBLISHED');
  v_effective_pinned := COALESCE(p_is_pinned, FALSE);

  IF v_effective_status = 'PUBLISHED' THEN
    v_published_at := NOW();
  ELSE
    v_published_at := NULL;
  END IF;

  -- 5. Insert event
  INSERT INTO public.events (
    title,
    description,
    event_type,
    status,
    start_time,
    end_time,
    location,
    location_url,
    group_id,
    creator_id,
    is_pinned,
    capacity,
    published_at
  ) VALUES (
    v_clean_title,
    v_clean_desc,
    v_effective_type,
    v_effective_status,
    p_start_time,
    p_end_time,
    v_clean_loc,
    v_clean_url,
    p_group_id,
    v_caller,
    v_effective_pinned,
    p_capacity,
    v_published_at
  ) RETURNING id INTO v_event_id;

  -- 6. Audit log
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'event',
    v_event_id,
    NULL,
    jsonb_build_object(
      'title', v_clean_title,
      'event_type', v_effective_type,
      'status', v_effective_status,
      'start_time', p_start_time,
      'end_time', p_end_time,
      'group_id', p_group_id,
      'capacity', p_capacity
    ),
    jsonb_build_object(
      'action', 'CREATE_EVENT',
      'creator_id', v_caller
    )
  );

  RETURN v_event_id;
END;
$$;

-- 6B. RPC: public.update_community_event
CREATE OR REPLACE FUNCTION public.update_community_event(
  p_event_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_event_type public.event_type DEFAULT NULL,
  p_start_time TIMESTAMPTZ DEFAULT NULL,
  p_end_time TIMESTAMPTZ DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_location_url TEXT DEFAULT NULL,
  p_capacity INTEGER DEFAULT NULL,
  p_status public.event_status DEFAULT NULL,
  p_is_pinned BOOLEAN DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_is_mod BOOLEAN;
  v_event public.events%ROWTYPE;
  v_caller_role public.group_role;
  v_clean_title TEXT;
  v_clean_desc TEXT;
  v_clean_loc TEXT;
  v_clean_url TEXT;
  v_effective_type public.event_type;
  v_effective_status public.event_status;
  v_effective_pinned BOOLEAN;
  v_effective_start TIMESTAMPTZ;
  v_effective_end TIMESTAMPTZ;
  v_published_at TIMESTAMPTZ;
  v_cancelled_at TIMESTAMPTZ;
  v_cancellation_reason TEXT;
BEGIN
  -- 1. Caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required to update an event.'
      USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  -- 2. Select target event
  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event does not exist or has been deleted.' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Authorization check
  IF v_event.group_id IS NOT NULL THEN
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = v_event.group_id AND user_id = v_caller;

    IF NOT (v_caller = v_event.creator_id OR v_caller_role IN ('ADMIN', 'MODERATOR') OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only event creator, group managers, or community moderators can update this event.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_caller = v_event.creator_id OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only event creator or community moderators can update this global event.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 4. Clean inputs
  v_clean_title := trim(p_title);
  IF v_clean_title IS NULL OR length(v_clean_title) = 0 OR length(v_clean_title) > 200 THEN
    RAISE EXCEPTION 'Event title must be between 1 and 200 characters.' USING ERRCODE = '23514';
  END IF;

  v_clean_desc := NULLIF(trim(p_description), '');
  IF v_clean_desc IS NOT NULL AND length(v_clean_desc) > 10000 THEN
    RAISE EXCEPTION 'Event description must not exceed 10000 characters.' USING ERRCODE = '23514';
  END IF;

  v_clean_loc := NULLIF(trim(p_location), '');
  IF v_clean_loc IS NOT NULL AND length(v_clean_loc) > 300 THEN
    RAISE EXCEPTION 'Event location must not exceed 300 characters.' USING ERRCODE = '23514';
  END IF;

  v_clean_url := NULLIF(trim(p_location_url), '');
  IF v_clean_url IS NOT NULL AND length(v_clean_url) > 500 THEN
    RAISE EXCEPTION 'Event location URL must not exceed 500 characters.' USING ERRCODE = '23514';
  END IF;

  v_effective_start := COALESCE(p_start_time, v_event.start_time);
  v_effective_end := p_end_time;
  IF v_effective_end IS NOT NULL AND v_effective_end < v_effective_start THEN
    RAISE EXCEPTION 'Event end time cannot be earlier than start time.' USING ERRCODE = '23514';
  END IF;

  IF p_capacity IS NOT NULL AND p_capacity <= 0 THEN
    RAISE EXCEPTION 'Event capacity must be greater than zero.' USING ERRCODE = '23514';
  END IF;

  -- 5. Effective attributes & lifecycle rules
  v_effective_type := COALESCE(p_event_type, v_event.event_type);
  v_effective_status := COALESCE(p_status, v_event.status);
  v_effective_pinned := COALESCE(p_is_pinned, v_event.is_pinned);

  -- Publication timestamp handling
  v_published_at := v_event.published_at;
  IF v_effective_status = 'PUBLISHED' AND v_published_at IS NULL THEN
    v_published_at := NOW();
  END IF;

  -- Reopening from CANCELLED
  v_cancelled_at := v_event.cancelled_at;
  v_cancellation_reason := v_event.cancellation_reason;

  IF v_event.status = 'CANCELLED' AND v_effective_status = 'PUBLISHED' THEN
    IF v_effective_start <= NOW() THEN
      RAISE EXCEPTION 'Cannot reopen a cancelled event whose start time has already passed.'
        USING ERRCODE = '23514';
    END IF;
    v_cancelled_at := NULL;
    v_cancellation_reason := NULL;
  END IF;

  -- 6. Update event
  UPDATE public.events
  SET
    title = v_clean_title,
    description = v_clean_desc,
    event_type = v_effective_type,
    status = v_effective_status,
    start_time = v_effective_start,
    end_time = v_effective_end,
    location = v_clean_loc,
    location_url = v_clean_url,
    capacity = p_capacity,
    is_pinned = v_effective_pinned,
    published_at = v_published_at,
    cancelled_at = v_cancelled_at,
    cancellation_reason = v_cancellation_reason,
    updated_at = NOW()
  WHERE id = p_event_id;

  -- 7. Audit log
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'event',
    p_event_id,
    jsonb_build_object(
      'title', v_event.title,
      'status', v_event.status,
      'start_time', v_event.start_time,
      'capacity', v_event.capacity
    ),
    jsonb_build_object(
      'title', v_clean_title,
      'status', v_effective_status,
      'start_time', v_effective_start,
      'capacity', p_capacity
    ),
    jsonb_build_object(
      'action', 'UPDATE_EVENT',
      'actor_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

-- 6C. RPC: public.cancel_community_event
CREATE OR REPLACE FUNCTION public.cancel_community_event(
  p_event_id UUID,
  p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_is_mod BOOLEAN;
  v_event public.events%ROWTYPE;
  v_caller_role public.group_role;
  v_clean_reason TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event does not exist or has been deleted.' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Event is already cancelled.' USING ERRCODE = '23514';
  END IF;

  IF v_event.group_id IS NOT NULL THEN
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = v_event.group_id AND user_id = v_caller;

    IF NOT (v_caller = v_event.creator_id OR v_caller_role IN ('ADMIN', 'MODERATOR') OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only event creator, group managers, or community moderators can cancel this event.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_caller = v_event.creator_id OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only event creator or community moderators can cancel this global event.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_clean_reason := NULLIF(trim(p_cancellation_reason), '');
  IF v_clean_reason IS NOT NULL AND length(v_clean_reason) > 1000 THEN
    RAISE EXCEPTION 'Cancellation reason must not exceed 1000 characters.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.events
  SET
    status = 'CANCELLED',
    cancelled_at = NOW(),
    cancellation_reason = v_clean_reason,
    updated_at = NOW()
  WHERE id = p_event_id;

  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'event',
    p_event_id,
    jsonb_build_object('status', v_event.status),
    jsonb_build_object(
      'status', 'CANCELLED',
      'cancellation_reason', v_clean_reason
    ),
    jsonb_build_object(
      'action', 'CANCEL_EVENT',
      'actor_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

-- 6D. RPC: public.archive_community_event
CREATE OR REPLACE FUNCTION public.archive_community_event(
  p_event_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_is_mod BOOLEAN;
  v_event public.events%ROWTYPE;
  v_caller_role public.group_role;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event does not exist or has been deleted.' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.group_id IS NOT NULL THEN
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = v_event.group_id AND user_id = v_caller;

    IF NOT (v_caller = v_event.creator_id OR v_caller_role IN ('ADMIN', 'MODERATOR') OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only event creator, group managers, or community moderators can archive this event.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_caller = v_event.creator_id OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only event creator or community moderators can archive this global event.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.events
  SET
    status = 'ARCHIVED',
    updated_at = NOW()
  WHERE id = p_event_id;

  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'event',
    p_event_id,
    jsonb_build_object('status', v_event.status),
    jsonb_build_object('status', 'ARCHIVED'),
    jsonb_build_object(
      'action', 'ARCHIVE_EVENT',
      'actor_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

-- 6E. RPC: public.delete_community_event
CREATE OR REPLACE FUNCTION public.delete_community_event(
  p_event_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_is_mod BOOLEAN;
  v_event public.events%ROWTYPE;
  v_caller_role public.group_role;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '42501';
  END IF;

  v_is_mod := public.is_community_moderator();

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event does not exist or has already been deleted.' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.group_id IS NOT NULL THEN
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = v_event.group_id AND user_id = v_caller;

    IF NOT (v_caller = v_event.creator_id OR v_caller_role IN ('ADMIN', 'MODERATOR') OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only event creator, group managers, or community moderators can delete this event.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_caller = v_event.creator_id OR v_is_mod) THEN
      RAISE EXCEPTION 'Unauthorized: Only event creator or community moderators can delete this global event.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.events
  SET
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_event_id;

  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'event',
    p_event_id,
    jsonb_build_object('deleted_at', v_event.deleted_at),
    jsonb_build_object('deleted_at', NOW()),
    jsonb_build_object(
      'action', 'DELETE_EVENT',
      'actor_id', v_caller
    )
  );

  RETURN TRUE;
END;
$$;

-- 6F. RPC: public.set_event_rsvp
-- Atomically reserves capacity and sets attendance declaration for authenticated caller.
CREATE OR REPLACE FUNCTION public.set_event_rsvp(
  p_event_id UUID,
  p_status public.event_rsvp_status DEFAULT 'GOING',
  p_guest_count INTEGER DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_event public.events%ROWTYPE;
  v_rsvp_id UUID;
  v_status public.event_rsvp_status;
  v_guest_count INTEGER;
  v_notes TEXT;
  v_booked_seats INTEGER;
  v_requested_seats INTEGER;
BEGIN
  -- 1. Caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required to RSVP for an event.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Lock event row to guarantee atomic capacity calculation
  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event does not exist or has been deleted.' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Check event status and timing
  IF v_event.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'Cannot RSVP: Event is not open for registration (status: %).' , v_event.status
      USING ERRCODE = '23514';
  END IF;

  IF v_event.start_time <= NOW() THEN
    RAISE EXCEPTION 'Cannot RSVP: Event has already started or concluded.'
      USING ERRCODE = '23514';
  END IF;

  -- 4. Scope authorization for group events
  IF v_event.group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = v_event.group_id
        AND g.deleted_at IS NULL
        AND (
          NOT g.is_private
          OR g.created_by = v_caller
          OR EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = g.id AND gm.user_id = v_caller
          )
          OR public.is_community_moderator()
        )
    ) THEN
      RAISE EXCEPTION 'Unauthorized: You do not have permission to RSVP for this private group event.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 5. Input sanitation & bounds
  v_status := COALESCE(p_status, 'GOING');
  v_guest_count := COALESCE(p_guest_count, 0);

  IF v_guest_count < 0 OR v_guest_count > 5 THEN
    RAISE EXCEPTION 'Guest count must be between 0 and 5.' USING ERRCODE = '23514';
  END IF;

  v_notes := NULLIF(trim(p_notes), '');
  IF v_notes IS NOT NULL AND length(v_notes) > 300 THEN
    RAISE EXCEPTION 'RSVP notes must not exceed 300 characters.' USING ERRCODE = '23514';
  END IF;

  -- 6. Concurrency-safe capacity check
  IF v_status = 'GOING' AND v_event.capacity IS NOT NULL THEN
    v_requested_seats := 1 + v_guest_count;

    -- Calculate total booked seats excluding caller's prior reservation
    SELECT COALESCE(SUM(1 + guest_count), 0) INTO v_booked_seats
    FROM public.event_rsvps
    WHERE event_id = p_event_id
      AND status = 'GOING'
      AND user_id <> v_caller;

    IF (v_booked_seats + v_requested_seats) > v_event.capacity THEN
      RAISE EXCEPTION 'Event capacity exceeded. Available seats: %, requested: %.',
        GREATEST(0, v_event.capacity - v_booked_seats), v_requested_seats
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 7. Upsert RSVP
  INSERT INTO public.event_rsvps (
    event_id,
    user_id,
    status,
    guest_count,
    notes
  ) VALUES (
    p_event_id,
    v_caller,
    v_status,
    v_guest_count,
    v_notes
  )
  ON CONFLICT (event_id, user_id) DO UPDATE
  SET
    status = EXCLUDED.status,
    guest_count = EXCLUDED.guest_count,
    notes = EXCLUDED.notes,
    updated_at = NOW()
  RETURNING id INTO v_rsvp_id;

  RETURN v_rsvp_id;
END;
$$;

-- 6G. RPC: public.cancel_event_rsvp
-- Updates RSVP status to NOT_GOING, releasing reserved capacity seats.
CREATE OR REPLACE FUNCTION public.cancel_event_rsvp(
  p_event_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_event public.events%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event does not exist or has been deleted.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.event_rsvps
  SET
    status = 'NOT_GOING',
    guest_count = 0,
    updated_at = NOW()
  WHERE event_id = p_event_id AND user_id = v_caller;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.create_community_event IS
  'Authoritatively creates a community event with scope validation and audit logging.';
COMMENT ON FUNCTION public.update_community_event IS
  'Authoritatively updates an event with organizer check and audit logging.';
COMMENT ON FUNCTION public.cancel_community_event IS
  'Authoritatively cancels an event with reason recording and audit logging.';
COMMENT ON FUNCTION public.archive_community_event IS
  'Authoritatively archives an event with audit logging.';
COMMENT ON FUNCTION public.delete_community_event IS
  'Authoritatively soft-deletes an event with audit logging.';
COMMENT ON FUNCTION public.set_event_rsvp IS
  'Authoritatively reserves capacity and records user attendance declaration with row-level locking.';
COMMENT ON FUNCTION public.cancel_event_rsvp IS
  'Authoritatively cancels user attendance declaration and releases reserved capacity.';

-- -----------------------------------------------------------------------------
-- 7. Hardened Row Level Security Policies
-- -----------------------------------------------------------------------------

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- EVENTS POLICIES
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "events_select_authenticated" ON public.events;
CREATE POLICY "events_select_authenticated"
  ON public.events
  FOR SELECT
  TO authenticated
  USING (
    (
      deleted_at IS NULL
      AND (
        (
          status IN ('PUBLISHED', 'CANCELLED', 'COMPLETED', 'ARCHIVED')
          AND (
            group_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.groups g
              WHERE g.id = events.group_id
                AND g.deleted_at IS NULL
                AND (
                  NOT g.is_private
                  OR g.created_by = auth.uid()
                  OR EXISTS (
                    SELECT 1 FROM public.group_members gm
                    WHERE gm.group_id = g.id
                      AND gm.user_id = auth.uid()
                  )
                )
            )
          )
        )
        OR (
          status = 'DRAFT'
          AND (
            creator_id = auth.uid()
            OR (
              group_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM public.group_members gm
                WHERE gm.group_id = events.group_id
                  AND gm.user_id = auth.uid()
                  AND gm.role IN ('ADMIN', 'MODERATOR')
              )
            )
          )
        )
      )
    )
    OR public.is_community_moderator()
  );

DROP POLICY IF EXISTS "events_insert_deny" ON public.events;
CREATE POLICY "events_insert_deny"
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "events_update_deny" ON public.events;
CREATE POLICY "events_update_deny"
  ON public.events
  FOR UPDATE
  TO authenticated
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "events_delete_deny" ON public.events;
CREATE POLICY "events_delete_deny"
  ON public.events
  FOR DELETE
  TO authenticated
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- EVENT RSVPS POLICIES
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "event_rsvps_select_authenticated" ON public.event_rsvps;
CREATE POLICY "event_rsvps_select_authenticated"
  ON public.event_rsvps
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_manage_event(event_id, auth.uid())
    OR public.is_community_moderator()
  );

DROP POLICY IF EXISTS "event_rsvps_insert_deny" ON public.event_rsvps;
CREATE POLICY "event_rsvps_insert_deny"
  ON public.event_rsvps
  FOR INSERT
  TO authenticated
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "event_rsvps_update_deny" ON public.event_rsvps;
CREATE POLICY "event_rsvps_update_deny"
  ON public.event_rsvps
  FOR UPDATE
  TO authenticated
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "event_rsvps_delete_deny" ON public.event_rsvps;
CREATE POLICY "event_rsvps_delete_deny"
  ON public.event_rsvps
  FOR DELETE
  TO authenticated
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 8. Explicit Least-Privilege Table & RPC Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.events FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.event_rsvps FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.events TO authenticated;
GRANT SELECT ON TABLE public.event_rsvps TO authenticated;

-- Internal helper function execution revoked from clients
REVOKE EXECUTE ON FUNCTION public.can_view_event(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_event(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Authoritative Application RPCs: Revoke from PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.create_community_event(TEXT, TEXT, public.event_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INTEGER, public.event_status, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_community_event(UUID, TEXT, TEXT, public.event_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INTEGER, public.event_status, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_community_event(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.archive_community_event(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_community_event(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_event_rsvp(UUID, public.event_rsvp_status, INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_event_rsvp(UUID) FROM PUBLIC, anon;

-- Authoritative Application RPCs: Grant to authenticated
GRANT EXECUTE ON FUNCTION public.create_community_event(TEXT, TEXT, public.event_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INTEGER, public.event_status, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_community_event(UUID, TEXT, TEXT, public.event_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INTEGER, public.event_status, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_community_event(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_community_event(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_community_event(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_rsvp(UUID, public.event_rsvp_status, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_event_rsvp(UUID) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261010100000_create_storage_and_avatars.sql <<<
-- =============================================================================

-- =============================================================================
-- MIGRATION: 20261010100000_create_storage_and_avatars.sql
-- DESCRIPTION: Phase 11 — Subtask 1: Storage Infrastructure, Buckets & Avatars
-- AUTHOR: Community Roots Platform Engineering Team
--
-- SECURITY ARCHITECTURE:
-- 1. AVATAR BUCKET PRIVACY & MULTI-TIER ACCESS:
--    - 'avatars' bucket is PRIVATE (public = FALSE). Direct public CDN enumeration
--      is completely disabled to respect user, person, and family privacy tiers.
--    - Controlled/signed retrieval or authenticated RLS SELECT governs read access.
--    - Reading object requires that caller satisfy the profile, person, or family
--      privacy level (PRIVATE / FAMILY / CONNECTIONS / COMMUNITY / PUBLIC).
--
-- 2. DOMAIN BOUNDARIES (BUCKET ISOLATION):
--    - 'avatars' bucket is dedicated strictly to profile pictures, person census
--      portraits, and family crests.
--    - Family albums, photo galleries, historical media, and family documents
--      will reside in separate dedicated buckets in future subtasks/phases.
--
-- 3. STRICT PATH & TRAVERSAL GUARDS:
--    - Structure:
--      * profiles/{user_id}/avatar_{timestamp}.{ext}
--      * persons/{person_id}/avatar_{timestamp}.{ext}
--      * families/{family_id}/avatar_{timestamp}.{ext}
--    - Path segment 1 must match the known root domain ('profiles', 'persons', 'families').
--    - Path segment 2 must match strict UUID format (regex guarded to prevent casting exceptions).
--    - Path segment 3 must be non-empty (filename).
--    - Path segment 4 must be empty (strictly exactly 3 path segments, no subdirectory traversal).
--
-- 4. AUTHORIZATION MODEL (CANONICAL & EXTENSIBLE):
--    - Persons: Linked user account (PERSON == USER) or census record creator.
--      Administrative moderation is restricted strictly to ADMIN and SUPER_ADMIN
--      (via public.is_admin()). COMMITTEE_MEMBER does NOT have global authority.
--    - Families: Family creator or active FAMILY_HEAD. Administrative moderation
--      is restricted strictly to ADMIN and SUPER_ADMIN (via public.is_admin()).
--    - Profiles: Authenticated user strictly for their own profile (auth.uid() = user_id).
--
-- 5. CANONICAL STORAGE URL INTEGRITY:
--    - avatar_url columns accept either:
--      A. Canonical internal storage path: 'avatars/{scope}/{uuid}/{filename}'
--      B. Signed / Supabase project Storage URL matching '/storage/v1/object/(public|sign|authenticated)/avatars/'
--    - Arbitrary external third-party HTTP/HTTPS URLs are strictly rejected by CHECK constraints
--      and database RPC validation.
--
-- 6. AUTHORITATIVE DATABASE RPCS:
--    - SECURITY DEFINER, SET search_path = public.
--    - Internal auth.uid() resolution (no caller-supplied actor ID).
--    - Immutable audit logging in public.audit_logs via public.log_audit_event().
--    - Execution revoked from PUBLIC and anon, granted strictly to authenticated.
-- =============================================================================

-- =============================================================================
-- SECTION 1: STORAGE BUCKET PROVISIONING (avatars)
-- =============================================================================
-- The avatars bucket is created with public = FALSE (PRIVATE).
-- Size limit: 5MB (5,242,880 bytes).
-- Allowed MIME types: image/jpeg, image/png, image/webp, image/gif.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  FALSE, -- Private bucket: privacy-first architecture
  5242880, -- 5 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- SECTION 2: CANONICAL SCHEMA EXTENSION (avatar_url columns)
-- =============================================================================
-- Adds avatar_url to public.persons and public.families with format validation.
-- Respects PERSON != USER boundary (person census identity != auth profile).
-- Enforces storage reference integrity: internal storage path or project storage URL only.
-- Arbitrary third-party external URLs are rejected.
-- =============================================================================

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'persons_avatar_url_format'
      AND conrelid = 'public.persons'::regclass
  ) THEN
    ALTER TABLE public.persons
      ADD CONSTRAINT persons_avatar_url_format
      CHECK (
        avatar_url IS NULL OR
        avatar_url ~ '^avatars/persons/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
      );
  END IF;
END $$;

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'families_avatar_url_format'
      AND conrelid = 'public.families'::regclass
  ) THEN
    ALTER TABLE public.families
      ADD CONSTRAINT families_avatar_url_format
      CHECK (
        avatar_url IS NULL OR
        avatar_url ~ '^avatars/families/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
      );
  END IF;
END $$;

-- Also attach format constraint to public.profiles if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_avatar_url_format'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_avatar_url_format
      CHECK (
        avatar_url IS NULL OR
        avatar_url ~ '^avatars/profiles/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
      );
  END IF;
END $$;

-- =============================================================================
-- SECTION 3: AUTHORIZATION HELPER FUNCTIONS
-- =============================================================================
-- Security Definer helper functions that determine avatar management authority
-- strictly based on auth.uid() internally.
-- Does NOT grant global COMMITTEE_MEMBER authority.
-- Admin moderation is restricted strictly to ADMIN and SUPER_ADMIN (public.is_admin()).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_manage_person_avatar(p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR p_person_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. System Administrator (ADMIN, SUPER_ADMIN)
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  -- 2. Person is linked to this authenticated user (PERSON == USER link)
  IF EXISTS (
    SELECT 1 FROM public.persons
    WHERE id = p_person_id
      AND user_id = v_user_id
      AND deleted_at IS NULL
  ) THEN
    RETURN TRUE;
  END IF;

  -- 3. Person was created by this user (census recorder / owner)
  IF EXISTS (
    SELECT 1 FROM public.persons
    WHERE id = p_person_id
      AND created_by = v_user_id
      AND deleted_at IS NULL
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.can_manage_person_avatar(UUID) IS
  'Authorization check: returns TRUE if auth.uid() owns, created, or is admin of the person record.';

CREATE OR REPLACE FUNCTION public.can_manage_family_avatar(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR p_family_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. System Administrator (ADMIN, SUPER_ADMIN)
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  -- 2. Family creator
  IF EXISTS (
    SELECT 1 FROM public.families
    WHERE id = p_family_id
      AND created_by = v_user_id
      AND deleted_at IS NULL
  ) THEN
    RETURN TRUE;
  END IF;

  -- 3. Active Family Head
  IF EXISTS (
    SELECT 1
    FROM public.family_members fm
    JOIN public.persons p
      ON p.id = fm.person_id
     AND p.user_id = v_user_id
     AND p.deleted_at IS NULL
    WHERE fm.family_id = p_family_id
      AND fm.is_head = TRUE
      AND fm.deleted_at IS NULL
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.can_manage_family_avatar(UUID) IS
  'Authorization check: returns TRUE if auth.uid() created, is active head, or is admin of the family.';

-- Privacy-respecting read helper for avatar objects
CREATE OR REPLACE FUNCTION public.can_read_avatar_object(p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
  v_target_id_txt TEXT;
  v_target_id UUID;
  v_user_id UUID;
  v_privacy public.privacy_level;
  v_person_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  v_scope := split_part(p_object_name, '/', 1);
  v_target_id_txt := split_part(p_object_name, '/', 2);

  -- Segment count and UUID validation guard
  IF v_target_id_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN FALSE;
  END IF;
  IF split_part(p_object_name, '/', 3) = '' OR split_part(p_object_name, '/', 4) != '' THEN
    RETURN FALSE;
  END IF;

  v_target_id := v_target_id_txt::UUID;

  -- Admins can read all avatars for moderation
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  -- 1. Profiles scope: user themselves or authenticated directory member
  IF v_scope = 'profiles' THEN
    IF v_user_id IS NOT NULL AND v_user_id = v_target_id THEN
      RETURN TRUE;
    END IF;
    -- Authenticated members can view other active user profile avatars in directory
    IF v_user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = v_target_id AND is_active = TRUE
    ) THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- 2. Persons scope: evaluate person's profile_privacy
  IF v_scope = 'persons' THEN
    SELECT profile_privacy, user_id INTO v_privacy, v_person_user_id
    FROM public.persons
    WHERE id = v_target_id AND deleted_at IS NULL AND status != 'ARCHIVED';

    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;

    -- Own linked person or creator
    IF v_user_id IS NOT NULL AND (
      v_user_id = v_person_user_id OR
      EXISTS (SELECT 1 FROM public.persons WHERE id = v_target_id AND created_by = v_user_id)
    ) THEN
      RETURN TRUE;
    END IF;

    -- PUBLIC privacy
    IF v_privacy = 'PUBLIC' THEN
      RETURN TRUE;
    END IF;

    -- COMMUNITY privacy: requires authenticated user
    IF v_privacy = 'COMMUNITY' AND v_user_id IS NOT NULL THEN
      RETURN TRUE;
    END IF;

    -- CONNECTIONS privacy: requires accepted connection with linked user account
    IF v_privacy = 'CONNECTIONS' AND v_user_id IS NOT NULL AND v_person_user_id IS NOT NULL THEN
      RETURN public.are_users_connected(v_user_id, v_person_user_id);
    END IF;

    -- FAMILY privacy: requires sharing an active, non-deleted, non-archived family unit with this person
    IF v_privacy = 'FAMILY' AND v_user_id IS NOT NULL THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.family_members fm1
        JOIN public.families f ON f.id = fm1.family_id
        JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
        JOIN public.persons p_caller ON p_caller.id = fm2.person_id
        WHERE fm1.person_id = v_target_id
          AND fm1.left_at IS NULL
          AND fm2.left_at IS NULL
          AND f.deleted_at IS NULL
          AND f.status = 'ACTIVE'
          AND p_caller.user_id = v_user_id
          AND p_caller.deleted_at IS NULL
          AND p_caller.status != 'ARCHIVED'
      );
    END IF;

    RETURN FALSE;
  END IF;

  -- 3. Families scope: evaluate family's profile_privacy according to canonical lifecycle
  IF v_scope = 'families' THEN
    SELECT profile_privacy INTO v_privacy
    FROM public.families
    WHERE id = v_target_id AND deleted_at IS NULL AND status = 'ACTIVE';

    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;

    -- Family creator or active member
    IF v_user_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.families
        WHERE id = v_target_id AND created_by = v_user_id AND deleted_at IS NULL AND status = 'ACTIVE'
      ) OR
      EXISTS (
        SELECT 1 FROM public.family_members fm
        JOIN public.persons p ON p.id = fm.person_id
        WHERE fm.family_id = v_target_id
          AND fm.left_at IS NULL
          AND p.user_id = v_user_id
          AND p.deleted_at IS NULL
          AND p.status != 'ARCHIVED'
      )
    ) THEN
      RETURN TRUE;
    END IF;

    -- PUBLIC privacy: everyone can view
    IF v_privacy = 'PUBLIC' THEN
      RETURN TRUE;
    END IF;

    -- COMMUNITY privacy: authenticated community members can view
    IF v_privacy = 'COMMUNITY' AND v_user_id IS NOT NULL THEN
      RETURN TRUE;
    END IF;

    -- PRIVATE / FAMILY / CONNECTIONS: handled above if creator/member, otherwise denied
    RETURN FALSE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.can_read_avatar_object(TEXT) IS
  'Evaluates whether the caller may read an avatar storage object based on profile, person, or family privacy level.';

-- =============================================================================
-- SECTION 4: AUTHORITATIVE AVATAR RPCS (SECURITY DEFINER + AUDIT)
-- =============================================================================
-- Mutation RPCs ensure:
-- - User is authenticated
-- - Caller has verified authority
-- - Input URL/path conforms strictly to approved internal format (no arbitrary external URLs)
-- - Event is immutably logged to public.audit_logs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_person_avatar(
  p_person_id UUID,
  p_avatar_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_old_url TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.can_manage_person_avatar(p_person_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to manage this avatar'
      USING ERRCODE = 'P0003';
  END IF;

  -- Strict URL/path validation: must match approved avatars storage structure (canonical internal path only)
  IF p_avatar_url IS NOT NULL AND (
    p_avatar_url !~ '^avatars/persons/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
  ) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: avatar_url must reference a canonical internal person storage path in the avatars bucket'
      USING ERRCODE = '22023';
  END IF;

  SELECT avatar_url INTO v_old_url
  FROM public.persons
  WHERE id = p_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Person record does not exist or has been deleted'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.persons
  SET avatar_url = p_avatar_url,
      updated_at = NOW()
  WHERE id = p_person_id AND deleted_at IS NULL;

  PERFORM public.log_audit_event(
    'UPDATE'::public.audit_action,
    'persons',
    p_person_id,
    jsonb_build_object('avatar_url', v_old_url),
    jsonb_build_object('avatar_url', p_avatar_url)
  );

  RETURN jsonb_build_object('success', TRUE, 'person_id', p_person_id, 'avatar_url', p_avatar_url);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_person_avatar(p_person_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.set_person_avatar(p_person_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_family_avatar(
  p_family_id UUID,
  p_avatar_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_old_url TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.can_manage_family_avatar(p_family_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to manage this family avatar'
      USING ERRCODE = 'P0003';
  END IF;

  -- Strict URL/path validation: must match approved family storage structure (canonical internal path only)
  IF p_avatar_url IS NOT NULL AND (
    p_avatar_url !~ '^avatars/families/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
  ) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: avatar_url must reference a canonical internal family storage path in the avatars bucket'
      USING ERRCODE = '22023';
  END IF;

  SELECT avatar_url INTO v_old_url
  FROM public.families
  WHERE id = p_family_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Family record does not exist or has been deleted'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.families
  SET avatar_url = p_avatar_url,
      updated_at = NOW()
  WHERE id = p_family_id AND deleted_at IS NULL;

  PERFORM public.log_audit_event(
    'UPDATE'::public.audit_action,
    'families',
    p_family_id,
    jsonb_build_object('avatar_url', v_old_url),
    jsonb_build_object('avatar_url', p_avatar_url)
  );

  RETURN jsonb_build_object('success', TRUE, 'family_id', p_family_id, 'avatar_url', p_avatar_url);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_family_avatar(p_family_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.set_family_avatar(p_family_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_profile_avatar(p_avatar_url TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_old_url TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  -- Strict URL/path validation: must match approved profile storage structure for this user (canonical internal path only)
  IF p_avatar_url IS NOT NULL AND (
    p_avatar_url !~ ('^avatars/profiles/' || v_user_id::TEXT || '/[^/]+$')
  ) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: avatar_url must reference a canonical internal profile storage path matching your user account'
      USING ERRCODE = '22023';
  END IF;

  SELECT avatar_url INTO v_old_url
  FROM public.profiles
  WHERE id = v_user_id;

  UPDATE public.profiles
  SET avatar_url = p_avatar_url,
      updated_at = NOW()
  WHERE id = v_user_id;

  PERFORM public.log_audit_event(
    'UPDATE'::public.audit_action,
    'profiles',
    v_user_id,
    jsonb_build_object('avatar_url', v_old_url),
    jsonb_build_object('avatar_url', p_avatar_url)
  );

  RETURN jsonb_build_object('success', TRUE, 'user_id', v_user_id, 'avatar_url', p_avatar_url);
END;
$$;

-- =============================================================================
-- SECTION 5: STORAGE RLS POLICIES (storage.objects)
-- =============================================================================
-- Explicit RLS policies governing the private 'avatars' storage bucket.
-- Prevents path traversal, enforces strict MIME types, and guarantees privacy:
-- - SELECT: Evaluates public.can_read_avatar_object(name) ensuring private person/family
--           avatars cannot be viewed by unauthorized users or public crawlers.
-- - INSERT/UPDATE/DELETE: Strictly enforces root scope, UUID regex, exact 3 segments,
--   and authenticated ownership/management authority.
-- =============================================================================

DROP POLICY IF EXISTS "avatars_select_policy" ON storage.objects;
CREATE POLICY "avatars_select_policy"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND public.can_read_avatar_object(name)
  );

DROP POLICY IF EXISTS "avatars_insert_policy" ON storage.objects;
CREATE POLICY "avatars_insert_policy"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (
      (
        split_part(name, '/', 1) = 'profiles'
        AND split_part(name, '/', 2) = (auth.uid())::TEXT
        AND split_part(name, '/', 3) != ''
        AND split_part(name, '/', 4) = ''
      )
      OR
      (
        split_part(name, '/', 1) = 'persons'
        AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND split_part(name, '/', 3) != ''
        AND split_part(name, '/', 4) = ''
        AND public.can_manage_person_avatar((split_part(name, '/', 2))::UUID)
      )
      OR
      (
        split_part(name, '/', 1) = 'families'
        AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND split_part(name, '/', 3) != ''
        AND split_part(name, '/', 4) = ''
        AND public.can_manage_family_avatar((split_part(name, '/', 2))::UUID)
      )
    )
  );

DROP POLICY IF EXISTS "avatars_update_policy" ON storage.objects;
CREATE POLICY "avatars_update_policy"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (
      (
        split_part(name, '/', 1) = 'profiles'
        AND split_part(name, '/', 2) = (auth.uid())::TEXT
        AND split_part(name, '/', 3) != ''
        AND split_part(name, '/', 4) = ''
      )
      OR
      (
        split_part(name, '/', 1) = 'persons'
        AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND split_part(name, '/', 3) != ''
        AND split_part(name, '/', 4) = ''
        AND public.can_manage_person_avatar((split_part(name, '/', 2))::UUID)
      )
      OR
      (
        split_part(name, '/', 1) = 'families'
        AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND split_part(name, '/', 3) != ''
        AND split_part(name, '/', 4) = ''
        AND public.can_manage_family_avatar((split_part(name, '/', 2))::UUID)
      )
    )
  );

DROP POLICY IF EXISTS "avatars_delete_policy" ON storage.objects;
CREATE POLICY "avatars_delete_policy"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (
      (
        split_part(name, '/', 1) = 'profiles'
        AND split_part(name, '/', 2) = (auth.uid())::TEXT
        AND split_part(name, '/', 3) != ''
        AND split_part(name, '/', 4) = ''
      )
      OR
      (
        split_part(name, '/', 1) = 'persons'
        AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND split_part(name, '/', 3) != ''
        AND split_part(name, '/', 4) = ''
        AND public.can_manage_person_avatar((split_part(name, '/', 2))::UUID)
      )
      OR
      (
        split_part(name, '/', 1) = 'families'
        AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND split_part(name, '/', 3) != ''
        AND split_part(name, '/', 4) = ''
        AND public.can_manage_family_avatar((split_part(name, '/', 2))::UUID)
      )
    )
  );

-- =============================================================================
-- SECTION 6: FUNCTION EXECUTION PRIVILEGES
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.can_manage_person_avatar(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_family_avatar(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_avatar_object(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_person_avatar(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_person_avatar(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_family_avatar(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_family_avatar(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_profile_avatar(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_person_avatar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_family_avatar(UUID) TO authenticated;
-- can_read_avatar_object is evaluated inside Storage RLS ("avatars_select_policy" on storage.objects).
-- Anonymous (unauthenticated) visitors require EXECUTE permission exclusively to allow
-- Storage RLS evaluation of avatars for records configured with profile_privacy = 'PUBLIC'
-- (e.g. public census person records or public family directory cards).
-- All other privacy tiers (COMMUNITY, CONNECTIONS, FAMILY, PRIVATE) immediately evaluate
-- to FALSE within the function when auth.uid() IS NULL, preserving zero-trust privacy.
GRANT EXECUTE ON FUNCTION public.can_read_avatar_object(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.set_person_avatar(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_person_avatar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_family_avatar(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_family_avatar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_avatar(TEXT) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261010140000_create_family_media_and_history.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261010140000_create_family_media_and_history.sql
-- Purpose:   Phase 11 Subtask 2 — Family & Community Media / Photo Albums / Family History
-- Security:  Zero-trust private storage architecture with dedicated 'family-media' bucket,
--            preserving 'avatars' bucket isolation intact,
--            normalized media metadata, canonical internal storage paths ('family-media/...'),
--            active family lifecycle enforcement, strictly bounded RLS, audit-logged RPCs.
-- =============================================================================

-- =============================================================================
-- SECTION 1: STORAGE BUCKET PROVISIONING (family-media)
-- =============================================================================
-- 1. Dedicated 'family-media' bucket is PRIVATE (public = FALSE).
-- 2. Size limit: 20MB (20,971,520 bytes).
-- 3. Allowed MIME types: images (JPEG, PNG, WebP, GIF) + historical documents (PDF).
-- 4. avatars bucket contract is left 100% UNTOUCHED (5MB, images only).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'family-media',
  'family-media',
  FALSE, -- Private bucket: privacy-first architecture
  20971520, -- 20 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- SECTION 2: DOMAIN ENUMS
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'family_media_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.family_media_type AS ENUM (
      'PHOTO',
      'DOCUMENT',
      'HISTORICAL_RECORD'
    );
  END IF;
END $$;

-- =============================================================================
-- SECTION 3: TABLES DEFINITION
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 Table: public.family_albums
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.family_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  privacy_level public.privacy_level NOT NULL DEFAULT 'FAMILY',
  cover_media_id UUID, -- circular FK added after family_media table creation
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT family_albums_title_not_empty
    CHECK (trim(title) != '' AND length(title) <= 200),
  CONSTRAINT family_albums_description_length
    CHECK (description IS NULL OR length(description) <= 2000),
  CONSTRAINT family_albums_privacy_allowed
    CHECK (privacy_level IN ('PUBLIC', 'COMMUNITY', 'FAMILY', 'PRIVATE'))
);

COMMENT ON TABLE public.family_albums IS
  'Normalized photo albums belonging to a family, respecting family privacy lifecycle.';

-- Updated-at trigger
DROP TRIGGER IF EXISTS family_albums_handle_updated_at ON public.family_albums;
CREATE TRIGGER family_albums_handle_updated_at
  BEFORE UPDATE ON public.family_albums
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Immutability trigger guard for family_albums (id, family_id, created_by, created_at)
CREATE OR REPLACE FUNCTION public.handle_family_album_immutability_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id != OLD.id THEN
    RAISE EXCEPTION 'FORBIDDEN: Album id is immutable' USING ERRCODE = 'P0003';
  END IF;
  IF NEW.family_id != OLD.family_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Album family_id is immutable' USING ERRCODE = 'P0003';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'FORBIDDEN: Album created_by is immutable' USING ERRCODE = 'P0003';
  END IF;
  IF NEW.created_at != OLD.created_at THEN
    RAISE EXCEPTION 'FORBIDDEN: Album created_at is immutable' USING ERRCODE = 'P0003';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS family_album_immutability_guard ON public.family_albums;
CREATE TRIGGER family_album_immutability_guard
  BEFORE UPDATE ON public.family_albums
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_album_immutability_guard();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_family_albums_family_id
  ON public.family_albums(family_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_family_albums_privacy
  ON public.family_albums(family_id, privacy_level)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3.2 Table: public.family_media
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.family_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  album_id UUID REFERENCES public.family_albums(id) ON DELETE SET NULL,
  storage_object_path TEXT NOT NULL,
  media_type public.family_media_type NOT NULL DEFAULT 'PHOTO',
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  caption TEXT,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT family_media_storage_path_canonical
    CHECK (
      storage_object_path ~ '^family-media/families/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
    ),
  CONSTRAINT family_media_mime_type_allowed
    CHECK (
      mime_type IN (
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf'
      )
    ),
  CONSTRAINT family_media_file_size_limit
    CHECK (file_size > 0 AND file_size <= 20971520), -- 20 MB max
  CONSTRAINT family_media_original_filename_length
    CHECK (length(trim(original_filename)) > 0 AND length(original_filename) <= 255),
  CONSTRAINT family_media_caption_length
    CHECK (caption IS NULL OR length(caption) <= 500),
  CONSTRAINT family_media_description_length
    CHECK (description IS NULL OR length(description) <= 2000),
  CONSTRAINT family_media_display_order_non_negative
    CHECK (display_order >= 0)
);

COMMENT ON TABLE public.family_media IS
  'Metadata records for media files belonging to a family. Points to canonical internal storage path in family-media bucket.';

-- Circular cover_media_id FK added safely
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'family_albums_cover_media_id_fkey'
      AND conrelid = 'public.family_albums'::regclass
  ) THEN
    ALTER TABLE public.family_albums
      ADD CONSTRAINT family_albums_cover_media_id_fkey
      FOREIGN KEY (cover_media_id) REFERENCES public.family_media(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Cross-family cover_media trigger guard (Album cover media MUST belong to the SAME family)
CREATE OR REPLACE FUNCTION public.handle_family_album_cover_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_media_fam_id UUID;
BEGIN
  IF NEW.cover_media_id IS NOT NULL THEN
    SELECT family_id INTO v_media_fam_id
    FROM public.family_media
    WHERE id = NEW.cover_media_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Cover media does not exist' USING ERRCODE = '22023';
    END IF;

    IF v_media_fam_id != NEW.family_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Cover media belongs to a different family' USING ERRCODE = 'P0003';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS family_album_cover_guard ON public.family_albums;
CREATE TRIGGER family_album_cover_guard
  BEFORE INSERT OR UPDATE OF cover_media_id, family_id ON public.family_albums
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_album_cover_guard();

-- Updated-at trigger
DROP TRIGGER IF EXISTS family_media_handle_updated_at ON public.family_media;
CREATE TRIGGER family_media_handle_updated_at
  BEFORE UPDATE ON public.family_media
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Cross-family reference trigger guard (Album and Media MUST belong to the SAME family)
CREATE OR REPLACE FUNCTION public.handle_family_media_album_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_album_family_id UUID;
BEGIN
  IF NEW.album_id IS NOT NULL THEN
    SELECT family_id INTO v_album_family_id
    FROM public.family_albums
    WHERE id = NEW.album_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Associated album does not exist' USING ERRCODE = '22023';
    END IF;

    IF v_album_family_id != NEW.family_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Album belongs to a different family (cross-family reference rejected)' USING ERRCODE = 'P0003';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS family_media_album_guard ON public.family_media;
CREATE TRIGGER family_media_album_guard
  BEFORE INSERT OR UPDATE OF album_id, family_id ON public.family_media
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_media_album_guard();

-- Path consistency trigger guard (storage_object_path UUIDs MUST match NEW.family_id and NEW.id)
CREATE OR REPLACE FUNCTION public.handle_family_media_storage_path_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path_fam_id TEXT;
  v_path_media_id TEXT;
BEGIN
  -- Expected format: family-media/families/<family_id>/media/<media_id>/<filename>
  v_path_fam_id := split_part(NEW.storage_object_path, '/', 3);
  v_path_media_id := split_part(NEW.storage_object_path, '/', 5);

  IF v_path_fam_id != NEW.family_id::TEXT THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: storage_object_path family_id does not match record family_id' USING ERRCODE = '22023';
  END IF;

  IF v_path_media_id != NEW.id::TEXT THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: storage_object_path media_id does not match record id' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS family_media_storage_path_guard ON public.family_media;
CREATE TRIGGER family_media_storage_path_guard
  BEFORE INSERT OR UPDATE OF storage_object_path, family_id, id ON public.family_media
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_media_storage_path_guard();

-- Immutability trigger guard for family_media (id, family_id, uploaded_by, created_at, storage_object_path)
CREATE OR REPLACE FUNCTION public.handle_family_media_immutability_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id != OLD.id THEN
    RAISE EXCEPTION 'FORBIDDEN: Media id is immutable' USING ERRCODE = 'P0003';
  END IF;
  IF NEW.family_id != OLD.family_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Media family_id is immutable' USING ERRCODE = 'P0003';
  END IF;
  IF NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
    RAISE EXCEPTION 'FORBIDDEN: Media uploaded_by is immutable' USING ERRCODE = 'P0003';
  END IF;
  IF NEW.created_at != OLD.created_at THEN
    RAISE EXCEPTION 'FORBIDDEN: Media created_at is immutable' USING ERRCODE = 'P0003';
  END IF;
  IF NEW.storage_object_path != OLD.storage_object_path THEN
    RAISE EXCEPTION 'FORBIDDEN: Media storage_object_path is immutable' USING ERRCODE = 'P0003';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS family_media_immutability_guard ON public.family_media;
CREATE TRIGGER family_media_immutability_guard
  BEFORE UPDATE ON public.family_media
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_media_immutability_guard();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_family_media_family_id
  ON public.family_media(family_id, display_order, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_family_media_album_id
  ON public.family_media(album_id, display_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_family_media_storage_path
  ON public.family_media(storage_object_path);

-- -----------------------------------------------------------------------------
-- 3.3 Table: public.family_stories
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.family_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  privacy_level public.privacy_level NOT NULL DEFAULT 'FAMILY',
  featured_media_id UUID REFERENCES public.family_media(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT family_stories_title_not_empty
    CHECK (trim(title) != '' AND length(title) <= 300),
  CONSTRAINT family_stories_content_not_empty
    CHECK (trim(content) != '' AND length(content) <= 50000),
  CONSTRAINT family_stories_summary_length
    CHECK (summary IS NULL OR length(summary) <= 1000),
  CONSTRAINT family_stories_privacy_allowed
    CHECK (privacy_level IN ('PUBLIC', 'COMMUNITY', 'FAMILY', 'PRIVATE'))
);

COMMENT ON TABLE public.family_stories IS
  'Family stories, memoirs, and narrative history records associated with a family.';

-- Updated-at trigger
DROP TRIGGER IF EXISTS family_stories_handle_updated_at ON public.family_stories;
CREATE TRIGGER family_stories_handle_updated_at
  BEFORE UPDATE ON public.family_stories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Cross-family featured_media trigger guard
CREATE OR REPLACE FUNCTION public.handle_family_story_featured_media_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_media_family_id UUID;
BEGIN
  IF NEW.featured_media_id IS NOT NULL THEN
    SELECT family_id INTO v_media_family_id
    FROM public.family_media
    WHERE id = NEW.featured_media_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Featured media does not exist' USING ERRCODE = '22023';
    END IF;

    IF v_media_family_id != NEW.family_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Featured media belongs to a different family' USING ERRCODE = 'P0003';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS family_story_featured_media_guard ON public.family_stories;
CREATE TRIGGER family_story_featured_media_guard
  BEFORE INSERT OR UPDATE OF featured_media_id, family_id ON public.family_stories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_story_featured_media_guard();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_family_stories_family_id
  ON public.family_stories(family_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_family_stories_privacy
  ON public.family_stories(family_id, privacy_level)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- SECTION 4: AUTHORIZATION & PRIVACY HELPER FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 Helper: Can manage family media & albums
-- -----------------------------------------------------------------------------
-- Allowed: Admin/Super Admin, family creator, or active family head.
CREATE OR REPLACE FUNCTION public.can_manage_family_media(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR p_family_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. System Administrator
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  -- 2. Family creator (active, non-deleted family)
  IF EXISTS (
    SELECT 1 FROM public.families
    WHERE id = p_family_id
      AND created_by = v_user_id
      AND deleted_at IS NULL
      AND status = 'ACTIVE'
  ) THEN
    RETURN TRUE;
  END IF;

  -- 3. Active Family Head (active membership, active, non-archived person)
  IF EXISTS (
    SELECT 1
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    JOIN public.persons p
      ON p.id = fm.person_id
     AND p.user_id = v_user_id
     AND p.deleted_at IS NULL
     AND p.status != 'ARCHIVED'
    WHERE fm.family_id = p_family_id
      AND fm.is_head = TRUE
      AND fm.left_at IS NULL
      AND f.deleted_at IS NULL
      AND f.status = 'ACTIVE'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.can_manage_family_media(UUID) IS
  'Authorization check: returns TRUE if auth.uid() created, is active head, or is admin of the active family.';

-- -----------------------------------------------------------------------------
-- 4.2 Helper: Can read a specific family item by privacy level
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_read_family_item(
  p_family_id UUID,
  p_item_privacy public.privacy_level
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_fam_privacy public.privacy_level;
BEGIN
  v_user_id := auth.uid();
  IF p_family_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. System Administrator
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  -- 2. Check family lifecycle: must be active and non-deleted
  SELECT profile_privacy INTO v_fam_privacy
  FROM public.families
  WHERE id = p_family_id
    AND deleted_at IS NULL
    AND status = 'ACTIVE';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 3. Family Creator or Active Member has access to family items
  IF v_user_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.families
      WHERE id = p_family_id AND created_by = v_user_id AND deleted_at IS NULL AND status = 'ACTIVE'
    ) OR
    EXISTS (
      SELECT 1 FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = p_family_id
        AND fm.left_at IS NULL
        AND p.user_id = v_user_id
        AND p.deleted_at IS NULL
        AND p.status != 'ARCHIVED'
    )
  ) THEN
    RETURN TRUE;
  END IF;

  -- 4. PUBLIC item in PUBLIC family
  IF p_item_privacy = 'PUBLIC' AND v_fam_privacy = 'PUBLIC' THEN
    RETURN TRUE;
  END IF;

  -- 5. COMMUNITY item in COMMUNITY or PUBLIC family: requires authenticated user
  IF v_user_id IS NOT NULL AND
     p_item_privacy IN ('PUBLIC', 'COMMUNITY') AND
     v_fam_privacy IN ('PUBLIC', 'COMMUNITY') THEN
    RETURN TRUE;
  END IF;

  -- Otherwise (PRIVATE, FAMILY, or restricted family privacy): access denied
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.can_read_family_item(UUID, public.privacy_level) IS
  'Evaluates whether caller may read a family album, media, or story respecting family lifecycle and item privacy.';

-- =============================================================================
-- SECTION 5: ROW LEVEL SECURITY POLICIES (TABLES)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5.1 public.family_albums RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.family_albums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_albums_select_policy" ON public.family_albums;
CREATE POLICY "family_albums_select_policy"
  ON public.family_albums
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.can_read_family_item(family_id, privacy_level)
  );

DROP POLICY IF EXISTS "family_albums_insert_policy" ON public.family_albums;
CREATE POLICY "family_albums_insert_policy"
  ON public.family_albums
  FOR INSERT
  WITH CHECK (FALSE); -- Direct table mutations blocked; mutations MUST route through create_family_album RPC

DROP POLICY IF EXISTS "family_albums_update_policy" ON public.family_albums;
CREATE POLICY "family_albums_update_policy"
  ON public.family_albums
  FOR UPDATE
  USING (FALSE)
  WITH CHECK (FALSE); -- Direct table mutations blocked

DROP POLICY IF EXISTS "family_albums_delete_policy" ON public.family_albums;
CREATE POLICY "family_albums_delete_policy"
  ON public.family_albums
  FOR DELETE
  USING (FALSE); -- Physical deletes blocked; use soft-delete

-- -----------------------------------------------------------------------------
-- 5.2 public.family_media RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.family_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_media_select_policy" ON public.family_media;
CREATE POLICY "family_media_select_policy"
  ON public.family_media
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      -- If part of an album, check album read permissions, otherwise use default FAMILY privacy
      CASE
        WHEN album_id IS NOT NULL THEN EXISTS (
          SELECT 1 FROM public.family_albums fa
          WHERE fa.id = family_media.album_id
            AND fa.deleted_at IS NULL
            AND public.can_read_family_item(fa.family_id, fa.privacy_level)
        )
        ELSE public.can_read_family_item(family_id, 'FAMILY')
      END
    )
  );

DROP POLICY IF EXISTS "family_media_insert_policy" ON public.family_media;
CREATE POLICY "family_media_insert_policy"
  ON public.family_media
  FOR INSERT
  WITH CHECK (FALSE); -- Direct table mutations blocked; mutations MUST route through register_family_media RPC

DROP POLICY IF EXISTS "family_media_update_policy" ON public.family_media;
CREATE POLICY "family_media_update_policy"
  ON public.family_media
  FOR UPDATE
  USING (FALSE)
  WITH CHECK (FALSE); -- Direct table mutations blocked

DROP POLICY IF EXISTS "family_media_delete_policy" ON public.family_media;
CREATE POLICY "family_media_delete_policy"
  ON public.family_media
  FOR DELETE
  USING (FALSE); -- Physical deletes blocked; mutations MUST route through soft_delete_family_media RPC

-- -----------------------------------------------------------------------------
-- 5.3 public.family_stories RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.family_stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_stories_select_policy" ON public.family_stories;
CREATE POLICY "family_stories_select_policy"
  ON public.family_stories
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.can_read_family_item(family_id, privacy_level)
  );

DROP POLICY IF EXISTS "family_stories_insert_policy" ON public.family_stories;
CREATE POLICY "family_stories_insert_policy"
  ON public.family_stories
  FOR INSERT
  WITH CHECK (FALSE); -- Direct table mutations blocked; mutations MUST route through create_family_story RPC

DROP POLICY IF EXISTS "family_stories_update_policy" ON public.family_stories;
CREATE POLICY "family_stories_update_policy"
  ON public.family_stories
  FOR UPDATE
  USING (FALSE)
  WITH CHECK (FALSE); -- Direct table mutations blocked

DROP POLICY IF EXISTS "family_stories_delete_policy" ON public.family_stories;
CREATE POLICY "family_stories_delete_policy"
  ON public.family_stories
  FOR DELETE
  USING (FALSE); -- Physical deletes blocked; use soft-delete

-- =============================================================================
-- SECTION 6: DEDICATED STORAGE RLS POLICIES FOR 'family-media' BUCKET
-- =============================================================================
-- Governing the private 'family-media' storage bucket.
-- Existing 'avatars' bucket policies from Subtask 1 REMAIN 100% UNTOUCHED.
--
-- Path format: families/<family_id>/media/<media_id>/<filename>
-- Exactly 5 parts:
-- 1: 'families'
-- 2: family_id (UUID)
-- 3: 'media'
-- 4: media_id (UUID)
-- 5: filename (non-empty)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_read_family_media_object(p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  v_media_id UUID;
  v_fam_id_txt TEXT;
  v_media_id_txt TEXT;
BEGIN
  -- Validate segment structure: families/<family_id>/media/<media_id>/<filename>
  IF split_part(p_object_name, '/', 1) != 'families' OR
     split_part(p_object_name, '/', 3) != 'media' OR
     split_part(p_object_name, '/', 5) = '' OR
     split_part(p_object_name, '/', 6) != '' THEN
    RETURN FALSE;
  END IF;

  v_fam_id_txt := split_part(p_object_name, '/', 2);
  v_media_id_txt := split_part(p_object_name, '/', 4);

  IF v_fam_id_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
     v_media_id_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN FALSE;
  END IF;

  v_family_id := v_fam_id_txt::UUID;
  v_media_id := v_media_id_txt::UUID;

  -- Admins can read all family media
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  -- Object MUST be registered in public.family_media and active
  RETURN EXISTS (
    SELECT 1 FROM public.family_media fm
    WHERE fm.id = v_media_id
      AND fm.family_id = v_family_id
      AND fm.storage_object_path = ('family-media/' || p_object_name)
      AND fm.deleted_at IS NULL
      AND (
        CASE
          WHEN fm.album_id IS NOT NULL THEN EXISTS (
            SELECT 1 FROM public.family_albums fa
            WHERE fa.id = fm.album_id
              AND fa.deleted_at IS NULL
              AND public.can_read_family_item(fa.family_id, fa.privacy_level)
          )
          ELSE public.can_read_family_item(fm.family_id, 'FAMILY')
        END
      )
  );
END;
$$;

-- Dedicated family_media storage policies on storage.objects
DROP POLICY IF EXISTS "family_media_select_policy" ON storage.objects;
CREATE POLICY "family_media_select_policy"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'family-media'
    AND public.can_read_family_media_object(name)
  );

DROP POLICY IF EXISTS "family_media_insert_policy" ON storage.objects;
CREATE POLICY "family_media_insert_policy"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'family-media'
    AND auth.uid() IS NOT NULL
    AND split_part(name, '/', 1) = 'families'
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 3) = 'media'
    AND split_part(name, '/', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 5) != ''
    AND split_part(name, '/', 6) = ''
    AND public.can_manage_family_media((split_part(name, '/', 2))::UUID)
  );

DROP POLICY IF EXISTS "family_media_update_policy" ON storage.objects;
CREATE POLICY "family_media_update_policy"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'family-media'
    AND auth.uid() IS NOT NULL
    AND split_part(name, '/', 1) = 'families'
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 3) = 'media'
    AND split_part(name, '/', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 5) != ''
    AND split_part(name, '/', 6) = ''
    AND public.can_manage_family_media((split_part(name, '/', 2))::UUID)
  );

DROP POLICY IF EXISTS "family_media_delete_policy" ON storage.objects;
CREATE POLICY "family_media_delete_policy"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'family-media'
    AND auth.uid() IS NOT NULL
    AND split_part(name, '/', 1) = 'families'
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 3) = 'media'
    AND split_part(name, '/', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 5) != ''
    AND split_part(name, '/', 6) = ''
    AND public.can_manage_family_media((split_part(name, '/', 2))::UUID)
  );

-- =============================================================================
-- SECTION 7: AUTHORITATIVE MUTATION RPCS (SECURITY DEFINER + AUDIT)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 7.1 RPC: create_family_album
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_family_album(
  p_family_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_privacy_level public.privacy_level DEFAULT 'FAMILY'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_album_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.can_manage_family_media(p_family_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to manage albums for this family' USING ERRCODE = 'P0003';
  END IF;

  IF p_title IS NULL OR trim(p_title) = '' OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Title must be between 1 and 200 characters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.family_albums (
    family_id,
    title,
    description,
    privacy_level,
    created_by
  ) VALUES (
    p_family_id,
    trim(p_title),
    trim(p_description),
    p_privacy_level,
    v_user_id
  )
  RETURNING id INTO v_album_id;

  PERFORM public.log_audit_event(
    'FAMILY_UPDATED'::public.audit_action,
    'family_albums',
    v_album_id,
    NULL,
    jsonb_build_object('id', v_album_id, 'family_id', p_family_id, 'title', p_title, 'privacy_level', p_privacy_level)
  );

  RETURN jsonb_build_object('success', TRUE, 'album_id', v_album_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 7.2 RPC: register_family_media
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_family_media(
  p_family_id UUID,
  p_album_id UUID,
  p_media_id UUID,
  p_storage_path TEXT,
  p_media_type public.family_media_type,
  p_original_filename TEXT,
  p_mime_type TEXT,
  p_file_size BIGINT,
  p_caption TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_next_order INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.can_manage_family_media(p_family_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to add media to this family' USING ERRCODE = 'P0003';
  END IF;

  -- Validate storage path strictly matches family-media namespace, family_id and media_id
  IF p_storage_path !~ ('^family-media/families/' || p_family_id::TEXT || '/media/' || p_media_id::TEXT || '/[^/]+$') THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: storage_path does not conform to the canonical family-media namespace' USING ERRCODE = '22023';
  END IF;

  -- Validate album belongs to family if provided
  IF p_album_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.family_albums
    WHERE id = p_album_id AND family_id = p_family_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Album does not belong to the specified family' USING ERRCODE = '22023';
  END IF;

  -- Calculate next display order
  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_next_order
  FROM public.family_media
  WHERE family_id = p_family_id AND album_id IS NOT DISTINCT FROM p_album_id AND deleted_at IS NULL;

  INSERT INTO public.family_media (
    id,
    family_id,
    album_id,
    storage_object_path,
    media_type,
    original_filename,
    mime_type,
    file_size,
    caption,
    description,
    display_order,
    uploaded_by
  ) VALUES (
    p_media_id,
    p_family_id,
    p_album_id,
    p_storage_path,
    p_media_type,
    p_original_filename,
    p_mime_type,
    p_file_size,
    trim(p_caption),
    trim(p_description),
    v_next_order,
    v_user_id
  );

  PERFORM public.log_audit_event(
    'FAMILY_UPDATED'::public.audit_action,
    'family_media',
    p_media_id,
    NULL,
    jsonb_build_object('id', p_media_id, 'family_id', p_family_id, 'storage_path', p_storage_path)
  );

  RETURN jsonb_build_object('success', TRUE, 'media_id', p_media_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 7.3 RPC: soft_delete_family_media
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_family_media(p_media_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_family_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT family_id INTO v_family_id
  FROM public.family_media
  WHERE id = p_media_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Media record not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_manage_family_media(v_family_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to delete this media' USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.family_media
  SET deleted_at = NOW(),
      updated_at = NOW()
  WHERE id = p_media_id;

  PERFORM public.log_audit_event(
    'FAMILY_UPDATED'::public.audit_action,
    'family_media',
    p_media_id,
    jsonb_build_object('deleted_at', NULL),
    jsonb_build_object('deleted_at', NOW())
  );

  RETURN jsonb_build_object('success', TRUE, 'media_id', p_media_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 7.4 RPC: create_family_story
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_family_story(
  p_family_id UUID,
  p_title TEXT,
  p_content TEXT,
  p_summary TEXT DEFAULT NULL,
  p_privacy_level public.privacy_level DEFAULT 'FAMILY',
  p_featured_media_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_story_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.can_manage_family_media(p_family_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to add stories to this family' USING ERRCODE = 'P0003';
  END IF;

  IF p_title IS NULL OR trim(p_title) = '' OR length(p_title) > 300 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Title must be between 1 and 300 characters' USING ERRCODE = '22023';
  END IF;

  IF p_content IS NULL OR trim(p_content) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Content cannot be empty' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.family_stories (
    family_id,
    title,
    content,
    summary,
    author_id,
    privacy_level,
    featured_media_id
  ) VALUES (
    p_family_id,
    trim(p_title),
    trim(p_content),
    trim(p_summary),
    v_user_id,
    p_privacy_level,
    p_featured_media_id
  )
  RETURNING id INTO v_story_id;

  PERFORM public.log_audit_event(
    'FAMILY_UPDATED'::public.audit_action,
    'family_stories',
    v_story_id,
    NULL,
    jsonb_build_object('id', v_story_id, 'family_id', p_family_id, 'title', p_title)
  );

  RETURN jsonb_build_object('success', TRUE, 'story_id', v_story_id);
END;
$$;

-- =============================================================================
-- SECTION 8: FUNCTION EXECUTION PRIVILEGES & TABLE GRANTS
-- =============================================================================

-- Revoke direct table mutations; grant SELECT only to authenticated role
REVOKE ALL ON TABLE public.family_albums, public.family_media, public.family_stories FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.family_albums TO authenticated;
GRANT SELECT ON TABLE public.family_media TO authenticated;
GRANT SELECT ON TABLE public.family_stories TO authenticated;

-- Helper and RPC privileges
REVOKE EXECUTE ON FUNCTION public.can_manage_family_media(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_family_item(UUID, public.privacy_level) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_family_media_object(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_family_album(UUID, TEXT, TEXT, public.privacy_level) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_family_media(UUID, UUID, UUID, TEXT, public.family_media_type, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soft_delete_family_media(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_family_story(UUID, TEXT, TEXT, TEXT, public.privacy_level, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_family_media(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_family_item(UUID, public.privacy_level) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_read_family_media_object(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_family_album(UUID, TEXT, TEXT, public.privacy_level) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_family_media(UUID, UUID, UUID, TEXT, public.family_media_type, TEXT, TEXT, BIGINT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_family_media(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_family_story(UUID, TEXT, TEXT, TEXT, public.privacy_level, UUID) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261016100000_create_notifications_foundation.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261016100000_create_notifications_foundation.sql
-- Purpose:   Create Notifications Foundation schema, enums, tables, RLS policies,
--             indexes, immutability triggers, and authoritative RPC functions:
--             1. public.notification_category, public.notification_channel,
--                public.notification_delivery_status enums
--             2. public.notifications table (in-app inbox with immutable metadata)
--             3. public.notification_preferences table (user preference settings)
--             4. public.notification_outbox table (asynchronous external delivery queue)
--             5. Invariant & Immutability Triggers:
--                - public.handle_notification_immutability_guard
--                - public.handle_notification_preferences_guard
--                - public.handle_notification_outbox_guard
--                - public.notification_preferences_handle_updated_at
--             6. Authoritative Application RPCs (SECURITY DEFINER, search_path = public):
--                - public.mark_notification_read
--                - public.mark_all_notifications_read
--                - public.dismiss_notification
--                - public.get_unread_notification_count
--                - public.get_my_notification_preferences
--                - public.update_my_notification_preferences
--             7. Hardened Row Level Security policies (RPC-authoritative mutations)
--             8. Explicit least-privilege table & RPC grants (zero anon mutations)
--             9. Supabase Realtime publication configuration for public.notifications
-- Phase:     Phase 12 — Subtask 1 (Notification Database Foundation & RLS)
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. PERSON != USER:
--    Notifications and preferences belong strictly to authenticated user accounts
--    (auth.users / public.profiles.id), NEVER to raw census Person records.
--    No foreign keys exist to public.persons.
--
-- 2. SERVER-AUTHORITATIVE MUTATIONS:
--    Direct client INSERT and DELETE operations on public.notifications and
--    public.notification_outbox are strictly denied.
--    State transitions (read_at, deleted_at) are managed exclusively through
--    audited, SECURITY DEFINER RPCs or strictly guarded RLS policies.
--
-- 3. CONTENT IMMUTABILITY:
--    Once created, notification text, titles, categories, recipient, actor,
--    and entity references are permanently immutable.
--
-- 4. PRIVACY-FIRST ISOLATION:
--    Row Level Security guarantees recipients may view only their own notifications.
--    Cross-user access, inspection, or manipulation is completely blocked.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'notification_category' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.notification_category AS ENUM (
      'CONNECTION',    -- Connection requests, acceptances, network milestones
      'INVITATION',    -- Family member invitations, seat assignments
      'CLAIM',         -- Person claim submissions, review outcomes
      'VERIFICATION',  -- Verification request review outcomes, data quality badges
      'COMMUNITY',     -- Community announcements, group role updates
      'EVENT',         -- Event schedules, RSVP updates, cancellations
      'FAMILY',        -- New family albums, photos, preserved oral history stories
      'SECURITY'       -- Mandatory account security and critical system alerts
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'notification_channel' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.notification_channel AS ENUM (
      'EMAIL',         -- Transactional email dispatch
      'PUSH'           -- Web/Mobile Push notification (future)
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'notification_delivery_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.notification_delivery_status AS ENUM (
      'PENDING',       -- Queued for delivery
      'PROCESSING',    -- Worker actively dispatching
      'SENT',          -- Successfully delivered to external provider
      'FAILED',        -- Delivery attempt failed (retriable)
      'DEAD_LETTER'    -- Terminal failure after maximum retry attempts
    );
  END IF;
END $$;

COMMENT ON TYPE public.notification_category IS 'Domain categories for notifications.';
COMMENT ON TYPE public.notification_channel IS 'External communication channels for notification dispatches.';
COMMENT ON TYPE public.notification_delivery_status IS 'Delivery lifecycle states for outbox notifications.';

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

-- 2.1 public.notifications (In-app inbox)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category public.notification_category NOT NULL,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  action_url VARCHAR(500),
  entity_type VARCHAR(50),
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT notifications_title_length CHECK (length(title) >= 1 AND length(title) <= 200),
  CONSTRAINT notifications_body_length CHECK (length(body) >= 1 AND length(body) <= 2000),
  CONSTRAINT notifications_action_url_length CHECK (action_url IS NULL OR length(action_url) <= 500),
  CONSTRAINT notifications_entity_type_length CHECK (entity_type IS NULL OR length(entity_type) <= 50),
  CONSTRAINT notifications_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT notifications_read_at_after_created CHECK (read_at IS NULL OR read_at >= created_at - INTERVAL '5 seconds'),
  CONSTRAINT notifications_deleted_at_after_created CHECK (deleted_at IS NULL OR deleted_at >= created_at - INTERVAL '5 seconds')
);

COMMENT ON TABLE public.notifications IS
  'Canonical in-app notification inbox. Owned strictly by auth.users (PERSON != USER).';

-- 2.2 public.notification_preferences (User notification settings)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_connections BOOLEAN NOT NULL DEFAULT TRUE,
  email_invitations BOOLEAN NOT NULL DEFAULT TRUE,
  email_claims BOOLEAN NOT NULL DEFAULT TRUE,
  email_verifications BOOLEAN NOT NULL DEFAULT TRUE,
  email_announcements BOOLEAN NOT NULL DEFAULT FALSE,
  email_events BOOLEAN NOT NULL DEFAULT TRUE,
  email_family_media BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.notification_preferences IS
  'User communication preferences per channel and category. 1:1 with auth.users.';

-- 2.3 public.notification_outbox (Asynchronous external delivery queue)
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel public.notification_channel NOT NULL,
  status public.notification_delivery_status NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT notification_outbox_attempts_non_negative CHECK (attempts >= 0)
);

COMMENT ON TABLE public.notification_outbox IS
  'Asynchronous delivery queue for external notifications (email, push). Isolated from client access.';

-- -----------------------------------------------------------------------------
-- 3. Indexes
-- -----------------------------------------------------------------------------

-- Rapid unread counts and badge lookups (Index-Only Scan)
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL AND deleted_at IS NULL;

-- Paginated in-app inbox feed for user
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_feed
  ON public.notifications (recipient_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Fast correlation lookup when entities are updated or reconciled
CREATE INDEX IF NOT EXISTS idx_notifications_entity_lookup
  ON public.notifications (entity_type, entity_id)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

-- Outbox worker polling index
CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
  ON public.notification_outbox (status, scheduled_at)
  WHERE status = 'PENDING';

-- Outbox recipient correlation
CREATE INDEX IF NOT EXISTS idx_notification_outbox_recipient
  ON public.notification_outbox (recipient_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Invariant Triggers & Immutability Guards
-- -----------------------------------------------------------------------------

-- 4.1 Immutability guard for notifications
CREATE OR REPLACE FUNCTION public.handle_notification_immutability_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id != OLD.id THEN
    RAISE EXCEPTION 'INVALID_MUTATION: notification id is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.recipient_id != OLD.recipient_id THEN
    RAISE EXCEPTION 'INVALID_MUTATION: notification recipient_id is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.actor_id IS DISTINCT FROM OLD.actor_id THEN
    RAISE EXCEPTION 'INVALID_MUTATION: notification actor_id is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.category != OLD.category THEN
    RAISE EXCEPTION 'INVALID_MUTATION: notification category is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.type != OLD.type THEN
    RAISE EXCEPTION 'INVALID_MUTATION: notification type is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.title != OLD.title THEN
    RAISE EXCEPTION 'INVALID_MUTATION: notification title is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.body != OLD.body THEN
    RAISE EXCEPTION 'INVALID_MUTATION: notification body is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.action_url IS DISTINCT FROM OLD.action_url THEN
    RAISE EXCEPTION 'INVALID_MUTATION: notification action_url is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.entity_type IS DISTINCT FROM OLD.entity_type THEN
    RAISE EXCEPTION 'INVALID_MUTATION: notification entity_type is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
    RAISE EXCEPTION 'INVALID_MUTATION: notification entity_id is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.created_at != OLD.created_at THEN
    RAISE EXCEPTION 'INVALID_MUTATION: notification created_at is immutable' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_immutability_guard ON public.notifications;
CREATE TRIGGER notification_immutability_guard
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_notification_immutability_guard();

-- 4.2 Guard for notification_preferences
CREATE OR REPLACE FUNCTION public.handle_notification_preferences_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id != OLD.user_id THEN
    RAISE EXCEPTION 'INVALID_MUTATION: preferences user_id is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.created_at != OLD.created_at THEN
    RAISE EXCEPTION 'INVALID_MUTATION: preferences created_at is immutable' USING ERRCODE = '22023';
  END IF;

  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_preferences_guard ON public.notification_preferences;
CREATE TRIGGER notification_preferences_guard
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_notification_preferences_guard();

-- 4.3 Guard for notification_outbox
CREATE OR REPLACE FUNCTION public.handle_notification_outbox_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id != OLD.id THEN
    RAISE EXCEPTION 'INVALID_MUTATION: outbox id is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.notification_id != OLD.notification_id THEN
    RAISE EXCEPTION 'INVALID_MUTATION: outbox notification_id is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.recipient_id != OLD.recipient_id THEN
    RAISE EXCEPTION 'INVALID_MUTATION: outbox recipient_id is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.channel != OLD.channel THEN
    RAISE EXCEPTION 'INVALID_MUTATION: outbox channel is immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.created_at != OLD.created_at THEN
    RAISE EXCEPTION 'INVALID_MUTATION: outbox created_at is immutable' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_outbox_guard ON public.notification_outbox;
CREATE TRIGGER notification_outbox_guard
  BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_notification_outbox_guard();

-- -----------------------------------------------------------------------------
-- 5. Row Level Security Policies
-- -----------------------------------------------------------------------------

-- 5.1 public.notifications RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_recipient" ON public.notifications;
CREATE POLICY "notifications_select_recipient"
  ON public.notifications
  FOR SELECT
  USING (
    recipient_id = auth.uid()
    AND deleted_at IS NULL
  );

-- Direct client modifications denied; state updates route strictly through RPCs
DROP POLICY IF EXISTS "notifications_insert_deny" ON public.notifications;
CREATE POLICY "notifications_insert_deny"
  ON public.notifications
  FOR INSERT
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "notifications_update_deny" ON public.notifications;
CREATE POLICY "notifications_update_deny"
  ON public.notifications
  FOR UPDATE
  USING (FALSE)
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "notifications_delete_deny" ON public.notifications;
CREATE POLICY "notifications_delete_deny"
  ON public.notifications
  FOR DELETE
  USING (FALSE);

-- 5.2 public.notification_preferences RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_preferences_select_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_select_own"
  ON public.notification_preferences
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_preferences_insert_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_insert_own"
  ON public.notification_preferences
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_preferences_update_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_update_own"
  ON public.notification_preferences
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_preferences_delete_deny" ON public.notification_preferences;
CREATE POLICY "notification_preferences_delete_deny"
  ON public.notification_preferences
  FOR DELETE
  USING (FALSE);

-- 5.3 public.notification_outbox RLS (Private to system workers)
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_outbox_select_deny" ON public.notification_outbox;
CREATE POLICY "notification_outbox_select_deny"
  ON public.notification_outbox
  FOR SELECT
  USING (FALSE);

DROP POLICY IF EXISTS "notification_outbox_insert_deny" ON public.notification_outbox;
CREATE POLICY "notification_outbox_insert_deny"
  ON public.notification_outbox
  FOR INSERT
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "notification_outbox_update_deny" ON public.notification_outbox;
CREATE POLICY "notification_outbox_update_deny"
  ON public.notification_outbox
  FOR UPDATE
  USING (FALSE)
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "notification_outbox_delete_deny" ON public.notification_outbox;
CREATE POLICY "notification_outbox_delete_deny"
  ON public.notification_outbox
  FOR DELETE
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 6. Table Grants (Least Privilege)
-- -----------------------------------------------------------------------------

REVOKE ALL ON public.notifications FROM PUBLIC, anon;
GRANT SELECT ON public.notifications TO authenticated;

REVOKE ALL ON public.notification_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;

REVOKE ALL ON public.notification_outbox FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Authoritative Application RPCs (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- 7.1 RPC: mark_notification_read
CREATE OR REPLACE FUNCTION public.mark_notification_read(
  p_notification_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_updated INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF p_notification_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: notification_id is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notifications
  SET read_at = COALESCE(read_at, timezone('utc'::text, now()))
  WHERE id = p_notification_id
    AND recipient_id = v_user_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.mark_notification_read(UUID) IS
  'Marks a notification as read for the authenticated caller. Idempotent.';

-- 7.2 RPC: mark_all_notifications_read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(
  p_category public.notification_category DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_count INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated' USING ERRCODE = 'P0001';
  END IF;

  WITH updated AS (
    UPDATE public.notifications
    SET read_at = timezone('utc'::text, now())
    WHERE recipient_id = v_user_id
      AND read_at IS NULL
      AND deleted_at IS NULL
      AND (p_category IS NULL OR category = p_category)
    RETURNING id
  )
  SELECT count(*)::INT INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.mark_all_notifications_read(public.notification_category) IS
  'Bulk marks unread notifications as read for the authenticated caller, optionally scoped to a category.';

-- 7.3 RPC: dismiss_notification
CREATE OR REPLACE FUNCTION public.dismiss_notification(
  p_notification_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_updated INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF p_notification_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: notification_id is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notifications
  SET deleted_at = COALESCE(deleted_at, timezone('utc'::text, now()))
  WHERE id = p_notification_id
    AND recipient_id = v_user_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.dismiss_notification(UUID) IS
  'Soft-deletes a notification for the authenticated caller. Idempotent.';

-- 7.4 RPC: get_unread_notification_count
CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_count INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*)::INT INTO v_count
  FROM public.notifications
  WHERE recipient_id = v_user_id
    AND read_at IS NULL
    AND deleted_at IS NULL;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.get_unread_notification_count() IS
  'Returns total unread active notifications count for the authenticated caller.';

-- 7.5 RPC: get_my_notification_preferences
CREATE OR REPLACE FUNCTION public.get_my_notification_preferences()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Lazy initialization with standard defaults
  INSERT INTO public.notification_preferences (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT to_jsonb(np) INTO v_result
  FROM public.notification_preferences np
  WHERE np.user_id = v_user_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_my_notification_preferences() IS
  'Retrieves notification preferences for caller, initializing defaults lazily if missing.';

-- 7.6 RPC: update_my_notification_preferences
CREATE OR REPLACE FUNCTION public.update_my_notification_preferences(
  p_in_app_enabled BOOLEAN DEFAULT TRUE,
  p_email_enabled BOOLEAN DEFAULT TRUE,
  p_email_connections BOOLEAN DEFAULT TRUE,
  p_email_invitations BOOLEAN DEFAULT TRUE,
  p_email_claims BOOLEAN DEFAULT TRUE,
  p_email_verifications BOOLEAN DEFAULT TRUE,
  p_email_announcements BOOLEAN DEFAULT FALSE,
  p_email_events BOOLEAN DEFAULT TRUE,
  p_email_family_media BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.notification_preferences (
    user_id,
    in_app_enabled,
    email_enabled,
    email_connections,
    email_invitations,
    email_claims,
    email_verifications,
    email_announcements,
    email_events,
    email_family_media
  ) VALUES (
    v_user_id,
    COALESCE(p_in_app_enabled, TRUE),
    COALESCE(p_email_enabled, TRUE),
    COALESCE(p_email_connections, TRUE),
    COALESCE(p_email_invitations, TRUE),
    COALESCE(p_email_claims, TRUE),
    COALESCE(p_email_verifications, TRUE),
    COALESCE(p_email_announcements, FALSE),
    COALESCE(p_email_events, TRUE),
    COALESCE(p_email_family_media, FALSE)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    in_app_enabled = EXCLUDED.in_app_enabled,
    email_enabled = EXCLUDED.email_enabled,
    email_connections = EXCLUDED.email_connections,
    email_invitations = EXCLUDED.email_invitations,
    email_claims = EXCLUDED.email_claims,
    email_verifications = EXCLUDED.email_verifications,
    email_announcements = EXCLUDED.email_announcements,
    email_events = EXCLUDED.email_events,
    email_family_media = EXCLUDED.email_family_media,
    updated_at = timezone('utc'::text, now());

  SELECT to_jsonb(np) INTO v_result
  FROM public.notification_preferences np
  WHERE np.user_id = v_user_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.update_my_notification_preferences(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) IS
  'Updates and returns notification preferences for the authenticated caller.';

-- -----------------------------------------------------------------------------
-- 8. RPC Execution Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read(public.notification_category) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read(public.notification_category) TO authenticated;

REVOKE ALL ON FUNCTION public.dismiss_notification(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_notification(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_unread_notification_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count() TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_notification_preferences() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notification_preferences() TO authenticated;

REVOKE ALL ON FUNCTION public.update_my_notification_preferences(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_notification_preferences(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. Supabase Realtime Publication
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN OTHERS THEN
    NULL;
END $$;



-- =============================================================================
-- >>> MIGRATION FILE: 20261016140000_create_notification_domain_pipeline.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261016140000_create_notification_domain_pipeline.sql
-- Purpose:   Phase 12 Subtask 2 — Domain Event Notification Pipeline & Outbox
--             1. Unique Indexes for Strict Idempotency:
--                - uq_notifications_recipient_event_key on public.notifications
--                - uq_notification_outbox_notification_channel on public.notification_outbox
--             2. Centralized Pipeline Helper Function:
--                - public.emit_domain_notification (SECURITY DEFINER, search_path = public)
--             3. Domain Event Triggers & Handlers:
--                - Connections: connection_request, connection_accepted
--                - Person Claims: claim_approved, claim_rejected
--                - Invitations: invitation_accepted
--                - Verification Requests: verification_approved, verification_rejected
--                - Community Groups: group_role_updated
--                - Community Events: event_cancelled, event_rsvp
--                - Family Media & Stories: family_photo_added, family_story_added
--             4. Defense-in-Depth Privilege Hardening:
--                - Revoke execute on internal helpers from anon and authenticated
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. PERSON != USER:
--    Notifications and outbox queue entries are dispatched strictly to authenticated
--    accounts (auth.users), NEVER to census Person records.
--
-- 2. ZERO SILENT DROPS:
--    Notification generation occurs transactionally within the originating domain
--    operation without swallow-all exception handlers.
--
-- 3. DETERMINISTIC IDEMPOTENCY:
--    Every event produces a deterministic event_key. Database-level partial unique
--    indexes guarantee that duplicate trigger executions cannot produce duplicate
--    inbox notifications or duplicate outbox dispatches.
--
-- 4. PREFERENCE RESPECT:
--    External outbox delivery (EMAIL) checks public.notification_preferences.
--    In-app notifications remain the authoritative ledger of record.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Idempotency Indexes
-- -----------------------------------------------------------------------------

-- Enforces that at most ONE notification per event_key can exist for any recipient
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_recipient_event_key
  ON public.notifications (recipient_id, ((metadata->>'event_key')))
  WHERE (metadata->>'event_key') IS NOT NULL;

-- Enforces that at most ONE outbox record per channel exists for a notification
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_outbox_notification_channel
  ON public.notification_outbox (notification_id, channel);

-- -----------------------------------------------------------------------------
-- 2. Authoritative Internal Helper Function
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.emit_domain_notification(
  p_recipient_id UUID,
  p_actor_id UUID,
  p_category public.notification_category,
  p_type VARCHAR,
  p_title VARCHAR,
  p_body TEXT,
  p_action_url VARCHAR DEFAULT NULL,
  p_entity_type VARCHAR DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_event_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_email_enabled BOOLEAN := TRUE;
  v_category_email_allowed BOOLEAN := TRUE;
  v_prefs RECORD;
  v_user_exists BOOLEAN;
BEGIN
  -- 1. Validate recipient is provided
  IF p_recipient_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Suppress self-notifications (unless actor is NULL)
  IF p_actor_id IS NOT NULL AND p_recipient_id = p_actor_id THEN
    RETURN NULL;
  END IF;

  -- 3. Recipient safety: verify recipient exists in auth.users
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_recipient_id
  ) INTO v_user_exists;

  IF NOT v_user_exists THEN
    RETURN NULL;
  END IF;

  -- 4. Insert in-app notification with database-enforced idempotency
  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    category,
    type,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    p_recipient_id,
    p_actor_id,
    p_category,
    p_type,
    p_title,
    p_body,
    p_action_url,
    p_entity_type,
    p_entity_id,
    jsonb_build_object('event_key', p_event_key) || COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (recipient_id, ((metadata->>'event_key'))) WHERE (metadata->>'event_key') IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_notification_id;

  -- If duplicate event was already processed, return NULL (idempotent no-op)
  IF v_notification_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 5. Outbox Evaluation (Email channel)
  SELECT * INTO v_prefs
  FROM public.notification_preferences
  WHERE user_id = p_recipient_id;

  IF FOUND THEN
    v_email_enabled := v_prefs.email_enabled;
    CASE p_category
      WHEN 'CONNECTION' THEN v_category_email_allowed := v_prefs.email_connections;
      WHEN 'INVITATION' THEN v_category_email_allowed := v_prefs.email_invitations;
      WHEN 'CLAIM' THEN v_category_email_allowed := v_prefs.email_claims;
      WHEN 'VERIFICATION' THEN v_category_email_allowed := v_prefs.email_verifications;
      WHEN 'COMMUNITY' THEN v_category_email_allowed := v_prefs.email_announcements;
      WHEN 'EVENT' THEN v_category_email_allowed := v_prefs.email_events;
      WHEN 'FAMILY' THEN v_category_email_allowed := v_prefs.email_family_media;
      WHEN 'SECURITY' THEN v_category_email_allowed := TRUE;
      ELSE v_category_email_allowed := TRUE;
    END CASE;
  ELSE
    -- Default preferences (from schema defaults: announcements and family_media are default false)
    IF p_category IN ('COMMUNITY', 'FAMILY') THEN
      v_category_email_allowed := FALSE;
    ELSE
      v_category_email_allowed := TRUE;
    END IF;
  END IF;

  -- Queue for external email dispatch if preferences permit
  IF v_email_enabled AND v_category_email_allowed THEN
    INSERT INTO public.notification_outbox (
      notification_id,
      recipient_id,
      channel,
      status
    ) VALUES (
      v_notification_id,
      p_recipient_id,
      'EMAIL'::public.notification_channel,
      'PENDING'::public.notification_delivery_status
    )
    ON CONFLICT (notification_id, channel)
    DO NOTHING;
  END IF;

  RETURN v_notification_id;
END;
$$;

COMMENT ON FUNCTION public.emit_domain_notification IS
  'Internal security-definer helper to atomically insert idempotent notifications and outbox dispatches.';

-- Restrict execution to internal database triggers / service role
REVOKE ALL ON FUNCTION public.emit_domain_notification(UUID, UUID, public.notification_category, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_domain_notification(UUID, UUID, public.notification_category, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, UUID, TEXT, JSONB) TO postgres, service_role;

-- -----------------------------------------------------------------------------
-- 3. Connections Domain Triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_connection_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Event 1: New connection request received
  IF (TG_OP = 'INSERT' AND NEW.status = 'PENDING') THEN
    PERFORM public.emit_domain_notification(
      p_recipient_id := NEW.addressee_id,
      p_actor_id := NEW.requester_id,
      p_category := 'CONNECTION'::public.notification_category,
      p_type := 'connection_request',
      p_title := 'New Connection Request',
      p_body := 'You have received a new connection request.',
      p_action_url := '/connections',
      p_entity_type := 'connection',
      p_entity_id := NEW.id,
      p_event_key := 'connection:' || NEW.id || ':requested'
    );
  END IF;

  -- Event 2: Connection request accepted
  IF (TG_OP = 'UPDATE' AND OLD.status = 'PENDING' AND NEW.status = 'ACCEPTED') THEN
    PERFORM public.emit_domain_notification(
      p_recipient_id := NEW.requester_id,
      p_actor_id := NEW.addressee_id,
      p_category := 'CONNECTION'::public.notification_category,
      p_type := 'connection_accepted',
      p_title := 'Connection Request Accepted',
      p_body := 'Your connection request has been accepted.',
      p_action_url := '/connections',
      p_entity_type := 'connection',
      p_entity_id := NEW.id,
      p_event_key := 'connection:' || NEW.id || ':accepted'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_notification_events ON public.connections;
CREATE TRIGGER trg_connection_notification_events
  AFTER INSERT OR UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_connection_notification_events();

-- -----------------------------------------------------------------------------
-- 4. Person Claims Domain Triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_claim_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    -- Event: Claim Approved
    IF (OLD.status = 'PENDING' AND NEW.status = 'APPROVED') THEN
      PERFORM public.emit_domain_notification(
        p_recipient_id := NEW.claimant_id,
        p_actor_id := NEW.reviewed_by,
        p_category := 'CLAIM'::public.notification_category,
        p_type := 'claim_approved',
        p_title := 'Person Claim Approved',
        p_body := 'Your claim for the census person record has been approved.',
        p_action_url := '/claims',
        p_entity_type := 'person_claim',
        p_entity_id := NEW.id,
        p_event_key := 'claim:' || NEW.id || ':approved'
      );
    END IF;

    -- Event: Claim Rejected
    IF (OLD.status = 'PENDING' AND NEW.status = 'REJECTED') THEN
      PERFORM public.emit_domain_notification(
        p_recipient_id := NEW.claimant_id,
        p_actor_id := NEW.reviewed_by,
        p_category := 'CLAIM'::public.notification_category,
        p_type := 'claim_rejected',
        p_title := 'Person Claim Update',
        p_body := 'Your claim for the census person record was not approved.',
        p_action_url := '/claims',
        p_entity_type := 'person_claim',
        p_entity_id := NEW.id,
        p_event_key := 'claim:' || NEW.id || ':rejected'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_notification_events ON public.person_claims;
CREATE TRIGGER trg_claim_notification_events
  AFTER UPDATE ON public.person_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_claim_notification_events();

-- -----------------------------------------------------------------------------
-- 5. Invitations Domain Triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_invitation_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status = 'PENDING' AND NEW.status = 'ACCEPTED') THEN
    -- Notify the inviter (who is an authenticated user) that their invitation was accepted
    PERFORM public.emit_domain_notification(
      p_recipient_id := NEW.invited_by,
      p_actor_id := NEW.accepted_by,
      p_category := 'INVITATION'::public.notification_category,
      p_type := 'invitation_accepted',
      p_title := 'Invitation Accepted',
      p_body := 'Your invitation has been accepted.',
      p_action_url := '/families',
      p_entity_type := 'invitation',
      p_entity_id := NEW.id,
      p_event_key := 'invitation:' || NEW.id || ':accepted'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invitation_notification_events ON public.invitations;
CREATE TRIGGER trg_invitation_notification_events
  AFTER UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invitation_notification_events();

-- -----------------------------------------------------------------------------
-- 6. Verification Requests Domain Triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_verification_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    -- Event: Verification Approved
    IF (OLD.status = 'PENDING' AND NEW.status = 'APPROVED') THEN
      PERFORM public.emit_domain_notification(
        p_recipient_id := NEW.requester_id,
        p_actor_id := NEW.reviewed_by,
        p_category := 'VERIFICATION'::public.notification_category,
        p_type := 'verification_approved',
        p_title := 'Record Verification Approved',
        p_body := 'Your verification request for ' || lower(NEW.entity_type) || ' record has been approved.',
        p_action_url := '/verification',
        p_entity_type := 'verification_request',
        p_entity_id := NEW.id,
        p_event_key := 'verification:' || NEW.id || ':approved'
      );
    END IF;

    -- Event: Verification Rejected
    IF (OLD.status = 'PENDING' AND NEW.status = 'REJECTED') THEN
      PERFORM public.emit_domain_notification(
        p_recipient_id := NEW.requester_id,
        p_actor_id := NEW.reviewed_by,
        p_category := 'VERIFICATION'::public.notification_category,
        p_type := 'verification_rejected',
        p_title := 'Record Verification Update',
        p_body := 'Your verification request for ' || lower(NEW.entity_type) || ' record was not approved.',
        p_action_url := '/verification',
        p_entity_type := 'verification_request',
        p_entity_id := NEW.id,
        p_event_key := 'verification:' || NEW.id || ':rejected'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verification_notification_events ON public.verification_requests;
CREATE TRIGGER trg_verification_notification_events
  AFTER UPDATE ON public.verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_verification_notification_events();

-- -----------------------------------------------------------------------------
-- 7. Community Groups Domain Triggers (Role Update)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_group_member_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_slug TEXT;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role) THEN
    SELECT slug INTO v_group_slug FROM public.groups WHERE id = NEW.group_id;

    PERFORM public.emit_domain_notification(
      p_recipient_id := NEW.user_id,
      p_actor_id := auth.uid(),
      p_category := 'COMMUNITY'::public.notification_category,
      p_type := 'group_role_updated',
      p_title := 'Group Role Updated',
      p_body := 'Your role in the group has been updated to ' || NEW.role || '.',
      p_action_url := CASE WHEN v_group_slug IS NOT NULL THEN '/community/groups/' || v_group_slug ELSE '/community/groups' END,
      p_entity_type := 'group',
      p_entity_id := NEW.group_id,
      p_event_key := 'group_role:' || NEW.group_id || ':' || NEW.user_id || ':' || NEW.role
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_member_notification_events ON public.group_members;
CREATE TRIGGER trg_group_member_notification_events
  AFTER UPDATE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_group_member_notification_events();

-- -----------------------------------------------------------------------------
-- 8. Community Events Domain Triggers
-- -----------------------------------------------------------------------------

-- 8.1 Event Cancellation (notifies registered attendees)
CREATE OR REPLACE FUNCTION public.handle_event_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attendee RECORD;
BEGIN
  -- Event Cancelled: notify attendees who RSVP'd GOING or MAYBE
  IF (TG_OP = 'UPDATE' AND OLD.status <> 'CANCELLED' AND NEW.status = 'CANCELLED') THEN
    FOR v_attendee IN
      SELECT user_id
      FROM public.event_rsvps
      WHERE event_id = NEW.id
        AND status IN ('GOING', 'MAYBE')
        AND user_id <> NEW.creator_id
    LOOP
      PERFORM public.emit_domain_notification(
        p_recipient_id := v_attendee.user_id,
        p_actor_id := NEW.creator_id,
        p_category := 'EVENT'::public.notification_category,
        p_type := 'event_cancelled',
        p_title := 'Event Cancelled',
        p_body := 'The event "' || substring(NEW.title from 1 for 100) || '" has been cancelled.',
        p_action_url := '/community/events/' || NEW.id,
        p_entity_type := 'event',
        p_entity_id := NEW.id,
        p_event_key := 'event:' || NEW.id || ':cancelled:' || v_attendee.user_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_notification_events ON public.events;
CREATE TRIGGER trg_event_notification_events
  AFTER UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_event_notification_events();

-- 8.2 Event RSVP (notifies event organizer when member RSVPs GOING)
CREATE OR REPLACE FUNCTION public.handle_event_rsvp_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
  v_event_title TEXT;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'GOING') OR
     (TG_OP = 'UPDATE' AND OLD.status <> 'GOING' AND NEW.status = 'GOING') THEN
    SELECT creator_id, title INTO v_creator_id, v_event_title
    FROM public.events
    WHERE id = NEW.event_id;

    IF v_creator_id IS NOT NULL AND v_creator_id <> NEW.user_id THEN
      PERFORM public.emit_domain_notification(
        p_recipient_id := v_creator_id,
        p_actor_id := NEW.user_id,
        p_category := 'EVENT'::public.notification_category,
        p_type := 'event_rsvp',
        p_title := 'New Event RSVP',
        p_body := 'A member has RSVP''d Going to your event.',
        p_action_url := '/community/events/' || NEW.event_id,
        p_entity_type := 'event',
        p_entity_id := NEW.event_id,
        p_event_key := 'event_rsvp:' || NEW.event_id || ':' || NEW.user_id || ':going:' || to_char(NEW.updated_at, 'YYYYMMDDHH24MISSUS')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_rsvp_notification_events ON public.event_rsvps;
CREATE TRIGGER trg_event_rsvp_notification_events
  AFTER INSERT OR UPDATE ON public.event_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_event_rsvp_notification_events();

-- -----------------------------------------------------------------------------
-- 9. Family Media & Stories Domain Triggers
-- -----------------------------------------------------------------------------

-- 9.1 Family Media (notifies registered family members when photo/document added)
CREATE OR REPLACE FUNCTION public.handle_family_media_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    FOR v_member IN
      SELECT DISTINCT p.user_id
      FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = NEW.family_id
        AND fm.left_at IS NULL
        AND p.deleted_at IS NULL
        AND p.user_id IS NOT NULL
        AND (NEW.uploaded_by IS NULL OR p.user_id <> NEW.uploaded_by)
    LOOP
      PERFORM public.emit_domain_notification(
        p_recipient_id := v_member.user_id,
        p_actor_id := NEW.uploaded_by,
        p_category := 'FAMILY'::public.notification_category,
        p_type := 'family_photo_added',
        p_title := 'New Family Media Added',
        p_body := 'New media was added to your family archive.',
        p_action_url := '/family/media',
        p_entity_type := 'family_media',
        p_entity_id := NEW.id,
        p_event_key := 'family_media:' || NEW.id || ':' || v_member.user_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_media_notification_events ON public.family_media;
CREATE TRIGGER trg_family_media_notification_events
  AFTER INSERT ON public.family_media
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_media_notification_events();

-- 9.2 Family Stories (notifies registered family members when historical story added)
CREATE OR REPLACE FUNCTION public.handle_family_story_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    FOR v_member IN
      SELECT DISTINCT p.user_id
      FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = NEW.family_id
        AND fm.left_at IS NULL
        AND p.deleted_at IS NULL
        AND p.user_id IS NOT NULL
        AND (NEW.author_id IS NULL OR p.user_id <> NEW.author_id)
    LOOP
      PERFORM public.emit_domain_notification(
        p_recipient_id := v_member.user_id,
        p_actor_id := NEW.author_id,
        p_category := 'FAMILY'::public.notification_category,
        p_type := 'family_story_added',
        p_title := 'New Family Story Preserved',
        p_body := 'A new story was preserved in your family history.',
        p_action_url := '/family/history',
        p_entity_type := 'family_story',
        p_entity_id := NEW.id,
        p_event_key := 'family_story:' || NEW.id || ':' || v_member.user_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_story_notification_events ON public.family_stories;
CREATE TRIGGER trg_family_story_notification_events
  AFTER INSERT ON public.family_stories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_story_notification_events();



-- =============================================================================
-- >>> MIGRATION FILE: 20261016160000_create_notification_outbox_worker_rpcs.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261016160000_create_notification_outbox_worker_rpcs.sql
-- Purpose:   Create server-authoritative, concurrency-safe RPCs for the
--             notification outbox email worker:
--             1. public.claim_notification_outbox_batch
--                (Atomic queue claim using FOR UPDATE SKIP LOCKED)
--             2. public.complete_notification_outbox_delivery
--                (Transition status = 'SENT', sent_at = now())
--             3. public.fail_notification_outbox_delivery
--                (Transition status = 'FAILED' or 'DEAD_LETTER' with backoff)
--             4. Strict least-privilege security:
--                - REVOKE ALL FROM PUBLIC, anon, authenticated
--                - GRANT EXECUTE TO service_role only
-- Phase:     Phase 12 — Subtask 4 (Email Dispatch Infrastructure & Outbox Worker)
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. CONCURRENCY SAFETY:
--    Multiple workers claiming batches simultaneously will NEVER claim the same
--    outbox record due to PostgreSQL 'FOR UPDATE SKIP LOCKED'.
--
-- 2. LEAST PRIVILEGE / ZERO CLIENT MUTATION:
--    These functions are executable EXCLUSIVELY by the trusted backend worker
--    (service_role). Access is explicitly revoked from anon and authenticated.
--
-- 3. BOUNDED RETRIES & DEAD LETTER:
--    Transient errors increment attempts and reschedule delivery.
--    Terminal errors or attempts >= max_attempts transition directly to DEAD_LETTER.
--
-- 4. PRIVACY & PROJECTION MINIMIZATION:
--    Only the minimum necessary recipient email and notification content
--    are returned to the worker. Sensitive census person data is never exposed.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC: claim_notification_outbox_batch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_notification_outbox_batch(
  p_batch_size INT DEFAULT 10,
  p_max_attempts INT DEFAULT 3
)
RETURNS TABLE (
  outbox_id UUID,
  notification_id UUID,
  recipient_id UUID,
  channel public.notification_channel,
  attempts INT,
  recipient_email TEXT,
  recipient_name TEXT,
  title VARCHAR(255),
  body TEXT,
  action_url VARCHAR(500),
  category public.notification_category,
  notification_type VARCHAR(64)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Atomically claim eligible pending/failed records with SKIP LOCKED
  RETURN QUERY
  WITH eligible AS (
    SELECT o.id
    FROM public.notification_outbox o
    WHERE o.channel = 'EMAIL'
      AND o.status IN ('PENDING', 'FAILED')
      AND o.attempts < p_max_attempts
      AND o.scheduled_at <= now()
    ORDER BY o.scheduled_at ASC, o.created_at ASC
    LIMIT GREATEST(1, LEAST(p_batch_size, 50))
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.notification_outbox o
    SET
      status = 'PROCESSING',
      attempts = o.attempts + 1
    FROM eligible e
    WHERE o.id = e.id
    RETURNING
      o.id AS outbox_id,
      o.notification_id,
      o.recipient_id,
      o.channel,
      o.attempts
  )
  SELECT
    u.outbox_id,
    u.notification_id,
    u.recipient_id,
    u.channel,
    u.attempts,
    COALESCE(p.email, u_auth.email::TEXT) AS recipient_email,
    p.display_name AS recipient_name,
    n.title,
    n.body,
    n.action_url,
    n.category,
    n.type AS notification_type
  FROM updated u
  INNER JOIN public.notifications n ON n.id = u.notification_id
  LEFT JOIN public.profiles p ON p.id = u.recipient_id
  LEFT JOIN auth.users u_auth ON u_auth.id = u.recipient_id;
END;
$$;

COMMENT ON FUNCTION public.claim_notification_outbox_batch(INT, INT) IS
  'Atomically claims eligible outbox records for email dispatch with FOR UPDATE SKIP LOCKED. Restricted to service_role.';

-- -----------------------------------------------------------------------------
-- 2. RPC: complete_notification_outbox_delivery
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_notification_outbox_delivery(
  p_outbox_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF p_outbox_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: outbox_id is required' USING ERRCODE = '22023';
  END IF;

  -- Strict state transition guard: MUST ONLY allow PROCESSING -> SENT
  UPDATE public.notification_outbox
  SET
    status = 'SENT',
    sent_at = now(),
    last_error = NULL
  WHERE id = p_outbox_id
    AND status = 'PROCESSING';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.complete_notification_outbox_delivery(UUID) IS
  'Marks a PROCESSING outbox record as SENT. Restricted to service_role.';

-- -----------------------------------------------------------------------------
-- 3. RPC: fail_notification_outbox_delivery
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fail_notification_outbox_delivery(
  p_outbox_id UUID,
  p_error_message TEXT,
  p_is_terminal BOOLEAN DEFAULT FALSE,
  p_retry_delay_seconds INT DEFAULT 300,
  p_max_attempts INT DEFAULT 3
)
RETURNS public.notification_delivery_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status public.notification_delivery_status;
  v_current_attempts INT;
  v_new_status public.notification_delivery_status;
  v_sanitized_error TEXT;
BEGIN
  IF p_outbox_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: outbox_id is required' USING ERRCODE = '22023';
  END IF;

  -- Sanitize error message to prevent excessive log bloat
  v_sanitized_error := SUBSTRING(COALESCE(p_error_message, 'Unknown delivery error') FROM 1 FOR 1000);

  SELECT status, attempts INTO v_current_status, v_current_attempts
  FROM public.notification_outbox
  WHERE id = p_outbox_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: outbox item not found' USING ERRCODE = 'P0002';
  END IF;

  -- Strict state transition guard: MUST ONLY operate on a currently PROCESSING row.
  -- Reject transitions from PENDING, FAILED, SENT, or DEAD_LETTER without modifying row.
  IF v_current_status <> 'PROCESSING' THEN
    RETURN v_current_status;
  END IF;

  -- Determine whether failure is terminal or can be retried
  IF p_is_terminal OR v_current_attempts >= p_max_attempts THEN
    v_new_status := 'DEAD_LETTER';
  ELSE
    v_new_status := 'FAILED';
  END IF;

  UPDATE public.notification_outbox
  SET
    status = v_new_status,
    last_error = v_sanitized_error,
    scheduled_at = CASE
      WHEN v_new_status = 'FAILED' THEN
        now() + (GREATEST(10, LEAST(p_retry_delay_seconds, 86400)) || ' seconds')::INTERVAL
      ELSE
        scheduled_at
    END
  WHERE id = p_outbox_id
    AND status = 'PROCESSING';

  RETURN v_new_status;
END;
$$;

COMMENT ON FUNCTION public.fail_notification_outbox_delivery(UUID, TEXT, BOOLEAN, INT, INT) IS
  'Records an outbox delivery failure for a PROCESSING row, scheduling retry or moving to DEAD_LETTER. Restricted to service_role.';

-- -----------------------------------------------------------------------------
-- 4. Execution Grants (Strict Server-to-Server Only)
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.claim_notification_outbox_batch(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox_batch(INT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.complete_notification_outbox_delivery(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_notification_outbox_delivery(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.fail_notification_outbox_delivery(UUID, TEXT, BOOLEAN, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_notification_outbox_delivery(UUID, TEXT, BOOLEAN, INT, INT) TO service_role;



-- =============================================================================
-- >>> MIGRATION FILE: 20261016180000_create_admin_authorization_rpcs.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261016180000_create_admin_authorization_rpcs.sql
-- Purpose:   Phase 13 Subtask 1 — Admin Authorization Infrastructure, Database RPCs
--             1. Server-authoritative role change RPC:
--                - public.admin_update_user_role(p_user_id UUID, p_new_role public.user_role)
--             2. Server-authoritative account status RPC:
--                - public.admin_set_user_status(p_user_id UUID, p_is_active BOOLEAN, p_reason TEXT)
--             3. Server-authoritative audit logs query RPC:
--                - public.admin_get_audit_logs(...)
--             4. Platform summary metrics RPC:
--                - public.admin_get_platform_metrics()
--             5. Strict Least-Privilege & Role Hierarchy Security:
--                - Execution revoked from PUBLIC and anon
--                - ADMIN cannot grant SUPER_ADMIN
--                - ADMIN cannot modify or deactivate SUPER_ADMIN
--                - Self-demotion and self-deactivation protections
--                - Protection for the sole active SUPER_ADMIN
--                - Automated audit logging (USER_ROLE_CHANGED, USER_DEACTIVATED, USER_REACTIVATED)
--                - Strict adherence to PERSON != USER
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. PERSON != USER:
--    Administrative operations on accounts modify public.profiles and auth.users,
--    NEVER public.persons. Deactivating an account disables login capabilities,
--    but preserves all historical census records, relationships, and lineage.
--
-- 2. ROLE HIERARCHY DEFENSE:
--    Role changes route through server-authoritative logic. An ADMIN cannot
--    escalate any account to SUPER_ADMIN, nor demote/deactivate a SUPER_ADMIN.
--    The final active SUPER_ADMIN cannot be demoted or deactivated.
--
-- 3. AUDIT IMMUTABILITY:
--    All administrative actions generate immutable entries in public.audit_logs
--    via public.log_audit_event().
--
-- 4. LEAST PRIVILEGE & BYPASS MITIGATION:
--    COMMUNITY_MODERATOR is strictly blocked from user administration and audit logs.
--    Direct table updates to public.profiles by ADMINs (previously permitted under
--    profiles_update_admin) are revoked to prevent role escalation, account
--    tampering, and audit log circumvention.
--    All functions declare SECURITY DEFINER with explicit search_path = public, auth.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. RLS Hardening: Eliminate Direct Profiles Mutation Bypass
-- -----------------------------------------------------------------------------
-- In Phase 1 (20261002140000_phase1_foundation.sql), policy profiles_update_admin
-- allowed any user satisfying is_admin() to directly UPDATE public.profiles without
-- a restrictive WITH CHECK clause. This permitted an ADMIN to bypass role hierarchy,
-- anti-lockout rules, and audit logging by executing direct table UPDATEs (e.g.
-- updating another user's role, deactivating accounts, or self-escalating to SUPER_ADMIN).
--
-- With the deployment of server-authoritative RPCs (admin_update_user_role and
-- admin_set_user_status), all administrative profile mutations MUST route through
-- these RPCs. Direct administrative table UPDATEs are permanently revoked by
-- dropping profiles_update_admin.
--
-- Direct table updates remain governed solely by profiles_update_own:
--   - USING (auth.uid() = id): Users may only target their own profile.
--   - WITH CHECK (auth.uid() = id AND role::TEXT = public.get_my_role() AND is_active = TRUE):
--     * Users (including ADMINs) cannot modify their own role.
--     * Users cannot deactivate their own account directly.
--     * Inactive users cannot modify anything.
--     * Permitted self-profile updates (e.g. display_name) continue to function.

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role::TEXT = public.get_my_role()
    AND is_active = TRUE
  );

-- -----------------------------------------------------------------------------
-- 1. RPC: public.admin_update_user_role
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  p_user_id UUID,
  p_new_role public.user_role
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role public.user_role;
  v_caller_active BOOLEAN;
  v_target_role public.user_role;
  v_target_active BOOLEAN;
  v_super_admin_count INT;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate arguments
  IF p_user_id IS NULL OR p_new_role IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: user_id and new_role are required' USING ERRCODE = '22023';
  END IF;

  -- 3. Retrieve caller role and status
  SELECT role, is_active INTO v_caller_role, v_caller_active
  FROM public.profiles
  WHERE id = v_caller_id;

  IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Caller profile not found or inactive' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN' USING ERRCODE = '42501';
  END IF;

  -- 4. Retrieve target user role and status (lock target row to serialize updates on same user)
  SELECT role, is_active INTO v_target_role, v_target_active
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Target user profile not found' USING ERRCODE = 'P0002';
  END IF;

  -- 5. No-op check
  IF v_target_role = p_new_role THEN
    RETURN TRUE;
  END IF;

  -- 6. Role Hierarchy Checks:
  -- A. ADMIN cannot grant SUPER_ADMIN
  IF v_caller_role = 'ADMIN' AND p_new_role = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'FORBIDDEN: Only SUPER_ADMIN can grant the SUPER_ADMIN role' USING ERRCODE = '42501';
  END IF;

  -- B. ADMIN cannot modify a SUPER_ADMIN account
  IF v_caller_role = 'ADMIN' AND v_target_role = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'FORBIDDEN: ADMIN cannot modify roles of a SUPER_ADMIN account' USING ERRCODE = '42501';
  END IF;

  -- C. Self-demotion protection:
  -- If caller is modifying their own role and demoting themselves from administrative standing:
  IF v_caller_id = p_user_id AND p_new_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'FORBIDDEN: Administrators cannot demote themselves to a non-administrative role' USING ERRCODE = '42501';
  END IF;

  -- D. Final SUPER_ADMIN protection (concurrency-safe via transaction advisory lock):
  -- If target is currently SUPER_ADMIN and is being changed to something else:
  IF v_target_role = 'SUPER_ADMIN' AND p_new_role <> 'SUPER_ADMIN' THEN
    -- Serialize super admin membership modifications to prevent race conditions resulting in 0 active super admins
    PERFORM pg_advisory_xact_lock(hashtext('super_admin_membership_guard'));

    SELECT COUNT(*) INTO v_super_admin_count
    FROM public.profiles
    WHERE role = 'SUPER_ADMIN' AND is_active = TRUE;

    IF v_super_admin_count <= 1 THEN
      RAISE EXCEPTION 'CONFLICT: Cannot demote the platform sole active SUPER_ADMIN' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 7. Apply role change
  UPDATE public.profiles
  SET
    role = p_new_role,
    updated_at = now()
  WHERE id = p_user_id;

  -- 8. Audit logging
  PERFORM public.log_audit_event(
    'USER_ROLE_CHANGED'::public.audit_action,
    'profile',
    p_user_id,
    jsonb_build_object('role', v_target_role),
    jsonb_build_object('role', p_new_role),
    jsonb_build_object(
      'action_type', 'ADMIN_ROLE_UPDATE',
      'target_user_id', p_user_id,
      'caller_id', v_caller_id,
      'caller_role', v_caller_role
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_update_user_role(UUID, public.user_role) IS
  'Updates a user role with strict role hierarchy checks and audit logging. Restricted to ADMIN and SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 2. RPC: public.admin_set_user_status
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_user_status(
  p_user_id UUID,
  p_is_active BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role public.user_role;
  v_caller_active BOOLEAN;
  v_target_role public.user_role;
  v_target_active BOOLEAN;
  v_super_admin_count INT;
  v_action public.audit_action;
  v_sanitized_reason TEXT;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate arguments
  IF p_user_id IS NULL OR p_is_active IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: user_id and is_active are required' USING ERRCODE = '22023';
  END IF;

  v_sanitized_reason := SUBSTRING(TRIM(COALESCE(p_reason, '')) FROM 1 FOR 500);

  -- 3. Retrieve caller role and status
  SELECT role, is_active INTO v_caller_role, v_caller_active
  FROM public.profiles
  WHERE id = v_caller_id;

  IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Caller profile not found or inactive' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN' USING ERRCODE = '42501';
  END IF;

  -- 4. Retrieve target user role and status (lock target row to serialize updates on same user)
  SELECT role, is_active INTO v_target_role, v_target_active
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Target user profile not found' USING ERRCODE = 'P0002';
  END IF;

  -- 5. No-op check
  IF v_target_active = p_is_active THEN
    RETURN TRUE;
  END IF;

  -- 6. Hierarchy & lockout guards when DEACTIVATING:
  IF p_is_active IS FALSE THEN
    -- A. Self-deactivation protection: Cannot deactivate own account
    IF v_caller_id = p_user_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Administrators cannot deactivate their own account' USING ERRCODE = '42501';
    END IF;

    -- B. ADMIN cannot deactivate SUPER_ADMIN
    IF v_caller_role = 'ADMIN' AND v_target_role = 'SUPER_ADMIN' THEN
      RAISE EXCEPTION 'FORBIDDEN: ADMIN cannot deactivate a SUPER_ADMIN account' USING ERRCODE = '42501';
    END IF;

    -- C. Final active SUPER_ADMIN protection (concurrency-safe via transaction advisory lock):
    IF v_target_role = 'SUPER_ADMIN' THEN
      -- Serialize super admin status modifications to prevent race conditions resulting in 0 active super admins
      PERFORM pg_advisory_xact_lock(hashtext('super_admin_membership_guard'));

      SELECT COUNT(*) INTO v_super_admin_count
      FROM public.profiles
      WHERE role = 'SUPER_ADMIN' AND is_active = TRUE;

      IF v_super_admin_count <= 1 THEN
        RAISE EXCEPTION 'CONFLICT: Cannot deactivate the platform sole active SUPER_ADMIN' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  -- 7. Apply status update
  UPDATE public.profiles
  SET
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_user_id;

  -- 8. Audit logging
  IF p_is_active THEN
    v_action := 'USER_REACTIVATED'::public.audit_action;
  ELSE
    v_action := 'USER_DEACTIVATED'::public.audit_action;
  END IF;

  PERFORM public.log_audit_event(
    v_action,
    'profile',
    p_user_id,
    jsonb_build_object('is_active', v_target_active),
    jsonb_build_object('is_active', p_is_active),
    jsonb_build_object(
      'action_type', CASE WHEN p_is_active THEN 'ADMIN_USER_REACTIVATED' ELSE 'ADMIN_USER_DEACTIVATED' END,
      'reason', NULLIF(v_sanitized_reason, ''),
      'target_user_id', p_user_id,
      'caller_id', v_caller_id,
      'caller_role', v_caller_role
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_set_user_status(UUID, BOOLEAN, TEXT) IS
  'Activates or deactivates a user account with lockout protection and audit logging. Restricted to ADMIN and SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 3. RPC: public.admin_get_audit_logs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_audit_logs(
  p_action public.audit_action DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_target_type TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  action public.audit_action,
  actor_id UUID,
  actor_name TEXT,
  actor_email TEXT,
  target_type TEXT,
  target_id UUID,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_offset INT;
  v_limit INT;
BEGIN
  -- 1. Authorization: strictly is_admin() (ADMIN or SUPER_ADMIN)
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN' USING ERRCODE = '42501';
  END IF;

  -- 2. Pagination bounds: clamp page_size between 1 and 50
  v_limit := GREATEST(1, LEAST(COALESCE(p_page_size, 20), 50));
  v_offset := (GREATEST(1, COALESCE(p_page, 1)) - 1) * v_limit;

  RETURN QUERY
  WITH filtered_logs AS (
    SELECT
      a.id,
      a.action,
      a.actor_id,
      p.display_name AS actor_name,
      p.email AS actor_email,
      a.target_type,
      a.target_id,
      a.old_data,
      a.new_data,
      a.metadata,
      a.created_at
    FROM public.audit_logs a
    LEFT JOIN public.profiles p ON p.id = a.actor_id
    WHERE (p_action IS NULL OR a.action = p_action)
      AND (p_actor_id IS NULL OR a.actor_id = p_actor_id)
      AND (p_target_type IS NULL OR a.target_type = p_target_type)
      AND (p_target_id IS NULL OR a.target_id = p_target_id)
      AND (p_start_date IS NULL OR a.created_at >= p_start_date)
      AND (p_end_date IS NULL OR a.created_at <= p_end_date)
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered_logs
  )
  SELECT
    f.id,
    f.action,
    f.actor_id,
    f.actor_name,
    f.actor_email,
    f.target_type,
    f.target_id,
    f.old_data,
    f.new_data,
    f.metadata,
    f.created_at,
    c.cnt AS total_count
  FROM filtered_logs f
  CROSS JOIN counted c
  ORDER BY f.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_get_audit_logs(public.audit_action, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) IS
  'Fetches paginated and filtered audit logs with actor profile details. Restricted to ADMIN and SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 4. RPC: public.admin_get_platform_metrics
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_platform_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_total_users INT;
  v_active_users INT;
  v_total_persons INT;
  v_total_families INT;
  v_pending_claims INT;
  v_pending_verifications INT;
  v_open_duplicates INT;
BEGIN
  -- Authorization: strictly is_admin() (ADMIN or SUPER_ADMIN)
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = TRUE)
  INTO v_total_users, v_active_users
  FROM public.profiles;

  SELECT COUNT(*) INTO v_total_persons
  FROM public.persons
  WHERE deleted_at IS NULL;

  SELECT COUNT(*) INTO v_total_families
  FROM public.families
  WHERE deleted_at IS NULL;

  SELECT COUNT(*) INTO v_pending_claims
  FROM public.person_claims
  WHERE status = 'PENDING';

  SELECT COUNT(*) INTO v_pending_verifications
  FROM public.verification_requests
  WHERE status = 'PENDING';

  SELECT COUNT(*) INTO v_open_duplicates
  FROM public.duplicate_flags
  WHERE status = 'OPEN';

  RETURN jsonb_build_object(
    'total_users', COALESCE(v_total_users, 0),
    'active_users', COALESCE(v_active_users, 0),
    'total_persons', COALESCE(v_total_persons, 0),
    'total_families', COALESCE(v_total_families, 0),
    'pending_claims', COALESCE(v_pending_claims, 0),
    'pending_verifications', COALESCE(v_pending_verifications, 0),
    'open_duplicates', COALESCE(v_open_duplicates, 0),
    'generated_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.admin_get_platform_metrics() IS
  'Aggregates platform KPI counts for administrative overview dashboards. Restricted strictly to ADMIN and SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 5. Execution Grants & Revocations
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.admin_update_user_role(UUID, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, public.user_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_user_status(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_audit_logs(public.audit_action, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_audit_logs(public.audit_action, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_platform_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_platform_metrics() TO authenticated, service_role;



-- =============================================================================
-- >>> MIGRATION FILE: 20261017100000_create_import_staging_infrastructure.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261017100000_create_import_staging_infrastructure.sql
-- Purpose:   Create import batches and staging records database foundation,
--             authoritative batch lifecycle RPCs, and admin-only RLS policies.
-- Phase:     Phase 14 — Subtask 1 (Import & Data Migration Foundation)
-- =============================================================================
--
-- ARCHITECTURAL DECISIONS & INVARIANTS:
-- 1. PERSON != USER:
--    - Staged and imported records represent census entities (public.persons).
--    - Staging and import RPCs NEVER create auth.users, NEVER create public.profiles,
--      NEVER assign persons.user_id, and NEVER approve identity claims.
--
-- 2. DETECT != MERGE:
--    - No automated deduplication or destructive merges occur.
--
-- 3. CANONICAL TABLES ARE UNTOUCHED:
--    - Subtask 1 operates strictly in isolated staging storage.
--    - Canonical tables (persons, families, relationships) are not altered.
--    - Addition of any canonical provenance markers (e.g., import_batch_id) is
--      deferred to the promotion subtask (Subtask 4) to eliminate premature schema coupling.
--
-- 4. HYBRID STAGING ARCHITECTURE (WHY THIS DESIGN WAS CHOSEN):
--    - A generic JSONB payload within an entity-scoped staging table (public.staging_records)
--      was selected over rigid separate tables (staging_persons, staging_families, etc.).
--    - RATIONALE:
--      * Source datasets (CSV/JSON) vary significantly in schema and often contain raw/unparsed
--        values, custom headers, or malformed strings that would crash strict DDL constraints.
--      * Preserves entity-level scoping via `entity_type` ('PERSON', 'FAMILY', 'RELATIONSHIP')
--        with exact `source_row_number` and `source_record_id` traceability.
--      * Structured JSONB allows flexible field mapping and partial updates during validation.
--      * Batch isolation and cascade cleanup: all staging rows are bound to a batch and
--        automatically removed upon batch deletion (`ON DELETE CASCADE`).
--
-- 5. ADMIN-ONLY AUTHORIZATION:
--    - Only active SUPER_ADMIN and ADMIN accounts can create or cancel batches or view staging.
--    - COMMUNITY_MODERATOR and lower roles have zero import access.
--    - All mutations are server-authoritative via SECURITY DEFINER RPCs with search_path = public, auth.
--    - Direct client INSERT/UPDATE/DELETE on staging tables is denied by default via RLS.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Custom Enums
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'import_batch_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.import_batch_status AS ENUM (
      'STAGED',     -- File uploaded and rows staged; awaiting validation
      'VALIDATED',  -- Validation complete; duplicate candidates flagged; ready for review
      'PROMOTED',   -- Validated records promoted into canonical tables
      'CANCELLED',  -- Batch discarded by administrator
      'REVERTED'    -- Previously promoted batch soft-reverted
    );
  END IF;
END $$;

COMMENT ON TYPE public.import_batch_status IS
  'Lifecycle states for an import batch: STAGED -> VALIDATED -> PROMOTED (or CANCELLED/REVERTED).';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'import_entity_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.import_entity_type AS ENUM (
      'PERSON',
      'FAMILY',
      'RELATIONSHIP'
    );
  END IF;
END $$;

COMMENT ON TYPE public.import_entity_type IS
  'Scoping of census entities handled during data migration.';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'staging_validation_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.staging_validation_status AS ENUM (
      'PENDING',    -- Awaiting validation checks
      'VALID',      -- Passed schema and relational validation
      'WARNING',    -- Non-blocking issues detected (e.g. possible duplicate)
      'ERROR',      -- Blocking constraint or syntax errors detected
      'EXCLUDED'    -- Explicitly excluded by administrator from final promotion
    );
  END IF;
END $$;

COMMENT ON TYPE public.staging_validation_status IS
  'Validation evaluation outcome for an individual staged row.';

-- -----------------------------------------------------------------------------
-- 2. Table: public.import_batches
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provenance & File Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_format TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size_bytes BIGINT,

  -- Lifecycle State
  status public.import_batch_status NOT NULL DEFAULT 'STAGED',

  -- Aggregate Metrics & Summaries
  total_records INT NOT NULL DEFAULT 0,
  row_counts JSONB NOT NULL DEFAULT '{"persons": 0, "families": 0, "relationships": 0}'::jsonb,
  validation_summary JSONB NOT NULL DEFAULT '{"errors": 0, "warnings": 0, "valid": 0, "duplicates": 0}'::jsonb,

  -- Optional Context & Notes
  notes TEXT,

  -- Lifecycle Timestamps & Actors
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancellation_reason TEXT,

  promoted_at TIMESTAMPTZ,
  promoted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Constraints
  CONSTRAINT import_batches_file_name_not_empty
    CHECK (file_name != '' AND length(trim(file_name)) > 0 AND length(file_name) <= 255),
  CONSTRAINT import_batches_file_format_valid
    CHECK (file_format IN ('CSV', 'JSON')),
  CONSTRAINT import_batches_file_hash_format
    CHECK (file_hash ~ '^[a-fA-F0-9]{64}$'),
  CONSTRAINT import_batches_file_size_positive
    CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),
  CONSTRAINT import_batches_total_records_non_negative
    CHECK (total_records >= 0),
  CONSTRAINT import_batches_row_counts_is_object
    CHECK (jsonb_typeof(row_counts) = 'object'),
  CONSTRAINT import_batches_validation_summary_is_object
    CHECK (jsonb_typeof(validation_summary) = 'object'),
  CONSTRAINT import_batches_notes_length
    CHECK (notes IS NULL OR length(notes) <= 2000),
  CONSTRAINT import_batches_cancellation_reason_length
    CHECK (cancellation_reason IS NULL OR length(cancellation_reason) <= 1000),
  CONSTRAINT import_batches_cancellation_consistency
    CHECK (
      (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
      OR (status != 'CANCELLED' AND cancelled_at IS NULL)
    ),
  CONSTRAINT import_batches_promoted_consistency
    CHECK (
      (status = 'PROMOTED' AND promoted_at IS NOT NULL)
      OR (status != 'PROMOTED' AND promoted_at IS NULL)
    )
);

COMMENT ON TABLE public.import_batches IS
  'Authoritative container tracking bulk census data imports, file provenance, and lifecycle states.';

-- Updated-At Trigger for import_batches
DROP TRIGGER IF EXISTS import_batches_handle_updated_at ON public.import_batches;
CREATE TRIGGER import_batches_handle_updated_at
  BEFORE UPDATE ON public.import_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Indexes for import_batches
CREATE INDEX IF NOT EXISTS idx_import_batches_created_by
  ON public.import_batches (created_by);

CREATE INDEX IF NOT EXISTS idx_import_batches_status
  ON public.import_batches (status, created_at DESC);

-- Partial Unique Index: Prevents simultaneous in-progress imports of identical files.
-- Allows re-uploading if a previous batch was CANCELLED or REVERTED.
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_batches_active_hash
  ON public.import_batches (file_hash)
  WHERE status IN ('STAGED', 'VALIDATED');

-- -----------------------------------------------------------------------------
-- 3. Table: public.staging_records
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staging_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,

  -- Scoping & Source Traceability
  entity_type public.import_entity_type NOT NULL,
  source_row_number INT NOT NULL,
  source_record_id TEXT,

  -- Payload Data
  parsed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_data JSONB,

  -- Validation State
  validation_status public.staging_validation_status NOT NULL DEFAULT 'PENDING',
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Canonical Linkage Placeholder (Populated upon promotion in Subtask 4)
  canonical_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT staging_records_source_row_positive
    CHECK (source_row_number > 0),
  CONSTRAINT staging_records_source_record_id_length
    CHECK (source_record_id IS NULL OR (length(trim(source_record_id)) > 0 AND length(source_record_id) <= 100)),
  CONSTRAINT staging_records_parsed_data_is_object
    CHECK (jsonb_typeof(parsed_data) = 'object'),
  CONSTRAINT staging_records_validation_errors_is_array
    CHECK (jsonb_typeof(validation_errors) = 'array'),
  CONSTRAINT staging_records_unique_source_row
    UNIQUE (batch_id, entity_type, source_row_number)
);

COMMENT ON TABLE public.staging_records IS
  'Isolated staging storage holding unpromoted census records with validation metadata and source row lineage.';

-- Updated-At Trigger for staging_records
DROP TRIGGER IF EXISTS staging_records_handle_updated_at ON public.staging_records;
CREATE TRIGGER staging_records_handle_updated_at
  BEFORE UPDATE ON public.staging_records
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Indexes for staging_records
CREATE INDEX IF NOT EXISTS idx_staging_records_batch_entity
  ON public.staging_records (batch_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_staging_records_batch_status
  ON public.staging_records (batch_id, validation_status);

CREATE INDEX IF NOT EXISTS idx_staging_records_source_id
  ON public.staging_records (batch_id, entity_type, source_record_id)
  WHERE source_record_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security (RLS)
-- -----------------------------------------------------------------------------

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_records ENABLE ROW LEVEL SECURITY;

-- Policies for public.import_batches:
-- Read: Active ADMIN or SUPER_ADMIN can inspect all import batches.
DROP POLICY IF EXISTS "import_batches_select_admin" ON public.import_batches;
CREATE POLICY "import_batches_select_admin"
  ON public.import_batches
  FOR SELECT
  USING (public.is_admin());

-- Mutations: Direct client mutations are blocked. All writes flow through authoritative RPCs.
DROP POLICY IF EXISTS "import_batches_insert_deny" ON public.import_batches;
CREATE POLICY "import_batches_insert_deny"
  ON public.import_batches
  FOR INSERT
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "import_batches_update_deny" ON public.import_batches;
CREATE POLICY "import_batches_update_deny"
  ON public.import_batches
  FOR UPDATE
  USING (FALSE);

DROP POLICY IF EXISTS "import_batches_delete_deny" ON public.import_batches;
CREATE POLICY "import_batches_delete_deny"
  ON public.import_batches
  FOR DELETE
  USING (FALSE);

-- Policies for public.staging_records:
-- Read: Active ADMIN or SUPER_ADMIN can query staging rows.
DROP POLICY IF EXISTS "staging_records_select_admin" ON public.staging_records;
CREATE POLICY "staging_records_select_admin"
  ON public.staging_records
  FOR SELECT
  USING (public.is_admin());

-- Mutations: Direct client mutations are blocked. Ingestion and updates flow through authoritative RPCs.
DROP POLICY IF EXISTS "staging_records_insert_deny" ON public.staging_records;
CREATE POLICY "staging_records_insert_deny"
  ON public.staging_records
  FOR INSERT
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "staging_records_update_deny" ON public.staging_records;
CREATE POLICY "staging_records_update_deny"
  ON public.staging_records
  FOR UPDATE
  USING (FALSE);

DROP POLICY IF EXISTS "staging_records_delete_deny" ON public.staging_records;
CREATE POLICY "staging_records_delete_deny"
  ON public.staging_records
  FOR DELETE
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 5. Server-Authoritative RPC: public.create_import_batch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_import_batch(
  p_file_name TEXT,
  p_file_format TEXT,
  p_file_hash TEXT,
  p_file_size_bytes BIGINT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_batch_id UUID;
  v_clean_name TEXT;
  v_clean_format TEXT;
  v_clean_hash TEXT;
  v_clean_notes TEXT;
  v_existing_active_id UUID;
  v_existing_promoted_id UUID;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated to create import batches'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: Active ADMIN or SUPER_ADMIN only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN to create import batches'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate arguments
  v_clean_name := trim(COALESCE(p_file_name, ''));
  IF length(v_clean_name) = 0 OR length(v_clean_name) > 255 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: file_name must be between 1 and 255 characters'
      USING ERRCODE = '22023';
  END IF;

  v_clean_format := upper(trim(COALESCE(p_file_format, '')));
  IF v_clean_format NOT IN ('CSV', 'JSON') THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: file_format must be CSV or JSON'
      USING ERRCODE = '22023';
  END IF;

  v_clean_hash := lower(trim(COALESCE(p_file_hash, '')));
  IF v_clean_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: file_hash must be a valid 64-character hex SHA-256 string'
      USING ERRCODE = '22023';
  END IF;

  IF p_file_size_bytes IS NOT NULL AND p_file_size_bytes <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: file_size_bytes must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  v_clean_notes := trim(COALESCE(p_notes, ''));
  IF length(v_clean_notes) = 0 THEN
    v_clean_notes := NULL;
  ELSIF length(v_clean_notes) > 2000 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: notes must not exceed 2000 characters'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Idempotency & Duplicate Hash Checks
  -- Check if an active (STAGED/VALIDATED) batch already exists with the same hash
  SELECT id INTO v_existing_active_id
  FROM public.import_batches
  WHERE file_hash = v_clean_hash
    AND status IN ('STAGED', 'VALIDATED')
  LIMIT 1;

  IF v_existing_active_id IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT: An active import batch with this exact file hash already exists (Batch ID: %)', v_existing_active_id
      USING ERRCODE = '23505';
  END IF;

  -- Check if an already promoted batch exists with the same hash
  SELECT id INTO v_existing_promoted_id
  FROM public.import_batches
  WHERE file_hash = v_clean_hash
    AND status = 'PROMOTED'
  LIMIT 1;

  IF v_existing_promoted_id IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT: This exact file has already been imported and promoted in batch %', v_existing_promoted_id
      USING ERRCODE = '23505';
  END IF;

  -- 5. Insert new batch in STAGED status
  INSERT INTO public.import_batches (
    created_by,
    file_name,
    file_format,
    file_hash,
    file_size_bytes,
    status,
    notes
  ) VALUES (
    v_caller_id,
    v_clean_name,
    v_clean_format,
    v_clean_hash,
    p_file_size_bytes,
    'STAGED',
    v_clean_notes
  )
  RETURNING id INTO v_batch_id;

  -- 6. Audit Logging via existing infrastructure
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'import_batch',
    v_batch_id,
    NULL,
    jsonb_build_object(
      'status', 'STAGED',
      'file_name', v_clean_name,
      'file_format', v_clean_format,
      'file_hash', v_clean_hash,
      'file_size_bytes', p_file_size_bytes
    ),
    jsonb_build_object(
      'action_type', 'CREATE_IMPORT_BATCH',
      'batch_id', v_batch_id,
      'caller_id', v_caller_id
    )
  );

  RETURN v_batch_id;
END;
$$;

COMMENT ON FUNCTION public.create_import_batch(TEXT, TEXT, TEXT, BIGINT, TEXT) IS
  'Server-authoritative RPC: Initializes a new census import batch in STAGED status with file hash verification and audit logging. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 6. Server-Authoritative RPC: public.cancel_import_batch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_import_batch(
  p_batch_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_batch RECORD;
  v_clean_reason TEXT;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated to cancel import batches'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: Active ADMIN or SUPER_ADMIN only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN to cancel import batches'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate arguments
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: batch_id is required'
      USING ERRCODE = '22023';
  END IF;

  v_clean_reason := trim(COALESCE(p_reason, ''));
  IF length(v_clean_reason) = 0 THEN
    v_clean_reason := NULL;
  ELSIF length(v_clean_reason) > 1000 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: cancellation reason must not exceed 1000 characters'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Retrieve and lock batch row
  SELECT id, status, file_name, file_hash INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Import batch % does not exist', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. Lifecycle Guard Checks
  IF v_batch.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'CONFLICT: Import batch % is already cancelled', p_batch_id
      USING ERRCODE = '23514';
  END IF;

  IF v_batch.status = 'PROMOTED' THEN
    RAISE EXCEPTION 'CONFLICT: Cannot cancel an already promoted import batch (Batch ID: %)', p_batch_id
      USING ERRCODE = '23514';
  END IF;

  IF v_batch.status = 'REVERTED' THEN
    RAISE EXCEPTION 'CONFLICT: Cannot cancel an already reverted import batch (Batch ID: %)', p_batch_id
      USING ERRCODE = '23514';
  END IF;

  -- 6. Apply cancellation
  UPDATE public.import_batches
  SET
    status = 'CANCELLED',
    cancelled_at = NOW(),
    cancelled_by = v_caller_id,
    cancellation_reason = v_clean_reason,
    updated_at = NOW()
  WHERE id = p_batch_id;

  -- 7. Audit Logging via existing infrastructure
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'import_batch',
    p_batch_id,
    jsonb_build_object('status', v_batch.status),
    jsonb_build_object(
      'status', 'CANCELLED',
      'cancellation_reason', v_clean_reason
    ),
    jsonb_build_object(
      'action_type', 'CANCEL_IMPORT_BATCH',
      'batch_id', p_batch_id,
      'previous_status', v_batch.status,
      'caller_id', v_caller_id
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.cancel_import_batch(UUID, TEXT) IS
  'Server-authoritative RPC: Cancels an unpromoted import batch with row locking and audit logging. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 7. Privileges & Access Grants
-- -----------------------------------------------------------------------------

-- Revoke all privileges from PUBLIC and anon (least privilege)
REVOKE ALL ON public.import_batches FROM PUBLIC, anon;
REVOKE ALL ON public.staging_records FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_import_batch(TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_import_batch(UUID, TEXT) FROM PUBLIC, anon;

-- Grant authenticated role SELECT on tables (RLS filters rows using is_admin())
GRANT SELECT ON public.import_batches TO authenticated;
GRANT SELECT ON public.staging_records TO authenticated;

-- Grant authenticated role EXECUTE on authoritative RPCs (RPC verifies is_admin() internally)
GRANT EXECUTE ON FUNCTION public.create_import_batch(TEXT, TEXT, TEXT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_import_batch(UUID, TEXT) TO authenticated;

-- Service role retains full administrative privileges for background operations & migrations
GRANT ALL ON public.import_batches TO service_role;
GRANT ALL ON public.staging_records TO service_role;
GRANT ALL ON FUNCTION public.create_import_batch(TEXT, TEXT, TEXT, BIGINT, TEXT) TO service_role;
GRANT ALL ON FUNCTION public.cancel_import_batch(UUID, TEXT) TO service_role;



-- =============================================================================
-- >>> MIGRATION FILE: 20261017180000_create_staging_ingestion_rpc.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261017180000_create_staging_ingestion_rpc.sql
-- Purpose:   Authoritative RPC for bulk ingestion of staged import records
--             and atomic synchronization of batch aggregate metrics.
-- Phase:     Phase 14 — Subtask 2 (Parsing, Mapping & Staging Ingestion)
-- =============================================================================
--
-- ARCHITECTURAL DECISIONS & INVARIANTS:
-- 1. PERSON != USER:
--    - Ingests demographic census data only into public.staging_records.
--    - Never creates auth.users, never creates public.profiles, never sets user_id.
--
-- 2. DETECT != MERGE:
--    - Staging records are isolated with validation_status = 'PENDING' or 'ERROR'.
--    - No automated deduplication or destructive merges occur.
--
-- 3. CANONICAL TABLES ARE UNTOUCHED:
--    - Ingestion operates strictly within public.staging_records.
--    - canonical_id is strictly set to NULL.
--    - Canonical tables (persons, families, relationships) are not altered.
--
-- 4. ATOMICITY & IDEMPOTENCY:
--    - Bulk upserts records on unique constraint (batch_id, entity_type, source_row_number).
--    - Automatically re-aggregates total_records, row_counts, and validation_summary on import_batches.
--    - Row locking (FOR UPDATE) guarantees concurrent safety.
--
-- 5. ADMIN-ONLY AUTHORIZATION:
--    - Restricted to active SUPER_ADMIN and ADMIN roles via public.is_admin().
--    - SECURITY DEFINER with safe search_path = public, auth.
--    - PUBLIC and anon access revoked.
--
-- =============================================================================

CREATE OR REPLACE FUNCTION public.stage_import_records(
  p_batch_id UUID,
  p_records JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_batch RECORD;
  v_inserted_count INT := 0;
  v_total_records INT := 0;
  v_row_counts JSONB;
  v_validation_summary JSONB;
  v_idx INT := 0;
  v_elem JSONB;
  v_entity_text TEXT;
  v_row_num_text TEXT;
  v_parsed_data JSONB;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated to stage import records'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: Active ADMIN or SUPER_ADMIN only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN to stage import records'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Argument validation
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: batch_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_records IS NULL OR jsonb_typeof(p_records) != 'array' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_records must be a JSON array of staging records'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Server-side chunk limit: Maximum 500 records per call
  IF jsonb_array_length(p_records) > 500 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Chunk size exceeds maximum allowed limit of 500 records (received %)', jsonb_array_length(p_records)
      USING ERRCODE = '22023';
  END IF;

  -- 5. Strict record structure validation (reject entire chunk on malformed record)
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_records) LOOP
    v_idx := v_idx + 1;

    -- Must be a JSON object
    IF jsonb_typeof(v_elem) != 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Record at index % is not a JSON object', v_idx
        USING ERRCODE = '22023';
    END IF;

    -- Entity type validation
    v_entity_text := trim(v_elem->>'entity_type');
    IF v_entity_text IS NULL OR v_entity_text NOT IN ('PERSON', 'FAMILY', 'RELATIONSHIP') THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Record at index % has missing or invalid entity_type "%"', v_idx, COALESCE(v_entity_text, 'NULL')
        USING ERRCODE = '22023';
    END IF;

    -- Source row number validation
    v_row_num_text := trim(v_elem->>'source_row_number');
    IF v_row_num_text IS NULL OR v_row_num_text !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Record at index % has missing, non-numeric, or non-positive source_row_number "%"', v_idx, COALESCE(v_row_num_text, 'NULL')
        USING ERRCODE = '22023';
    END IF;

    -- Parsed data validation (must be object if present)
    v_parsed_data := v_elem->'parsed_data';
    IF v_parsed_data IS NOT NULL AND jsonb_typeof(v_parsed_data) != 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Record at index % has invalid parsed_data (must be an object)', v_idx
        USING ERRCODE = '22023';
    END IF;

    -- Raw data validation (must be object if present)
    IF v_elem->'raw_data' IS NOT NULL AND jsonb_typeof(v_elem->'raw_data') != 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Record at index % has invalid raw_data (must be an object)', v_idx
        USING ERRCODE = '22023';
    END IF;

    -- Validation errors validation (must be array if present)
    IF v_elem->'validation_errors' IS NOT NULL AND jsonb_typeof(v_elem->'validation_errors') != 'array' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Record at index % has invalid validation_errors (must be an array)', v_idx
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- 6. Retrieve and lock target batch
  SELECT id, status, file_name, file_hash, total_records INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Import batch % does not exist', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 7. Lifecycle status check: Ingestion is only permitted for STAGED batches
  IF v_batch.status != 'STAGED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot stage records into import batch % with status %', p_batch_id, v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- 8. Bulk upsert staging records
  -- NOTE: validation_status is ALWAYS forced to 'PENDING'. Client cannot bypass PENDING.
  -- Canonical_id is strictly NULL.
  WITH inserted_rows AS (
    INSERT INTO public.staging_records (
      batch_id,
      entity_type,
      source_row_number,
      source_record_id,
      parsed_data,
      raw_data,
      validation_status,
      validation_errors,
      canonical_id
    )
    SELECT
      p_batch_id,
      (elem->>'entity_type')::public.import_entity_type,
      (elem->>'source_row_number')::INT,
      NULLIF(trim(elem->>'source_record_id'), ''),
      COALESCE(elem->'parsed_data', '{}'::jsonb),
      COALESCE(elem->'raw_data', '{}'::jsonb),
      'PENDING'::public.staging_validation_status, -- Forced server-side authority
      COALESCE(elem->'validation_errors', '[]'::jsonb),
      NULL -- canonical_id must remain strictly NULL during staging
    FROM jsonb_array_elements(p_records) AS elem
    ON CONFLICT (batch_id, entity_type, source_row_number)
    DO UPDATE SET
      source_record_id = EXCLUDED.source_record_id,
      parsed_data = EXCLUDED.parsed_data,
      raw_data = EXCLUDED.raw_data,
      validation_status = 'PENDING'::public.staging_validation_status, -- Reset to PENDING on upsert
      validation_errors = EXCLUDED.validation_errors,
      updated_at = NOW()
    RETURNING id
  )
  SELECT count(*) INTO v_inserted_count FROM inserted_rows;

  -- 9. Re-calculate aggregate metrics from staging_records
  SELECT
    count(*),
    jsonb_build_object(
      'persons', count(*) FILTER (WHERE entity_type = 'PERSON'),
      'families', count(*) FILTER (WHERE entity_type = 'FAMILY'),
      'relationships', count(*) FILTER (WHERE entity_type = 'RELATIONSHIP')
    ),
    jsonb_build_object(
      'errors', count(*) FILTER (WHERE validation_status = 'ERROR'),
      'warnings', count(*) FILTER (WHERE validation_status = 'WARNING'),
      'valid', count(*) FILTER (WHERE validation_status = 'VALID' OR validation_status = 'PENDING'),
      'duplicates', 0
    )
  INTO
    v_total_records,
    v_row_counts,
    v_validation_summary
  FROM public.staging_records
  WHERE batch_id = p_batch_id;

  -- 10. Synchronize aggregate metrics onto import_batches
  UPDATE public.import_batches
  SET
    total_records = v_total_records,
    row_counts = v_row_counts,
    validation_summary = v_validation_summary,
    updated_at = NOW()
  WHERE id = p_batch_id;

  -- 11. Audit Logging via existing infrastructure
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'import_batch',
    p_batch_id,
    NULL,
    jsonb_build_object(
      'inserted_chunk_size', v_inserted_count,
      'total_staged_records', v_total_records,
      'row_counts', v_row_counts,
      'validation_summary', v_validation_summary
    ),
    jsonb_build_object(
      'action_type', 'STAGE_IMPORT_RECORDS',
      'batch_id', p_batch_id,
      'caller_id', v_caller_id
    )
  );

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'inserted_count', v_inserted_count,
    'total_records', v_total_records,
    'row_counts', v_row_counts,
    'validation_summary', v_validation_summary
  );
END;
$$;

COMMENT ON FUNCTION public.stage_import_records(UUID, JSONB) IS
  'Server-authoritative RPC: Bulk ingests staged records into public.staging_records and atomically synchronizes batch metrics. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- Privileges & Access Grants
-- -----------------------------------------------------------------------------

-- Revoke all from PUBLIC and anon (least privilege)
REVOKE ALL ON FUNCTION public.stage_import_records(UUID, JSONB) FROM PUBLIC, anon;

-- Grant EXECUTE to authenticated administrators only (no service_role dependency)
GRANT EXECUTE ON FUNCTION public.stage_import_records(UUID, JSONB) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261017200000_create_import_validation_and_review_rpcs.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261017200000_create_import_validation_and_review_rpcs.sql
-- Purpose:   Authoritative RPCs for server-side validation, duplicate review,
--             and lifecycle state transitions of staged import batches.
-- Phase:     Phase 14 — Subtask 3 (Validation, Data Quality & Duplicate Review)
-- =============================================================================
--
-- ARCHITECTURAL DECISIONS & INVARIANTS:
-- 1. DETECT != MERGE:
--    - Identifies duplicates and sets validation_status = 'WARNING' with structured match signals.
--    - NEVER automatically merges, deletes, or mutates canonical or staging records.
--
-- 2. PERSON != USER:
--    - Validates demographic census data only. Never creates auth.users or profiles.
--
-- 3. CANONICAL ISOLATION:
--    - Operates exclusively on public.staging_records and public.import_batches.
--    - NEVER writes to public.persons, public.families, public.relationships, or public.family_members.
--    - canonical_id remains strictly NULL.
--
-- 4. BATCH LIFECYCLE & ROW LOCKING:
--    - Target import batch is locked FOR UPDATE.
--    - Permitted only for batches in 'STAGED' status.
--    - Transitions batch to 'VALIDATED' only when explicit transition RPC is invoked and 0 blocking errors exist.
--
-- 5. ADMIN-ONLY AUTHORIZATION:
--    - Restricted to active SUPER_ADMIN and ADMIN roles via public.is_admin().
--    - SECURITY DEFINER with safe search_path = public, auth.
--    - Executable by authenticated administrators only. Revoked from PUBLIC and anon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Authoritative RPC: public.validate_import_batch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_import_batch(
  p_batch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_batch RECORD;
  v_rec RECORD;
  v_errors JSONB;
  v_status public.staging_validation_status;
  v_errors_count INT := 0;
  v_warnings_count INT := 0;
  v_valid_count INT := 0;
  v_total_records INT := 0;
  v_duplicate_count INT := 0;
  v_row_counts JSONB;
  v_validation_summary JSONB;

  -- Field evaluation variables
  v_first_name TEXT;
  v_last_name TEXT;
  v_dob_str TEXT;
  v_dod_str TEXT;
  v_dob DATE;
  v_dod DATE;
  v_gender TEXT;
  v_family_name TEXT;
  v_person_a TEXT;
  v_person_b TEXT;
  v_rel_type TEXT;
  v_head_id TEXT;
  v_is_living BOOLEAN;
  v_is_living_raw TEXT;
  v_person_status_raw TEXT;
  v_canonical_status TEXT;

  -- Duplicate candidate variables
  v_cand_match RECORD;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated to validate import batch'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: Active ADMIN or SUPER_ADMIN only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN to validate import batch'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Argument validation
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: batch_id is required'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Retrieve and lock target batch
  SELECT id, status, total_records INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Import batch % does not exist', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. Lifecycle status check: Only STAGED batches may be validated
  IF v_batch.status != 'STAGED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot validate import batch % with status %', p_batch_id, v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- 6. Iterate through all staging records for this batch
  FOR v_rec IN
    SELECT id, entity_type, source_row_number, source_record_id, parsed_data, raw_data, validation_status
    FROM public.staging_records
    WHERE batch_id = p_batch_id
    ORDER BY source_row_number ASC
    FOR UPDATE
  LOOP
    -- If explicitly excluded, preserve EXCLUDED status
    IF v_rec.validation_status = 'EXCLUDED' THEN
      CONTINUE;
    END IF;

    v_errors := '[]'::jsonb;

    -- =========================================================================
    -- ENTITY: PERSON
    -- =========================================================================
    IF v_rec.entity_type = 'PERSON' THEN
      v_first_name := NULLIF(trim(v_rec.parsed_data->>'first_name'), '');
      v_last_name := NULLIF(trim(v_rec.parsed_data->>'last_name'), '');
      v_dob_str := NULLIF(trim(v_rec.parsed_data->>'date_of_birth'), '');
      v_dod_str := NULLIF(trim(v_rec.parsed_data->>'date_of_death'), '');
      v_gender := NULLIF(upper(trim(v_rec.parsed_data->>'gender')), '');

      -- Safe is_living & status validation (without casting to boolean)
      v_is_living_raw := trim(v_rec.parsed_data->>'is_living');
      v_is_living := NULL;
      IF v_is_living_raw IS NOT NULL THEN
        IF lower(v_is_living_raw) IN ('true', 't', 'yes', 'y', '1', 'living', 'alive') THEN
          v_is_living := TRUE;
        ELSIF lower(v_is_living_raw) IN ('false', 'f', 'no', 'n', '0', 'deceased', 'dead') THEN
          v_is_living := FALSE;
        ELSE
          v_errors := v_errors || jsonb_build_object(
            'code', 'INVALID_BOOLEAN_VALUE',
            'field', 'is_living',
            'severity', 'WARNING',
            'message', format('Value "%s" for is_living is not a recognized boolean; expected true/false, living/deceased.', v_is_living_raw)
          );
        END IF;
      END IF;

      -- Canonical persons status validation & normalization: ACTIVE | DECEASED
      -- Source status = 'LIVING' is normalized to canonical 'ACTIVE'
      v_person_status_raw := upper(trim(v_rec.parsed_data->>'status'));
      v_canonical_status := NULL;
      IF v_person_status_raw IS NOT NULL THEN
        IF v_person_status_raw = 'ACTIVE' THEN
          v_canonical_status := 'ACTIVE';
        ELSIF v_person_status_raw = 'LIVING' THEN
          v_canonical_status := 'ACTIVE';
        ELSIF v_person_status_raw = 'DECEASED' THEN
          v_canonical_status := 'DECEASED';
        ELSE
          -- Unsupported status values produce a structured row-level warning and preserve raw value
          v_errors := v_errors || jsonb_build_object(
            'code', 'INVALID_PERSON_STATUS',
            'field', 'status',
            'severity', 'WARNING',
            'message', format('Status "%s" is not a recognized canonical person status; expected ACTIVE or DECEASED (source LIVING maps to ACTIVE).', v_person_status_raw)
          );
        END IF;
      END IF;

      -- If both status and is_living are provided, check for contradiction
      IF v_is_living IS NOT NULL AND v_canonical_status IS NOT NULL THEN
        IF (v_is_living = TRUE AND v_canonical_status = 'DECEASED') OR
           (v_is_living = FALSE AND v_canonical_status = 'ACTIVE') THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'VITAL_STATUS_CONTRADICTION',
            'field', 'status',
            'severity', 'WARNING',
            'message', format('Contradiction detected: is_living=%s contradicts person status=%s.', v_is_living, v_canonical_status)
          );
        END IF;
      END IF;

      -- Rule P1: Name existence (BOTH first_name and last_name required by canonical schema)
      IF v_first_name IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'MISSING_FIRST_NAME',
          'field', 'first_name',
          'severity', 'ERROR',
          'message', 'Person record must have a first_name.'
        );
      END IF;

      IF v_last_name IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'MISSING_LAST_NAME',
          'field', 'last_name',
          'severity', 'ERROR',
          'message', 'Person record must have a last_name.'
        );
      END IF;

      -- Rule P2: Name length checks
      IF v_first_name IS NOT NULL AND length(v_first_name) > 100 THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'FIELD_TOO_LONG',
          'field', 'first_name',
          'severity', 'ERROR',
          'message', 'first_name exceeds maximum length of 100 characters.'
        );
      END IF;

      IF v_last_name IS NOT NULL AND length(v_last_name) > 100 THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'FIELD_TOO_LONG',
          'field', 'last_name',
          'severity', 'ERROR',
          'message', 'last_name exceeds maximum length of 100 characters.'
        );
      END IF;

      -- Rule P3: Gender validity
      IF v_gender IS NOT NULL AND v_gender NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'INVALID_GENDER',
          'field', 'gender',
          'severity', 'ERROR',
          'message', 'gender must be MALE, FEMALE, or OTHER.'
        );
      END IF;

      -- Rule P4: Date of birth validation
      v_dob := NULL;
      IF v_dob_str IS NOT NULL THEN
        BEGIN
          v_dob := v_dob_str::DATE;
          IF v_dob < '1800-01-01'::DATE THEN
            v_errors := v_errors || jsonb_build_object(
              'code', 'DOB_TOO_EARLY',
              'field', 'date_of_birth',
              'severity', 'ERROR',
              'message', 'date_of_birth cannot be earlier than 1800-01-01.'
            );
          ELSIF v_dob > CURRENT_DATE THEN
            v_errors := v_errors || jsonb_build_object(
              'code', 'DOB_IN_FUTURE',
              'field', 'date_of_birth',
              'severity', 'ERROR',
              'message', 'date_of_birth cannot be in the future.'
            );
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'INVALID_DATE_FORMAT',
            'field', 'date_of_birth',
            'severity', 'ERROR',
            'message', 'date_of_birth is not a valid date (expected YYYY-MM-DD).'
          );
        END;
      END IF;

      -- Rule P5: Date of death validation
      v_dod := NULL;
      IF v_dod_str IS NOT NULL THEN
        BEGIN
          v_dod := v_dod_str::DATE;
          IF v_dod > CURRENT_DATE THEN
            v_errors := v_errors || jsonb_build_object(
              'code', 'DOD_IN_FUTURE',
              'field', 'date_of_death',
              'severity', 'ERROR',
              'message', 'date_of_death cannot be in the future.'
            );
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'INVALID_DATE_FORMAT',
            'field', 'date_of_death',
            'severity', 'ERROR',
            'message', 'date_of_death is not a valid date (expected YYYY-MM-DD).'
          );
        END;
      END IF;

      -- Rule P6: Chronological consistency (DOD >= DOB)
      IF v_dob IS NOT NULL AND v_dod IS NOT NULL AND v_dod < v_dob THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'DEATH_BEFORE_BIRTH',
          'field', 'date_of_death',
          'severity', 'ERROR',
          'message', 'date_of_death cannot precede date_of_birth.'
        );
      END IF;

      -- Rule P7: Vital status contradiction
      IF v_dod IS NOT NULL AND (v_is_living = TRUE OR v_canonical_status = 'ACTIVE') THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'VITAL_STATUS_CONTRADICTION',
          'field', 'is_living',
          'severity', 'WARNING',
          'message', 'Person has date_of_death but is represented as living/ACTIVE.'
        );
      END IF;

      -- Rule P8: Duplicate Detection against canonical public.persons
      -- DETECT != MERGE: Flag as WARNING only with privacy-preserving match signals
      IF v_first_name IS NOT NULL AND v_last_name IS NOT NULL THEN
        SELECT id, first_name, last_name, date_of_birth, gotra INTO v_cand_match
        FROM public.persons
        WHERE deleted_at IS NULL
          AND lower(first_name) = lower(v_first_name)
          AND lower(last_name) = lower(v_last_name)
          AND (
            (v_dob IS NOT NULL AND date_of_birth = v_dob)
            OR (v_rec.parsed_data->>'gotra' IS NOT NULL AND lower(gotra) = lower(v_rec.parsed_data->>'gotra'))
          )
        LIMIT 1;

        IF FOUND THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'DUPLICATE_CANDIDATE',
            'field', 'name',
            'severity', 'WARNING',
            'message', 'Potential duplicate match detected with an existing canonical person.',
            'canonical_candidate_id', v_cand_match.id,
            'confidence', CASE WHEN v_dob IS NOT NULL AND v_cand_match.date_of_birth = v_dob THEN 'STRONG' ELSE 'POSSIBLE' END,
            'match_signals', jsonb_build_array(
              'FULL_NAME_MATCH',
              CASE WHEN v_dob IS NOT NULL AND v_cand_match.date_of_birth = v_dob THEN 'DOB_MATCH' ELSE 'GOTRA_MATCH' END
            )
          );
        END IF;
      END IF;

    -- =========================================================================
    -- ENTITY: FAMILY
    -- =========================================================================
    ELSIF v_rec.entity_type = 'FAMILY' THEN
      v_family_name := NULLIF(trim(v_rec.parsed_data->>'family_name'), '');
      v_head_id := NULLIF(trim(v_rec.parsed_data->>'head_id'), '');

      -- Rule F1: Family name existence
      IF v_family_name IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'MISSING_REQUIRED_FIELD',
          'field', 'family_name',
          'severity', 'ERROR',
          'message', 'Family record must have a family_name.'
        );
      ELSIF length(v_family_name) > 200 THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'FIELD_TOO_LONG',
          'field', 'family_name',
          'severity', 'ERROR',
          'message', 'family_name exceeds maximum length of 200 characters.'
        );
      END IF;

      -- Rule F2: Description length
      IF v_rec.parsed_data->>'description' IS NOT NULL AND length(v_rec.parsed_data->>'description') > 2000 THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'FIELD_TOO_LONG',
          'field', 'description',
          'severity', 'ERROR',
          'message', 'description exceeds maximum length of 2000 characters.'
        );
      END IF;

      -- Rule F3: Head ID UUID format if supplied
      IF v_head_id IS NOT NULL AND v_head_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'INVALID_UUID_FORMAT',
          'field', 'head_id',
          'severity', 'WARNING',
          'message', 'head_id is not a standard UUID format; will require lineage resolution.'
        );
      END IF;

      -- Rule F4: Duplicate Detection against canonical public.families
      -- DETECT != MERGE: Flag as WARNING only with privacy-preserving match signals
      IF v_family_name IS NOT NULL THEN
        SELECT id, family_name, city INTO v_cand_match
        FROM public.families
        WHERE deleted_at IS NULL
          AND lower(family_name) = lower(v_family_name)
          AND (
            (v_rec.parsed_data->>'city' IS NOT NULL AND lower(city) = lower(v_rec.parsed_data->>'city'))
            OR (v_rec.parsed_data->>'gotra' IS NOT NULL AND lower(gotra) = lower(v_rec.parsed_data->>'gotra'))
          )
        LIMIT 1;

        IF FOUND THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'DUPLICATE_CANDIDATE',
            'field', 'family_name',
            'severity', 'WARNING',
            'message', 'Potential duplicate match detected with an existing canonical family.',
            'canonical_candidate_id', v_cand_match.id,
            'confidence', 'POSSIBLE',
            'match_signals', jsonb_build_array(
              'FAMILY_NAME_MATCH',
              CASE WHEN v_rec.parsed_data->>'city' IS NOT NULL AND lower(v_cand_match.city) = lower(v_rec.parsed_data->>'city') THEN 'CITY_MATCH' ELSE 'GOTRA_MATCH' END
            )
          );
        END IF;
      END IF;

    -- =========================================================================
    -- ENTITY: RELATIONSHIP
    -- =========================================================================
    ELSIF v_rec.entity_type = 'RELATIONSHIP' THEN
      v_person_a := NULLIF(trim(v_rec.parsed_data->>'person_a_id'), '');
      v_person_b := NULLIF(trim(v_rec.parsed_data->>'person_b_id'), '');
      v_rel_type := NULLIF(upper(trim(v_rec.parsed_data->>'relationship_type')), '');

      -- Rule R1: Endpoints existence
      IF v_person_a IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'MISSING_REQUIRED_FIELD',
          'field', 'person_a_id',
          'severity', 'ERROR',
          'message', 'Relationship record must reference Person A (person_a_id).'
        );
      END IF;

      IF v_person_b IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'MISSING_REQUIRED_FIELD',
          'field', 'person_b_id',
          'severity', 'ERROR',
          'message', 'Relationship record must reference Person B (person_b_id).'
        );
      END IF;

      -- Rule R2: Disallow self-reference
      IF v_person_a IS NOT NULL AND v_person_b IS NOT NULL AND lower(v_person_a) = lower(v_person_b) THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'SELF_RELATIONSHIP',
          'field', 'person_b_id',
          'severity', 'ERROR',
          'message', 'A relationship cannot connect a person to themselves.'
        );
      END IF;

      -- Rule R3: Relationship type valid canonical enum (PARENT, SPOUSE, SIBLING only)
      IF v_rel_type IS NULL OR v_rel_type NOT IN ('PARENT', 'SPOUSE', 'SIBLING') THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'INVALID_RELATIONSHIP_TYPE',
          'field', 'relationship_type',
          'severity', 'ERROR',
          'message', 'relationship_type must be PARENT, SPOUSE, or SIBLING (canonical schema does not support CHILD; map to PARENT with reversed endpoints).'
        );
      END IF;

      -- Rule R4: UUID format check (warning if source uses external IDs like ROW_5)
      IF v_person_a IS NOT NULL AND v_person_a !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        -- Check if it matches a source_record_id within the batch
        IF NOT EXISTS (
          SELECT 1 FROM public.staging_records
          WHERE batch_id = p_batch_id AND source_record_id = v_person_a
        ) THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'UNRESOLVED_REFERENCE',
            'field', 'person_a_id',
            'severity', 'WARNING',
            'message', format('Reference person_a_id "%s" does not match any source_record_id in this batch.', v_person_a)
          );
        END IF;
      END IF;

      IF v_person_b IS NOT NULL AND v_person_b !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.staging_records
          WHERE batch_id = p_batch_id AND source_record_id = v_person_b
        ) THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'UNRESOLVED_REFERENCE',
            'field', 'person_b_id',
            'severity', 'WARNING',
            'message', format('Reference person_b_id "%s" does not match any source_record_id in this batch.', v_person_b)
          );
        END IF;
      END IF;
    END IF;

    -- =========================================================================
    -- Determine Record Status from Evaluation
    -- =========================================================================
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_errors) elem WHERE elem->>'severity' = 'ERROR'
    ) THEN
      v_status := 'ERROR';
    ELSIF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_errors) elem WHERE elem->>'severity' = 'WARNING'
    ) THEN
      v_status := 'WARNING';
    ELSE
      v_status := 'VALID';
    END IF;

    -- Update staging record with evaluation results
    UPDATE public.staging_records
    SET
      validation_status = v_status,
      validation_errors = v_errors,
      updated_at = NOW()
    WHERE id = v_rec.id;
  END LOOP;

  -- 7. Re-calculate aggregate metrics from staging_records
  SELECT
    count(*),
    count(*) FILTER (WHERE validation_status = 'ERROR'),
    count(*) FILTER (WHERE validation_status = 'WARNING'),
    count(*) FILTER (WHERE validation_status = 'VALID'),
    count(*) FILTER (
      WHERE validation_errors @> '[{"code": "DUPLICATE_CANDIDATE"}]'::jsonb
    ),
    jsonb_build_object(
      'persons', count(*) FILTER (WHERE entity_type = 'PERSON'),
      'families', count(*) FILTER (WHERE entity_type = 'FAMILY'),
      'relationships', count(*) FILTER (WHERE entity_type = 'RELATIONSHIP')
    )
  INTO
    v_total_records,
    v_errors_count,
    v_warnings_count,
    v_valid_count,
    v_duplicate_count,
    v_row_counts
  FROM public.staging_records
  WHERE batch_id = p_batch_id;

  v_validation_summary := jsonb_build_object(
    'errors', v_errors_count,
    'warnings', v_warnings_count,
    'valid', v_valid_count,
    'duplicates', v_duplicate_count
  );

  -- 8. Synchronize aggregate metrics onto import_batches
  UPDATE public.import_batches
  SET
    total_records = v_total_records,
    row_counts = v_row_counts,
    validation_summary = v_validation_summary,
    updated_at = NOW()
  WHERE id = p_batch_id;

  -- 9. Audit Logging via existing infrastructure
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'import_batch',
    p_batch_id,
    NULL,
    jsonb_build_object(
      'action_type', 'VALIDATE_IMPORT_BATCH',
      'batch_id', p_batch_id,
      'total_records', v_total_records,
      'validation_summary', v_validation_summary
    ),
    jsonb_build_object(
      'caller_id', v_caller_id
    )
  );

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'total_records', v_total_records,
    'row_counts', v_row_counts,
    'validation_summary', v_validation_summary
  );
END;
$$;

COMMENT ON FUNCTION public.validate_import_batch(UUID) IS
  'Server-authoritative RPC: Evaluates staging records against canonical schema rules and duplicate detection, updates validation statuses, and synchronizes batch metrics. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 2. Authoritative RPC: public.set_staging_record_status
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_staging_record_status(
  p_record_id UUID,
  p_status public.staging_validation_status,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_rec RECORD;
  v_batch RECORD;
  v_has_blocking_errors BOOLEAN := FALSE;
  v_notes_trimmed TEXT;
  v_elem JSONB;
  v_new_errors JSONB := '[]'::jsonb;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Argument validation
  IF p_record_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: record_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: status is required'
      USING ERRCODE = '22023';
  END IF;

  v_notes_trimmed := NULLIF(trim(p_notes), '');

  -- 4. Retrieve staging record and its parent batch
  SELECT id, batch_id, entity_type, validation_status, validation_errors
  INTO v_rec
  FROM public.staging_records
  WHERE id = p_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Staging record % does not exist', p_record_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id, status INTO v_batch
  FROM public.import_batches
  WHERE id = v_rec.batch_id
  FOR UPDATE;

  IF v_batch.status != 'STAGED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot modify record status in batch with status %', v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Enforce allowed manual status transitions
  -- PENDING records MUST NOT be manually manufactured into VALID, WARNING, or ERROR.
  -- They must be processed by validate_import_batch() or explicitly EXCLUDED.
  IF v_rec.validation_status = 'PENDING' AND p_status IN ('VALID', 'WARNING', 'ERROR') THEN
    RAISE EXCEPTION 'INVALID_STATUS: PENDING records must be processed by validate_import_batch() before they can become VALID, WARNING, or ERROR.'
      USING ERRCODE = '23514';
  END IF;

  -- EXCLUDED records MUST NOT be manually changed to VALID, WARNING, or ERROR.
  -- They must be reprocessed by validate_import_batch() before becoming VALID, WARNING, or ERROR.
  IF v_rec.validation_status = 'EXCLUDED' AND p_status IN ('VALID', 'WARNING', 'ERROR') THEN
    RAISE EXCEPTION 'INVALID_STATUS: EXCLUDED records must be reprocessed by validate_import_batch() before becoming VALID, WARNING, or ERROR.'
      USING ERRCODE = '23514';
  END IF;

  -- Disallow setting any record back to PENDING manually
  IF p_status = 'PENDING' AND v_rec.validation_status != 'PENDING' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot manually transition validated record back to PENDING status.'
      USING ERRCODE = '23514';
  END IF;

  -- Disallow turning VALID records into ERROR or WARNING unless through validation engine
  IF v_rec.validation_status = 'VALID' AND p_status IN ('ERROR', 'WARNING') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot manually downgrade VALID record to % without running validation.', p_status
      USING ERRCODE = '23514';
  END IF;

  -- Disallow turning WARNING records into ERROR without running validation
  IF v_rec.validation_status = 'WARNING' AND p_status = 'ERROR' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot manually downgrade WARNING record to ERROR without running validation.'
      USING ERRCODE = '23514';
  END IF;

  -- Disallow turning ERROR records into WARNING without running validation
  IF v_rec.validation_status = 'ERROR' AND p_status = 'WARNING' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot manually transition ERROR record to WARNING without running validation.'
      USING ERRCODE = '23514';
  END IF;

  -- 6. Inspect existing errors for blocking ERROR severity
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_rec.validation_errors) elem
    WHERE elem->>'severity' = 'ERROR'
  ) INTO v_has_blocking_errors;

  -- Prevent contradictory state: validation_status = 'VALID' with unresolved ERRORs
  IF p_status = 'VALID' AND v_has_blocking_errors THEN
    -- Mandatory review reason required to resolve blocking errors
    IF v_notes_trimmed IS NULL OR length(v_notes_trimmed) < 3 THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Mandatory review notes (minimum 3 characters) required to resolve blocking validation errors to VALID status'
        USING ERRCODE = '22023';
    END IF;

    -- Transform existing ERRORs to RESOLVED, preserving the original evidence and adding resolution provenance
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_rec.validation_errors)
    LOOP
      IF v_elem->>'severity' = 'ERROR' THEN
        v_new_errors := v_new_errors || jsonb_build_object(
          'code', COALESCE(v_elem->>'code', 'RESOLVED_ERROR'),
          'field', v_elem->>'field',
          'severity', 'RESOLVED',
          'message', v_elem->>'message',
          'original_severity', 'ERROR',
          'resolved_by', v_caller_id,
          'resolved_at', NOW(),
          'resolution_note', v_notes_trimmed
        );
      ELSE
        v_new_errors := v_new_errors || v_elem;
      END IF;
    END LOOP;

    -- Append explicit admin review resolution note
    v_new_errors := v_new_errors || jsonb_build_object(
      'code', 'ADMIN_ERROR_RESOLVED',
      'severity', 'NOTE',
      'message', format('Blocking errors manually resolved by administrator: %s', v_notes_trimmed),
      'reviewed_by', v_caller_id,
      'reviewed_at', NOW()
    );
  ELSE
    -- Standard review update (e.g. EXCLUDED, WARNING, or VALID when no blocking errors)
    v_new_errors := v_rec.validation_errors;
    IF v_notes_trimmed IS NOT NULL THEN
      v_new_errors := v_new_errors || jsonb_build_object(
        'code', 'ADMIN_REVIEW_NOTE',
        'severity', 'NOTE',
        'message', v_notes_trimmed,
        'reviewed_by', v_caller_id,
        'reviewed_at', NOW()
      );
    END IF;
  END IF;

  -- Update staging record
  UPDATE public.staging_records
  SET
    validation_status = p_status,
    validation_errors = v_new_errors,
    updated_at = NOW()
  WHERE id = p_record_id;

  -- Re-synchronize batch summary
  UPDATE public.import_batches
  SET
    validation_summary = (
      SELECT jsonb_build_object(
        'errors', count(*) FILTER (WHERE validation_status = 'ERROR'),
        'warnings', count(*) FILTER (WHERE validation_status = 'WARNING'),
        'valid', count(*) FILTER (WHERE validation_status = 'VALID'),
        'duplicates', count(*) FILTER (WHERE validation_errors @> '[{"code": "DUPLICATE_CANDIDATE"}]'::jsonb)
      )
      FROM public.staging_records
      WHERE batch_id = v_rec.batch_id
    ),
    updated_at = NOW()
  WHERE id = v_rec.batch_id;

  RETURN jsonb_build_object(
    'record_id', p_record_id,
    'batch_id', v_rec.batch_id,
    'status', p_status
  );
END;
$$;

COMMENT ON FUNCTION public.set_staging_record_status(UUID, public.staging_validation_status, TEXT) IS
  'Server-authoritative RPC: Sets manual review status on a staging record while maintaining error integrity. Resolving ERROR to VALID requires review notes and marks errors as RESOLVED. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 3. Authoritative RPC: public.finalize_batch_validation
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_batch_validation(
  p_batch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_batch RECORD;
  v_error_status_count INT;
  v_pending_status_count INT;
  v_unresolved_error_count INT;
  v_eligible_count INT;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Argument validation
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: batch_id is required'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Retrieve and lock target batch
  SELECT id, status INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Import batch % does not exist', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_batch.status != 'STAGED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Only batches in STAGED status can be finalized to VALIDATED (current: %)', v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Comprehensive check for unresolved errors and unvalidated records
  SELECT
    count(*) FILTER (WHERE validation_status = 'ERROR'),
    count(*) FILTER (WHERE validation_status = 'PENDING'),
    count(*) FILTER (
      WHERE validation_status != 'EXCLUDED'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(validation_errors) elem
          WHERE elem->>'severity' = 'ERROR'
        )
    ),
    count(*) FILTER (WHERE validation_status IN ('VALID', 'WARNING'))
  INTO
    v_error_status_count,
    v_pending_status_count,
    v_unresolved_error_count,
    v_eligible_count
  FROM public.staging_records
  WHERE batch_id = p_batch_id;

  -- Reject if records are still PENDING
  IF v_pending_status_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot finalize batch with % unvalidated (PENDING) records. Run validation first.', v_pending_status_count
      USING ERRCODE = '23514';
  END IF;

  -- Reject if any record has status ERROR or contains unresolved severity ERROR
  IF v_error_status_count > 0 OR v_unresolved_error_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot finalize batch with unresolved blocking errors (% with ERROR status, % with unresolved error payloads). Exclude or resolve invalid records first.', v_error_status_count, v_unresolved_error_count
      USING ERRCODE = '23514';
  END IF;

  -- Reject if batch has zero eligible records to import (e.g. all excluded or empty)
  IF v_eligible_count = 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot finalize batch with zero valid or warning records to import.'
      USING ERRCODE = '23514';
  END IF;

  -- 6. Transition batch status to VALIDATED
  UPDATE public.import_batches
  SET
    status = 'VALIDATED',
    updated_at = NOW()
  WHERE id = p_batch_id;

  -- 7. Audit log
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'import_batch',
    p_batch_id,
    jsonb_build_object('status', 'STAGED'),
    jsonb_build_object('status', 'VALIDATED'),
    jsonb_build_object(
      'action_type', 'FINALIZE_BATCH_VALIDATION',
      'caller_id', v_caller_id,
      'eligible_records', v_eligible_count
    )
  );

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'status', 'VALIDATED'
  );
END;
$$;

COMMENT ON FUNCTION public.finalize_batch_validation(UUID) IS
  'Server-authoritative RPC: Transitions import batch from STAGED to VALIDATED status if zero blocking or unresolved errors exist and records are not PENDING. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- Privileges & Access Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.validate_import_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_import_batch(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.set_staging_record_status(UUID, public.staging_validation_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_staging_record_status(UUID, public.staging_validation_status, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_batch_validation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_batch_validation(UUID) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261017220000_create_import_promotion_rpc.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261017220000_create_import_promotion_rpc.sql
-- Purpose:   Authoritative RPC for transactional import promotion into canonical
--             census domain tables (persons, families, family_members, relationships,
--             and duplicate_flags) with full lineage provenance and audit trail.
-- Phase:     Phase 14 — Subtask 4 (Final Import Promotion, Provenance & Safe Completion)
-- =============================================================================
--
-- ARCHITECTURAL DECISIONS & INVARIANTS:
-- 1. PERSON != USER:
--    - Staged and imported records represent census entities (public.persons).
--    - Promotion sets persons.user_id = NULL unconditionally.
--    - Promotion NEVER creates auth.users, NEVER creates public.profiles,
--      NEVER approves claims, and NEVER accepts invitations.
--
-- 2. DETECT != MERGE:
--    - Promotion NEVER automatically merges, overwrites, or deletes existing canonical records.
--    - Validated records with warning status (including DUPLICATE_CANDIDATE) that were NOT
--      excluded by an administrator are promoted as NEW canonical census records.
--    - Staging records flagged with DUPLICATE_CANDIDATE automatically generate an OPEN
--      entry in public.duplicate_flags linking the newly promoted canonical record
--      and the existing candidate, preserving traceability for human moderation.
--
-- 3. PROMOTION ELIGIBILITY & HARD GATES:
--    - Import batch status MUST be 'VALIDATED'.
--    - Zero records with validation_status = 'PENDING'.
--    - Zero records with validation_status = 'ERROR'.
--    - Zero non-excluded records containing an unresolved error payload.
--    - At least one eligible record with validation_status IN ('VALID', 'WARNING').
--    - Records with validation_status = 'EXCLUDED' are completely skipped and never promoted.
--    - All eligible records must have canonical_id IS NULL prior to promotion.
--
-- 4. ATOMICITY & CONCURRENCY:
--    - Single PostgreSQL transaction with row-level locks on import_batches FOR UPDATE
--      and staging_records FOR UPDATE.
--    - Any constraint or foreign key violation aborts the transaction completely;
--      zero canonical rows are committed, staging canonical_id remains NULL, and the
--      batch remains VALIDATED.
--
-- 5. DETERMINISTIC PROCESSING ORDER & CROSS-ENTITY DEPENDENCIES:
--    Order:
--      Step 1: PERSON records -> public.persons (canonical_id assigned)
--      Step 2: FAMILY records -> public.families (canonical_id assigned)
--      Step 3: FAMILY MEMBERSHIP / HEAD -> public.family_members (role=HEAD, is_head=TRUE)
--      Step 4: RELATIONSHIP records -> public.relationships (lexical ordering enforced)
--      Step 5: DUPLICATE FLAGS -> public.duplicate_flags (OPEN flags for WARNING duplicates)
--      Step 6: BATCH UPDATE -> import_batches (status = 'PROMOTED', promoted_at, promoted_by)
--      Step 7: IMMUTABLE AUDIT LOG -> public.log_audit_event()
--
-- 6. ADMIN-ONLY AUTHORIZATION:
--    - Restricted to active SUPER_ADMIN and ADMIN roles via public.is_admin().
--    - SECURITY DEFINER with safe search_path = public, auth.
--    - Executable by authenticated administrators only. Revoked from PUBLIC and anon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Provenance Index on staging_records
-- -----------------------------------------------------------------------------
-- Supports bidirectional O(1) lookup: "Which import batch and source row created this canonical record?"
CREATE INDEX IF NOT EXISTS idx_staging_records_canonical_id
  ON public.staging_records (canonical_id)
  WHERE canonical_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Authoritative RPC: public.promote_import_batch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promote_import_batch(
  p_batch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_batch RECORD;
  v_rec RECORD;

  -- Eligibility counters
  v_pending_count INT := 0;
  v_error_count INT := 0;
  v_unresolved_error_count INT := 0;
  v_eligible_count INT := 0;
  v_already_promoted_count INT := 0;

  -- Execution counters
  v_promoted_persons INT := 0;
  v_promoted_families INT := 0;
  v_promoted_memberships INT := 0;
  v_promoted_relationships INT := 0;
  v_created_duplicate_flags INT := 0;
  v_total_promoted INT := 0;

  -- Entity variables
  v_canonical_id UUID;
  v_first_name TEXT;
  v_last_name TEXT;
  v_middle_name TEXT;
  v_maiden_name TEXT;
  v_gender public.gender;
  v_gender_str TEXT;
  v_dob DATE;
  v_dod DATE;
  v_dob_str TEXT;
  v_dod_str TEXT;
  v_birth_place TEXT;
  v_gotra TEXT;
  v_nukh TEXT;
  v_kul TEXT;
  v_phone TEXT;
  v_email TEXT;
  v_status_str TEXT;
  v_person_status public.person_status;

  -- Family variables
  v_family_name TEXT;
  v_description TEXT;
  v_city TEXT;
  v_state TEXT;
  v_country TEXT;
  v_head_ref TEXT;
  v_head_canonical_id UUID;

  -- Relationship variables
  v_rel_person_a_ref TEXT;
  v_rel_person_b_ref TEXT;
  v_rel_type_str TEXT;
  v_rel_type public.relationship_type;
  v_canonical_person_a UUID;
  v_canonical_person_b UUID;
  v_swap_temp UUID;

  -- Duplicate candidate variables
  v_dup_candidate_id UUID;
  v_dup_confidence public.duplicate_confidence;
  v_dup_confidence_str TEXT;
  v_dup_signals JSONB;
  v_dup_rec_a UUID;
  v_dup_rec_b UUID;
  v_error_elem JSONB;

  -- Temporary mapping table name check
  v_promoted_at TIMESTAMPTZ;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated to promote import batch'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: Active ADMIN or SUPER_ADMIN only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN to promote import batch'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Argument validation
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: batch_id is required'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Retrieve and lock target batch exclusively
  SELECT id, status, file_name, total_records, row_counts, validation_summary, promoted_at, promoted_by
  INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Import batch % does not exist', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency Check: if batch has already been promoted, return controlled idempotent response
  IF v_batch.status = 'PROMOTED' THEN
    SELECT
      count(*) FILTER (WHERE entity_type = 'PERSON' AND canonical_id IS NOT NULL),
      count(*) FILTER (WHERE entity_type = 'FAMILY' AND canonical_id IS NOT NULL),
      count(*) FILTER (WHERE entity_type = 'RELATIONSHIP' AND canonical_id IS NOT NULL),
      count(*) FILTER (WHERE canonical_id IS NOT NULL)
    INTO
      v_promoted_persons,
      v_promoted_families,
      v_promoted_relationships,
      v_total_promoted
    FROM public.staging_records
    WHERE batch_id = p_batch_id;

    RETURN jsonb_build_object(
      'batchId', p_batch_id,
      'status', 'PROMOTED',
      'alreadyPromoted', TRUE,
      'promotedAt', v_batch.promoted_at,
      'promotedBy', v_batch.promoted_by,
      'promotedCounts', jsonb_build_object(
        'persons', v_promoted_persons,
        'families', v_promoted_families,
        'relationships', v_promoted_relationships,
        'total', v_total_promoted
      ),
      'familyMemberships', 0,
      'duplicateFlags', 0,
      'total', v_total_promoted
    );
  END IF;

  -- Lifecycle status check: Only VALIDATED batches may be promoted
  IF v_batch.status != 'VALIDATED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot promote import batch % with status %. Batch must be VALIDATED.', p_batch_id, v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Lock all staging records for this batch deterministically
  PERFORM 1
  FROM public.staging_records
  WHERE batch_id = p_batch_id
  ORDER BY source_row_number ASC, id ASC
  FOR UPDATE;

  -- 6. Rigorous Eligibility Verification
  SELECT
    count(*) FILTER (WHERE validation_status = 'PENDING'),
    count(*) FILTER (WHERE validation_status = 'ERROR'),
    count(*) FILTER (
      WHERE validation_status != 'EXCLUDED'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(validation_errors) elem
          WHERE elem->>'severity' = 'ERROR'
        )
    ),
    count(*) FILTER (WHERE validation_status IN ('VALID', 'WARNING')),
    count(*) FILTER (WHERE canonical_id IS NOT NULL)
  INTO
    v_pending_count,
    v_error_count,
    v_unresolved_error_count,
    v_eligible_count,
    v_already_promoted_count
  FROM public.staging_records
  WHERE batch_id = p_batch_id;

  IF v_pending_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot promote batch with % unvalidated (PENDING) records. Run validation first.', v_pending_count
      USING ERRCODE = '23514';
  END IF;

  IF v_error_count > 0 OR v_unresolved_error_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot promote batch with unresolved errors (% with ERROR status, % with unresolved error payloads).', v_error_count, v_unresolved_error_count
      USING ERRCODE = '23514';
  END IF;

  IF v_eligible_count = 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot promote batch with zero valid or warning records.'
      USING ERRCODE = '23514';
  END IF;

  IF v_already_promoted_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Batch contains % records that have already been assigned a canonical_id.', v_already_promoted_count
      USING ERRCODE = '23514';
  END IF;

  -- 7. Create temporary in-transaction source-to-canonical mapping table
  CREATE TEMP TABLE temp_import_id_map (
    staging_id UUID PRIMARY KEY,
    source_record_id TEXT,
    entity_type public.import_entity_type NOT NULL,
    canonical_id UUID NOT NULL
  ) ON COMMIT DROP;

  CREATE INDEX idx_temp_import_id_map_source
    ON temp_import_id_map (source_record_id)
    WHERE source_record_id IS NOT NULL;

  -- ===========================================================================
  -- STEP 1: PROMOTE PERSON RECORDS
  -- ===========================================================================
  FOR v_rec IN
    SELECT id, source_row_number, source_record_id, parsed_data, validation_status, validation_errors
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'PERSON'
      AND validation_status IN ('VALID', 'WARNING')
    ORDER BY source_row_number ASC, id ASC
  LOOP
    v_first_name := trim(v_rec.parsed_data->>'first_name');
    v_last_name := trim(v_rec.parsed_data->>'last_name');
    v_middle_name := NULLIF(trim(v_rec.parsed_data->>'middle_name'), '');
    v_maiden_name := NULLIF(trim(v_rec.parsed_data->>'maiden_name'), '');

    v_gender_str := upper(trim(COALESCE(v_rec.parsed_data->>'gender', '')));
    IF v_gender_str = 'MALE' THEN
      v_gender := 'MALE'::public.gender;
    ELSIF v_gender_str = 'FEMALE' THEN
      v_gender := 'FEMALE'::public.gender;
    ELSIF v_gender_str = 'OTHER' THEN
      v_gender := 'OTHER'::public.gender;
    ELSIF v_gender_str = 'PREFER_NOT_TO_SAY' THEN
      v_gender := 'PREFER_NOT_TO_SAY'::public.gender;
    ELSE
      v_gender := NULL;
    END IF;

    v_dob_str := NULLIF(trim(v_rec.parsed_data->>'date_of_birth'), '');
    v_dob := CASE WHEN v_dob_str IS NOT NULL THEN v_dob_str::DATE ELSE NULL END;

    v_dod_str := NULLIF(trim(v_rec.parsed_data->>'date_of_death'), '');
    v_dod := CASE WHEN v_dod_str IS NOT NULL THEN v_dod_str::DATE ELSE NULL END;

    v_birth_place := NULLIF(trim(v_rec.parsed_data->>'birth_place'), '');
    v_gotra := NULLIF(trim(v_rec.parsed_data->>'gotra'), '');
    v_nukh := NULLIF(trim(v_rec.parsed_data->>'nukh'), '');
    v_kul := NULLIF(trim(v_rec.parsed_data->>'kul'), '');
    v_phone := NULLIF(trim(v_rec.parsed_data->>'phone'), '');
    v_email := NULLIF(trim(v_rec.parsed_data->>'email'), '');

    -- Determine canonical person status: ACTIVE | DECEASED
    v_status_str := upper(trim(COALESCE(v_rec.parsed_data->>'status', '')));
    IF v_dod IS NOT NULL OR v_status_str = 'DECEASED' THEN
      v_person_status := 'DECEASED'::public.person_status;
    ELSE
      v_person_status := 'ACTIVE'::public.person_status;
    END IF;

    -- Insert into public.persons (PERSON != USER: user_id is strictly NULL)
    INSERT INTO public.persons (
      first_name,
      middle_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      date_of_death,
      birth_place,
      gotra,
      nukh,
      kul,
      phone,
      email_contact,
      status,
      verification_status,
      profile_privacy,
      dob_privacy,
      contact_privacy,
      user_id,
      created_by,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      v_first_name,
      v_middle_name,
      v_last_name,
      v_maiden_name,
      v_gender,
      v_dob,
      v_dod,
      v_birth_place,
      v_gotra,
      v_nukh,
      v_kul,
      v_phone,
      v_email,
      v_person_status,
      'UNVERIFIED'::public.verification_status,
      'COMMUNITY'::public.privacy_level,
      'FAMILY'::public.privacy_level,
      'PRIVATE'::public.privacy_level,
      NULL,
      v_caller_id,
      NOW(),
      NOW(),
      NULL
    )
    RETURNING id INTO v_canonical_id;

    -- Update staging record with canonical link
    UPDATE public.staging_records
    SET
      canonical_id = v_canonical_id,
      updated_at = NOW()
    WHERE id = v_rec.id;

    -- Record mapping for downstream resolution
    INSERT INTO temp_import_id_map (staging_id, source_record_id, entity_type, canonical_id)
    VALUES (v_rec.id, v_rec.source_record_id, 'PERSON', v_canonical_id);

    v_promoted_persons := v_promoted_persons + 1;

    -- Duplicate Review Traceability:
    -- If record was flagged with DUPLICATE_CANDIDATE and left as WARNING, create an OPEN duplicate flag
    IF v_rec.validation_status = 'WARNING' THEN
      FOR v_error_elem IN SELECT * FROM jsonb_array_elements(v_rec.validation_errors)
      LOOP
        IF v_error_elem->>'code' = 'DUPLICATE_CANDIDATE' AND v_error_elem->>'canonical_candidate_id' IS NOT NULL THEN
          v_dup_candidate_id := (v_error_elem->>'canonical_candidate_id')::UUID;
          v_dup_confidence_str := upper(trim(COALESCE(v_error_elem->>'confidence', 'POSSIBLE')));
          IF v_dup_confidence_str = 'STRONG' THEN
            v_dup_confidence := 'STRONG'::public.duplicate_confidence;
          ELSIF v_dup_confidence_str = 'WEAK' THEN
            v_dup_confidence := 'WEAK'::public.duplicate_confidence;
          ELSE
            v_dup_confidence := 'POSSIBLE'::public.duplicate_confidence;
          END IF;
          v_dup_signals := COALESCE(v_error_elem->'match_signals', '["IMPORT_VALIDATION_MATCH"]'::jsonb);

          -- Enforce canonical pair ordering (record_a_id < record_b_id)
          IF v_canonical_id < v_dup_candidate_id THEN
            v_dup_rec_a := v_canonical_id;
            v_dup_rec_b := v_dup_candidate_id;
          ELSE
            v_dup_rec_a := v_dup_candidate_id;
            v_dup_rec_b := v_canonical_id;
          END IF;

          -- Insert duplicate flag if not already existing
          IF NOT EXISTS (
            SELECT 1 FROM public.duplicate_flags
            WHERE entity_type = 'PERSON'
              AND record_a_id = v_dup_rec_a
              AND record_b_id = v_dup_rec_b
          ) THEN
            INSERT INTO public.duplicate_flags (
              entity_type,
              record_a_id,
              record_b_id,
              confidence,
              match_signals,
              status,
              notes,
              flagged_by,
              created_at,
              updated_at
            ) VALUES (
              'PERSON'::public.duplicate_entity_type,
              v_dup_rec_a,
              v_dup_rec_b,
              v_dup_confidence,
              v_dup_signals,
              'OPEN'::public.duplicate_flag_status,
              format('Flagged during import promotion for batch %s (source row %s). DETECT != MERGE: distinct canonical records preserved.', p_batch_id, v_rec.source_row_number),
              v_caller_id,
              NOW(),
              NOW()
            );
            v_created_duplicate_flags := v_created_duplicate_flags + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- STEP 2: PROMOTE FAMILY RECORDS
  -- ===========================================================================
  FOR v_rec IN
    SELECT id, source_row_number, source_record_id, parsed_data, validation_status, validation_errors
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'FAMILY'
      AND validation_status IN ('VALID', 'WARNING')
    ORDER BY source_row_number ASC, id ASC
  LOOP
    v_family_name := trim(v_rec.parsed_data->>'family_name');
    v_description := NULLIF(trim(v_rec.parsed_data->>'description'), '');
    v_gotra := NULLIF(trim(v_rec.parsed_data->>'gotra'), '');
    v_nukh := NULLIF(trim(v_rec.parsed_data->>'nukh'), '');
    v_kul := NULLIF(trim(v_rec.parsed_data->>'kul'), '');
    v_city := NULLIF(trim(v_rec.parsed_data->>'city'), '');
    v_state := NULLIF(trim(v_rec.parsed_data->>'state'), '');
    v_country := COALESCE(NULLIF(trim(v_rec.parsed_data->>'country'), ''), 'India');

    -- Insert into public.families
    INSERT INTO public.families (
      family_name,
      description,
      gotra,
      nukh,
      kul,
      city,
      state,
      country,
      status,
      verification_status,
      profile_privacy,
      members_privacy,
      created_by,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      v_family_name,
      v_description,
      v_gotra,
      v_nukh,
      v_kul,
      v_city,
      v_state,
      v_country,
      'ACTIVE'::public.family_status,
      'UNVERIFIED'::public.verification_status,
      'COMMUNITY'::public.privacy_level,
      'COMMUNITY'::public.privacy_level,
      v_caller_id,
      NOW(),
      NOW(),
      NULL
    )
    RETURNING id INTO v_canonical_id;

    -- Update staging record with canonical link
    UPDATE public.staging_records
    SET
      canonical_id = v_canonical_id,
      updated_at = NOW()
    WHERE id = v_rec.id;

    -- Record mapping for downstream resolution
    INSERT INTO temp_import_id_map (staging_id, source_record_id, entity_type, canonical_id)
    VALUES (v_rec.id, v_rec.source_record_id, 'FAMILY', v_canonical_id);

    v_promoted_families := v_promoted_families + 1;

    -- Duplicate Review Traceability for Family:
    IF v_rec.validation_status = 'WARNING' THEN
      FOR v_error_elem IN SELECT * FROM jsonb_array_elements(v_rec.validation_errors)
      LOOP
        IF v_error_elem->>'code' = 'DUPLICATE_CANDIDATE' AND v_error_elem->>'canonical_candidate_id' IS NOT NULL THEN
          v_dup_candidate_id := (v_error_elem->>'canonical_candidate_id')::UUID;
          v_dup_confidence_str := upper(trim(COALESCE(v_error_elem->>'confidence', 'POSSIBLE')));
          IF v_dup_confidence_str = 'STRONG' THEN
            v_dup_confidence := 'STRONG'::public.duplicate_confidence;
          ELSIF v_dup_confidence_str = 'WEAK' THEN
            v_dup_confidence := 'WEAK'::public.duplicate_confidence;
          ELSE
            v_dup_confidence := 'POSSIBLE'::public.duplicate_confidence;
          END IF;
          v_dup_signals := COALESCE(v_error_elem->'match_signals', '["IMPORT_VALIDATION_MATCH"]'::jsonb);

          IF v_canonical_id < v_dup_candidate_id THEN
            v_dup_rec_a := v_canonical_id;
            v_dup_rec_b := v_dup_candidate_id;
          ELSE
            v_dup_rec_a := v_dup_candidate_id;
            v_dup_rec_b := v_canonical_id;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM public.duplicate_flags
            WHERE entity_type = 'FAMILY'
              AND record_a_id = v_dup_rec_a
              AND record_b_id = v_dup_rec_b
          ) THEN
            INSERT INTO public.duplicate_flags (
              entity_type,
              record_a_id,
              record_b_id,
              confidence,
              match_signals,
              status,
              notes,
              flagged_by,
              created_at,
              updated_at
            ) VALUES (
              'FAMILY'::public.duplicate_entity_type,
              v_dup_rec_a,
              v_dup_rec_b,
              v_dup_confidence,
              v_dup_signals,
              'OPEN'::public.duplicate_flag_status,
              format('Flagged during import promotion for batch %s (source row %s). DETECT != MERGE: distinct canonical records preserved.', p_batch_id, v_rec.source_row_number),
              v_caller_id,
              NOW(),
              NOW()
            );
            v_created_duplicate_flags := v_created_duplicate_flags + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- STEP 3: FAMILY HEAD MEMBERSHIP LINKAGE (APPROVED BUSINESS DECISION)
  -- ===========================================================================
  FOR v_rec IN
    SELECT id, source_row_number, parsed_data, canonical_id
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'FAMILY'
      AND canonical_id IS NOT NULL
    ORDER BY source_row_number ASC
  LOOP
    v_head_ref := NULLIF(trim(v_rec.parsed_data->>'head_id'), '');
    IF v_head_ref IS NOT NULL THEN
      -- Resolve head reference: MUST resolve ONLY to an in-batch promoted person
      SELECT canonical_id INTO v_head_canonical_id
      FROM temp_import_id_map
      WHERE entity_type = 'PERSON'
        AND (source_record_id = v_head_ref OR staging_id::TEXT = v_head_ref);

      -- If head reference cannot be resolved to a same-batch promoted person: FAIL ENTIRE PROMOTION TRANSACTION
      IF v_head_canonical_id IS NULL THEN
        RAISE EXCEPTION 'UNRESOLVED_REFERENCE: Family row % specifies head_id "%" which could not be resolved to any promoted person in this batch. Family head reference must belong to the same import batch.', v_rec.source_row_number, v_head_ref
          USING ERRCODE = '23503';
      END IF;

      -- Insert family membership (role = HEAD, is_head = TRUE)
      INSERT INTO public.family_members (
        family_id,
        person_id,
        role,
        is_head,
        joined_at,
        added_by,
        created_at
      ) VALUES (
        v_rec.canonical_id,
        v_head_canonical_id,
        'HEAD'::public.family_role,
        TRUE,
        NOW(),
        v_caller_id,
        NOW()
      );

      v_promoted_memberships := v_promoted_memberships + 1;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- STEP 4: PROMOTE RELATIONSHIP RECORDS
  -- ===========================================================================
  FOR v_rec IN
    SELECT id, source_row_number, parsed_data, validation_status
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'RELATIONSHIP'
      AND validation_status IN ('VALID', 'WARNING')
    ORDER BY source_row_number ASC, id ASC
  LOOP
    v_rel_person_a_ref := NULLIF(trim(v_rec.parsed_data->>'person_a_id'), '');
    v_rel_person_b_ref := NULLIF(trim(v_rec.parsed_data->>'person_b_id'), '');
    v_rel_type_str := upper(trim(COALESCE(v_rec.parsed_data->>'relationship_type', '')));

    -- 1. Validate relationship type (canonical: PARENT, SPOUSE, SIBLING only; CHILD is disallowed)
    IF v_rel_type_str = 'PARENT' THEN
      v_rel_type := 'PARENT'::public.relationship_type;
    ELSIF v_rel_type_str = 'SPOUSE' THEN
      v_rel_type := 'SPOUSE'::public.relationship_type;
    ELSIF v_rel_type_str = 'SIBLING' THEN
      v_rel_type := 'SIBLING'::public.relationship_type;
    ELSE
      RAISE EXCEPTION 'INVALID_ARGUMENT: Unsupported relationship type "%" in row % (canonical types: PARENT, SPOUSE, SIBLING).', v_rel_type_str, v_rec.source_row_number
        USING ERRCODE = '23514';
    END IF;

    -- 2. Resolve Person A endpoint
    v_canonical_person_a := NULL;
    SELECT canonical_id INTO v_canonical_person_a
    FROM temp_import_id_map
    WHERE entity_type = 'PERSON'
      AND (source_record_id = v_rel_person_a_ref OR staging_id::TEXT = v_rel_person_a_ref);

    IF v_canonical_person_a IS NULL AND v_rel_person_a_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_canonical_person_a
      FROM public.persons
      WHERE id = v_rel_person_a_ref::UUID AND deleted_at IS NULL;
    END IF;

    IF v_canonical_person_a IS NULL THEN
      RAISE EXCEPTION 'UNRESOLVED_REFERENCE: Relationship row % person_a_id "%" cannot be resolved to any canonical person in this batch or database.', v_rec.source_row_number, v_rel_person_a_ref
        USING ERRCODE = '23503';
    END IF;

    -- 3. Resolve Person B endpoint
    v_canonical_person_b := NULL;
    SELECT canonical_id INTO v_canonical_person_b
    FROM temp_import_id_map
    WHERE entity_type = 'PERSON'
      AND (source_record_id = v_rel_person_b_ref OR staging_id::TEXT = v_rel_person_b_ref);

    IF v_canonical_person_b IS NULL AND v_rel_person_b_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_canonical_person_b
      FROM public.persons
      WHERE id = v_rel_person_b_ref::UUID AND deleted_at IS NULL;
    END IF;

    IF v_canonical_person_b IS NULL THEN
      RAISE EXCEPTION 'UNRESOLVED_REFERENCE: Relationship row % person_b_id "%" cannot be resolved to any canonical person in this batch or database.', v_rec.source_row_number, v_rel_person_b_ref
        USING ERRCODE = '23503';
    END IF;

    -- 4. Disallow self-reference
    IF v_canonical_person_a = v_canonical_person_b THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Relationship in row % connects person % to themselves.', v_rec.source_row_number, v_canonical_person_a
        USING ERRCODE = '23514';
    END IF;

    -- 5. Canonical Lexical Ordering for symmetric types (SPOUSE, SIBLING)
    IF v_rel_type IN ('SPOUSE', 'SIBLING') AND v_canonical_person_a > v_canonical_person_b THEN
      v_swap_temp := v_canonical_person_a;
      v_canonical_person_a := v_canonical_person_b;
      v_canonical_person_b := v_swap_temp;
    END IF;

    -- 6. Insert canonical relationship
    INSERT INTO public.relationships (
      person_a_id,
      person_b_id,
      relationship_type,
      notes,
      verification_status,
      created_by,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      v_canonical_person_a,
      v_canonical_person_b,
      v_rel_type,
      NULLIF(trim(v_rec.parsed_data->>'notes'), ''),
      'UNVERIFIED'::public.verification_status,
      v_caller_id,
      NOW(),
      NOW(),
      NULL
    )
    RETURNING id INTO v_canonical_id;

    -- Update staging record with canonical link
    UPDATE public.staging_records
    SET
      canonical_id = v_canonical_id,
      updated_at = NOW()
    WHERE id = v_rec.id;

    v_promoted_relationships := v_promoted_relationships + 1;
  END LOOP;

  v_total_promoted := v_promoted_persons + v_promoted_families + v_promoted_relationships;

  -- ===========================================================================
  -- STEP 5: UPDATE IMPORT BATCH STATUS TO PROMOTED
  -- ===========================================================================
  v_promoted_at := NOW();

  UPDATE public.import_batches
  SET
    status = 'PROMOTED',
    promoted_at = v_promoted_at,
    promoted_by = v_caller_id,
    updated_at = v_promoted_at
  WHERE id = p_batch_id;

  -- ===========================================================================
  -- STEP 6: IMMUTABLE AUDIT LOGGING
  -- ===========================================================================
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'import_batch',
    p_batch_id,
    jsonb_build_object('status', 'VALIDATED'),
    jsonb_build_object(
      'status', 'PROMOTED',
      'promoted_counts', jsonb_build_object(
        'persons', v_promoted_persons,
        'families', v_promoted_families,
        'relationships', v_promoted_relationships,
        'family_memberships', v_promoted_memberships,
        'duplicate_flags', v_created_duplicate_flags,
        'total', v_total_promoted
      )
    ),
    jsonb_build_object(
      'action_type', 'PROMOTE_IMPORT_BATCH',
      'batch_id', p_batch_id,
      'file_name', v_batch.file_name,
      'promoted_by', v_caller_id,
      'promoted_at', v_promoted_at
    )
  );

  -- Return structured completion payload
  RETURN jsonb_build_object(
    'batchId', p_batch_id,
    'status', 'PROMOTED',
    'alreadyPromoted', FALSE,
    'promotedAt', v_promoted_at,
    'promotedBy', v_caller_id,
    'promotedCounts', jsonb_build_object(
      'persons', v_promoted_persons,
      'families', v_promoted_families,
      'relationships', v_promoted_relationships,
      'total', v_total_promoted
    ),
    'familyMemberships', v_promoted_memberships,
    'duplicateFlags', v_created_duplicate_flags,
    'total', v_total_promoted
  );
END;
$$;

COMMENT ON FUNCTION public.promote_import_batch(UUID) IS
  'Server-authoritative RPC: Promotes validated staging records into canonical census domain tables (persons, families, family_members, relationships) with strict dependency ordering, head linkage, duplicate flag tracking, and audit trail. Restricted to active ADMIN or SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 3. Privileges & Access Grants
-- -----------------------------------------------------------------------------
-- Revoke all direct execution from PUBLIC and anon
REVOKE ALL ON FUNCTION public.promote_import_batch(UUID) FROM PUBLIC, anon;

-- Grant execution to authenticated (function verifies public.is_admin() internally)
GRANT EXECUTE ON FUNCTION public.promote_import_batch(UUID) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261026200000_enforce_privacy_authorization_lock.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261026200000_enforce_privacy_authorization_lock.sql
-- Description: Enforce server-side privacy authorization lock for persons & families
-- Task: ANDROID-2 — Privacy Authorization Lock
--
-- Authorization Model:
--   SUPER_ADMIN          -> ALLOW
--   ADMIN                -> ALLOW
--   COMMUNITY_MODERATOR  -> ALLOW (Temporary Mukhi-equivalent)
--   COMMITTEE_MEMBER     -> DENY
--   FAMILY_HEAD          -> DENY
--   MEMBER               -> DENY
--   GUEST                -> DENY
--
-- Security Invariants:
--   1. Server-side boundary rejects unauthorized direct UPDATE on privacy columns.
--   2. Normal users (MEMBER, FAMILY_HEAD, etc.) cannot modify privacy settings
--      even if they own or created the record.
--   3. Privacy column modifications are audited via public.log_audit_event.
--   4. Default privacy on creation is hardened to 'PRIVATE'.
--   5. Unrelated updates to profile/person/family fields are NOT blocked.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper Function: can_manage_privacy_settings()
-- -----------------------------------------------------------------------------
-- Returns TRUE if the current session belongs to an active SUPER_ADMIN, ADMIN,
-- or COMMUNITY_MODERATOR (temporary Mukhi-equivalent).
-- Returns FALSE for COMMITTEE_MEMBER, FAMILY_HEAD, MEMBER, GUEST, or anon.

CREATE OR REPLACE FUNCTION public.can_manage_privacy_settings()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('SUPER_ADMIN', 'ADMIN', 'COMMUNITY_MODERATOR')
      AND is_active = TRUE
  );
$$;

COMMENT ON FUNCTION public.can_manage_privacy_settings() IS
  'Authorization check for privacy setting management. '
  'Authorized: SUPER_ADMIN, ADMIN, and COMMUNITY_MODERATOR (temporary Mukhi-equivalent). '
  'Denied: COMMITTEE_MEMBER, FAMILY_HEAD, MEMBER, GUEST.';

REVOKE ALL ON FUNCTION public.can_manage_privacy_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_privacy_settings() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Update Column Defaults on persons and families to 'PRIVATE'
-- -----------------------------------------------------------------------------
-- Hardens creation default to 'PRIVATE' as required by ANDROID-2 Section 11.

ALTER TABLE public.persons ALTER COLUMN profile_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;
ALTER TABLE public.persons ALTER COLUMN dob_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;
ALTER TABLE public.persons ALTER COLUMN contact_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;

ALTER TABLE public.families ALTER COLUMN profile_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;
ALTER TABLE public.families ALTER COLUMN members_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;

-- -----------------------------------------------------------------------------
-- 3. Trigger Guard on persons: handle_person_privacy_update_guard()
-- -----------------------------------------------------------------------------
-- Intercepts UPDATE on public.persons. If any privacy setting column
-- (profile_privacy, dob_privacy, contact_privacy) is changed:
--   - Rejects unauthorized callers with error code 42501 (insufficient privilege).
--   - Records an immutable audit log entry in public.audit_logs.

CREATE OR REPLACE FUNCTION public.handle_person_privacy_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Detect modifications to any of the 3 privacy columns
  IF (NEW.profile_privacy IS DISTINCT FROM OLD.profile_privacy) OR
     (NEW.dob_privacy IS DISTINCT FROM OLD.dob_privacy) OR
     (NEW.contact_privacy IS DISTINCT FROM OLD.contact_privacy) THEN

    -- Verify caller authorization
    IF NOT public.can_manage_privacy_settings() THEN
      RAISE EXCEPTION 'Unauthorized: Normal users cannot modify profile privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
        USING ERRCODE = '42501';
    END IF;

    -- Record immutable audit log entry
    PERFORM public.log_audit_event(
      'ADMIN_ACTION'::public.audit_action,
      'person',
      NEW.id,
      jsonb_build_object(
        'profile_privacy', OLD.profile_privacy,
        'dob_privacy', OLD.dob_privacy,
        'contact_privacy', OLD.contact_privacy
      ),
      jsonb_build_object(
        'profile_privacy', NEW.profile_privacy,
        'dob_privacy', NEW.dob_privacy,
        'contact_privacy', NEW.contact_privacy
      ),
      jsonb_build_object(
        'action_type', 'PRIVACY_SETTING_CHANGED',
        'actor_role', public.get_my_role()
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_person_privacy_update_guard() IS
  'Trigger guard preventing unauthorized updates to person privacy columns and auditing authorized changes.';

DROP TRIGGER IF EXISTS trg_person_privacy_update_guard ON public.persons;
CREATE TRIGGER trg_person_privacy_update_guard
  BEFORE UPDATE ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_person_privacy_update_guard();

-- -----------------------------------------------------------------------------
-- 4. Trigger Guard on families: handle_family_privacy_update_guard()
-- -----------------------------------------------------------------------------
-- Intercepts UPDATE on public.families. If profile_privacy or members_privacy
-- is changed:
--   - Rejects unauthorized callers with error code 42501.
--   - Records an immutable audit log entry in public.audit_logs.

CREATE OR REPLACE FUNCTION public.handle_family_privacy_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Detect modifications to either family privacy column
  IF (NEW.profile_privacy IS DISTINCT FROM OLD.profile_privacy) OR
     (NEW.members_privacy IS DISTINCT FROM OLD.members_privacy) THEN

    -- Verify caller authorization
    IF NOT public.can_manage_privacy_settings() THEN
      RAISE EXCEPTION 'Unauthorized: Normal users cannot modify family privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
        USING ERRCODE = '42501';
    END IF;

    -- Record immutable audit log entry
    PERFORM public.log_audit_event(
      'ADMIN_ACTION'::public.audit_action,
      'family',
      NEW.id,
      jsonb_build_object(
        'profile_privacy', OLD.profile_privacy,
        'members_privacy', OLD.members_privacy
      ),
      jsonb_build_object(
        'profile_privacy', NEW.profile_privacy,
        'members_privacy', NEW.members_privacy
      ),
      jsonb_build_object(
        'action_type', 'PRIVACY_SETTING_CHANGED',
        'actor_role', public.get_my_role()
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_family_privacy_update_guard() IS
  'Trigger guard preventing unauthorized updates to family privacy columns and auditing authorized changes.';

DROP TRIGGER IF EXISTS trg_family_privacy_update_guard ON public.families;
CREATE TRIGGER trg_family_privacy_update_guard
  BEFORE UPDATE ON public.families
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_privacy_update_guard();

-- -----------------------------------------------------------------------------
-- 5. Trigger Guards for INSERT: Enforce 'PRIVATE' Default for Unauthorized Callers
-- -----------------------------------------------------------------------------
-- If an unauthorized caller attempts to inject custom privacy settings on INSERT,
-- the trigger silently forces them to the safe default 'PRIVATE'.

CREATE OR REPLACE FUNCTION public.handle_person_privacy_insert_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_privacy_settings() THEN
    NEW.profile_privacy := 'PRIVATE'::public.privacy_level;
    NEW.dob_privacy := 'PRIVATE'::public.privacy_level;
    NEW.contact_privacy := 'PRIVATE'::public.privacy_level;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_person_privacy_insert_guard ON public.persons;
CREATE TRIGGER trg_person_privacy_insert_guard
  BEFORE INSERT ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_person_privacy_insert_guard();

CREATE OR REPLACE FUNCTION public.handle_family_privacy_insert_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_privacy_settings() THEN
    NEW.profile_privacy := 'PRIVATE'::public.privacy_level;
    NEW.members_privacy := 'PRIVATE'::public.privacy_level;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_privacy_insert_guard ON public.families;
CREATE TRIGGER trg_family_privacy_insert_guard
  BEFORE INSERT ON public.families
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_privacy_insert_guard();

-- -----------------------------------------------------------------------------
-- 6. Dedicated Server-Authoritative RPCs for Privacy Management
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_person_privacy(
  p_person_id UUID,
  p_profile_privacy public.privacy_level,
  p_contact_privacy public.privacy_level,
  p_dob_privacy public.privacy_level
)
RETURNS public.persons
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person public.persons;
BEGIN
  IF NOT public.can_manage_privacy_settings() THEN
    RAISE EXCEPTION 'Unauthorized: Normal users cannot modify privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.persons
  SET
    profile_privacy = p_profile_privacy,
    contact_privacy = p_contact_privacy,
    dob_privacy = p_dob_privacy,
    updated_at = NOW()
  WHERE id = p_person_id
    AND deleted_at IS NULL
  RETURNING * INTO v_person;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found or has been deleted' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_person;
END;
$$;

COMMENT ON FUNCTION public.admin_set_person_privacy IS
  'Administrative RPC to explicitly set person privacy levels. Restricted to Mukhi/Admin.';

REVOKE ALL ON FUNCTION public.admin_set_person_privacy(UUID, public.privacy_level, public.privacy_level, public.privacy_level) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_person_privacy(UUID, public.privacy_level, public.privacy_level, public.privacy_level) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_family_privacy(
  p_family_id UUID,
  p_profile_privacy public.privacy_level,
  p_members_privacy public.privacy_level
)
RETURNS public.families
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family public.families;
BEGIN
  IF NOT public.can_manage_privacy_settings() THEN
    RAISE EXCEPTION 'Unauthorized: Normal users cannot modify privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.families
  SET
    profile_privacy = p_profile_privacy,
    members_privacy = p_members_privacy,
    updated_at = NOW()
  WHERE id = p_family_id
    AND deleted_at IS NULL
  RETURNING * INTO v_family;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Family record not found or has been deleted' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_family;
END;
$$;

COMMENT ON FUNCTION public.admin_set_family_privacy IS
  'Administrative RPC to explicitly set family privacy levels. Restricted to Mukhi/Admin.';

REVOKE ALL ON FUNCTION public.admin_set_family_privacy(UUID, public.privacy_level, public.privacy_level) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_family_privacy(UUID, public.privacy_level, public.privacy_level) TO authenticated;



-- =============================================================================
-- >>> MIGRATION FILE: 20261102200000_enforce_protected_personal_data_governance.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261102200000_enforce_protected_personal_data_governance.sql
-- Description: Server-authoritative protected personal data & visibility governance
-- Task: CLIENT-PRIVACY-1 — Protected Personal Data & Visibility Governance
--
-- Security Invariants & Client Privacy Policy:
--   1. Protected personal data by default:
--      - Full date of birth (exact day & month hidden; year & derived age public)
--      - Primary phone number (phone)
--      - Secondary phone number (phone_secondary)
--      - Contact email (email_contact)
--      - Residential/full address (street address, building, flat; city/state public)
--   2. Non-exposure guarantee:
--      - Base users (MEMBER, FAMILY_HEAD, COMMITTEE_MEMBER, GUEST, anonymous)
--        MUST NEVER receive protected fields belonging to other people.
--      - Masking and authorization enforced at database level (security barrier views,
--        column-level privileges, RPC boundaries, column defaults, and RLS).
--   3. Authorized roles:
--      - SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR (Mukhi-equivalent; no MUKHI DB role).
--      - Authorized roles can access and manage protected personal data.
--   4. Self-service for normal users:
--      - A linked user (user_id = auth.uid()) can access and maintain their own
--        legitimate personal data, but has ZERO editable privacy controls rendered.
--   5. Mukhi location association:
--      - Normal users view assigned respective Mukhi (name, designation, city)
--        with contact request affordance (no cleartext private contact info).
--   6. Audit logging:
--      - Audit logging records only structural metadata; zero raw sensitive PII
--        (phone, email, full DOB) is logged.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Generated Column & Age Function on public.persons
-- -----------------------------------------------------------------------------

-- Add dob_year generated column to extract the birth year without exposing day/month
ALTER TABLE public.persons 
  ADD COLUMN IF NOT EXISTS dob_year INTEGER 
  GENERATED ALWAYS AS (EXTRACT(YEAR FROM date_of_birth)::INTEGER) STORED;

COMMENT ON COLUMN public.persons.dob_year IS
  'Public-safe birth year extracted from date_of_birth. Safe for community directory and tree display.';

-- Helper function to calculate person's current age safely
CREATE OR REPLACE FUNCTION public.calculate_person_age(p_dob DATE)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT CASE 
    WHEN p_dob IS NULL THEN NULL
    ELSE (date_part('year', CURRENT_DATE) - date_part('year', p_dob))::INTEGER - 
         CASE WHEN to_char(CURRENT_DATE, 'MMDD') < to_char(p_dob, 'MMDD') THEN 1 ELSE 0 END
  END;
$$;

COMMENT ON FUNCTION public.calculate_person_age(DATE) IS
  'Calculates age in years from date_of_birth relative to CURRENT_DATE.';

-- -----------------------------------------------------------------------------
-- 2. Harden Privacy Defaults on persons & families
-- -----------------------------------------------------------------------------

ALTER TABLE public.persons ALTER COLUMN dob_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;
ALTER TABLE public.persons ALTER COLUMN contact_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;
ALTER TABLE public.persons ALTER COLUMN profile_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;

-- Temporarily disable the privacy update guard trigger for migration data normalization.
-- Note: ALTER TABLE ... DISABLE TRIGGER requires table ownership (postgres role).
-- Ordinary authenticated/anon application clients have zero DDL privileges and cannot invoke this.
ALTER TABLE public.persons DISABLE TRIGGER trg_person_privacy_update_guard;

-- Migrate any pre-existing records to PRIVATE defaults
UPDATE public.persons
SET dob_privacy = 'PRIVATE'::public.privacy_level
WHERE dob_privacy IS NULL OR dob_privacy != 'PRIVATE'::public.privacy_level;

UPDATE public.persons
SET contact_privacy = 'PRIVATE'::public.privacy_level
WHERE contact_privacy IS NULL OR contact_privacy != 'PRIVATE'::public.privacy_level;

UPDATE public.persons
SET profile_privacy = 'PRIVATE'::public.privacy_level
WHERE profile_privacy IS NULL OR profile_privacy != 'PRIVATE'::public.privacy_level;

-- Re-enable the privacy update guard trigger immediately after normalization
ALTER TABLE public.persons ENABLE TRIGGER trg_person_privacy_update_guard;

-- -----------------------------------------------------------------------------
-- 3. Security Barrier View: public.community_persons
-- -----------------------------------------------------------------------------
-- Exposes ONLY approved community-safe fields.
-- Protected columns (date_of_birth, phone, phone_secondary, email_contact, user_id,
-- created_by, dob_privacy, contact_privacy, profile_privacy, birth_place) are entirely removed.
-- Resolves community-safe residence (city, state) from active family membership,
-- with graceful fallback to birth_place town.
-- dob_year and calculated age are exposed. Full birth date is absent.
-- Protected personal details are accessible only via get_person_protected_details() RPC.

CREATE OR REPLACE VIEW public.community_persons
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.first_name,
  p.middle_name,
  p.last_name,
  p.maiden_name,
  p.gender,
  p.dob_year,
  public.calculate_person_age(p.date_of_birth) AS age,
  COALESCE(
    (
      SELECT f.city
      FROM public.family_members fm
      JOIN public.families f ON f.id = fm.family_id
      WHERE fm.person_id = p.id
        AND fm.left_at IS NULL
        AND f.deleted_at IS NULL
      ORDER BY fm.is_head DESC, fm.created_at ASC
      LIMIT 1
    ),
    NULLIF(trim(split_part(p.birth_place, ',', 1)), '')
  ) AS city,
  COALESCE(
    (
      SELECT f.state
      FROM public.family_members fm
      JOIN public.families f ON f.id = fm.family_id
      WHERE fm.person_id = p.id
        AND fm.left_at IS NULL
        AND f.deleted_at IS NULL
      ORDER BY fm.is_head DESC, fm.created_at ASC
      LIMIT 1
    ),
    NULLIF(trim(split_part(p.birth_place, ',', 2)), '')
  ) AS state,
  p.date_of_death,
  p.avatar_url,
  p.gotra,
  p.nukh,
  p.kul,
  p.status,
  p.verification_status,
  p.created_at,
  p.updated_at,
  p.deleted_at
FROM public.persons p
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW public.community_persons IS
  'Security barrier view exposing approved community-safe fields. Protected columns (date_of_birth, phone, phone_secondary, email_contact, user_id, created_by, privacy levels, birth_place) are entirely omitted.';

-- Gated to authenticated community members only — zero public/anon harvesting
REVOKE ALL ON public.community_persons FROM PUBLIC, anon;
GRANT SELECT ON public.community_persons TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Database-Level Gate 1 Protection on public.persons
-- -----------------------------------------------------------------------------
-- Revoke wide table-level SELECT on public.persons from authenticated, anon, PUBLIC.
-- Re-grant column-level SELECT on non-protected columns only to authenticated members.
-- Zero SELECT permissions granted to anon.
-- Protected columns (date_of_birth, phone, phone_secondary, email_contact, user_id,
-- created_by, profile_privacy, contact_privacy, dob_privacy, birth_place) CANNOT
-- be directly selected from public.persons by callers via PostgREST.

REVOKE SELECT ON TABLE public.persons FROM authenticated, anon, PUBLIC;

GRANT SELECT (
  id,
  first_name,
  middle_name,
  last_name,
  maiden_name,
  gender,
  dob_year,
  date_of_death,
  avatar_url,
  gotra,
  nukh,
  kul,
  status,
  verification_status,
  created_at,
  updated_at,
  deleted_at
) ON TABLE public.persons TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. RPC: public.get_person_protected_details
-- -----------------------------------------------------------------------------
-- Authorized or self-service fetching of protected details with audit logging.

CREATE OR REPLACE FUNCTION public.get_person_protected_details(p_person_id UUID)
RETURNS TABLE (
  date_of_birth DATE,
  phone TEXT,
  phone_secondary TEXT,
  email_contact TEXT,
  is_owner BOOLEAN,
  is_moderator BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_user_id UUID;
  v_is_owner BOOLEAN;
  v_is_moderator BOOLEAN;
  v_caller_uid UUID;
BEGIN
  v_caller_uid := auth.uid();
  
  -- Locate person
  SELECT user_id INTO v_person_user_id
  FROM public.persons
  WHERE id = p_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found' USING ERRCODE = 'P0002';
  END IF;

  v_is_owner := (v_caller_uid IS NOT NULL AND v_person_user_id IS NOT NULL AND v_caller_uid = v_person_user_id);
  v_is_moderator := public.can_manage_privacy_settings();

  -- Security Gate: Caller must be owner or authorized moderator/admin
  IF NOT (v_is_owner OR v_is_moderator) THEN
    RAISE EXCEPTION 'Unauthorized: Protected personal data is restricted to authorized Mukhis and the individual record owner.'
      USING ERRCODE = '42501';
  END IF;

  -- Audit log the access (zero sensitive PII in log payload)
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'person',
    p_person_id,
    NULL,
    NULL,
    jsonb_build_object(
      'action_type', 'PROTECTED_DATA_ACCESSED',
      'accessor_uid', v_caller_uid,
      'is_owner', v_is_owner,
      'is_moderator', v_is_moderator
    )
  );

  RETURN QUERY
  SELECT 
    p.date_of_birth,
    p.phone,
    p.phone_secondary,
    p.email_contact,
    v_is_owner,
    v_is_moderator
  FROM public.persons p
  WHERE p.id = p_person_id;
END;
$$;

COMMENT ON FUNCTION public.get_person_protected_details(UUID) IS
  'SECURITY DEFINER RPC to retrieve protected personal data (full DOB, phone, email). Restricted to owner and authorized Mukhis/admins.';

REVOKE ALL ON FUNCTION public.get_person_protected_details(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_person_protected_details(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC: public.update_person_protected_details
-- -----------------------------------------------------------------------------
-- Self-service update by record owner or authorized Mukhi/Admin.
-- RETURNS ONLY minimal confirmation metadata (person_id, updated_at).
-- Strictly DOES NOT return the complete public.persons row or protected columns.

CREATE OR REPLACE FUNCTION public.update_person_protected_details(
  p_person_id UUID,
  p_date_of_birth DATE DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_phone_secondary TEXT DEFAULT NULL,
  p_email_contact TEXT DEFAULT NULL
)
RETURNS TABLE (
  person_id UUID,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person RECORD;
  v_is_owner BOOLEAN;
  v_is_moderator BOOLEAN;
  v_caller_uid UUID;
  v_updated_at TIMESTAMPTZ;
BEGIN
  v_caller_uid := auth.uid();

  SELECT * INTO v_person
  FROM public.persons
  WHERE id = p_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found' USING ERRCODE = 'P0002';
  END IF;

  v_is_owner := (v_caller_uid IS NOT NULL AND v_person.user_id IS NOT NULL AND v_caller_uid = v_person.user_id);
  v_is_moderator := public.can_manage_privacy_settings();

  IF NOT (v_is_owner OR v_is_moderator) THEN
    RAISE EXCEPTION 'Unauthorized: Only the record owner or an authorized Mukhi / Administrator may update protected personal data.'
      USING ERRCODE = '42501';
  END IF;

  v_updated_at := NOW();

  UPDATE public.persons
  SET
    date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
    phone = COALESCE(p_phone, phone),
    phone_secondary = COALESCE(p_phone_secondary, phone_secondary),
    email_contact = COALESCE(p_email_contact, email_contact),
    updated_at = v_updated_at
  WHERE id = p_person_id;

  -- Audit log the update (zero sensitive PII in log payload)
  PERFORM public.log_audit_event(
    'PERSON_UPDATED'::public.audit_action,
    'person',
    p_person_id,
    NULL,
    NULL,
    jsonb_build_object(
      'action_type', 'PROTECTED_DATA_UPDATED',
      'updater_uid', v_caller_uid,
      'is_owner', v_is_owner,
      'is_moderator', v_is_moderator,
      'updated_fields', ARRAY[
        CASE WHEN p_date_of_birth IS NOT NULL THEN 'date_of_birth' END,
        CASE WHEN p_phone IS NOT NULL THEN 'phone' END,
        CASE WHEN p_phone_secondary IS NOT NULL THEN 'phone_secondary' END,
        CASE WHEN p_email_contact IS NOT NULL THEN 'email_contact' END
      ]
    )
  );

  RETURN QUERY
  SELECT p_person_id AS person_id, v_updated_at AS updated_at;
END;
$$;

COMMENT ON FUNCTION public.update_person_protected_details(UUID, DATE, TEXT, TEXT, TEXT) IS
  'SECURITY DEFINER RPC allowing record owner or authorized Mukhi/Admin to update protected personal data. Returns minimal metadata only.';

REVOKE ALL ON FUNCTION public.update_person_protected_details(UUID, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_person_protected_details(UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. RPC: public.update_person_privacy_settings (Hardened Return Type)
-- -----------------------------------------------------------------------------
-- Redefine privacy settings update RPC to return minimal metadata only.
-- Strictly DOES NOT return the complete public.persons row or protected columns.

CREATE OR REPLACE FUNCTION public.update_person_privacy_settings(
  p_person_id UUID,
  p_profile_privacy public.privacy_level,
  p_contact_privacy public.privacy_level,
  p_dob_privacy public.privacy_level
)
RETURNS TABLE (
  person_id UUID,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_at TIMESTAMPTZ;
BEGIN
  IF NOT public.can_manage_privacy_settings() THEN
    RAISE EXCEPTION 'Unauthorized: Normal users cannot modify privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
      USING ERRCODE = '42501';
  END IF;

  v_updated_at := NOW();

  UPDATE public.persons
  SET
    profile_privacy = p_profile_privacy,
    contact_privacy = p_contact_privacy,
    dob_privacy = p_dob_privacy,
    updated_at = v_updated_at
  WHERE id = p_person_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found or has been deleted' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT p_person_id AS person_id, v_updated_at AS updated_at;
END;
$$;

COMMENT ON FUNCTION public.update_person_privacy_settings(UUID, public.privacy_level, public.privacy_level, public.privacy_level) IS
  'SECURITY DEFINER RPC allowing authorized Mukhi/Admin to update privacy settings. Returns minimal metadata only.';

REVOKE ALL ON FUNCTION public.update_person_privacy_settings(UUID, public.privacy_level, public.privacy_level, public.privacy_level) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_person_privacy_settings(UUID, public.privacy_level, public.privacy_level, public.privacy_level) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. RPC: public.get_my_linked_person
-- -----------------------------------------------------------------------------
-- Allows an authenticated user to fetch their own linked census record
-- via community_persons without requiring direct SELECT grant on persons.user_id.

CREATE OR REPLACE FUNCTION public.get_my_linked_person()
RETURNS SETOF public.community_persons
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cp.*
  FROM public.community_persons cp
  JOIN public.persons p ON p.id = cp.id
  WHERE p.user_id = auth.uid()
    AND p.deleted_at IS NULL
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_my_linked_person() IS
  'SECURITY DEFINER RPC allowing authenticated user to retrieve their own linked person record safely.';

REVOKE ALL ON FUNCTION public.get_my_linked_person() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_linked_person() TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. Redefine Legacy RPC: public.admin_set_person_privacy (Harden Return Contract)
-- -----------------------------------------------------------------------------
-- Legacy RPC redefined to return minimal metadata only, ensuring no complete
-- public.persons row or protected columns are returned to callers.
-- PostgreSQL requires dropping the existing function when changing its return type.

DROP FUNCTION public.admin_set_person_privacy(
  UUID,
  public.privacy_level,
  public.privacy_level,
  public.privacy_level
);

CREATE FUNCTION public.admin_set_person_privacy(
  p_person_id UUID,
  p_profile_privacy public.privacy_level,
  p_contact_privacy public.privacy_level,
  p_dob_privacy public.privacy_level
)
RETURNS TABLE (
  person_id UUID,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_at TIMESTAMPTZ;
BEGIN
  IF NOT public.can_manage_privacy_settings() THEN
    RAISE EXCEPTION 'Unauthorized: Normal users cannot modify privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
      USING ERRCODE = '42501';
  END IF;

  v_updated_at := NOW();

  UPDATE public.persons
  SET
    profile_privacy = p_profile_privacy,
    contact_privacy = p_contact_privacy,
    dob_privacy = p_dob_privacy,
    updated_at = v_updated_at
  WHERE id = p_person_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found or has been deleted' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT p_person_id AS person_id, v_updated_at AS updated_at;
END;
$$;

COMMENT ON FUNCTION public.admin_set_person_privacy(UUID, public.privacy_level, public.privacy_level, public.privacy_level) IS
  'SECURITY DEFINER RPC allowing authorized Mukhi/Admin to update privacy settings. Returns minimal metadata only.';

REVOKE ALL ON FUNCTION public.admin_set_person_privacy(UUID, public.privacy_level, public.privacy_level, public.privacy_level) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_person_privacy(UUID, public.privacy_level, public.privacy_level, public.privacy_level) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10. Notify PostgREST schema cache
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;




-- =============================================================================
-- >>> MIGRATION FILE: 20261103200000_remove_gallery_albums.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261103200000_remove_gallery_albums.sql
-- Purpose:   Complete teardown of deprecated Family Media, Albums, and Stories.
--
-- STRICT TOPOLOGICAL DEPENDENCY DROP ORDER:
--   1. Drop storage.objects RLS policies referencing family media helper functions.
--   2. Explicitly drop all table RLS policies on media tables.
--   3. Explicitly drop all named table triggers on owning tables.
--   4. Explicitly drop circular foreign key constraints (family_albums <-> family_media).
--   5. Drop tables in safe dependency order (family_stories -> family_media -> family_albums)
--      WITHOUT blanket CASCADE.
--   6. Drop all media-related RPC functions (including register_family_media which
--      depends on public.family_media_type).
--   7. Drop all trigger functions and guard functions (using actual historical names).
--      NOTE: Shared public.handle_updated_at() is PRESERVED.
--   8. Drop authorization helper functions.
--   9. Drop the domain enum (public.family_media_type).
--  10. Operational note on Supabase Storage cleanup (emptyBucket / deleteBucket).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Storage RLS Policies (Must drop before helper functions are removed)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_media_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "family_media_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "family_media_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "family_media_delete_policy" ON storage.objects;

-- Defensive drops for alternate naming conventions
DROP POLICY IF EXISTS "family_media_select" ON storage.objects;
DROP POLICY IF EXISTS "family_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "family_media_update" ON storage.objects;
DROP POLICY IF EXISTS "family_media_delete" ON storage.objects;

-- -----------------------------------------------------------------------------
-- 2. Explicitly Drop Table RLS Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_stories_select_policy" ON public.family_stories;
DROP POLICY IF EXISTS "family_stories_insert_policy" ON public.family_stories;
DROP POLICY IF EXISTS "family_stories_update_policy" ON public.family_stories;
DROP POLICY IF EXISTS "family_stories_delete_policy" ON public.family_stories;

DROP POLICY IF EXISTS "family_media_select_policy" ON public.family_media;
DROP POLICY IF EXISTS "family_media_insert_policy" ON public.family_media;
DROP POLICY IF EXISTS "family_media_update_policy" ON public.family_media;
DROP POLICY IF EXISTS "family_media_delete_policy" ON public.family_media;

DROP POLICY IF EXISTS "family_albums_select_policy" ON public.family_albums;
DROP POLICY IF EXISTS "family_albums_insert_policy" ON public.family_albums;
DROP POLICY IF EXISTS "family_albums_update_policy" ON public.family_albums;
DROP POLICY IF EXISTS "family_albums_delete_policy" ON public.family_albums;

-- -----------------------------------------------------------------------------
-- 3. Explicitly Drop Named Triggers on Owning Tables
-- -----------------------------------------------------------------------------
-- Triggers on public.family_stories
DROP TRIGGER IF EXISTS family_stories_handle_updated_at ON public.family_stories;
DROP TRIGGER IF EXISTS family_story_featured_media_guard ON public.family_stories;
DROP TRIGGER IF EXISTS trg_family_story_notification_events ON public.family_stories;

-- Triggers on public.family_media
DROP TRIGGER IF EXISTS family_media_handle_updated_at ON public.family_media;
DROP TRIGGER IF EXISTS family_media_album_guard ON public.family_media;
DROP TRIGGER IF EXISTS family_media_storage_path_guard ON public.family_media;
DROP TRIGGER IF EXISTS family_media_immutability_guard ON public.family_media;
DROP TRIGGER IF EXISTS trg_family_media_notification_events ON public.family_media;

-- Triggers on public.family_albums
DROP TRIGGER IF EXISTS family_albums_handle_updated_at ON public.family_albums;
DROP TRIGGER IF EXISTS family_album_immutability_guard ON public.family_albums;
DROP TRIGGER IF EXISTS family_album_cover_guard ON public.family_albums;

-- -----------------------------------------------------------------------------
-- 4. Explicitly Unlink Circular Foreign Keys
-- -----------------------------------------------------------------------------
-- family_albums.cover_media_id -> family_media.id
ALTER TABLE IF EXISTS public.family_albums
  DROP CONSTRAINT IF EXISTS family_albums_cover_media_id_fkey;

-- family_stories.featured_media_id -> family_media.id
ALTER TABLE IF EXISTS public.family_stories
  DROP CONSTRAINT IF EXISTS family_stories_featured_media_id_fkey;

-- family_media.album_id -> family_albums.id
ALTER TABLE IF EXISTS public.family_media
  DROP CONSTRAINT IF EXISTS family_media_album_id_fkey;

-- -----------------------------------------------------------------------------
-- 5. Drop Tables in Safe Dependency Order (Leaf to Root, No CASCADE)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.family_stories;
DROP TABLE IF EXISTS public.family_media;
DROP TABLE IF EXISTS public.family_albums;

-- -----------------------------------------------------------------------------
-- 6. Drop Media-Related RPC Functions
--    (Must drop register_family_media before dropping family_media_type enum)
--    Uses exact argument signatures to comply with strict PostgreSQL syntax.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_family_media(UUID, UUID, UUID, TEXT, public.family_media_type, TEXT, TEXT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.soft_delete_family_media(UUID);
DROP FUNCTION IF EXISTS public.create_family_story(UUID, TEXT, TEXT, TEXT, public.privacy_level, UUID);
DROP FUNCTION IF EXISTS public.create_family_album(UUID, TEXT, TEXT, public.privacy_level);

-- -----------------------------------------------------------------------------
-- 7. Drop Trigger Functions and Guard Functions (Using exact historical signatures)
--    NOTE: public.handle_updated_at() is a shared trigger function and is NOT dropped.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.handle_family_story_featured_media_guard();
DROP FUNCTION IF EXISTS public.handle_family_story_notification_events();

DROP FUNCTION IF EXISTS public.handle_family_media_album_guard();
DROP FUNCTION IF EXISTS public.handle_family_media_storage_path_guard();
DROP FUNCTION IF EXISTS public.handle_family_media_immutability_guard();
DROP FUNCTION IF EXISTS public.handle_family_media_notification_events();

DROP FUNCTION IF EXISTS public.handle_family_album_immutability_guard();
DROP FUNCTION IF EXISTS public.handle_family_album_cover_guard();

-- Defensive drops for naming variations (strictly zero-argument syntax)
DROP FUNCTION IF EXISTS public.family_media_validate_album();
DROP FUNCTION IF EXISTS public.family_media_validate_storage_path();
DROP FUNCTION IF EXISTS public.family_media_enforce_immutability();
DROP FUNCTION IF EXISTS public.family_album_validate_cover();
DROP FUNCTION IF EXISTS public.family_album_enforce_immutability();
DROP FUNCTION IF EXISTS public.family_story_validate_featured_media();
DROP FUNCTION IF EXISTS public.emit_family_media_notification();
DROP FUNCTION IF EXISTS public.emit_family_story_notification();

-- -----------------------------------------------------------------------------
-- 8. Drop Authorization Helper Functions (Using exact historical signatures)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.can_manage_family_media(UUID);
DROP FUNCTION IF EXISTS public.can_read_family_item(UUID, public.privacy_level);
DROP FUNCTION IF EXISTS public.can_read_family_media_object(TEXT);

-- -----------------------------------------------------------------------------
-- 9. Drop Domain Enum
-- -----------------------------------------------------------------------------
DROP TYPE IF EXISTS public.family_media_type;

-- -----------------------------------------------------------------------------
-- 10. Operational Note on Supabase Storage Bucket Cleanup
--
-- IMPORTANT ARCHITECTURAL DIRECTIVE:
-- Direct SQL deletion from storage.objects and storage.buckets is intentionally
-- omitted from this migration. Direct SQL manipulation of internal storage schema
-- tables does not trigger the Supabase Storage service to evict physical files
-- from the underlying S3/cloud storage layer.
--
-- Because all existing gallery and album uploads are disposable testing data,
-- physical file preservation is not required.
-- If complete removal of the 'family-media' bucket is desired in the target
-- environment, operators must empty and delete the bucket through the Supabase
-- Storage Management API or the Supabase Dashboard prior to (or following)
-- executing this SQL migration:
--
--   // Supabase Storage API (Node.js / Admin script with service_role):
--   await supabase.storage.emptyBucket('family-media');
--   await supabase.storage.deleteBucket('family-media');
--
-- The 'avatars' bucket, its storage records, and all 'avatars_*' policies remain
-- 100% intact and unaffected.
-- -----------------------------------------------------------------------------

COMMIT;



-- =============================================================================
-- >>> MIGRATION FILE: 20261103210000_create_family_with_head_rpc.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261103210000_create_family_with_head_rpc.sql
-- Purpose:   Transactional atomic RPC for Family + Head creation.
-- Security:  SECURITY DEFINER with strict search_path, caller authentication,
--            active profile status verification (Rule A: any active authenticated user),
--            sanitized inputs, PERSON != USER adherence, strict privacy boundary
--            on existing-person selection, and zero headless family states.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_family_with_head(
  p_family_name TEXT,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_gotra TEXT DEFAULT NULL,
  p_nukh TEXT DEFAULT NULL,
  p_profile_privacy public.privacy_level DEFAULT 'PRIVATE',
  p_members_privacy public.privacy_level DEFAULT 'PRIVATE',
  -- Option B: Existing Person ID
  p_existing_person_id UUID DEFAULT NULL,
  -- Option A: New Person Details (used only if p_existing_person_id is NULL)
  p_new_person_first_name TEXT DEFAULT NULL,
  p_new_person_middle_name TEXT DEFAULT NULL,
  p_new_person_last_name TEXT DEFAULT NULL,
  p_new_person_maiden_name TEXT DEFAULT NULL,
  p_new_person_gender public.gender DEFAULT 'MALE',
  p_new_person_dob DATE DEFAULT NULL,
  p_new_person_birth_place TEXT DEFAULT NULL
)
RETURNS TABLE (
  family_id UUID,
  head_person_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_family_id UUID;
  v_head_person_id UUID;
  v_clean_fam_name TEXT;
  v_clean_first_name TEXT;
  v_clean_last_name TEXT;
BEGIN
  -- 1. Authentication & Active Status Check (Rule A: Any active authenticated user)
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: A valid session is required to create a family.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: User account is inactive, suspended, or does not exist.' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Family Name
  v_clean_fam_name := NULLIF(trim(p_family_name), '');
  IF v_clean_fam_name IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Family name is required.' USING ERRCODE = '22023';
  END IF;

  -- 3. Resolve Head Person ID (Option B: Existing vs Option A: New)
  IF p_existing_person_id IS NOT NULL THEN
    -- Verify existing person exists, is not soft-deleted, and caller has legitimate access to select them
    -- (Strict privacy boundary matching exact production RLS policies: persons_select_admin,
    --  persons_select_own, persons_select_public, persons_select_community, persons_select_connections.
    --  NOTE: Production RLS contains NO persons_select_family policy and NO unlinked creator policy.
    --  The SECURITY DEFINER RPC must strictly mirror production visibility without inventing permissions.)
    --
    -- DOMAIN INVARIANT ON DELETED_AT IS NULL FOR ALL CALLERS (INCLUDING ADMIN / MODERATORS):
    -- While administrative roles possess read access to soft-deleted records for archival audit
    -- purposes in persons_select_admin, designating a person as the HEAD of a newly created active
    -- family strictly requires an active, living census identity. A soft-deleted person cannot head an
    -- active family unit. Thus, `p.deleted_at IS NULL` is enforced across all roles without exception.
    SELECT p.id INTO v_head_person_id
    FROM public.persons p
    WHERE p.id = p_existing_person_id
      AND p.deleted_at IS NULL
      AND (
        -- 1. Administrative access (persons_select_admin: ADMIN, SUPER_ADMIN, COMMUNITY_MODERATOR)
        public.is_community_moderator()
        -- 2. Self-access (persons_select_own: caller is linked to this person record)
        OR p.user_id = v_caller_id
        -- 3. Public or Community visibility (persons_select_public and persons_select_community)
        OR (p.profile_privacy IN ('COMMUNITY', 'PUBLIC') AND p.status != 'ARCHIVED')
        -- 4. Connections visibility (persons_select_connections: requires mutual accepted connection)
        OR (
          p.profile_privacy = 'CONNECTIONS'
          AND p.user_id IS NOT NULL
          AND p.status != 'ARCHIVED'
          AND public.are_users_connected(v_caller_id, p.user_id)
        )
      );

    IF v_head_person_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: The specified person does not exist or you do not have permission to select them.' USING ERRCODE = 'P0002';
    END IF;

    -- NOTE: Invariant confirmation: If the person is already head/member in another family,
    -- ALLOW WITH CONFIRMATION. Existing family memberships remain untouched (no demotion, no transfer).
  ELSE
    -- Option A: Validate and create a new canonical census person
    v_clean_first_name := NULLIF(trim(p_new_person_first_name), '');
    v_clean_last_name := NULLIF(trim(p_new_person_last_name), '');

    IF v_clean_first_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: First name is required for new family head.' USING ERRCODE = '22023';
    END IF;
    IF v_clean_last_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Last name is required for new family head.' USING ERRCODE = '22023';
    END IF;

    -- PERSON != USER Invariant: user_id is explicitly NULL for census records created via family flow
    INSERT INTO public.persons (
      first_name,
      middle_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      birth_place,
      gotra,
      nukh,
      profile_privacy,
      contact_privacy,
      dob_privacy,
      created_by,
      user_id
    )
    VALUES (
      v_clean_first_name,
      NULLIF(trim(p_new_person_middle_name), ''),
      v_clean_last_name,
      NULLIF(trim(p_new_person_maiden_name), ''),
      COALESCE(p_new_person_gender, 'MALE'::public.gender),
      p_new_person_dob,
      NULLIF(trim(p_new_person_birth_place), ''),
      NULLIF(trim(p_gotra), ''),
      NULLIF(trim(p_nukh), ''),
      'PRIVATE',
      'PRIVATE',
      'PRIVATE',
      v_caller_id,
      NULL -- Strict census separation
    )
    RETURNING id INTO v_head_person_id;
  END IF;

  -- 4. Insert Family Record
  INSERT INTO public.families (
    family_name,
    description,
    city,
    state,
    country,
    gotra,
    nukh,
    profile_privacy,
    members_privacy,
    created_by
  )
  VALUES (
    v_clean_fam_name,
    NULLIF(trim(p_description), ''),
    NULLIF(trim(p_city), ''),
    NULLIF(trim(p_state), ''),
    NULLIF(trim(p_country), ''),
    NULLIF(trim(p_gotra), ''),
    NULLIF(trim(p_nukh), ''),
    COALESCE(p_profile_privacy, 'PRIVATE'),
    COALESCE(p_members_privacy, 'PRIVATE'),
    v_caller_id
  )
  RETURNING id INTO v_family_id;

  -- 5. Insert Family Head Member Record (Exactly one initial head enforced by partial unique index)
  INSERT INTO public.family_members (
    family_id,
    person_id,
    role,
    is_head,
    added_by
  )
  VALUES (
    v_family_id,
    v_head_person_id,
    'HEAD'::public.family_role,
    TRUE,
    v_caller_id
  );

  -- 6. Return Identifiers (No PII / personal data exposed)
  family_id := v_family_id;
  head_person_id := v_head_person_id;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.create_family_with_head(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  public.privacy_level, public.privacy_level,
  UUID, TEXT, TEXT, TEXT, TEXT, public.gender, DATE, TEXT
) IS
  'Atomically creates a family record and links its designated head in a single transaction, preventing headless families.';

-- Explicitly revoke from PUBLIC and anon; grant exclusively to authenticated
REVOKE ALL ON FUNCTION public.create_family_with_head(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.privacy_level, public.privacy_level, UUID, TEXT, TEXT, TEXT, TEXT, public.gender, DATE, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_family_with_head(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.privacy_level, public.privacy_level, UUID, TEXT, TEXT, TEXT, TEXT, public.gender, DATE, TEXT
) TO authenticated;

COMMIT;



-- =============================================================================
-- >>> MIGRATION FILE: 20261103220000_create_gotra_nukh_master_registry.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261103220000_create_gotra_nukh_master_registry.sql
-- Purpose:   Master Gotra & Nukh tables, case-insensitive uniqueness indexes,
--            seed data (authoritative 29 Gotras & Nukhs), integrity triggers,
--            restricted administrative RLS policies, pre-existing data validation,
--            and database-level canonicalization & validation triggers on persons and families.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Gotra Registry Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gotras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness index on Gotra name
CREATE UNIQUE INDEX IF NOT EXISTS idx_gotras_name_lower_unique ON public.gotras (lower(name));

-- -----------------------------------------------------------------------------
-- 2. Nukh Registry Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nukhs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gotra_id UUID NOT NULL REFERENCES public.gotras(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness index on (gotra_id, lower(name))
CREATE UNIQUE INDEX IF NOT EXISTS idx_nukhs_gotra_name_lower_unique ON public.nukhs (gotra_id, lower(name));

-- -----------------------------------------------------------------------------
-- 3. Row Level Security & Access Control
-- -----------------------------------------------------------------------------
ALTER TABLE public.gotras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nukhs ENABLE ROW LEVEL SECURITY;

-- Revoke default public and anon privileges
REVOKE ALL ON TABLE public.gotras, public.nukhs FROM PUBLIC, anon;

-- Public / Authenticated read-only access (master catalog is visible to all community users)
DROP POLICY IF EXISTS gotras_select_policy ON public.gotras;
CREATE POLICY gotras_select_policy ON public.gotras
  FOR SELECT USING (true);

DROP POLICY IF EXISTS nukhs_select_policy ON public.nukhs;
CREATE POLICY nukhs_select_policy ON public.nukhs
  FOR SELECT USING (true);

-- Restrictive Administrative Mutation Policies (Only active ADMIN or SUPER_ADMIN via public.is_admin())
DROP POLICY IF EXISTS gotras_admin_insert ON public.gotras;
CREATE POLICY gotras_admin_insert ON public.gotras
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS gotras_admin_update ON public.gotras;
CREATE POLICY gotras_admin_update ON public.gotras
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS gotras_admin_delete ON public.gotras;
CREATE POLICY gotras_admin_delete ON public.gotras
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS nukhs_admin_insert ON public.nukhs;
CREATE POLICY nukhs_admin_insert ON public.nukhs
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS nukhs_admin_update ON public.nukhs;
CREATE POLICY nukhs_admin_update ON public.nukhs
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS nukhs_admin_delete ON public.nukhs;
CREATE POLICY nukhs_admin_delete ON public.nukhs
  FOR DELETE USING (public.is_admin());

-- Explicit grants: SELECT for client roles; mutations guarded by RLS
GRANT SELECT ON TABLE public.gotras, public.nukhs TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.gotras, public.nukhs TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Integrity Guard Triggers (Prevent deleting, renaming, or reassigning active entries)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_gotra_master_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND lower(NEW.name) != lower(OLD.name)) THEN
    IF EXISTS (
      SELECT 1 FROM public.persons WHERE lower(gotra) = lower(OLD.name)
    ) OR EXISTS (
      SELECT 1 FROM public.families WHERE lower(gotra) = lower(OLD.name)
    ) THEN
      RAISE EXCEPTION 'RESTRICT: Cannot delete or rename Gotra "%" because active community records reference it.', OLD.name USING ERRCODE = '23001';
    END IF;
  END IF;

  -- For BEFORE DELETE triggers, return OLD to allow row removal.
  -- Returning NEW (which is NULL on DELETE) silences/suppresses deletion.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_gotra_master_integrity ON public.gotras;
CREATE TRIGGER trg_guard_gotra_master_integrity
  BEFORE UPDATE OF name OR DELETE ON public.gotras
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_gotra_master_integrity();

CREATE OR REPLACE FUNCTION public.guard_nukh_master_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_gotra_name TEXT;
BEGIN
  -- Retrieve Gotra name for OLD.gotra_id to scope check specifically to this Gotra+Nukh pair
  SELECT name INTO v_old_gotra_name FROM public.gotras WHERE id = OLD.gotra_id;

  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE' AND (lower(NEW.name) != lower(OLD.name) OR NEW.gotra_id != OLD.gotra_id)) THEN

    IF EXISTS (
      SELECT 1 FROM public.persons
      WHERE lower(gotra) = lower(v_old_gotra_name)
        AND lower(nukh) = lower(OLD.name)
    ) OR EXISTS (
      SELECT 1 FROM public.families
      WHERE lower(gotra) = lower(v_old_gotra_name)
        AND lower(nukh) = lower(OLD.name)
    ) THEN
      RAISE EXCEPTION 'RESTRICT: Cannot delete, rename, or reassign Nukh "%" in Gotra "%" because active community records reference this association.', OLD.name, v_old_gotra_name USING ERRCODE = '23001';
    END IF;
  END IF;

  -- For BEFORE DELETE triggers, return OLD to allow row removal.
  -- Returning NEW (which is NULL on DELETE) silences/suppresses deletion.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_nukh_master_integrity ON public.nukhs;
CREATE TRIGGER trg_guard_nukh_master_integrity
  BEFORE UPDATE OF name, gotra_id OR DELETE ON public.nukhs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_nukh_master_integrity();

-- -----------------------------------------------------------------------------
-- 5. Gotra and Nukh columns on persons and families
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS gotra TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS nukh TEXT;

ALTER TABLE public.families ADD COLUMN IF NOT EXISTS gotra TEXT;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS nukh TEXT;

-- -----------------------------------------------------------------------------
-- 6. Seed Data: Authoritative 29 Gotras and Dependent Nukhs
--    Uses ON CONFLICT ((lower(name))) and ON CONFLICT (gotra_id, (lower(name)))
--    ensuring complete idempotency while restoring exact canonical casing on reruns.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_gid UUID;
  v_nukh TEXT;
BEGIN
  FOR r IN
    SELECT g.name AS g_name, g.disp_order, g.nukhs
    FROM (VALUES
      ('Agastya', 1, ARRAY['Agasti', 'Dixit', 'Pandya', 'Pathak']),
      ('Alambayan', 2, ARRAY['Alamb', 'Bhatt', 'Rawal']),
      ('Angiras', 3, ARRAY['Angira', 'Brihaspati', 'Dave', 'Sharma']),
      ('Atri', 4, ARRAY['Atre', 'Bhatt', 'Joshi', 'Sukla']),
      ('Audala', 5, ARRAY['Audichya', 'Dholakia', 'Trivedi']),
      ('Bharadwaj', 6, ARRAY['Bharadwaj', 'Dwivedi', 'Kapadia', 'Pattani', 'Tripathi', 'Upadhyaya']),
      ('Bhrigu', 7, ARRAY['Bhargav', 'Bhrigu', 'Chhaya', 'Shukla']),
      ('Dhananjaya', 8, ARRAY['Arjuna', 'Dhanani', 'Parikh']),
      ('Garg', 9, ARRAY['Garga', 'Gargya', 'Jani', 'Pandya']),
      ('Garga', 10, ARRAY['Garg', 'Gargeya', 'Upadhyaya']),
      ('Gautam', 11, ARRAY['Chauhan', 'Gautam', 'Panchal', 'Rathod', 'Solanki']),
      ('Harita', 12, ARRAY['Harit', 'Haritasya', 'Vyas']),
      ('Jamadagni', 13, ARRAY['Jamadagni', 'Mankad', 'Mehta']),
      ('Kanva', 14, ARRAY['Kanva', 'Kashyap', 'Thakar']),
      ('Kapil', 15, ARRAY['Kapila', 'Munshi', 'Trivedi']),
      ('Kashyap', 16, ARRAY['Aditya', 'Chauhan', 'Dholakia', 'Kashyap', 'Khatri', 'Naik', 'Parekh', 'Solanki', 'Varun']),
      ('Katyayan', 17, ARRAY['Katya', 'Katyayan', 'Mehta']),
      ('Kaundinya', 18, ARRAY['Kaundinya', 'Majmudar', 'Pathak']),
      ('Kaushik', 19, ARRAY['Gadhavi', 'Kaushik', 'Viswamitra']),
      ('Mudgala', 20, ARRAY['Modh', 'Mudgal', 'Pujara']),
      ('Parashar', 21, ARRAY['Parashar', 'Parasharya', 'Shastri']),
      ('Rohit', 22, ARRAY['Rohita', 'Surti', 'Vyas']),
      ('Sankriti', 23, ARRAY['Sankrit', 'Vaidya']),
      ('Shandilya', 24, ARRAY['Mehta', 'Nanavati', 'Pandit', 'Shandilya', 'Shukla']),
      ('Shaunak', 25, ARRAY['Shaunaka', 'Thaker', 'Vyas']),
      ('Sudarshan', 26, ARRAY['Keria', 'Khatri', 'Mulchandani', 'Sudarshan', 'Vaswani']),
      ('Upamanyu', 27, ARRAY['Upamanyu', 'Upadhyay']),
      ('Vashistha', 28, ARRAY['Solanki', 'Vashisth', 'Vashistha']),
      ('Vatsa', 29, ARRAY['Bakshi', 'Munshi', 'Vats', 'Vatsa'])
    ) AS g(name, disp_order, nukhs)
  LOOP
    -- 1. Insert or update Gotra targeting lower(name) unique index, restoring canonical casing
    INSERT INTO public.gotras (name, display_order)
    VALUES (r.g_name, r.disp_order)
    ON CONFLICT ((lower(name))) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order;

    -- 2. Case-insensitively resolve the canonical Gotra ID (never NULL)
    SELECT id INTO v_gid
    FROM public.gotras
    WHERE lower(name) = lower(r.g_name);

    IF v_gid IS NULL THEN
      RAISE EXCEPTION 'CRITICAL: Failed to retrieve canonical Gotra ID for "%"', r.g_name;
    END IF;

    -- 3. Insert Nukhs targeting (gotra_id, lower(name)) unique index, restoring canonical casing
    FOREACH v_nukh IN ARRAY r.nukhs
    LOOP
      INSERT INTO public.nukhs (gotra_id, name)
      VALUES (v_gid, v_nukh)
      ON CONFLICT (gotra_id, (lower(name))) DO UPDATE
      SET name = EXCLUDED.name;
    END LOOP;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Existing Data Inspection & Canonicalization
--    Validates existing non-null records against master registry.
--    Aborts immediately with a detailed list if invalid or ambiguous records exist.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_unmatched_persons TEXT;
  v_unmatched_families TEXT;
BEGIN
  -- 0. Normalize empty or whitespace-only Gotra and Nukh values to NULL in existing records
  UPDATE public.persons
  SET gotra = NULL
  WHERE gotra IS NOT NULL AND trim(gotra) = '';

  UPDATE public.persons
  SET nukh = NULL
  WHERE nukh IS NOT NULL AND trim(nukh) = '';

  UPDATE public.families
  SET gotra = NULL
  WHERE gotra IS NOT NULL AND trim(gotra) = '';

  UPDATE public.families
  SET nukh = NULL
  WHERE nukh IS NOT NULL AND trim(nukh) = '';

  -- Also trim leading/trailing whitespace on populated entries
  UPDATE public.persons
  SET gotra = trim(gotra)
  WHERE gotra IS NOT NULL AND gotra != trim(gotra);

  UPDATE public.persons
  SET nukh = trim(nukh)
  WHERE nukh IS NOT NULL AND nukh != trim(nukh);

  UPDATE public.families
  SET gotra = trim(gotra)
  WHERE gotra IS NOT NULL AND gotra != trim(gotra);

  UPDATE public.families
  SET nukh = trim(nukh)
  WHERE nukh IS NOT NULL AND nukh != trim(nukh);

  -- 1. Canonicalize existing Gotras in persons using case-insensitive match
  UPDATE public.persons p
  SET gotra = g.name
  FROM public.gotras g
  WHERE p.gotra IS NOT NULL
    AND lower(trim(p.gotra)) = lower(g.name)
    AND p.gotra != g.name;

  -- 2. Canonicalize existing Nukhs in persons using case-insensitive match scoped to their Gotra
  UPDATE public.persons p
  SET nukh = n.name
  FROM public.gotras g
  JOIN public.nukhs n ON n.gotra_id = g.id
  WHERE p.gotra IS NOT NULL
    AND p.nukh IS NOT NULL
    AND lower(trim(p.gotra)) = lower(g.name)
    AND lower(trim(p.nukh)) = lower(n.name)
    AND p.nukh != n.name;

  -- 3. Canonicalize existing Gotras in families
  UPDATE public.families f
  SET gotra = g.name
  FROM public.gotras g
  WHERE f.gotra IS NOT NULL
    AND lower(trim(f.gotra)) = lower(g.name)
    AND f.gotra != g.name;

  -- 4. Canonicalize existing Nukhs in families
  UPDATE public.families f
  SET nukh = n.name
  FROM public.gotras g
  JOIN public.nukhs n ON n.gotra_id = g.id
  WHERE f.gotra IS NOT NULL
    AND f.nukh IS NOT NULL
    AND lower(trim(f.gotra)) = lower(g.name)
    AND lower(trim(f.nukh)) = lower(n.name)
    AND f.nukh != n.name;

  -- 5. Inspect for any remaining invalid or unmatched Gotra/Nukh values in persons
  SELECT string_agg(
    'Person ID ' || p.id || ': Gotra="' || COALESCE(p.gotra, 'NULL') || '", Nukh="' || COALESCE(p.nukh, 'NULL') || '"',
    E'\n'
  )
  INTO v_unmatched_persons
  FROM public.persons p
  WHERE (p.gotra IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.gotras g WHERE lower(g.name) = lower(trim(p.gotra))
  )) OR (p.nukh IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.gotras g
    JOIN public.nukhs n ON n.gotra_id = g.id
    WHERE lower(g.name) = lower(trim(p.gotra))
      AND lower(n.name) = lower(trim(p.nukh))
  ));

  IF v_unmatched_persons IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Found existing persons with invalid or unmatched Gotra/Nukh records:%',
      E'\n' || v_unmatched_persons
      USING ERRCODE = '22023';
  END IF;

  -- 6. Inspect for any remaining invalid or unmatched Gotra/Nukh values in families
  SELECT string_agg(
    'Family ID ' || f.id || ': Gotra="' || COALESCE(f.gotra, 'NULL') || '", Nukh="' || COALESCE(f.nukh, 'NULL') || '"',
    E'\n'
  )
  INTO v_unmatched_families
  FROM public.families f
  WHERE (f.gotra IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.gotras g WHERE lower(g.name) = lower(trim(f.gotra))
  )) OR (f.nukh IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.gotras g
    JOIN public.nukhs n ON n.gotra_id = g.id
    WHERE lower(g.name) = lower(trim(f.gotra))
      AND lower(n.name) = lower(trim(f.nukh))
  ));

  IF v_unmatched_families IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Found existing families with invalid or unmatched Gotra/Nukh records:%',
      E'\n' || v_unmatched_families
      USING ERRCODE = '22023';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 8. Database-Level Canonicalization & Validation Trigger Function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_gotra_nukh()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gotra_id UUID;
  v_canonical_gotra TEXT;
  v_canonical_nukh TEXT;
BEGIN
  -- Normalize empty strings to NULL
  NEW.gotra := NULLIF(trim(NEW.gotra), '');
  NEW.nukh := NULLIF(trim(NEW.nukh), '');

  -- If both are NULL, allow
  IF NEW.gotra IS NULL AND NEW.nukh IS NULL THEN
    RETURN NEW;
  END IF;

  -- If Nukh is provided without Gotra, reject
  IF NEW.gotra IS NULL AND NEW.nukh IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_GOTRA_NUKH: Nukh cannot be specified without a valid Gotra.' USING ERRCODE = '22023';
  END IF;

  -- Validate Gotra exists in public.gotras and fetch canonical master spelling
  SELECT id, name INTO v_gotra_id, v_canonical_gotra
  FROM public.gotras
  WHERE lower(name) = lower(NEW.gotra);

  IF v_gotra_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_GOTRA_NUKH: "%" is not a registered Gotra.', NEW.gotra USING ERRCODE = '22023';
  END IF;

  -- Canonicalize stored Gotra spelling from master table
  NEW.gotra := v_canonical_gotra;

  -- If Nukh is provided, validate it belongs to that Gotra and canonicalize stored Nukh spelling
  IF NEW.nukh IS NOT NULL THEN
    SELECT name INTO v_canonical_nukh
    FROM public.nukhs
    WHERE gotra_id = v_gotra_id AND lower(name) = lower(NEW.nukh);

    IF v_canonical_nukh IS NULL THEN
      RAISE EXCEPTION 'INVALID_GOTRA_NUKH: Nukh "%" does not belong to Gotra "%".', NEW.nukh, v_canonical_gotra USING ERRCODE = '22023';
    END IF;

    -- Canonicalize stored Nukh spelling from master table
    NEW.nukh := v_canonical_nukh;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_gotra_nukh() IS
  'Guarantees database-level master data integrity and canonical casing for Gotra and Nukh across persons and families.';

-- Attach triggers to persons and families
DROP TRIGGER IF EXISTS trg_validate_person_gotra_nukh ON public.persons;
CREATE TRIGGER trg_validate_person_gotra_nukh
  BEFORE INSERT OR UPDATE OF gotra, nukh ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_gotra_nukh();

DROP TRIGGER IF EXISTS trg_validate_family_gotra_nukh ON public.families;
CREATE TRIGGER trg_validate_family_gotra_nukh
  BEFORE INSERT OR UPDATE OF gotra, nukh ON public.families
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_gotra_nukh();

COMMIT;



-- =============================================================================
-- >>> MIGRATION FILE: 20261104120000_fix_family_creation_gotra_nukh_and_cities.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261104120000_fix_family_creation_gotra_nukh_and_cities.sql
-- Purpose:
--   1. Create public.cities table with case-insensitive uniqueness and RLS
--   2. Update public.gotras and public.nukhs with the authoritative 29 Brahm Kshatriya Gotra entries from PDF
--   3. Add RLS policies for family creator on family_members and persons so creators can view their family & members
--   4. Update create_family_with_head RPC with COMMUNITY default privacy and zero Mukhi role confusion
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Cities Registry Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cities_unique_norm
  ON public.cities (lower(trim(name)), lower(trim(state)), lower(trim(country)));

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cities_select_all ON public.cities;
CREATE POLICY cities_select_all ON public.cities
  FOR SELECT USING (true);

DROP POLICY IF EXISTS cities_insert_authenticated ON public.cities;
CREATE POLICY cities_insert_authenticated ON public.cities
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

GRANT SELECT ON TABLE public.cities TO authenticated, anon;
GRANT INSERT ON TABLE public.cities TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Creator Access RLS on family_members & persons
--    Guarantees creators can always immediately view their created families & members
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_members_select_creator" ON public.family_members;
CREATE POLICY "family_members_select_creator" ON public.family_members
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
      added_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = family_members.family_id
          AND f.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "persons_select_creator" ON public.persons;
CREATE POLICY "persons_select_creator" ON public.persons
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
      created_by = auth.uid() OR
      user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.family_members fm
        JOIN public.families f ON f.id = fm.family_id
        WHERE fm.person_id = persons.id
          AND f.created_by = auth.uid()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Seed/Update Authoritative 29 Gotras and Nukhs from Brahm Kshatriya PDF
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_gid UUID;
  v_nukh TEXT;
BEGIN
  FOR r IN
    SELECT g.name AS g_name, g.disp_order, g.nukhs
    FROM (VALUES
      ('Agastya', 1, ARRAY['Arora (Arora)', 'Asalavanta (Asalavanta)', 'Gajubha', 'Tatiya']),
      ('Utri', 2, ARRAY['Asara (Asara)', 'Mamalutara', 'Dingama', 'Baval', 'Dungana']),
      ('Badarayana', 3, ARRAY['Bariya (Bungadiya)', 'Boradiya', 'Rakhuna', 'Rakhana']),
      ('Bhamaraya', 4, ARRAY['Vesamiya (Vesamiya, Bosamiya)', 'Barva', 'Papor iya', 'Parya (Padiya)']),
      ('Bharadwaj', 5, ARRAY['Bhut (Nirmal)', 'Bheva', 'Bhudda', 'Kakar (Kokil)', 'Bhedan (Bheda)', 'Bhul', 'Bhadar (Bhadar)']),
      ('Tandira', 6, ARRAY['Tadad Otha', 'Dhora', 'Ida', 'Dadiya', 'Dangana']),
      ('Parashar', 7, ARRAY['Panjabhut', 'Padhar', 'Mamata (Mamatara)', 'Bhitar Mehera']),
      ('Jamadagni', 8, ARRAY['Godhiya (Godiya)', 'Joshihaar (Joshihaar)', 'Joshihar', 'Jajal', 'Jogi', 'Jariya', 'Jagar', 'Lulla']),
      ('Dhananjaya', 9, ARRAY['Dhanga', 'Dhare', 'Dhanadiya (Dhanadiya)', 'Bara (Bada)', 'Hans Jamat (Hans Jamat)']),
      ('Darvashayana (Dayavahana)', 10, ARRAY['Dubal (Dubdan)', 'Kosara', 'Dadhara (Dadariya)', 'Dulera', 'Damariya (Damariya)', 'Dhariya', 'Gadya']),
      ('Raghuna', 11, ARRAY['Rasputara', 'Raspoda', 'Raja', 'Khara (Kharara)', 'Sasiya']),
      ('Sudarshan', 12, ARRAY['Sonisher (Soniser Soniser)', 'Sita (Sota)', 'Sodiya (Sodiya)', 'Damara (Damara)', 'Chava Jamavara']),
      ('Shandilya', 13, ARRAY['Sanicharya (Sanicharya)', 'Sonapar (Sonapar)', 'Sidhava', 'Sodhi (Sodha)']),
      ('Shankhpal', 14, ARRAY['Sorathiya', 'Soneji (Soneja)', 'Dangara (Dangara)', 'Desar', 'Gadiya']),
      ('Kashyap (Kashyapa)', 15, ARRAY['Kathambhan (Kath Vada, Kathiya)', 'Kandhara', 'Harun (Majhadiya)', 'Hanja (Hanjadiya)']),
      ('Kamuk', 16, ARRAY['Keshari', 'Kariya (Kidiya)', 'Tokala (Tikli)', 'Tangara', 'Daka']),
      ('Krishna (Shishan)', 17, ARRAY['Karatela', 'Karbaliya', 'Khubhar (Khubadiya)', 'Khuba (Khuda)', 'Khubhariya']),
      ('Karna', 18, ARRAY['Kidi (Kiri)', 'Vaniya (Vagiya)', 'Davani', 'Dand (Dandana)']),
      ('Kaushik', 19, ARRAY['Kakadya', 'Kaku (Kakava, Kakupota)', 'Kakara', 'Lakhanhar', 'Katakiya']),
      ('Gargya', 20, ARRAY['Gajkaran (Gaj Karan)', 'Gumara', 'Vankala', 'Chhuchha (Chhuchha)']),
      ('Gautam', 21, ARRAY['Shirach', 'Goratola', 'Gila', 'Madhur', 'Madhu']),
      ('Mandhata', 22, ARRAY['Mamudar', 'Mavariya (Mavarda)', 'Mavadiya (Mavadasya)', 'Mayadhak', 'Mayadhara', 'Mohanvacha']),
      ('Mudgal', 23, ARRAY['Makariya (Makadiya, Manak)', 'Makori', 'Medhiya (Medhya)', 'Mahhar', 'Ranara', 'Meher (Mera)']),
      ('Naradijana', 24, ARRAY['Nansi', 'Nemana', 'Naisar', 'Neno', 'Nan (Nayan)']),
      ('Vaman', 25, ARRAY['Vadhala', 'Davadiya', 'Dod (Doshara)', 'Dadiya']),
      ('Vamdev', 26, ARRAY['Khede (Vare)', 'Lamariya', 'Leya', 'Luladiya']),
      ('Vatsa', 27, ARRAY['Vama', 'Vajari', 'Kidi', 'Vali (Veli)', 'Chamariya']),
      ('Vashishtha', 28, ARRAY['Valin (Valara)', 'Chhapara', 'Dangana', 'Mel (Meri)', 'Jil Jhina']),
      ('Gotra not known', 29, ARRAY['Acharya', 'Pipaliya', 'Gana', 'Gondi Odha', 'Saraya', 'Harasaya', 'Chhatakpur', 'Gungava'])
    ) AS g(name, disp_order, nukhs)
  LOOP
    INSERT INTO public.gotras (name, display_order)
    VALUES (r.g_name, r.disp_order)
    ON CONFLICT ((lower(name))) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order;

    SELECT id INTO v_gid
    FROM public.gotras
    WHERE lower(name) = lower(r.g_name);

    IF v_gid IS NOT NULL THEN
      FOREACH v_nukh IN ARRAY r.nukhs
      LOOP
        INSERT INTO public.nukhs (gotra_id, name)
        VALUES (v_gid, v_nukh)
        ON CONFLICT (gotra_id, (lower(name))) DO UPDATE
        SET name = EXCLUDED.name;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Transactional create_family_with_head RPC Update
--    - COMMUNITY default privacy (ensures family census records appear in census)
--    - Family Head is linked to family_members with role='HEAD' and is_head=TRUE
--    - ZERO Mukhi role assignment (Family Head != Mukhi)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_family_with_head(
  p_family_name TEXT,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_gotra TEXT DEFAULT NULL,
  p_nukh TEXT DEFAULT NULL,
  p_profile_privacy public.privacy_level DEFAULT 'COMMUNITY',
  p_members_privacy public.privacy_level DEFAULT 'COMMUNITY',
  p_existing_person_id UUID DEFAULT NULL,
  p_new_person_first_name TEXT DEFAULT NULL,
  p_new_person_middle_name TEXT DEFAULT NULL,
  p_new_person_last_name TEXT DEFAULT NULL,
  p_new_person_maiden_name TEXT DEFAULT NULL,
  p_new_person_gender public.gender DEFAULT 'MALE',
  p_new_person_dob DATE DEFAULT NULL,
  p_new_person_birth_place TEXT DEFAULT NULL
)
RETURNS TABLE (
  family_id UUID,
  head_person_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_family_id UUID;
  v_head_person_id UUID;
  v_clean_fam_name TEXT;
  v_clean_first_name TEXT;
  v_clean_last_name TEXT;
  v_eff_privacy public.privacy_level;
BEGIN
  -- 1. Caller Authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: A valid session is required to create a family.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: User account is inactive, suspended, or does not exist.' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Family Name
  v_clean_fam_name := NULLIF(trim(p_family_name), '');
  IF v_clean_fam_name IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Family name is required.' USING ERRCODE = '22023';
  END IF;

  v_eff_privacy := COALESCE(p_profile_privacy, 'COMMUNITY'::public.privacy_level);

  -- 3. Resolve or Create Head Person
  IF p_existing_person_id IS NOT NULL THEN
    SELECT p.id INTO v_head_person_id
    FROM public.persons p
    WHERE p.id = p_existing_person_id
      AND p.deleted_at IS NULL;

    IF v_head_person_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: The specified person does not exist.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_clean_first_name := NULLIF(trim(p_new_person_first_name), '');
    v_clean_last_name := NULLIF(trim(p_new_person_last_name), '');

    IF v_clean_first_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: First name is required for new family head.' USING ERRCODE = '22023';
    END IF;
    IF v_clean_last_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Last name is required for new family head.' USING ERRCODE = '22023';
    END IF;

    -- PERSON != USER Invariant: user_id is explicitly NULL for census records
    INSERT INTO public.persons (
      first_name,
      middle_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      birth_place,
      gotra,
      nukh,
      profile_privacy,
      contact_privacy,
      dob_privacy,
      created_by,
      user_id
    )
    VALUES (
      v_clean_first_name,
      NULLIF(trim(p_new_person_middle_name), ''),
      v_clean_last_name,
      NULLIF(trim(p_new_person_maiden_name), ''),
      COALESCE(p_new_person_gender, 'MALE'::public.gender),
      p_new_person_dob,
      COALESCE(NULLIF(trim(p_new_person_birth_place), ''), NULLIF(trim(p_city), '')),
      NULLIF(trim(p_gotra), ''),
      NULLIF(trim(p_nukh), ''),
      v_eff_privacy,
      'PRIVATE',
      'PRIVATE',
      v_caller_id,
      NULL
    )
    RETURNING id INTO v_head_person_id;
  END IF;

  -- 4. Insert Family Record
  INSERT INTO public.families (
    family_name,
    description,
    city,
    state,
    country,
    gotra,
    nukh,
    profile_privacy,
    members_privacy,
    created_by,
    manager_user_id
  )
  VALUES (
    v_clean_fam_name,
    NULLIF(trim(p_description), ''),
    NULLIF(trim(p_city), ''),
    NULLIF(trim(p_state), ''),
    COALESCE(NULLIF(trim(p_country), ''), 'India'),
    NULLIF(trim(p_gotra), ''),
    NULLIF(trim(p_nukh), ''),
    v_eff_privacy,
    COALESCE(p_members_privacy, v_eff_privacy),
    v_caller_id,
    v_caller_id
  )
  RETURNING id INTO v_family_id;

  -- 5. Insert Family Head Member Record (Head of household strictly, NEVER Mukhi)
  INSERT INTO public.family_members (
    family_id,
    person_id,
    role,
    is_head,
    added_by
  )
  VALUES (
    v_family_id,
    v_head_person_id,
    'HEAD'::public.family_role,
    TRUE,
    v_caller_id
  );

  family_id := v_family_id;
  head_person_id := v_head_person_id;
  RETURN NEXT;
END;
$$;

COMMIT;



-- =============================================================================
-- >>> MIGRATION FILE: 20261105123000_fix_persons_family_members_rls_recursion.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261105123000_fix_persons_family_members_rls_recursion.sql
-- Purpose:
--   1. Fix mutual RLS recursion between public.persons and public.family_members
--   2. Reset and seed master public.gotras and public.nukhs to exactly match the
--      authoritative 29 Brahm Kshatriya Gotras and 147 Nukhs from the PDF.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER Authorization Helpers to Break RLS Mutual Recursion
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_own_person(p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.persons
    WHERE id = p_person_id
      AND user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_own_person(UUID) IS
  'SECURITY DEFINER helper: checks if person record belongs to auth.uid() without triggering RLS recursion.';

CREATE OR REPLACE FUNCTION public.is_person_in_my_created_family(p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    WHERE fm.person_id = p_person_id
      AND f.created_by = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_person_in_my_created_family(UUID) IS
  'SECURITY DEFINER helper: checks if person is in a family created by auth.uid() without triggering RLS recursion.';

-- -----------------------------------------------------------------------------
-- 2. Update Policies on family_members & persons
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "family_members_select_own" ON public.family_members;
CREATE POLICY "family_members_select_own"
  ON public.family_members
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND public.is_own_person(family_members.person_id)
  );

DROP POLICY IF EXISTS "persons_select_creator" ON public.persons;
CREATE POLICY "persons_select_creator"
  ON public.persons
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      created_by = auth.uid() OR
      user_id = auth.uid() OR
      public.is_person_in_my_created_family(persons.id)
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Reset and Populate Authoritative 29 Brahm Kshatriya Gotras & 147 Nukhs
-- -----------------------------------------------------------------------------

-- Temporarily drop or update foreign keys if needed
DELETE FROM public.nukhs;
DELETE FROM public.gotras;

DO $$
DECLARE
  r RECORD;
  v_gid UUID;
  v_nukh TEXT;
BEGIN
  FOR r IN
    SELECT g.name AS g_name, g.disp_order, g.nukhs
    FROM (VALUES
      ('Agastya', 1, ARRAY['Arora (Arora)', 'Asalavanta (Asalavanta)', 'Gajubha', 'Tatiya']),
      ('Utri', 2, ARRAY['Asara (Asara)', 'Mamalutara', 'Dingama', 'Baval', 'Dungana']),
      ('Badarayana', 3, ARRAY['Bariya (Bungadiya)', 'Boradiya', 'Rakhuna', 'Rakhana']),
      ('Bhamaraya', 4, ARRAY['Vesamiya (Vesamiya, Bosamiya)', 'Barva', 'Papor iya', 'Parya (Padiya)']),
      ('Bharadwaj', 5, ARRAY['Bhut (Nirmal)', 'Bheva', 'Bhudda', 'Kakar (Kokil)', 'Bhedan (Bheda)', 'Bhul', 'Bhadar (Bhadar)']),
      ('Tandira', 6, ARRAY['Tadad Otha', 'Dhora', 'Ida', 'Dadiya', 'Dangana']),
      ('Parashar', 7, ARRAY['Panjabhut', 'Padhar', 'Mamata (Mamatara)', 'Bhitar Mehera']),
      ('Jamadagni', 8, ARRAY['Godhiya (Godiya)', 'Joshihaar (Joshihaar)', 'Joshihar', 'Jajal', 'Jogi', 'Jariya', 'Jagar', 'Lulla']),
      ('Dhananjaya', 9, ARRAY['Dhanga', 'Dhare', 'Dhanadiya (Dhanadiya)', 'Bara (Bada)', 'Hans Jamat (Hans Jamat)']),
      ('Darvashayana (Dayavahana)', 10, ARRAY['Dubal (Dubdan)', 'Kosara', 'Dadhara (Dadariya)', 'Dulera', 'Damariya (Damariya)', 'Dhariya', 'Gadya']),
      ('Raghuna', 11, ARRAY['Rasputara', 'Raspoda', 'Raja', 'Khara (Kharara)', 'Sasiya']),
      ('Sudarshan', 12, ARRAY['Sonisher (Soniser Soniser)', 'Sita (Sota)', 'Sodiya (Sodiya)', 'Damara (Damara)', 'Chava Jamavara']),
      ('Shandilya', 13, ARRAY['Sanicharya (Sanicharya)', 'Sonapar (Sonapar)', 'Sidhava', 'Sodhi (Sodha)']),
      ('Shankhpal', 14, ARRAY['Sorathiya', 'Soneji (Soneja)', 'Dangara (Dangara)', 'Desar', 'Gadiya']),
      ('Kashyap (Kashyapa)', 15, ARRAY['Kathambhan (Kath Vada, Kathiya)', 'Kandhara', 'Harun (Majhadiya)', 'Hanja (Hanjadiya)']),
      ('Kamuk', 16, ARRAY['Keshari', 'Kariya (Kidiya)', 'Tokala (Tikli)', 'Tangara', 'Daka']),
      ('Krishna (Shishan)', 17, ARRAY['Karatela', 'Karbaliya', 'Khubhar (Khubadiya)', 'Khuba (Khuda)', 'Khubhariya']),
      ('Karna', 18, ARRAY['Kidi (Kiri)', 'Vaniya (Vagiya)', 'Davani', 'Dand (Dandana)']),
      ('Kaushik', 19, ARRAY['Kakadya', 'Kaku (Kakava, Kakupota)', 'Kakara', 'Lakhanhar', 'Katakiya']),
      ('Gargya', 20, ARRAY['Gajkaran (Gaj Karan)', 'Gumara', 'Vankala', 'Chhuchha (Chhuchha)']),
      ('Gautam', 21, ARRAY['Shirach', 'Goratola', 'Gila', 'Madhur', 'Madhu']),
      ('Mandhata', 22, ARRAY['Mamudar', 'Mavariya (Mavarda)', 'Mavadiya (Mavadasya)', 'Mayadhak', 'Mayadhara', 'Mohanvacha']),
      ('Mudgal', 23, ARRAY['Makariya (Makadiya, Manak)', 'Makori', 'Medhiya (Medhya)', 'Mahhar', 'Ranara', 'Meher (Mera)']),
      ('Naradijana', 24, ARRAY['Nansi', 'Nemana', 'Naisar', 'Neno', 'Nan (Nayan)']),
      ('Vaman', 25, ARRAY['Vadhala', 'Davadiya', 'Dod (Doshara)', 'Dadiya']),
      ('Vamdev', 26, ARRAY['Khede (Vare)', 'Lamariya', 'Leya', 'Luladiya']),
      ('Vatsa', 27, ARRAY['Vama', 'Vajari', 'Kidi', 'Vali (Veli)', 'Chamariya']),
      ('Vashishtha', 28, ARRAY['Valin (Valara)', 'Chhapara', 'Dangana', 'Mel (Meri)', 'Jil Jhina']),
      ('Gotra not known', 29, ARRAY['Acharya', 'Pipaliya', 'Gana', 'Gondi Odha', 'Saraya', 'Harasaya', 'Chhatakpur', 'Gungava'])
    ) AS g(name, disp_order, nukhs)
  LOOP
    INSERT INTO public.gotras (name, display_order)
    VALUES (r.g_name, r.disp_order)
    RETURNING id INTO v_gid;

    FOREACH v_nukh IN ARRAY r.nukhs
    LOOP
      INSERT INTO public.nukhs (gotra_id, name)
      VALUES (v_gid, v_nukh);
    END LOOP;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Grants on Core Tables
-- -----------------------------------------------------------------------------
GRANT SELECT ON TABLE public.persons TO anon, authenticated;
GRANT SELECT ON TABLE public.families TO anon, authenticated;
GRANT SELECT ON TABLE public.family_members TO anon, authenticated;
GRANT SELECT ON TABLE public.relationships TO anon, authenticated;
GRANT SELECT ON TABLE public.gotras TO anon, authenticated;
GRANT SELECT ON TABLE public.nukhs TO anon, authenticated;
GRANT SELECT ON TABLE public.cities TO anon, authenticated;

COMMIT;


-- =============================================================================
-- >>> MIGRATION FILE: 20261105140000_fix_database_grants_and_permissions.sql <<<
-- =============================================================================

BEGIN;

-- are_users_connected: internally returns FALSE for unauthenticated callers safely
GRANT EXECUTE ON FUNCTION public.are_users_connected(UUID, UUID) TO authenticated, anon;

-- is_own_person & is_person_in_my_created_family: SECURITY DEFINER helpers
GRANT EXECUTE ON FUNCTION public.is_own_person(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_person_in_my_created_family(UUID) TO authenticated, anon;

-- Role and moderation helpers
GRANT EXECUTE ON FUNCTION public.is_community_moderator() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_privacy_settings() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.validate_gotra_nukh() TO authenticated, anon;

-- Ensure RLS is active on all core tables
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

-- Grant table-level access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.persons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.families TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.family_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.relationships TO authenticated;

-- Grant SELECT to anon for tables with public / community RLS policies
GRANT SELECT ON TABLE public.persons TO anon;
GRANT SELECT ON TABLE public.families TO anon;
GRANT SELECT ON TABLE public.family_members TO anon;
GRANT SELECT ON TABLE public.relationships TO anon;

-- Security Barrier Views
GRANT SELECT ON public.community_persons TO authenticated, anon;

COMMIT;

-- =============================================================================
-- >>> MIGRATION FILE: 20261105150000_update_roles_permissions_and_family_privacy.sql <<<
-- =============================================================================

BEGIN;

DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'COMMUNITY_MEMBER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'FAMILY_MEMBER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'FAMILY_MANAGER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'ASSISTANT_MUKHI';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'COMMUNITY_MUKHI';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.families 
  ADD COLUMN IF NOT EXISTS manager_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_families_manager_user_id 
  ON public.families(manager_user_id);

UPDATE public.families
SET manager_user_id = created_by
WHERE manager_user_id IS NULL AND created_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role::text IN ('ADMIN', 'SUPER_ADMIN')
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_community_moderator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role::text IN ('ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MODERATOR', 'COMMUNITY_MUKHI', 'ASSISTANT_MUKHI')
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_same_family_member(p_target_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_target_person_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND user_id = auth.uid() AND deleted_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND created_by = auth.uid() AND deleted_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.families f ON f.id = fm.family_id
        WHERE fm.person_id = p_target_person_id
          AND fm.left_at IS NULL
          AND f.deleted_at IS NULL
          AND (f.manager_user_id = auth.uid() OR (f.manager_user_id IS NULL AND f.created_by = auth.uid()))
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.persons my_p
        JOIN public.family_members my_fm ON my_fm.person_id = my_p.id AND my_fm.left_at IS NULL
        JOIN public.family_members target_fm ON target_fm.family_id = my_fm.family_id AND target_fm.left_at IS NULL
        JOIN public.families f ON f.id = my_fm.family_id AND f.deleted_at IS NULL
        WHERE my_p.user_id = auth.uid()
          AND my_p.deleted_at IS NULL
          AND target_fm.person_id = p_target_person_id
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_person(p_target_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_target_person_id IS NOT NULL AND (
      public.is_admin()
      OR
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND user_id = auth.uid() AND deleted_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND created_by = auth.uid() AND user_id IS NULL AND deleted_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.families f ON f.id = fm.family_id
        WHERE fm.person_id = p_target_person_id
          AND fm.left_at IS NULL
          AND f.deleted_at IS NULL
          AND (f.manager_user_id = auth.uid() OR (f.manager_user_id IS NULL AND f.created_by = auth.uid()))
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.persons my_p
        JOIN public.family_members my_fm ON my_fm.person_id = my_p.id AND my_fm.left_at IS NULL AND my_fm.is_head = TRUE
        JOIN public.family_members target_fm ON target_fm.family_id = my_fm.family_id AND target_fm.left_at IS NULL
        JOIN public.families f ON f.id = my_fm.family_id AND f.deleted_at IS NULL
        WHERE my_p.user_id = auth.uid()
          AND my_p.deleted_at IS NULL
          AND target_fm.person_id = p_target_person_id
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_family(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_family_id IS NOT NULL AND (
      public.is_admin()
      OR
      public.is_community_moderator()
      OR
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = p_family_id
          AND f.deleted_at IS NULL
          AND (f.manager_user_id = auth.uid() OR (f.manager_user_id IS NULL AND f.created_by = auth.uid()))
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.persons p ON p.id = fm.person_id
        WHERE fm.family_id = p_family_id
          AND fm.left_at IS NULL
          AND fm.is_head = TRUE
          AND p.user_id = auth.uid()
          AND p.deleted_at IS NULL
      )
    )
  );
$$;

DROP VIEW IF EXISTS public.community_persons CASCADE;

CREATE OR REPLACE VIEW public.community_persons
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.first_name,
  p.middle_name,
  p.last_name,
  p.maiden_name,
  p.gender,
  public.calculate_person_age(p.date_of_birth) AS age,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.date_of_birth
    ELSE NULL
  END AS date_of_birth,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.dob_year
    ELSE NULL
  END AS dob_year,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.birth_place
    ELSE NULL
  END AS birth_place,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.email_contact
    ELSE NULL
  END AS email_contact,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.phone
    ELSE NULL
  END AS phone,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.phone_secondary
    ELSE NULL
  END AS phone_secondary,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN
      COALESCE(
        (
          SELECT f.city
          FROM public.family_members fm
          JOIN public.families f ON f.id = fm.family_id
          WHERE fm.person_id = p.id AND fm.left_at IS NULL AND f.deleted_at IS NULL
          ORDER BY fm.is_head DESC, fm.created_at ASC
          LIMIT 1
        ),
        NULLIF(trim(split_part(p.birth_place, ',', 1)), '')
      )
    ELSE NULL
  END AS city,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN
      COALESCE(
        (
          SELECT f.state
          FROM public.family_members fm
          JOIN public.families f ON f.id = fm.family_id
          WHERE fm.person_id = p.id AND fm.left_at IS NULL AND f.deleted_at IS NULL
          ORDER BY fm.is_head DESC, fm.created_at ASC
          LIMIT 1
        ),
        NULLIF(trim(split_part(p.birth_place, ',', 2)), '')
      )
    ELSE NULL
  END AS state,

  p.date_of_death,
  p.avatar_url,
  p.gotra,
  p.nukh,
  p.kul,
  p.status,
  p.verification_status,
  p.created_at,
  p.updated_at,
  p.deleted_at,
  p.user_id,
  p.created_by,
  p.profile_privacy,
  p.contact_privacy,
  p.dob_privacy,

  (public.is_admin() OR public.is_same_family_member(p.id)) AS is_same_family,
  public.can_edit_person(p.id) AS can_edit

FROM public.persons p
WHERE p.deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_person_protected_details(p_person_id UUID)
RETURNS TABLE (
  date_of_birth DATE,
  birth_place TEXT,
  phone TEXT,
  phone_secondary TEXT,
  email_contact TEXT,
  is_owner BOOLEAN,
  is_same_family BOOLEAN,
  is_manager BOOLEAN,
  is_moderator BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_user_id UUID;
  v_is_owner BOOLEAN;
  v_is_same_family BOOLEAN;
  v_is_manager BOOLEAN;
  v_is_moderator BOOLEAN;
  v_caller_uid UUID;
BEGIN
  v_caller_uid := auth.uid();
  
  SELECT user_id INTO v_person_user_id
  FROM public.persons
  WHERE id = p_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found' USING ERRCODE = 'P0002';
  END IF;

  v_is_owner := (v_caller_uid IS NOT NULL AND v_person_user_id IS NOT NULL AND v_caller_uid = v_person_user_id);
  v_is_same_family := public.is_same_family_member(p_person_id);
  v_is_manager := public.can_edit_person(p_person_id);
  v_is_moderator := public.is_community_moderator() OR public.is_admin();

  IF NOT (v_is_owner OR v_is_same_family OR v_is_manager OR v_is_moderator) THEN
    RAISE EXCEPTION 'Unauthorized: Protected personal data is restricted to own family members and authorized administrators.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'person',
    p_person_id,
    NULL,
    NULL,
    jsonb_build_object(
      'action_type', 'PROTECTED_DATA_ACCESSED',
      'accessor_uid', v_caller_uid,
      'is_owner', v_is_owner,
      'is_same_family', v_is_same_family,
      'is_manager', v_is_manager,
      'is_moderator', v_is_moderator
    )
  );

  RETURN QUERY
  SELECT 
    p.date_of_birth,
    p.birth_place,
    p.phone,
    p.phone_secondary,
    p.email_contact,
    v_is_owner,
    v_is_same_family,
    v_is_manager,
    v_is_moderator
  FROM public.persons p
  WHERE p.id = p_person_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_person_protected_details(
  p_person_id UUID,
  p_date_of_birth DATE DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_phone_secondary TEXT DEFAULT NULL,
  p_email_contact TEXT DEFAULT NULL,
  p_birth_place TEXT DEFAULT NULL
)
RETURNS TABLE (
  person_id UUID,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID;
  v_can_edit BOOLEAN;
  v_updated_at TIMESTAMPTZ;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot update protected details.' USING ERRCODE = '42501';
  END IF;

  v_can_edit := public.can_edit_person(p_person_id);
  IF NOT v_can_edit THEN
    RAISE EXCEPTION 'Unauthorized: Only Family Head, Family Manager, Admin, or the person themselves can edit personal details.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.persons
  SET
    date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
    birth_place = COALESCE(p_birth_place, birth_place),
    phone = COALESCE(p_phone, phone),
    phone_secondary = COALESCE(p_phone_secondary, phone_secondary),
    email_contact = COALESCE(p_email_contact, email_contact),
    updated_at = NOW()
  WHERE id = p_person_id AND deleted_at IS NULL
  RETURNING persons.updated_at INTO v_updated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_audit_event(
    'PERSON_UPDATED'::public.audit_action,
    'person',
    p_person_id,
    NULL,
    NULL,
    jsonb_build_object(
      'action_type', 'PROTECTED_DATA_UPDATED',
      'editor_uid', v_caller_uid
    )
  );

  RETURN QUERY SELECT p_person_id, v_updated_at;
END;
$$;

ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "persons_update_own" ON public.persons;
DROP POLICY IF EXISTS "persons_update_admin" ON public.persons;
DROP POLICY IF EXISTS "persons_update_authorized" ON public.persons;
CREATE POLICY "persons_update_authorized" ON public.persons
  FOR UPDATE
  USING (public.can_edit_person(persons.id))
  WITH CHECK (public.can_edit_person(persons.id));

DROP POLICY IF EXISTS "persons_delete_deny" ON public.persons;
DROP POLICY IF EXISTS "persons_delete_admin" ON public.persons;
CREATE POLICY "persons_delete_admin" ON public.persons
  FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "persons_insert_authenticated" ON public.persons;
CREATE POLICY "persons_insert_authenticated" ON public.persons
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (created_by = auth.uid() OR public.is_admin())
  );

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "families_update_creator" ON public.families;
DROP POLICY IF EXISTS "families_update_admin" ON public.families;
DROP POLICY IF EXISTS "families_update_authorized" ON public.families;
CREATE POLICY "families_update_authorized" ON public.families
  FOR UPDATE
  USING (public.can_manage_family(families.id))
  WITH CHECK (public.can_manage_family(families.id));

DROP POLICY IF EXISTS "families_delete_creator" ON public.families;
DROP POLICY IF EXISTS "families_delete_admin" ON public.families;
DROP POLICY IF EXISTS "families_delete_authorized" ON public.families;
CREATE POLICY "families_delete_authorized" ON public.families
  FOR DELETE
  USING (public.can_manage_family(families.id));

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_members_insert_creator" ON public.family_members;
DROP POLICY IF EXISTS "family_members_insert_admin" ON public.family_members;
DROP POLICY IF EXISTS "family_members_insert_authorized" ON public.family_members;
CREATE POLICY "family_members_insert_authorized" ON public.family_members
  FOR INSERT
  WITH CHECK (public.can_manage_family(family_members.family_id));

DROP POLICY IF EXISTS "family_members_update_creator" ON public.family_members;
DROP POLICY IF EXISTS "family_members_update_admin" ON public.family_members;
DROP POLICY IF EXISTS "family_members_update_authorized" ON public.family_members;
CREATE POLICY "family_members_update_authorized" ON public.family_members
  FOR UPDATE
  USING (public.can_manage_family(family_members.family_id))
  WITH CHECK (public.can_manage_family(family_members.family_id));

DROP POLICY IF EXISTS "family_members_delete_creator" ON public.family_members;
DROP POLICY IF EXISTS "family_members_delete_admin" ON public.family_members;
DROP POLICY IF EXISTS "family_members_delete_authorized" ON public.family_members;
CREATE POLICY "family_members_delete_authorized" ON public.family_members
  FOR DELETE
  USING (public.can_manage_family(family_members.family_id));

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_community_moderator() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_same_family_member(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_person(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_family(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_person_protected_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_person_protected_details(UUID, DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;

GRANT SELECT ON public.community_persons TO authenticated, anon;

COMMIT;


-- =============================================================================
-- >>> MIGRATION FILE: 20261105160000_sync_person_deceased_status.sql <<<
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_person_deceased_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If date_of_death is provided and not null, set status to DECEASED
  IF NEW.date_of_death IS NOT NULL THEN
    NEW.status := 'DECEASED'::public.person_status;
  -- If date_of_death was previously set and is now cleared, restore status to ACTIVE
  ELSIF TG_OP = 'UPDATE' AND OLD.date_of_death IS NOT NULL AND NEW.date_of_death IS NULL THEN
    IF NEW.status = 'DECEASED'::public.person_status THEN
      NEW.status := 'ACTIVE'::public.person_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_person_deceased_status ON public.persons;
CREATE TRIGGER trg_sync_person_deceased_status
  BEFORE INSERT OR UPDATE OF date_of_death, status ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_person_deceased_status();

GRANT EXECUTE ON FUNCTION public.sync_person_deceased_status() TO authenticated, anon;

COMMIT;


-- =============================================================================
-- >>> MIGRATION FILE: 20261105180000_fix_family_creator_manager_authorization.sql <<<
-- =============================================================================

-- =============================================================================
-- Migration: 20261105180000_fix_family_creator_manager_authorization.sql
-- Purpose:
--   1. Ensure family creators are automatically designated as initial Family Manager
--      (manager_user_id) upon creation by default, across both RPC and direct INSERTs.
--   2. Safely initialize manager_user_id from created_by for any existing families
--      where manager_user_id is currently NULL, restoring creator management rights.
--   3. Attach BEFORE INSERT/UPDATE trigger on public.families to guarantee manager_user_id
--      defaults to created_by and prevent unauthorized tampering with provenance.
--   4. Refine families_update_authorized and families_delete_authorized RLS policies
--      to evaluate manager_user_id and created_by directly and prevent self-referential subquery lock.
--   5. Update create_family_with_head RPC to explicitly set manager_user_id to the caller.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Initialize manager_user_id for existing families where null
-- -----------------------------------------------------------------------------
UPDATE public.families
SET manager_user_id = created_by
WHERE manager_user_id IS NULL AND created_by IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Trigger Function: Enforce manager_user_id & created_by Defaults & Guard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_family_manager_and_creator_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- On INSERT:
  IF TG_OP = 'INSERT' THEN
    -- Ensure created_by is set to authenticated caller if null
    IF NEW.created_by IS NULL THEN
      NEW.created_by := auth.uid();
    END IF;

    -- Default manager_user_id to the creator or authenticated caller if null
    IF NEW.manager_user_id IS NULL THEN
      NEW.manager_user_id := COALESCE(NEW.created_by, auth.uid());
    END IF;
  END IF;

  -- On UPDATE:
  IF TG_OP = 'UPDATE' THEN
    -- Preserve immutability of created_by and id
    NEW.created_by := OLD.created_by;
    NEW.id := OLD.id;

    -- If manager_user_id was null and remains null, initialize to created_by
    IF NEW.manager_user_id IS NULL AND OLD.manager_user_id IS NULL THEN
      NEW.manager_user_id := OLD.created_by;
    END IF;

    -- Enforce that only current manager or platform admin can reassign manager_user_id
    IF NEW.manager_user_id IS DISTINCT FROM OLD.manager_user_id AND NOT public.is_admin() THEN
      IF OLD.manager_user_id IS DISTINCT FROM auth.uid()
         AND (OLD.manager_user_id IS NOT NULL OR OLD.created_by IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'FORBIDDEN: Only the current family manager or platform administrator can reassign family manager.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_manager_and_creator_defaults ON public.families;
CREATE TRIGGER trg_family_manager_and_creator_defaults
  BEFORE INSERT OR UPDATE ON public.families
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_manager_and_creator_defaults();

-- -----------------------------------------------------------------------------
-- 3. Update create_family_with_head RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_family_with_head(
  p_family_name TEXT,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_gotra TEXT DEFAULT NULL,
  p_nukh TEXT DEFAULT NULL,
  p_profile_privacy public.privacy_level DEFAULT 'COMMUNITY',
  p_members_privacy public.privacy_level DEFAULT 'COMMUNITY',
  p_existing_person_id UUID DEFAULT NULL,
  p_new_person_first_name TEXT DEFAULT NULL,
  p_new_person_middle_name TEXT DEFAULT NULL,
  p_new_person_last_name TEXT DEFAULT NULL,
  p_new_person_maiden_name TEXT DEFAULT NULL,
  p_new_person_gender public.gender DEFAULT 'MALE',
  p_new_person_dob DATE DEFAULT NULL,
  p_new_person_birth_place TEXT DEFAULT NULL
)
RETURNS TABLE (
  family_id UUID,
  head_person_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_family_id UUID;
  v_head_person_id UUID;
  v_clean_fam_name TEXT;
  v_clean_first_name TEXT;
  v_clean_last_name TEXT;
  v_eff_privacy public.privacy_level;
BEGIN
  -- 1. Caller Authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: A valid session is required to create a family.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: User account is inactive, suspended, or does not exist.' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Family Name
  v_clean_fam_name := NULLIF(trim(p_family_name), '');
  IF v_clean_fam_name IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Family name is required.' USING ERRCODE = '22023';
  END IF;

  v_eff_privacy := COALESCE(p_profile_privacy, 'COMMUNITY'::public.privacy_level);

  -- 3. Resolve or Create Head Person
  IF p_existing_person_id IS NOT NULL THEN
    SELECT p.id INTO v_head_person_id
    FROM public.persons p
    WHERE p.id = p_existing_person_id
      AND p.deleted_at IS NULL;

    IF v_head_person_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: The specified person does not exist.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_clean_first_name := NULLIF(trim(p_new_person_first_name), '');
    v_clean_last_name := NULLIF(trim(p_new_person_last_name), '');

    IF v_clean_first_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: First name is required for new family head.' USING ERRCODE = '22023';
    END IF;
    IF v_clean_last_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Last name is required for new family head.' USING ERRCODE = '22023';
    END IF;

    -- PERSON != USER Invariant: user_id is explicitly NULL for census records
    INSERT INTO public.persons (
      first_name,
      middle_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      birth_place,
      gotra,
      nukh,
      profile_privacy,
      contact_privacy,
      dob_privacy,
      created_by,
      user_id
    )
    VALUES (
      v_clean_first_name,
      NULLIF(trim(p_new_person_middle_name), ''),
      v_clean_last_name,
      NULLIF(trim(p_new_person_maiden_name), ''),
      COALESCE(p_new_person_gender, 'MALE'::public.gender),
      p_new_person_dob,
      COALESCE(NULLIF(trim(p_new_person_birth_place), ''), NULLIF(trim(p_city), '')),
      NULLIF(trim(p_gotra), ''),
      NULLIF(trim(p_nukh), ''),
      v_eff_privacy,
      'PRIVATE',
      'PRIVATE',
      v_caller_id,
      NULL
    )
    RETURNING id INTO v_head_person_id;
  END IF;

  -- 4. Insert Family Record (Explicitly setting manager_user_id to caller)
  INSERT INTO public.families (
    family_name,
    description,
    city,
    state,
    country,
    gotra,
    nukh,
    profile_privacy,
    members_privacy,
    created_by,
    manager_user_id
  )
  VALUES (
    v_clean_fam_name,
    NULLIF(trim(p_description), ''),
    NULLIF(trim(p_city), ''),
    NULLIF(trim(p_state), ''),
    COALESCE(NULLIF(trim(p_country), ''), 'India'),
    NULLIF(trim(p_gotra), ''),
    NULLIF(trim(p_nukh), ''),
    v_eff_privacy,
    COALESCE(p_members_privacy, v_eff_privacy),
    v_caller_id,
    v_caller_id
  )
  RETURNING id INTO v_family_id;

  -- 5. Insert Family Head Member Record
  INSERT INTO public.family_members (
    family_id,
    person_id,
    role,
    is_head,
    added_by
  )
  VALUES (
    v_family_id,
    v_head_person_id,
    'HEAD'::public.family_role,
    TRUE,
    v_caller_id
  );

  RETURN QUERY SELECT v_family_id, v_head_person_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Update can_manage_family Helper Function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_family(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_family_id IS NOT NULL AND (
      -- 1. Admin or Super Admin
      public.is_admin()
      OR
      -- 2. Mukhi (for moderation)
      public.is_community_moderator()
      OR
      -- 3. Designated Family Manager (or Creator if manager unset)
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = p_family_id
          AND f.deleted_at IS NULL
          AND (
            f.manager_user_id = auth.uid()
            OR (f.manager_user_id IS NULL AND f.created_by = auth.uid())
          )
      )
      OR
      -- 4. Designated Family Head
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.persons p ON p.id = fm.person_id
        WHERE fm.family_id = p_family_id
          AND fm.left_at IS NULL
          AND fm.is_head = TRUE
          AND p.user_id = auth.uid()
          AND p.deleted_at IS NULL
      )
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- 5. Row-Level Security Policies for public.families
-- -----------------------------------------------------------------------------
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "families_update_authorized" ON public.families;
CREATE POLICY "families_update_authorized" ON public.families
  FOR UPDATE
  USING (
    public.is_admin()
    OR public.is_community_moderator()
    OR manager_user_id = auth.uid()
    OR (manager_user_id IS NULL AND created_by = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = families.id
        AND fm.left_at IS NULL
        AND fm.is_head = TRUE
        AND p.user_id = auth.uid()
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_community_moderator()
    OR manager_user_id = auth.uid()
    OR (manager_user_id IS NULL AND created_by = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = families.id
        AND fm.left_at IS NULL
        AND fm.is_head = TRUE
        AND p.user_id = auth.uid()
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "families_delete_authorized" ON public.families;
CREATE POLICY "families_delete_authorized" ON public.families
  FOR DELETE
  USING (
    public.is_admin()
    OR manager_user_id = auth.uid()
    OR (manager_user_id IS NULL AND created_by = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 6. Grants
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.can_manage_family(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_family_with_head TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_family_manager_and_creator_defaults() TO authenticated, anon;

COMMIT;
-- =============================================================================
-- Migration: 20261105183000_sync_family_members_relationships.sql
-- Purpose:
--   1. Automatically synchronize public.relationships with public.family_members:
--      - When a family member's role changes (e.g. CHILD -> SPOUSE, SPOUSE -> CHILD):
--        Soft-deletes the previous relationship with the Family Head and inserts
--        the new canonical relationship.
--      - When a member is soft-removed (left_at IS NOT NULL), soft-deletes
--        their active relationships with the Family Head.
--   2. Ensures the Family Tree and Family Roster always display the exact same
--      persisted relationship structure from Supabase.
--   3. Enables Realtime publication on family_members and relationships tables.
-- =============================================================================

BEGIN;

-- 1. Trigger function to synchronize interpersonal relationships with head
CREATE OR REPLACE FUNCTION public.sync_family_member_relationship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_head_person_id UUID;
  v_creator_id UUID;
  v_p_a UUID;
  v_p_b UUID;
BEGIN
  -- If this is an UPDATE and neither role, is_head, nor left_at changed, skip
  IF TG_OP = 'UPDATE' AND OLD.role = NEW.role AND OLD.is_head = NEW.is_head AND OLD.left_at IS NOT DISTINCT FROM NEW.left_at THEN
    RETURN NEW;
  END IF;

  -- Resolve family head person ID
  SELECT head_person_id, created_by INTO v_head_person_id, v_creator_id
  FROM public.families
  WHERE id = NEW.family_id;

  IF v_head_person_id IS NULL THEN
    SELECT person_id INTO v_head_person_id
    FROM public.family_members
    WHERE family_id = NEW.family_id AND is_head = TRUE AND left_at IS NULL
    LIMIT 1;
  END IF;

  -- If head is unknown or this member IS the head, no relative edge to head needed
  IF v_head_person_id IS NULL OR v_head_person_id = NEW.person_id THEN
    RETURN NEW;
  END IF;

  -- 1. Soft-delete any existing active relationship with the head
  UPDATE public.relationships
  SET deleted_at = NOW(),
      updated_at = NOW()
  WHERE deleted_at IS NULL
    AND (
      (person_a_id = v_head_person_id AND person_b_id = NEW.person_id)
      OR (person_a_id = NEW.person_id AND person_b_id = v_head_person_id)
    );

  -- If member has departed (left_at IS NOT NULL), we stop after soft-deleting
  IF NEW.left_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Insert new relationship based on updated role
  IF NEW.role = 'SPOUSE' THEN
    IF v_head_person_id < NEW.person_id THEN
      v_p_a := v_head_person_id; v_p_b := NEW.person_id;
    ELSE
      v_p_a := NEW.person_id; v_p_b := v_head_person_id;
    END IF;

    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
    VALUES (v_p_a, v_p_b, 'SPOUSE', COALESCE(auth.uid(), v_creator_id))
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

  ELSIF NEW.role = 'CHILD' THEN
    -- Head is Parent of Child
    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
    VALUES (v_head_person_id, NEW.person_id, 'PARENT', COALESCE(auth.uid(), v_creator_id))
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

  ELSIF NEW.role = 'PARENT' THEN
    -- Member is Parent of Head
    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
    VALUES (NEW.person_id, v_head_person_id, 'PARENT', COALESCE(auth.uid(), v_creator_id))
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

  ELSIF NEW.role = 'SIBLING' THEN
    IF v_head_person_id < NEW.person_id THEN
      v_p_a := v_head_person_id; v_p_b := NEW.person_id;
    ELSE
      v_p_a := NEW.person_id; v_p_b := v_head_person_id;
    END IF;

    INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
    VALUES (v_p_a, v_p_b, 'SIBLING', COALESCE(auth.uid(), v_creator_id))
    ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_family_member_relationship ON public.family_members;
CREATE TRIGGER trg_sync_family_member_relationship
  AFTER INSERT OR UPDATE OF role, is_head, left_at ON public.family_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_family_member_relationship();

-- 2. Backfill: Synchronize any pre-existing active family members with public.relationships
DO $$
DECLARE
  rec RECORD;
  v_head_id UUID;
  v_creator UUID;
  v_p_a UUID;
  v_p_b UUID;
BEGIN
  FOR rec IN
    SELECT fm.family_id, fm.person_id, fm.role, f.head_person_id, f.created_by
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    WHERE fm.left_at IS NULL
      AND fm.is_head = FALSE
      AND (f.head_person_id IS NOT NULL AND f.head_person_id <> fm.person_id)
  LOOP
    v_head_id := rec.head_person_id;
    v_creator := rec.created_by;

    IF rec.role = 'SPOUSE' THEN
      IF v_head_id < rec.person_id THEN
        v_p_a := v_head_id; v_p_b := rec.person_id;
      ELSE
        v_p_a := rec.person_id; v_p_b := v_head_id;
      END IF;

      INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
      VALUES (v_p_a, v_p_b, 'SPOUSE', v_creator)
      ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

    ELSIF rec.role = 'CHILD' THEN
      INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
      VALUES (v_head_id, rec.person_id, 'PARENT', v_creator)
      ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

    ELSIF rec.role = 'PARENT' THEN
      INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
      VALUES (rec.person_id, v_head_id, 'PARENT', v_creator)
      ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;

    ELSIF rec.role = 'SIBLING' THEN
      IF v_head_id < rec.person_id THEN
        v_p_a := v_head_id; v_p_b := rec.person_id;
      ELSE
        v_p_a := rec.person_id; v_p_b := v_head_id;
      END IF;

      INSERT INTO public.relationships (person_a_id, person_b_id, relationship_type, created_by)
      VALUES (v_p_a, v_p_b, 'SIBLING', v_creator)
      ON CONFLICT (person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- 3. Ensure tables are in supabase_realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.family_members;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.relationships;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

COMMIT;
