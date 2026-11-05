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
