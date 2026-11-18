-- =============================================================================
-- Migration: 20261109140000_mukhi_deactivation_and_count_sync.sql
-- Description:
--   1. Deactivate & Reactivate Mukhi Authority:
--      - Admin/Super Admin controlled RPC functions:
--        * public.deactivate_mukhi_authority(p_mukhi_id UUID, p_reason TEXT)
--        * public.reactivate_mukhi_authority(p_mukhi_id UUID)
--      - Sets authority_status = 'INACTIVE' and is_active = FALSE on deactivation.
--      - Automatically downgrades linked user's profile role from 'MUKHI' to 'MEMBER'
--        (preserving 'ADMIN' and 'SUPER_ADMIN').
--      - Preserves all original Mukhi details (ID, name, region, Gotra, Nukh, linked person ID)
--        without deleting any auth user, person, family or census record.
--   2. Audit Log History:
--      - Immutable audit table public.mukhi_authority_audit_logs recording
--        mukhi ID, unique ID, linked person/user, old status, new status,
--        action, admin user ID, timestamp, and optional reason.
--   3. Directory View & Dynamic Count Sync:
--      - Recreates public.community_mukhis_directory to strictly filter
--        WHERE is_active = TRUE AND authority_status = 'ACTIVE'.
--      - Implements public.get_active_mukhi_count() returning dynamic count of active Mukhis.
--   4. Prevent Automatic Role Restoration:
--      - Updates public.sync_my_mukhi_status() and public.handle_community_mukhi_before_save()
--        to guarantee inactive/revoked status always takes precedence over email matching.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Add Deactivation & Reactivation Columns to public.community_mukhis
-- -----------------------------------------------------------------------------
ALTER TABLE public.community_mukhis
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT,
  ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 2. Mukhi Authority Audit Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mukhi_authority_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mukhi_id UUID NOT NULL REFERENCES public.community_mukhis(id) ON DELETE CASCADE,
  mukhi_unique_id TEXT,
  linked_person_id UUID,
  linked_user_id UUID,
  action TEXT NOT NULL CHECK (action IN ('DEACTIVATE', 'REACTIVATE', 'STATUS_CHANGE', 'UPSERT')),
  old_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mukhi_audit_mukhi_id
  ON public.mukhi_authority_audit_logs(mukhi_id);

CREATE INDEX IF NOT EXISTS idx_mukhi_audit_created_at
  ON public.mukhi_authority_audit_logs(created_at DESC);

ALTER TABLE public.mukhi_authority_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view audit logs
DROP POLICY IF EXISTS mukhi_audit_admin_select ON public.mukhi_authority_audit_logs;
CREATE POLICY mukhi_audit_admin_select ON public.mukhi_authority_audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role::text IN ('ADMIN', 'SUPER_ADMIN')
        AND profiles.is_active = TRUE
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Dynamic Active Mukhi Count Function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_mukhi_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.community_mukhis
  WHERE is_active = TRUE
    AND authority_status = 'ACTIVE';
$$;

GRANT EXECUTE ON FUNCTION public.get_active_mukhi_count() TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4. Recreate public.community_mukhis_directory View (Strict Active Authority Filter)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.community_mukhis_directory CASCADE;

CREATE VIEW public.community_mukhis_directory AS
SELECT
  id,
  source_serial_number,
  full_name,
  gram,
  mobile_number,
  gotra,
  nukh,
  mukhi_unique_id,
  authority_status,
  account_linking_status,
  linked_user_id,
  linked_person_id,
  is_active,
  created_at,
  updated_at
FROM public.community_mukhis
WHERE is_active = TRUE
  AND authority_status = 'ACTIVE';

COMMENT ON VIEW public.community_mukhis_directory IS
  'Public-safe directory view of active official community Mukhis. Omits internal onboarding flags and email, and strictly excludes inactive or deactivated authority records.';

