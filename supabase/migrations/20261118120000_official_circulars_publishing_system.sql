-- =============================================================================
-- Migration: 20261118120000_official_circulars_publishing_system.sql
-- Purpose:   Official Notice & Circular Publishing System with Khatri Sarvaniyat
--             Letterhead, Branded PDF Support, and Admin/Super-Admin Authorization:
--             1. Extend public.announcements with circular metadata columns
--             2. Configure storage.buckets for 'circulars' with hardened RLS
--             3. Authoritative role check: strictly ADMIN and SUPER_ADMIN for management
--             4. RLS policies allowing public & authenticated read of published circulars
--             5. Server RPCs for circular creation, editing, pinning, and deletion
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend public.announcements table with circular metadata
-- -----------------------------------------------------------------------------

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS circular_number TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS issuing_authority TEXT DEFAULT 'Central Panchayat Secretariat',
  ADD COLUMN IF NOT EXISTS signatory_name TEXT DEFAULT 'Central Secretariat',
  ADD COLUMN IF NOT EXISTS signatory_title TEXT DEFAULT 'Authorized Signatory',
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS original_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS creation_method TEXT DEFAULT 'ONLINE_EDITOR',
  ADD COLUMN IF NOT EXISTS effective_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS contact_info TEXT,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_announcements_circular_number
  ON public.announcements (circular_number)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 2. Storage Bucket: 'circulars'
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'circulars',
  'circulars',
  true,
  10485760, -- 10MB limit
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf']::text[];

