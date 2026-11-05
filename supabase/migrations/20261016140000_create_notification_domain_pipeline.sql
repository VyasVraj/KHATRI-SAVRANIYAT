-- =============================================================================
-- Migration: 20261016140000_create_notification_domain_pipeline.sql
-- Purpose:   Phase 12 Subtask 2 — Domain Event Notification Pipeline & Outbox
--             1. Unique Indexes for Strict Idempotency:
--                - uq_notifications_recipient_event_key on public.notifications
--                - uq_notification_outbox_notification_channel on public.notification_outbox
--             2. Centralized Pipeline Helper Function:
--                - public.emit_domain_notification (SECURITY DEFINER, search_path = public)
--             3. Domain Event Triggers & Handlers:
--                - Connections: connection_request, connection_accepted
--                - Person Claims: claim_approved, claim_rejected
--                - Invitations: invitation_accepted
--                - Verification Requests: verification_approved, verification_rejected
--                - Community Groups: group_role_updated
--                - Community Events: event_cancelled, event_rsvp
--                - Family Media & Stories: family_photo_added, family_story_added
--             4. Defense-in-Depth Privilege Hardening:
--                - Revoke execute on internal helpers from anon and authenticated
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. PERSON != USER:
--    Notifications and outbox queue entries are dispatched strictly to authenticated
--    accounts (auth.users), NEVER to census Person records.
--
-- 2. ZERO SILENT DROPS:
--    Notification generation occurs transactionally within the originating domain
--    operation without swallow-all exception handlers.
--
-- 3. DETERMINISTIC IDEMPOTENCY:
--    Every event produces a deterministic event_key. Database-level partial unique
--    indexes guarantee that duplicate trigger executions cannot produce duplicate
--    inbox notifications or duplicate outbox dispatches.
--
-- 4. PREFERENCE RESPECT:
--    External outbox delivery (EMAIL) checks public.notification_preferences.
--    In-app notifications remain the authoritative ledger of record.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Idempotency Indexes
-- -----------------------------------------------------------------------------

-- Enforces that at most ONE notification per event_key can exist for any recipient
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_recipient_event_key
  ON public.notifications (recipient_id, ((metadata->>'event_key')))
  WHERE (metadata->>'event_key') IS NOT NULL;

-- Enforces that at most ONE outbox record per channel exists for a notification
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_outbox_notification_channel
  ON public.notification_outbox (notification_id, channel);

-- -----------------------------------------------------------------------------
-- 2. Authoritative Internal Helper Function
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.emit_domain_notification(
  p_recipient_id UUID,
  p_actor_id UUID,
  p_category public.notification_category,
  p_type VARCHAR,
  p_title VARCHAR,
  p_body TEXT,
  p_action_url VARCHAR DEFAULT NULL,
  p_entity_type VARCHAR DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_event_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_email_enabled BOOLEAN := TRUE;
  v_category_email_allowed BOOLEAN := TRUE;
  v_prefs RECORD;
  v_user_exists BOOLEAN;
BEGIN
  -- 1. Validate recipient is provided
  IF p_recipient_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Suppress self-notifications (unless actor is NULL)
  IF p_actor_id IS NOT NULL AND p_recipient_id = p_actor_id THEN
    RETURN NULL;
  END IF;

  -- 3. Recipient safety: verify recipient exists in auth.users
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_recipient_id
  ) INTO v_user_exists;

  IF NOT v_user_exists THEN
    RETURN NULL;
  END IF;

  -- 4. Insert in-app notification with database-enforced idempotency
  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    category,
    type,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    p_recipient_id,
    p_actor_id,
    p_category,
    p_type,
    p_title,
    p_body,
    p_action_url,
    p_entity_type,
    p_entity_id,
    jsonb_build_object('event_key', p_event_key) || COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (recipient_id, ((metadata->>'event_key'))) WHERE (metadata->>'event_key') IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_notification_id;

  -- If duplicate event was already processed, return NULL (idempotent no-op)
  IF v_notification_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 5. Outbox Evaluation (Email channel)
  SELECT * INTO v_prefs
  FROM public.notification_preferences
  WHERE user_id = p_recipient_id;

  IF FOUND THEN
    v_email_enabled := v_prefs.email_enabled;
    CASE p_category
      WHEN 'CONNECTION' THEN v_category_email_allowed := v_prefs.email_connections;
      WHEN 'INVITATION' THEN v_category_email_allowed := v_prefs.email_invitations;
      WHEN 'CLAIM' THEN v_category_email_allowed := v_prefs.email_claims;
      WHEN 'VERIFICATION' THEN v_category_email_allowed := v_prefs.email_verifications;
      WHEN 'COMMUNITY' THEN v_category_email_allowed := v_prefs.email_announcements;
      WHEN 'EVENT' THEN v_category_email_allowed := v_prefs.email_events;
      WHEN 'FAMILY' THEN v_category_email_allowed := v_prefs.email_family_media;
      WHEN 'SECURITY' THEN v_category_email_allowed := TRUE;
      ELSE v_category_email_allowed := TRUE;
    END CASE;
  ELSE
    -- Default preferences (from schema defaults: announcements and family_media are default false)
    IF p_category IN ('COMMUNITY', 'FAMILY') THEN
      v_category_email_allowed := FALSE;
    ELSE
      v_category_email_allowed := TRUE;
    END IF;
  END IF;

  -- Queue for external email dispatch if preferences permit
  IF v_email_enabled AND v_category_email_allowed THEN
    INSERT INTO public.notification_outbox (
      notification_id,
      recipient_id,
      channel,
      status
    ) VALUES (
      v_notification_id,
      p_recipient_id,
      'EMAIL'::public.notification_channel,
      'PENDING'::public.notification_delivery_status
    )
    ON CONFLICT (notification_id, channel)
    DO NOTHING;
  END IF;

  RETURN v_notification_id;
