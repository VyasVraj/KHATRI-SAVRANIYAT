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