-- Storage RLS policies for 'circulars' bucket
DO $$
BEGIN
  -- Select policy (public read for published circular documents)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'circulars_public_select'
  ) THEN
    CREATE POLICY "circulars_public_select"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'circulars');
  END IF;

  -- Insert policy (strictly Admin and Super Admin)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'circulars_admin_insert'
  ) THEN
    CREATE POLICY "circulars_admin_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'circulars'
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        )
      );
  END IF;

  -- Update policy (strictly Admin and Super Admin)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'circulars_admin_update'
  ) THEN
    CREATE POLICY "circulars_admin_update"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'circulars'
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        )
      );
  END IF;

  -- Delete policy (strictly Admin and Super Admin)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'circulars_admin_delete'
  ) THEN
    CREATE POLICY "circulars_admin_delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'circulars'
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        )
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Strict Role Verification Helper: is_admin_or_super_admin()
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
  ) OR (
    auth.jwt() ->> 'role' IN ('ADMIN', 'SUPER_ADMIN')
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. RLS & Permissions on public.announcements
-- -----------------------------------------------------------------------------

-- Allow public and authenticated read of published community announcements
GRANT SELECT ON public.announcements TO anon, authenticated;

DROP POLICY IF EXISTS "announcements_select_authenticated" ON public.announcements;
DROP POLICY IF EXISTS "announcements_select_public_and_authenticated" ON public.announcements;

CREATE POLICY "announcements_select_public_and_authenticated"
  ON public.announcements
  FOR SELECT
  TO public
  USING (
    (
      deleted_at IS NULL
      AND status = 'PUBLISHED'
      AND (
        group_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.groups g
          WHERE g.id = announcements.group_id
            AND g.deleted_at IS NULL
            AND NOT g.is_private
        )
      )
    )
    OR (
      auth.uid() IS NOT NULL
      AND (
        author_id = auth.uid()
        OR public.is_admin_or_super_admin()
        OR (
          group_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = announcements.group_id
              AND gm.user_id = auth.uid()
          )
        )
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Authoritative RPCs for Official Circulars
-- -----------------------------------------------------------------------------

-- 5A. RPC: public.publish_official_circular
CREATE OR REPLACE FUNCTION public.publish_official_circular(
  p_title TEXT,
  p_content TEXT,
  p_category public.announcement_type DEFAULT 'GENERAL',
  p_circular_number TEXT DEFAULT NULL,
  p_issuing_authority TEXT DEFAULT 'Central Panchayat Secretariat',
  p_signatory_name TEXT DEFAULT 'Central Secretariat',
  p_signatory_title TEXT DEFAULT 'Authorized Signatory',
  p_pdf_url TEXT DEFAULT NULL,
  p_original_pdf_url TEXT DEFAULT NULL,
  p_creation_method TEXT DEFAULT 'ONLINE_EDITOR',
  p_subject TEXT DEFAULT NULL,
  p_instructions TEXT DEFAULT NULL,
  p_contact_info TEXT DEFAULT NULL,
  p_effective_date TIMESTAMPTZ DEFAULT NULL,
  p_status public.announcement_status DEFAULT 'PUBLISHED',
  p_is_pinned BOOLEAN DEFAULT FALSE,
  p_group_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_new_id UUID;
  v_circ_number TEXT;
  v_year TEXT;
  v_seq INT;
BEGIN
  -- Strict permission check: Only Admin and Super Admin
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Admin and Super Admin can publish official notices or circulars.'
      USING ERRCODE = '42501';
  END IF;

  -- Generate circular number if omitted
  v_circ_number := trim(COALESCE(p_circular_number, ''));
  IF v_circ_number = '' THEN
    v_year := to_char(NOW(), 'YYYY');
    SELECT COUNT(*) + 1 INTO v_seq
    FROM public.announcements
    WHERE circular_number LIKE 'CIR-' || v_year || '-%';
    v_circ_number := 'CIR-' || v_year || '-' || lpad(v_seq::text, 3, '0');
  END IF;

  INSERT INTO public.announcements (
    title,
    content,
    description,
    announcement_type,
    status,
    group_id,
    author_id,
    is_pinned,
    published_at,
    circular_number,
    issuing_authority,
    signatory_name,
    signatory_title,
    pdf_url,
    original_pdf_url,
    creation_method,
    subject,
    instructions,
    contact_info,
    effective_date
  ) VALUES (
    trim(p_title),
    trim(p_content),
    CASE WHEN length(trim(p_content)) > 200 THEN substr(trim(p_content), 1, 197) || '...' ELSE trim(p_content) END,
    p_category,
    p_status,
    p_group_id,
    v_caller,
    p_is_pinned,
    CASE WHEN p_status = 'PUBLISHED' THEN NOW() ELSE NULL END,
    v_circ_number,
    COALESCE(trim(p_issuing_authority), 'Central Panchayat Secretariat'),
    COALESCE(trim(p_signatory_name), 'Central Secretariat'),
    COALESCE(trim(p_signatory_title), 'Authorized Signatory'),
    p_pdf_url,
    p_original_pdf_url,
    p_creation_method,
    p_subject,
    p_instructions,
    p_contact_info,
    p_effective_date
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- 5B. RPC: public.update_official_circular
CREATE OR REPLACE FUNCTION public.update_official_circular(
  p_circular_id UUID,
  p_title TEXT,
  p_content TEXT,
  p_category public.announcement_type,
  p_issuing_authority TEXT,
  p_signatory_name TEXT,
  p_signatory_title TEXT,
  p_pdf_url TEXT DEFAULT NULL,
  p_original_pdf_url TEXT DEFAULT NULL,
  p_subject TEXT DEFAULT NULL,
  p_instructions TEXT DEFAULT NULL,
  p_contact_info TEXT DEFAULT NULL,
  p_status public.announcement_status DEFAULT 'PUBLISHED',
  p_is_pinned BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_existing public.announcements%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Admin and Super Admin can edit official notices or circulars.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing
  FROM public.announcements
  WHERE id = p_circular_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circular not found or deleted.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.announcements
  SET
    title = trim(p_title),
    content = trim(p_content),
    description = CASE WHEN length(trim(p_content)) > 200 THEN substr(trim(p_content), 1, 197) || '...' ELSE trim(p_content) END,
    announcement_type = p_category,
    issuing_authority = COALESCE(trim(p_issuing_authority), v_existing.issuing_authority),
    signatory_name = COALESCE(trim(p_signatory_name), v_existing.signatory_name),
    signatory_title = COALESCE(trim(p_signatory_title), v_existing.signatory_title),
    pdf_url = COALESCE(p_pdf_url, v_existing.pdf_url),
    original_pdf_url = COALESCE(p_original_pdf_url, v_existing.original_pdf_url),
    subject = COALESCE(p_subject, v_existing.subject),
    instructions = COALESCE(p_instructions, v_existing.instructions),
    contact_info = COALESCE(p_contact_info, v_existing.contact_info),
    status = p_status,
    is_pinned = p_is_pinned,
    published_at = CASE
      WHEN p_status = 'PUBLISHED' AND v_existing.published_at IS NULL THEN NOW()
      ELSE v_existing.published_at
    END,
    updated_by = v_caller,
    updated_at = NOW()
  WHERE id = p_circular_id;

  RETURN TRUE;
END;
$$;

-- 5C. RPC: public.delete_official_circular
CREATE OR REPLACE FUNCTION public.delete_official_circular(
  p_circular_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Admin and Super Admin can delete official notices or circulars.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.announcements
  SET
    deleted_at = NOW(),
    updated_by = v_caller,
    updated_at = NOW()
  WHERE id = p_circular_id AND deleted_at IS NULL;

  RETURN TRUE;
END;
$$;

-- 5D. RPC: public.toggle_pin_circular
CREATE OR REPLACE FUNCTION public.toggle_pin_circular(
  p_circular_id UUID,
  p_is_pinned BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Admin and Super Admin can pin or unpin official notices or circulars.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.announcements
  SET
    is_pinned = p_is_pinned,
    updated_by = v_caller,
    updated_at = NOW()
  WHERE id = p_circular_id AND deleted_at IS NULL;

  RETURN TRUE;
END;
$$;

-- 5E. RPC: public.get_public_official_circulars
CREATE OR REPLACE FUNCTION public.get_public_official_circulars()
RETURNS TABLE (
  id UUID,
  circular_number TEXT,
  title TEXT,
  description TEXT,
  content TEXT,
  category public.announcement_type,
  status public.announcement_status,
  issuing_authority TEXT,
  signatory_name TEXT,
  signatory_title TEXT,
  pdf_url TEXT,
  original_pdf_url TEXT,
  creation_method TEXT,
  is_pinned BOOLEAN,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  effective_date TIMESTAMPTZ,
  subject TEXT,
  instructions TEXT,
  contact_info TEXT,
  group_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    COALESCE(a.circular_number, 'CIR-' || to_char(COALESCE(a.published_at, a.created_at), 'YYYY') || '-' || substr(a.id::text, 1, 3)) AS circular_number,
    a.title,
    COALESCE(a.description, substr(a.content, 1, 200)) AS description,
    a.content,
    a.announcement_type AS category,
    a.status,
    COALESCE(a.issuing_authority, 'Central Panchayat Secretariat') AS issuing_authority,
    COALESCE(a.signatory_name, 'Central Secretariat') AS signatory_name,
    COALESCE(a.signatory_title, 'Authorized Signatory') AS signatory_title,
    a.pdf_url,
    a.original_pdf_url,
    COALESCE(a.creation_method, 'ONLINE_EDITOR') AS creation_method,
    a.is_pinned,
    a.published_at,
    a.created_at,
    a.effective_date,
    a.subject,
    a.instructions,
    a.contact_info,
    a.group_id
  FROM public.announcements a
  WHERE a.deleted_at IS NULL
    AND (
      a.status = 'PUBLISHED'
      OR (
        auth.uid() IS NOT NULL
        AND (public.is_admin_or_super_admin() OR a.author_id = auth.uid())
      )
    )
  ORDER BY a.is_pinned DESC, COALESCE(a.published_at, a.created_at) DESC;
$$;

-- Table & RPC grants
GRANT EXECUTE ON FUNCTION public.is_admin_or_super_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_official_circulars() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_official_circular(TEXT, TEXT, public.announcement_type, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, public.announcement_status, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_official_circular(UUID, TEXT, TEXT, public.announcement_type, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.announcement_status, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_official_circular(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_pin_circular(UUID, BOOLEAN) TO authenticated;
