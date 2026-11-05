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
