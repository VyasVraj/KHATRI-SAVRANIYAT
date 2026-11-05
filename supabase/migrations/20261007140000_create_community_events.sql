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
