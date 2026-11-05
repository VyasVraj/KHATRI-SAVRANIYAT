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