GRANT SELECT ON public.community_mukhis_directory TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 5. RPC: public.deactivate_mukhi_authority
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_mukhi_authority(
  p_mukhi_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_mukhi RECORD;
  v_old_status TEXT;
  v_other_active_mukhi_count INT;
  v_downgraded_user BOOLEAN := FALSE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- Admin check
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id
      AND role::text IN ('ADMIN', 'SUPER_ADMIN')
      AND is_active = TRUE
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Permission denied. Only Admins can deactivate a Mukhi.' USING ERRCODE = '42501';
  END IF;

  -- Lookup target Mukhi
  SELECT * INTO v_mukhi
  FROM public.community_mukhis
  WHERE id = p_mukhi_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mukhi record not found with ID %.', p_mukhi_id USING ERRCODE = 'P0002';
  END IF;

  v_old_status := COALESCE(v_mukhi.authority_status, 'ACTIVE');

  -- Update community_mukhis table: set INACTIVE and is_active = FALSE
  UPDATE public.community_mukhis
  SET authority_status = 'INACTIVE',
      is_active = FALSE,
      deactivated_at = NOW(),
      deactivated_by = v_caller_id,
      deactivation_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_mukhi_id;

  -- Downgrade linked user's role to MEMBER if linked
  IF v_mukhi.linked_user_id IS NOT NULL THEN
    -- Check if user is linked to any other active Mukhi record
    SELECT COUNT(*) INTO v_other_active_mukhi_count
    FROM public.community_mukhis
    WHERE linked_user_id = v_mukhi.linked_user_id
      AND id != p_mukhi_id
      AND is_active = TRUE
      AND authority_status = 'ACTIVE';

    IF v_other_active_mukhi_count = 0 THEN
      UPDATE public.profiles
      SET role = 'MEMBER',
          updated_at = NOW()
      WHERE id = v_mukhi.linked_user_id
        AND role::text NOT IN ('ADMIN', 'SUPER_ADMIN');

      v_downgraded_user := TRUE;
    END IF;
  END IF;

  -- Insert into mukhi_authority_audit_logs
  INSERT INTO public.mukhi_authority_audit_logs (
    mukhi_id,
    mukhi_unique_id,
    linked_person_id,
    linked_user_id,
    action,
    old_status,
    new_status,
    reason,
    performed_by,
    created_at
  ) VALUES (
    p_mukhi_id,
    v_mukhi.mukhi_unique_id,
    v_mukhi.linked_person_id,
    v_mukhi.linked_user_id,
    'DEACTIVATE',
    v_old_status,
    'INACTIVE',
    p_reason,
    v_caller_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'mukhi_id', p_mukhi_id,
    'mukhi_unique_id', v_mukhi.mukhi_unique_id,
    'old_status', v_old_status,
    'new_status', 'INACTIVE',
    'downgraded_user', v_downgraded_user,
    'linked_person_id', v_mukhi.linked_person_id,
    'linked_user_id', v_mukhi.linked_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deactivate_mukhi_authority(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC: public.reactivate_mukhi_authority
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reactivate_mukhi_authority(
  p_mukhi_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_mukhi RECORD;
  v_old_status TEXT;
  v_restored_user BOOLEAN := FALSE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- Admin check
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id
      AND role::text IN ('ADMIN', 'SUPER_ADMIN')
      AND is_active = TRUE
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Permission denied. Only Admins can reactivate a Mukhi.' USING ERRCODE = '42501';
  END IF;

  -- Lookup target Mukhi
  SELECT * INTO v_mukhi
  FROM public.community_mukhis
  WHERE id = p_mukhi_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mukhi record not found with ID %.', p_mukhi_id USING ERRCODE = 'P0002';
  END IF;

  v_old_status := COALESCE(v_mukhi.authority_status, 'INACTIVE');

  -- Update community_mukhis table: set ACTIVE and is_active = TRUE
  UPDATE public.community_mukhis
  SET authority_status = 'ACTIVE',
      is_active = TRUE,
      reactivated_at = NOW(),
      reactivated_by = v_caller_id,
      updated_at = NOW()
  WHERE id = p_mukhi_id;

  -- Restore linked user's role to MUKHI if linked and not admin
  IF v_mukhi.linked_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'MUKHI',
        updated_at = NOW()
    WHERE id = v_mukhi.linked_user_id
      AND role::text NOT IN ('ADMIN', 'SUPER_ADMIN');

    v_restored_user := TRUE;
  END IF;

  -- Insert into mukhi_authority_audit_logs
  INSERT INTO public.mukhi_authority_audit_logs (
    mukhi_id,
    mukhi_unique_id,
    linked_person_id,
    linked_user_id,
    action,
    old_status,
    new_status,
    reason,
    performed_by,
    created_at
  ) VALUES (
    p_mukhi_id,
    v_mukhi.mukhi_unique_id,
    v_mukhi.linked_person_id,
    v_mukhi.linked_user_id,
    'REACTIVATE',
    v_old_status,
    'ACTIVE',
    'Reactivated by administrator',
    v_caller_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'mukhi_id', p_mukhi_id,
    'mukhi_unique_id', v_mukhi.mukhi_unique_id,
    'old_status', v_old_status,
    'new_status', 'ACTIVE',
    'restored_user', v_restored_user,
    'linked_person_id', v_mukhi.linked_person_id,
    'linked_user_id', v_mukhi.linked_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reactivate_mukhi_authority(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Update public.handle_community_mukhi_before_save Trigger Function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_community_mukhi_before_save()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_matching_user_id UUID;
  v_other_active INT;
BEGIN
  -- Normalize email
  IF NEW.official_email IS NOT NULL THEN
    NEW.official_email := lower(trim(NEW.official_email));
    IF NEW.official_email = '' THEN
      NEW.official_email := NULL;
    END IF;
  END IF;

  -- Auto-generate MUK-XXXX ID if missing
  IF NEW.mukhi_unique_id IS NULL OR trim(NEW.mukhi_unique_id) = '' THEN
    NEW.mukhi_unique_id := 'MUK-' || lpad(nextval('public.mukhi_unique_id_seq')::text, 4, '0');
  END IF;

  -- Default authority status to ACTIVE
  IF NEW.authority_status IS NULL THEN
    NEW.authority_status := 'ACTIVE';
  END IF;

  -- Synchronize is_active flag with authority_status
  IF NEW.authority_status != 'ACTIVE' THEN
    NEW.is_active := FALSE;
  END IF;

  -- Handle ACTIVE authority: Automatic Mukhi Identification through verified Supabase Auth email
  IF NEW.official_email IS NOT NULL AND NEW.authority_status = 'ACTIVE' AND NEW.is_active = TRUE THEN
    SELECT id INTO v_matching_user_id
    FROM auth.users
    WHERE lower(trim(email)) = NEW.official_email
      AND email_confirmed_at IS NOT NULL;

    IF v_matching_user_id IS NOT NULL THEN
      NEW.linked_user_id := v_matching_user_id;
      NEW.account_linking_status := 'LINKED';

      -- Upgrade role to MUKHI in profiles (never touch ADMIN or SUPER_ADMIN)
      UPDATE public.profiles
      SET role = 'MUKHI', updated_at = NOW()
      WHERE id = v_matching_user_id
        AND role::text NOT IN ('ADMIN', 'SUPER_ADMIN');
    ELSE
      IF NEW.linked_user_id IS NULL THEN
        NEW.account_linking_status := 'NOT_REGISTERED';
      END IF;
    END IF;
  ELSIF NEW.authority_status != 'ACTIVE' OR NEW.is_active = FALSE THEN
    -- If deactivated or revoked, downgrade linked user if no other active Mukhi seat
    IF NEW.linked_user_id IS NOT NULL THEN
      NEW.account_linking_status := 'UNLINKED';

      SELECT COUNT(*) INTO v_other_active
      FROM public.community_mukhis
      WHERE linked_user_id = NEW.linked_user_id
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND is_active = TRUE
        AND authority_status = 'ACTIVE';

      IF v_other_active = 0 THEN
        UPDATE public.profiles
        SET role = 'MEMBER', updated_at = NOW()
        WHERE id = NEW.linked_user_id
          AND role::text NOT IN ('ADMIN', 'SUPER_ADMIN');
      END IF;
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Update public.sync_my_mukhi_status (Prevent Stale / Inactive Role Restoration)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_my_mukhi_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_email_confirmed_at TIMESTAMPTZ;
  v_active_mukhi RECORD;
  v_current_level TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated');
  END IF;

  -- Fetch user email and confirmation timestamp from auth.users
  SELECT lower(trim(email)), email_confirmed_at 
  INTO v_email, v_email_confirmed_at
  FROM auth.users
  WHERE id = v_user_id;

  -- RULE: A user can only hold MUKHI role if email is confirmed AND an ACTIVE mukhi record matches
  IF v_email IS NOT NULL AND v_email_confirmed_at IS NOT NULL THEN
    SELECT * INTO v_active_mukhi
    FROM public.community_mukhis
    WHERE lower(trim(official_email)) = v_email
      AND authority_status = 'ACTIVE'
      AND is_active = TRUE
    LIMIT 1;

    IF FOUND THEN
      -- Link user ID to active Mukhi record
      UPDATE public.community_mukhis
      SET linked_user_id = v_user_id,
          account_linking_status = 'LINKED',
          updated_at = NOW()
      WHERE id = v_active_mukhi.id;

      -- Upgrade user profile role to MUKHI (never override ADMIN or SUPER_ADMIN)
      UPDATE public.profiles
      SET role = 'MUKHI', updated_at = NOW()
      WHERE id = v_user_id
        AND role::text NOT IN ('ADMIN', 'SUPER_ADMIN');
    ELSE
      -- Deactivation / Revocation enforcement:
      -- If user has no ACTIVE Mukhi match, revert role to MEMBER (unless ADMIN or SUPER_ADMIN).
      UPDATE public.profiles
      SET role = 'MEMBER', updated_at = NOW()
      WHERE id = v_user_id
        AND role::text = 'MUKHI';

      -- Unlink any stale community_mukhis pointers
      UPDATE public.community_mukhis
      SET linked_user_id = NULL,
          account_linking_status = 'UNLINKED',
          updated_at = NOW()
      WHERE linked_user_id = v_user_id
        AND (authority_status != 'ACTIVE' OR is_active = FALSE OR lower(trim(official_email)) != v_email);
    END IF;
  ELSE
    -- Unconfirmed email: ensure user cannot retain MUKHI role
    UPDATE public.profiles
    SET role = 'MEMBER', updated_at = NOW()
    WHERE id = v_user_id
      AND role::text = 'MUKHI';
  END IF;

  v_current_level := public.get_user_authority_level(v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'authority_level', v_current_level,
    'is_mukhi', (v_current_level IN ('MUKHI', 'ADMIN', 'SUPER_ADMIN')),
    'email_verified', (v_email_confirmed_at IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_my_mukhi_status() TO authenticated;

COMMIT;
