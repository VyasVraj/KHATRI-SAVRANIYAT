-- =============================================================================
-- Migration: 20261026200000_enforce_privacy_authorization_lock.sql
-- Description: Enforce server-side privacy authorization lock for persons & families
-- Task: ANDROID-2 — Privacy Authorization Lock
--
-- Authorization Model:
--   SUPER_ADMIN          -> ALLOW
--   ADMIN                -> ALLOW
--   COMMUNITY_MODERATOR  -> ALLOW (Temporary Mukhi-equivalent)
--   COMMITTEE_MEMBER     -> DENY
--   FAMILY_HEAD          -> DENY
--   MEMBER               -> DENY
--   GUEST                -> DENY
--
-- Security Invariants:
--   1. Server-side boundary rejects unauthorized direct UPDATE on privacy columns.
--   2. Normal users (MEMBER, FAMILY_HEAD, etc.) cannot modify privacy settings
--      even if they own or created the record.
--   3. Privacy column modifications are audited via public.log_audit_event.
--   4. Default privacy on creation is hardened to 'PRIVATE'.
--   5. Unrelated updates to profile/person/family fields are NOT blocked.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper Function: can_manage_privacy_settings()
-- -----------------------------------------------------------------------------
-- Returns TRUE if the current session belongs to an active SUPER_ADMIN, ADMIN,
-- or COMMUNITY_MODERATOR (temporary Mukhi-equivalent).
-- Returns FALSE for COMMITTEE_MEMBER, FAMILY_HEAD, MEMBER, GUEST, or anon.

CREATE OR REPLACE FUNCTION public.can_manage_privacy_settings()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('SUPER_ADMIN', 'ADMIN', 'COMMUNITY_MODERATOR')
      AND is_active = TRUE
  );
$$;

COMMENT ON FUNCTION public.can_manage_privacy_settings() IS
  'Authorization check for privacy setting management. '
  'Authorized: SUPER_ADMIN, ADMIN, and COMMUNITY_MODERATOR (temporary Mukhi-equivalent). '
  'Denied: COMMITTEE_MEMBER, FAMILY_HEAD, MEMBER, GUEST.';

REVOKE ALL ON FUNCTION public.can_manage_privacy_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_privacy_settings() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Update Column Defaults on persons and families to 'PRIVATE'
-- -----------------------------------------------------------------------------
-- Hardens creation default to 'PRIVATE' as required by ANDROID-2 Section 11.

ALTER TABLE public.persons ALTER COLUMN profile_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;
ALTER TABLE public.persons ALTER COLUMN dob_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;
ALTER TABLE public.persons ALTER COLUMN contact_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;

ALTER TABLE public.families ALTER COLUMN profile_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;
ALTER TABLE public.families ALTER COLUMN members_privacy SET DEFAULT 'PRIVATE'::public.privacy_level;

-- -----------------------------------------------------------------------------
-- 3. Trigger Guard on persons: handle_person_privacy_update_guard()
-- -----------------------------------------------------------------------------
-- Intercepts UPDATE on public.persons. If any privacy setting column
-- (profile_privacy, dob_privacy, contact_privacy) is changed:
--   - Rejects unauthorized callers with error code 42501 (insufficient privilege).
--   - Records an immutable audit log entry in public.audit_logs.

