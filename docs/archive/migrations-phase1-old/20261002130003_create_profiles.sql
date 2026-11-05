-- =============================================================================
-- Migration: 20261002130003_create_profiles.sql
-- Purpose:   User profile table, role helpers, auth triggers & RLS policies
-- Phase:     1 — Architecture & Database Foundation
-- =============================================================================
-- IMPORTANT DOMAIN RULE: profiles = the USER (auth identity + display prefs)
-- This is NOT a person record. A person is in public.persons.
-- A profile does NOT automatically have a person record.
-- See docs/DATABASE.md — "PERSON != USER" section.
--
-- Dependency-safe structure:
-- A. CREATE TABLE public.profiles
-- B. Constraints & Indexes
-- C. profiles_handle_updated_at trigger
-- D. is_admin() role helper
-- E. is_community_moderator() role helper
-- F. get_my_role() helper
-- G. handle_new_user() auth function
-- H. on_auth_user_created trigger on auth.users
-- I. handle_user_email_confirmed() auth function
-- J. on_auth_user_email_confirmed trigger on auth.users
-- K. ENABLE ROW LEVEL SECURITY
-- L. RLS policies on public.profiles
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. TABLE: public.profiles
-- One-to-one with auth.users. Created automatically by handle_new_user trigger.
-- Contains user display preferences and application role.
-- Does NOT contain personal census information (that's in public.persons).
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  -- Primary key is the auth.users UUID — enforces 1:1 relationship
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Auth-sync fields (kept in sync by triggers)
  email TEXT NOT NULL UNIQUE,

  -- Display preferences
  display_name TEXT,           -- How the user's name appears in UI
  avatar_url TEXT,             -- URL to profile avatar (Supabase Storage)

  -- Application role — enforces RBAC
  -- SECURITY NOTE: This is set server-side only. Clients CANNOT self-promote.
  -- Role changes must go through admin workflow and are audit-logged.
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

-- -----------------------------------------------------------------------------
-- B. INDEXES
-- -----------------------------------------------------------------------------

-- Email lookup (unique index already created by UNIQUE constraint, but explicit for clarity)
-- Used for: duplicate detection, admin lookup by email
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles (lower(email));

-- Role-based lookup — used by is_admin() and similar helper functions
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles (role)
  WHERE is_active = TRUE;

-- Active user lookup
CREATE INDEX IF NOT EXISTS idx_profiles_is_active
  ON public.profiles (is_active)
  WHERE is_active = TRUE;

COMMENT ON INDEX idx_profiles_role IS 'Partial index on active profiles by role — used by SECURITY DEFINER admin check functions.';

-- -----------------------------------------------------------------------------
-- C. TRIGGER: Auto-update updated_at on every UPDATE
-- (Uses handle_updated_at() from 20261002130002_create_utility_functions.sql)
-- -----------------------------------------------------------------------------
CREATE TRIGGER profiles_handle_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- D. is_admin()
-- Returns TRUE if the current authenticated user has ADMIN or SUPER_ADMIN role.
--
-- SECURITY DEFINER rationale: This function reads the profiles table.
-- If profiles has RLS enabled, a normal function would be subject to RLS
-- policies, potentially creating an infinite loop. SECURITY DEFINER bypasses
-- RLS on the profiles table ONLY for this specific lookup.
--
-- This pattern is the standard Supabase/PostgreSQL approach for admin checks
-- in RLS policies. See docs/SECURITY.md for full security analysis.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE  -- Result is stable within a transaction; PostgreSQL can cache
SET search_path = public  -- Prevent search_path injection attacks
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

-- -----------------------------------------------------------------------------
-- E. is_community_moderator()
-- Returns TRUE if user is COMMUNITY_MODERATOR, ADMIN, or SUPER_ADMIN.
-- Used in verification and moderation RLS policies.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- F. get_my_role()
-- Returns the role of the current authenticated user as TEXT.
-- Useful in application-level checks; not used directly in RLS policies.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- G. handle_new_user()
-- Trigger function: automatically creates a profile row when a new user
-- registers via Supabase Auth (INSERT into auth.users).
--
-- This ensures the PERSON != USER boundary is maintained at registration time:
-- - A profile row is created automatically on registration
-- - The profile is NOT linked to any person record at creation
-- - Person linkage happens separately via the claim workflow (Phase 8)
--
-- SECURITY DEFINER: Required to INSERT into public.profiles from auth schema trigger.
-- -----------------------------------------------------------------------------
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
    -- Use display_name from metadata if provided, else derive from email
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    'MEMBER',           -- All new users start as MEMBER
    TRUE,
    COALESCE((NEW.email_confirmed_at IS NOT NULL), FALSE)
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auth trigger: creates a public.profiles row when auth.users receives a new user. '
  'Does NOT link to any person record — PERSON != USER boundary is maintained.';

-- -----------------------------------------------------------------------------
-- H. Trigger on auth.users for new user creation
-- Fires AFTER INSERT to ensure the auth.users row is committed first
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON TRIGGER on_auth_user_created ON auth.users IS
  'Automatically creates public.profiles entry on new user registration.';

-- -----------------------------------------------------------------------------
-- I. handle_user_email_confirmed()
-- Updates email_verified on the profile when auth confirms the email.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- J. Trigger on auth.users for email confirmation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_email_confirmed();

-- -----------------------------------------------------------------------------
-- K. ROW LEVEL SECURITY
-- EVERY table exposed to the Supabase client MUST have RLS enabled.
-- Default: deny all. Policies explicitly grant access.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- L. RLS POLICIES
-- -----------------------------------------------------------------------------

-- Policy: Users can read their own profile
-- Rationale: A user always needs to read their own profile for the UI.
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Admins can read all profiles
-- Rationale: Admin panels need to list and inspect user profiles.
-- is_admin() uses SECURITY DEFINER to avoid circular RLS dependency.
CREATE POLICY "profiles_select_admin"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

-- Policy: Users can update their own non-role fields
-- Rationale: Users may update display_name, avatar_url.
-- SECURITY CRITICAL: Users CANNOT change their own role or active status via this policy.
-- Enforced in WITH CHECK: role must match public.get_my_role() and is_active must remain TRUE.
-- Role changes and account deactivations require the admin policy (profiles_update_admin).
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role::TEXT = public.get_my_role()
    AND is_active = TRUE
  );

-- Policy: Admins can update any profile (including role changes)
CREATE POLICY "profiles_update_admin"
  ON public.profiles
  FOR UPDATE
  USING (public.is_admin());

-- Policy: INSERT is handled exclusively by the handle_new_user() trigger.
-- No direct INSERT from the client is permitted.
-- Rationale: Profiles are always created server-side via the auth trigger.
CREATE POLICY "profiles_insert_trigger_only"
  ON public.profiles
  FOR INSERT
  WITH CHECK (FALSE);

-- Policy: Hard deletes of profiles are disallowed from the client.
-- Deactivation uses the is_active = FALSE flag.
-- Physical deletion only via cascade from auth.users (handled by Supabase Auth).
CREATE POLICY "profiles_delete_deny"
  ON public.profiles
  FOR DELETE
  USING (FALSE);