END;
$$;

COMMENT ON FUNCTION public.emit_domain_notification IS
  'Internal security-definer helper to atomically insert idempotent notifications and outbox dispatches.';

-- Restrict execution to internal database triggers / service role
REVOKE ALL ON FUNCTION public.emit_domain_notification(UUID, UUID, public.notification_category, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_domain_notification(UUID, UUID, public.notification_category, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, UUID, TEXT, JSONB) TO postgres, service_role;

-- -----------------------------------------------------------------------------
-- 3. Connections Domain Triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_connection_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Event 1: New connection request received
  IF (TG_OP = 'INSERT' AND NEW.status = 'PENDING') THEN
    PERFORM public.emit_domain_notification(
      p_recipient_id := NEW.addressee_id,
      p_actor_id := NEW.requester_id,
      p_category := 'CONNECTION'::public.notification_category,
      p_type := 'connection_request',
      p_title := 'New Connection Request',
      p_body := 'You have received a new connection request.',
      p_action_url := '/connections',
      p_entity_type := 'connection',
      p_entity_id := NEW.id,
      p_event_key := 'connection:' || NEW.id || ':requested'
    );
  END IF;

  -- Event 2: Connection request accepted
  IF (TG_OP = 'UPDATE' AND OLD.status = 'PENDING' AND NEW.status = 'ACCEPTED') THEN
    PERFORM public.emit_domain_notification(
      p_recipient_id := NEW.requester_id,
      p_actor_id := NEW.addressee_id,
      p_category := 'CONNECTION'::public.notification_category,
      p_type := 'connection_accepted',
      p_title := 'Connection Request Accepted',
      p_body := 'Your connection request has been accepted.',
      p_action_url := '/connections',
      p_entity_type := 'connection',
      p_entity_id := NEW.id,
      p_event_key := 'connection:' || NEW.id || ':accepted'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_notification_events ON public.connections;
CREATE TRIGGER trg_connection_notification_events
  AFTER INSERT OR UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_connection_notification_events();

-- -----------------------------------------------------------------------------
-- 4. Person Claims Domain Triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_claim_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    -- Event: Claim Approved
    IF (OLD.status = 'PENDING' AND NEW.status = 'APPROVED') THEN
      PERFORM public.emit_domain_notification(
        p_recipient_id := NEW.claimant_id,
        p_actor_id := NEW.reviewed_by,
        p_category := 'CLAIM'::public.notification_category,
        p_type := 'claim_approved',
        p_title := 'Person Claim Approved',
        p_body := 'Your claim for the census person record has been approved.',
        p_action_url := '/claims',
        p_entity_type := 'person_claim',
        p_entity_id := NEW.id,
        p_event_key := 'claim:' || NEW.id || ':approved'
      );
    END IF;

    -- Event: Claim Rejected
    IF (OLD.status = 'PENDING' AND NEW.status = 'REJECTED') THEN
      PERFORM public.emit_domain_notification(
        p_recipient_id := NEW.claimant_id,
        p_actor_id := NEW.reviewed_by,
        p_category := 'CLAIM'::public.notification_category,
        p_type := 'claim_rejected',
        p_title := 'Person Claim Update',
        p_body := 'Your claim for the census person record was not approved.',
        p_action_url := '/claims',
        p_entity_type := 'person_claim',
        p_entity_id := NEW.id,
        p_event_key := 'claim:' || NEW.id || ':rejected'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_notification_events ON public.person_claims;
CREATE TRIGGER trg_claim_notification_events
  AFTER UPDATE ON public.person_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_claim_notification_events();

-- -----------------------------------------------------------------------------
-- 5. Invitations Domain Triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_invitation_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status = 'PENDING' AND NEW.status = 'ACCEPTED') THEN
    -- Notify the inviter (who is an authenticated user) that their invitation was accepted
    PERFORM public.emit_domain_notification(
      p_recipient_id := NEW.invited_by,
      p_actor_id := NEW.accepted_by,
      p_category := 'INVITATION'::public.notification_category,
      p_type := 'invitation_accepted',
      p_title := 'Invitation Accepted',
      p_body := 'Your invitation has been accepted.',
      p_action_url := '/families',
      p_entity_type := 'invitation',
      p_entity_id := NEW.id,
      p_event_key := 'invitation:' || NEW.id || ':accepted'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invitation_notification_events ON public.invitations;
CREATE TRIGGER trg_invitation_notification_events
  AFTER UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invitation_notification_events();

-- -----------------------------------------------------------------------------
-- 6. Verification Requests Domain Triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_verification_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    -- Event: Verification Approved
    IF (OLD.status = 'PENDING' AND NEW.status = 'APPROVED') THEN
      PERFORM public.emit_domain_notification(
        p_recipient_id := NEW.requester_id,
        p_actor_id := NEW.reviewed_by,
        p_category := 'VERIFICATION'::public.notification_category,
        p_type := 'verification_approved',
        p_title := 'Record Verification Approved',
        p_body := 'Your verification request for ' || lower(NEW.entity_type) || ' record has been approved.',
        p_action_url := '/verification',
        p_entity_type := 'verification_request',
        p_entity_id := NEW.id,
        p_event_key := 'verification:' || NEW.id || ':approved'
      );
    END IF;

    -- Event: Verification Rejected
    IF (OLD.status = 'PENDING' AND NEW.status = 'REJECTED') THEN
      PERFORM public.emit_domain_notification(
        p_recipient_id := NEW.requester_id,
        p_actor_id := NEW.reviewed_by,
        p_category := 'VERIFICATION'::public.notification_category,
        p_type := 'verification_rejected',
        p_title := 'Record Verification Update',
        p_body := 'Your verification request for ' || lower(NEW.entity_type) || ' record was not approved.',
        p_action_url := '/verification',
        p_entity_type := 'verification_request',
        p_entity_id := NEW.id,
        p_event_key := 'verification:' || NEW.id || ':rejected'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verification_notification_events ON public.verification_requests;
CREATE TRIGGER trg_verification_notification_events
  AFTER UPDATE ON public.verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_verification_notification_events();

-- -----------------------------------------------------------------------------
-- 7. Community Groups Domain Triggers (Role Update)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_group_member_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_slug TEXT;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role) THEN
    SELECT slug INTO v_group_slug FROM public.groups WHERE id = NEW.group_id;

    PERFORM public.emit_domain_notification(
      p_recipient_id := NEW.user_id,
      p_actor_id := auth.uid(),
      p_category := 'COMMUNITY'::public.notification_category,
      p_type := 'group_role_updated',
      p_title := 'Group Role Updated',
      p_body := 'Your role in the group has been updated to ' || NEW.role || '.',
      p_action_url := CASE WHEN v_group_slug IS NOT NULL THEN '/community/groups/' || v_group_slug ELSE '/community/groups' END,
      p_entity_type := 'group',
      p_entity_id := NEW.group_id,
      p_event_key := 'group_role:' || NEW.group_id || ':' || NEW.user_id || ':' || NEW.role
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_member_notification_events ON public.group_members;
CREATE TRIGGER trg_group_member_notification_events
  AFTER UPDATE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_group_member_notification_events();

-- -----------------------------------------------------------------------------
-- 8. Community Events Domain Triggers
-- -----------------------------------------------------------------------------

-- 8.1 Event Cancellation (notifies registered attendees)
CREATE OR REPLACE FUNCTION public.handle_event_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attendee RECORD;
BEGIN
  -- Event Cancelled: notify attendees who RSVP'd GOING or MAYBE
  IF (TG_OP = 'UPDATE' AND OLD.status <> 'CANCELLED' AND NEW.status = 'CANCELLED') THEN
    FOR v_attendee IN
      SELECT user_id
      FROM public.event_rsvps
      WHERE event_id = NEW.id
        AND status IN ('GOING', 'MAYBE')
        AND user_id <> NEW.creator_id
    LOOP
      PERFORM public.emit_domain_notification(
        p_recipient_id := v_attendee.user_id,
        p_actor_id := NEW.creator_id,
        p_category := 'EVENT'::public.notification_category,
        p_type := 'event_cancelled',
        p_title := 'Event Cancelled',
        p_body := 'The event "' || substring(NEW.title from 1 for 100) || '" has been cancelled.',
        p_action_url := '/community/events/' || NEW.id,
        p_entity_type := 'event',
        p_entity_id := NEW.id,
        p_event_key := 'event:' || NEW.id || ':cancelled:' || v_attendee.user_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_notification_events ON public.events;
CREATE TRIGGER trg_event_notification_events
  AFTER UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_event_notification_events();

-- 8.2 Event RSVP (notifies event organizer when member RSVPs GOING)
CREATE OR REPLACE FUNCTION public.handle_event_rsvp_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
  v_event_title TEXT;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'GOING') OR
     (TG_OP = 'UPDATE' AND OLD.status <> 'GOING' AND NEW.status = 'GOING') THEN
    SELECT creator_id, title INTO v_creator_id, v_event_title
    FROM public.events
    WHERE id = NEW.event_id;

    IF v_creator_id IS NOT NULL AND v_creator_id <> NEW.user_id THEN
      PERFORM public.emit_domain_notification(
        p_recipient_id := v_creator_id,
        p_actor_id := NEW.user_id,
        p_category := 'EVENT'::public.notification_category,
        p_type := 'event_rsvp',
        p_title := 'New Event RSVP',
        p_body := 'A member has RSVP''d Going to your event.',
        p_action_url := '/community/events/' || NEW.event_id,
        p_entity_type := 'event',
        p_entity_id := NEW.event_id,
        p_event_key := 'event_rsvp:' || NEW.event_id || ':' || NEW.user_id || ':going:' || to_char(NEW.updated_at, 'YYYYMMDDHH24MISSUS')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_rsvp_notification_events ON public.event_rsvps;
CREATE TRIGGER trg_event_rsvp_notification_events
  AFTER INSERT OR UPDATE ON public.event_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_event_rsvp_notification_events();

-- -----------------------------------------------------------------------------
-- 9. Family Media & Stories Domain Triggers
-- -----------------------------------------------------------------------------

-- 9.1 Family Media (notifies registered family members when photo/document added)
CREATE OR REPLACE FUNCTION public.handle_family_media_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    FOR v_member IN
      SELECT DISTINCT p.user_id
      FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = NEW.family_id
        AND fm.left_at IS NULL
        AND p.deleted_at IS NULL
        AND p.user_id IS NOT NULL
        AND (NEW.uploaded_by IS NULL OR p.user_id <> NEW.uploaded_by)
    LOOP
      PERFORM public.emit_domain_notification(
        p_recipient_id := v_member.user_id,
        p_actor_id := NEW.uploaded_by,
        p_category := 'FAMILY'::public.notification_category,
        p_type := 'family_photo_added',
        p_title := 'New Family Media Added',
        p_body := 'New media was added to your family archive.',
        p_action_url := '/family/media',
        p_entity_type := 'family_media',
        p_entity_id := NEW.id,
        p_event_key := 'family_media:' || NEW.id || ':' || v_member.user_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_media_notification_events ON public.family_media;
CREATE TRIGGER trg_family_media_notification_events
  AFTER INSERT ON public.family_media
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_media_notification_events();

-- 9.2 Family Stories (notifies registered family members when historical story added)
CREATE OR REPLACE FUNCTION public.handle_family_story_notification_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    FOR v_member IN
      SELECT DISTINCT p.user_id
      FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = NEW.family_id
        AND fm.left_at IS NULL
        AND p.deleted_at IS NULL
        AND p.user_id IS NOT NULL
        AND (NEW.author_id IS NULL OR p.user_id <> NEW.author_id)
    LOOP
      PERFORM public.emit_domain_notification(
        p_recipient_id := v_member.user_id,
        p_actor_id := NEW.author_id,
        p_category := 'FAMILY'::public.notification_category,
        p_type := 'family_story_added',
        p_title := 'New Family Story Preserved',
        p_body := 'A new story was preserved in your family history.',
        p_action_url := '/family/history',
        p_entity_type := 'family_story',
        p_entity_id := NEW.id,
        p_event_key := 'family_story:' || NEW.id || ':' || v_member.user_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_story_notification_events ON public.family_stories;
CREATE TRIGGER trg_family_story_notification_events
  AFTER INSERT ON public.family_stories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_story_notification_events();
