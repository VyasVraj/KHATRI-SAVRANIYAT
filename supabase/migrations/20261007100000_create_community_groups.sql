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