CREATE OR REPLACE FUNCTION public.handle_person_privacy_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Detect modifications to any of the 3 privacy columns
  IF (NEW.profile_privacy IS DISTINCT FROM OLD.profile_privacy) OR
     (NEW.dob_privacy IS DISTINCT FROM OLD.dob_privacy) OR
     (NEW.contact_privacy IS DISTINCT FROM OLD.contact_privacy) THEN

    -- Verify caller authorization
    IF NOT public.can_manage_privacy_settings() THEN
      RAISE EXCEPTION 'Unauthorized: Normal users cannot modify profile privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
        USING ERRCODE = '42501';
    END IF;

    -- Record immutable audit log entry
    PERFORM public.log_audit_event(
      'ADMIN_ACTION'::public.audit_action,
      'person',
      NEW.id,
      jsonb_build_object(
        'profile_privacy', OLD.profile_privacy,
        'dob_privacy', OLD.dob_privacy,
        'contact_privacy', OLD.contact_privacy
      ),
      jsonb_build_object(
        'profile_privacy', NEW.profile_privacy,
        'dob_privacy', NEW.dob_privacy,
        'contact_privacy', NEW.contact_privacy
      ),
      jsonb_build_object(
        'action_type', 'PRIVACY_SETTING_CHANGED',
        'actor_role', public.get_my_role()
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_person_privacy_update_guard() IS
  'Trigger guard preventing unauthorized updates to person privacy columns and auditing authorized changes.';

DROP TRIGGER IF EXISTS trg_person_privacy_update_guard ON public.persons;
CREATE TRIGGER trg_person_privacy_update_guard
  BEFORE UPDATE ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_person_privacy_update_guard();

-- -----------------------------------------------------------------------------
-- 4. Trigger Guard on families: handle_family_privacy_update_guard()
-- -----------------------------------------------------------------------------
-- Intercepts UPDATE on public.families. If profile_privacy or members_privacy
-- is changed:
--   - Rejects unauthorized callers with error code 42501.
--   - Records an immutable audit log entry in public.audit_logs.

CREATE OR REPLACE FUNCTION public.handle_family_privacy_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Detect modifications to either family privacy column
  IF (NEW.profile_privacy IS DISTINCT FROM OLD.profile_privacy) OR
     (NEW.members_privacy IS DISTINCT FROM OLD.members_privacy) THEN

    -- Verify caller authorization
    IF NOT public.can_manage_privacy_settings() THEN
      RAISE EXCEPTION 'Unauthorized: Normal users cannot modify family privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
        USING ERRCODE = '42501';
    END IF;

    -- Record immutable audit log entry
    PERFORM public.log_audit_event(
      'ADMIN_ACTION'::public.audit_action,
      'family',
      NEW.id,
      jsonb_build_object(
        'profile_privacy', OLD.profile_privacy,
        'members_privacy', OLD.members_privacy
      ),
      jsonb_build_object(
        'profile_privacy', NEW.profile_privacy,
        'members_privacy', NEW.members_privacy
      ),
      jsonb_build_object(
        'action_type', 'PRIVACY_SETTING_CHANGED',
        'actor_role', public.get_my_role()
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_family_privacy_update_guard() IS
  'Trigger guard preventing unauthorized updates to family privacy columns and auditing authorized changes.';

DROP TRIGGER IF EXISTS trg_family_privacy_update_guard ON public.families;
CREATE TRIGGER trg_family_privacy_update_guard
  BEFORE UPDATE ON public.families
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_privacy_update_guard();

-- -----------------------------------------------------------------------------
-- 5. Trigger Guards for INSERT: Enforce 'PRIVATE' Default for Unauthorized Callers
-- -----------------------------------------------------------------------------
-- If an unauthorized caller attempts to inject custom privacy settings on INSERT,
-- the trigger silently forces them to the safe default 'PRIVATE'.

CREATE OR REPLACE FUNCTION public.handle_person_privacy_insert_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_privacy_settings() THEN
    NEW.profile_privacy := 'PRIVATE'::public.privacy_level;
    NEW.dob_privacy := 'PRIVATE'::public.privacy_level;
    NEW.contact_privacy := 'PRIVATE'::public.privacy_level;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_person_privacy_insert_guard ON public.persons;
CREATE TRIGGER trg_person_privacy_insert_guard
  BEFORE INSERT ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_person_privacy_insert_guard();

CREATE OR REPLACE FUNCTION public.handle_family_privacy_insert_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_privacy_settings() THEN
    NEW.profile_privacy := 'PRIVATE'::public.privacy_level;
    NEW.members_privacy := 'PRIVATE'::public.privacy_level;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_privacy_insert_guard ON public.families;
CREATE TRIGGER trg_family_privacy_insert_guard
  BEFORE INSERT ON public.families
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_privacy_insert_guard();

-- -----------------------------------------------------------------------------
-- 6. Dedicated Server-Authoritative RPCs for Privacy Management
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_person_privacy(
  p_person_id UUID,
  p_profile_privacy public.privacy_level,
  p_contact_privacy public.privacy_level,
  p_dob_privacy public.privacy_level
)
RETURNS public.persons
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person public.persons;
BEGIN
  IF NOT public.can_manage_privacy_settings() THEN
    RAISE EXCEPTION 'Unauthorized: Normal users cannot modify privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.persons
  SET
    profile_privacy = p_profile_privacy,
    contact_privacy = p_contact_privacy,
    dob_privacy = p_dob_privacy,
    updated_at = NOW()
  WHERE id = p_person_id
    AND deleted_at IS NULL
  RETURNING * INTO v_person;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found or has been deleted' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_person;
END;
$$;

COMMENT ON FUNCTION public.admin_set_person_privacy IS
  'Administrative RPC to explicitly set person privacy levels. Restricted to Mukhi/Admin.';

REVOKE ALL ON FUNCTION public.admin_set_person_privacy(UUID, public.privacy_level, public.privacy_level, public.privacy_level) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_person_privacy(UUID, public.privacy_level, public.privacy_level, public.privacy_level) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_family_privacy(
  p_family_id UUID,
  p_profile_privacy public.privacy_level,
  p_members_privacy public.privacy_level
)
RETURNS public.families
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family public.families;
BEGIN
  IF NOT public.can_manage_privacy_settings() THEN
    RAISE EXCEPTION 'Unauthorized: Normal users cannot modify privacy settings. Only an authorized Mukhi or Administrator may modify privacy settings.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.families
  SET
    profile_privacy = p_profile_privacy,
    members_privacy = p_members_privacy,
    updated_at = NOW()
  WHERE id = p_family_id
    AND deleted_at IS NULL
  RETURNING * INTO v_family;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Family record not found or has been deleted' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_family;
END;
$$;

COMMENT ON FUNCTION public.admin_set_family_privacy IS
  'Administrative RPC to explicitly set family privacy levels. Restricted to Mukhi/Admin.';

REVOKE ALL ON FUNCTION public.admin_set_family_privacy(UUID, public.privacy_level, public.privacy_level) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_family_privacy(UUID, public.privacy_level, public.privacy_level) TO authenticated;
