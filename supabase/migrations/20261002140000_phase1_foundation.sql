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
