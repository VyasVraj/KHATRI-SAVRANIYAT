-- =============================================================================
-- Migration: 20261122204500_circulars_date_wise_sorting.sql
-- Purpose:   Update get_public_official_circulars RPC so that circulars are
--             ordered strictly by official circular publication date descending:
--             newest year, newest month, newest day first (nulls last).
--             Pinned directives no longer override chronological ordering.
-- =============================================================================

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
  ORDER BY COALESCE(a.published_at, a.created_at) DESC NULLS LAST, a.created_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_official_circulars() TO anon, authenticated;
