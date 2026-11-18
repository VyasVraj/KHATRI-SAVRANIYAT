-- =============================================================================
-- Migration: 20261111140000_remove_mukhi_authority_and_audit.sql
-- Description:
--   1. Complete Mukhi Removal System:
--      - Adds removal tracking columns to public.community_mukhis:
--        * removed_at TIMESTAMPTZ
--        * removed_by UUID REFERENCES auth.users(id)
--        * removal_reason TEXT
--      - Updates public.mukhi_authority_audit_logs CHECK constraint to include
--        'REMOVE' and 'REMOVE_MUKHI'.
--      - Implements public.remove_mukhi_authority(p_mukhi_id UUID, p_reason TEXT):
--        * Verifies caller has ADMIN or SUPER_ADMIN permission.
--        * Sets authority_status = 'REMOVED' and is_active = FALSE.
--        * Downgrades linked user's profile role from 'MUKHI' to 'MEMBER'
--          while strictly preserving 'ADMIN' and 'SUPER_ADMIN'.
--        * Preserves all original records (auth user, census person profile,
--          family membership, family relationships, tree links, Gotra, Nukh).
--        * Inserts immutable audit record in public.mukhi_authority_audit_logs.
--   2. Dynamic Active Mukhi Count Synchronization:
--      - public.get_active_mukhi_count() strictly filters is_active = TRUE AND authority_status = 'ACTIVE'.
--      - Setting authority_status = 'REMOVED' immediately decrements the count.
--   3. Prevent Automatic Role Restoration:
--      - public.sync_my_mukhi_status() and public.handle_community_mukhi_before_save()
--        explicitly exclude 'REMOVED' records from email matching.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Add Removal Tracking Columns to public.community_mukhis
-- -----------------------------------------------------------------------------
ALTER TABLE public.community_mukhis
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removal_reason TEXT;

-- -----------------------------------------------------------------------------
-- 2. Update Check Constraint on public.mukhi_authority_audit_logs
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  -- Drop existing check constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'mukhi_authority_audit_logs_action_check'
  ) THEN
    ALTER TABLE public.mukhi_authority_audit_logs
      DROP CONSTRAINT mukhi_authority_audit_logs_action_check;
  END IF;

  -- Add updated check constraint allowing REMOVE and REMOVE_MUKHI
  ALTER TABLE public.mukhi_authority_audit_logs
    ADD CONSTRAINT mukhi_authority_audit_logs_action_check
    CHECK (action IN ('DEACTIVATE', 'REACTIVATE', 'STATUS_CHANGE', 'UPSERT', 'REMOVE', 'REMOVE_MUKHI'));
EXCEPTION
  WHEN undefined_table THEN
    -- Table does not exist yet; create it
    CREATE TABLE IF NOT EXISTS public.mukhi_authority_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mukhi_id UUID NOT NULL REFERENCES public.community_mukhis(id) ON DELETE CASCADE,
      mukhi_unique_id TEXT,
      linked_person_id UUID,
      linked_user_id UUID,
      action TEXT NOT NULL CHECK (action IN ('DEACTIVATE', 'REACTIVATE', 'STATUS_CHANGE', 'UPSERT', 'REMOVE', 'REMOVE_MUKHI')),
      old_status TEXT,
      new_status TEXT NOT NULL,
      reason TEXT,
      performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
END $$;

-- -----------------------------------------------------------------------------
-- 3. RPC: public.remove_mukhi_authority
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_mukhi_authority(
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
  v_effective_reason TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- Verify administrative authority
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id
      AND role::text IN ('ADMIN', 'SUPER_ADMIN')
      AND is_active = TRUE
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Permission denied. Only Admins can remove Mukhi authority.' USING ERRCODE = '42501';
  END IF;

  -- Lookup target Mukhi
  SELECT * INTO v_mukhi
  FROM public.community_mukhis
  WHERE id = p_mukhi_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mukhi record not found with ID %.', p_mukhi_id USING ERRCODE = 'P0002';
  END IF;

  v_old_status := COALESCE(v_mukhi.authority_status, 'ACTIVE');
  v_effective_reason := COALESCE(NULLIF(trim(p_reason), ''), 'Removed from Mukhi position by administrator');

  -- Update target Mukhi record: set REMOVED, is_active = FALSE
  UPDATE public.community_mukhis
  SET authority_status = 'REMOVED',
      is_active = FALSE,
      removed_at = NOW(),
      removed_by = v_caller_id,
      removal_reason = v_effective_reason,
      updated_at = NOW()
  WHERE id = p_mukhi_id;

  -- Role Adjustment:
  -- If target Mukhi is linked to a user account, downgrade role to MEMBER
  -- while strictly preserving ADMIN and SUPER_ADMIN roles.
  IF v_mukhi.linked_user_id IS NOT NULL THEN
    -- Check if this user holds any other active Mukhi assignment
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

  -- Record this removal event in public.mukhi_authority_audit_logs
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
    'REMOVE',
    v_old_status,
    'REMOVED',
    v_effective_reason,
    v_caller_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'mukhi_id', p_mukhi_id,
    'mukhi_unique_id', v_mukhi.mukhi_unique_id,
    'old_status', v_old_status,
    'new_status', 'REMOVED',
    'downgraded_user', v_downgraded_user,
    'linked_person_id', v_mukhi.linked_person_id,
    'linked_user_id', v_mukhi.linked_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_mukhi_authority(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Update public.handle_community_mukhi_before_save Trigger Function
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
    -- If deactivated or removed, downgrade linked user if no other active Mukhi seat
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
-- 5. Update public.sync_my_mukhi_status (Prevent Removed / Inactive Restoration)
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
  v_current_role TEXT;
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

  SELECT role::text INTO v_current_role
  FROM public.profiles
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

      RETURN jsonb_build_object(
        'success', true,
        'status', 'ACTIVE_MUKHI',
        'mukhi_id', v_active_mukhi.id,
        'mukhi_unique_id', v_active_mukhi.mukhi_unique_id
      );
    ELSE
      -- No active Mukhi assignment: if user currently has MUKHI role, downgrade to MEMBER
      IF v_current_role = 'MUKHI' THEN
        UPDATE public.profiles
        SET role = 'MEMBER', updated_at = NOW()
        WHERE id = v_user_id;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'status', 'NOT_ACTIVE_MUKHI',
        'current_role', COALESCE(v_current_role, 'MEMBER')
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'NO_CONFIRMED_EMAIL');
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_my_mukhi_status() TO authenticated;

COMMIT;
