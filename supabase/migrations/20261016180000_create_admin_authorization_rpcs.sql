-- =============================================================================
-- Migration: 20261016180000_create_admin_authorization_rpcs.sql
-- Purpose:   Phase 13 Subtask 1 — Admin Authorization Infrastructure, Database RPCs
--             1. Server-authoritative role change RPC:
--                - public.admin_update_user_role(p_user_id UUID, p_new_role public.user_role)
--             2. Server-authoritative account status RPC:
--                - public.admin_set_user_status(p_user_id UUID, p_is_active BOOLEAN, p_reason TEXT)
--             3. Server-authoritative audit logs query RPC:
--                - public.admin_get_audit_logs(...)
--             4. Platform summary metrics RPC:
--                - public.admin_get_platform_metrics()
--             5. Strict Least-Privilege & Role Hierarchy Security:
--                - Execution revoked from PUBLIC and anon
--                - ADMIN cannot grant SUPER_ADMIN
--                - ADMIN cannot modify or deactivate SUPER_ADMIN
--                - Self-demotion and self-deactivation protections
--                - Protection for the sole active SUPER_ADMIN
--                - Automated audit logging (USER_ROLE_CHANGED, USER_DEACTIVATED, USER_REACTIVATED)
--                - Strict adherence to PERSON != USER
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. PERSON != USER:
--    Administrative operations on accounts modify public.profiles and auth.users,
--    NEVER public.persons. Deactivating an account disables login capabilities,
--    but preserves all historical census records, relationships, and lineage.
--
-- 2. ROLE HIERARCHY DEFENSE:
--    Role changes route through server-authoritative logic. An ADMIN cannot
--    escalate any account to SUPER_ADMIN, nor demote/deactivate a SUPER_ADMIN.
--    The final active SUPER_ADMIN cannot be demoted or deactivated.
--
-- 3. AUDIT IMMUTABILITY:
--    All administrative actions generate immutable entries in public.audit_logs
--    via public.log_audit_event().
--
-- 4. LEAST PRIVILEGE & BYPASS MITIGATION:
--    COMMUNITY_MODERATOR is strictly blocked from user administration and audit logs.
--    Direct table updates to public.profiles by ADMINs (previously permitted under
--    profiles_update_admin) are revoked to prevent role escalation, account
--    tampering, and audit log circumvention.
--    All functions declare SECURITY DEFINER with explicit search_path = public, auth.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. RLS Hardening: Eliminate Direct Profiles Mutation Bypass
-- -----------------------------------------------------------------------------
-- In Phase 1 (20261002140000_phase1_foundation.sql), policy profiles_update_admin
-- allowed any user satisfying is_admin() to directly UPDATE public.profiles without
-- a restrictive WITH CHECK clause. This permitted an ADMIN to bypass role hierarchy,
-- anti-lockout rules, and audit logging by executing direct table UPDATEs (e.g.
-- updating another user's role, deactivating accounts, or self-escalating to SUPER_ADMIN).
--
-- With the deployment of server-authoritative RPCs (admin_update_user_role and
-- admin_set_user_status), all administrative profile mutations MUST route through
-- these RPCs. Direct administrative table UPDATEs are permanently revoked by
-- dropping profiles_update_admin.
--
-- Direct table updates remain governed solely by profiles_update_own:
--   - USING (auth.uid() = id): Users may only target their own profile.
--   - WITH CHECK (auth.uid() = id AND role::TEXT = public.get_my_role() AND is_active = TRUE):
--     * Users (including ADMINs) cannot modify their own role.
--     * Users cannot deactivate their own account directly.
--     * Inactive users cannot modify anything.
--     * Permitted self-profile updates (e.g. display_name) continue to function.

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role::TEXT = public.get_my_role()
    AND is_active = TRUE
  );

-- -----------------------------------------------------------------------------
-- 1. RPC: public.admin_update_user_role
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  p_user_id UUID,
  p_new_role public.user_role
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role public.user_role;
  v_caller_active BOOLEAN;
  v_target_role public.user_role;
  v_target_active BOOLEAN;
  v_super_admin_count INT;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate arguments
  IF p_user_id IS NULL OR p_new_role IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: user_id and new_role are required' USING ERRCODE = '22023';
  END IF;

  -- 3. Retrieve caller role and status
  SELECT role, is_active INTO v_caller_role, v_caller_active
  FROM public.profiles
  WHERE id = v_caller_id;

  IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Caller profile not found or inactive' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN' USING ERRCODE = '42501';
  END IF;

  -- 4. Retrieve target user role and status (lock target row to serialize updates on same user)
  SELECT role, is_active INTO v_target_role, v_target_active
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Target user profile not found' USING ERRCODE = 'P0002';
  END IF;

  -- 5. No-op check
  IF v_target_role = p_new_role THEN
    RETURN TRUE;
  END IF;

  -- 6. Role Hierarchy Checks:
  -- A. ADMIN cannot grant SUPER_ADMIN
  IF v_caller_role = 'ADMIN' AND p_new_role = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'FORBIDDEN: Only SUPER_ADMIN can grant the SUPER_ADMIN role' USING ERRCODE = '42501';
  END IF;

  -- B. ADMIN cannot modify a SUPER_ADMIN account
  IF v_caller_role = 'ADMIN' AND v_target_role = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'FORBIDDEN: ADMIN cannot modify roles of a SUPER_ADMIN account' USING ERRCODE = '42501';
  END IF;

  -- C. Self-demotion protection:
  -- If caller is modifying their own role and demoting themselves from administrative standing:
  IF v_caller_id = p_user_id AND p_new_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'FORBIDDEN: Administrators cannot demote themselves to a non-administrative role' USING ERRCODE = '42501';
  END IF;

  -- D. Final SUPER_ADMIN protection (concurrency-safe via transaction advisory lock):
  -- If target is currently SUPER_ADMIN and is being changed to something else:
  IF v_target_role = 'SUPER_ADMIN' AND p_new_role <> 'SUPER_ADMIN' THEN
    -- Serialize super admin membership modifications to prevent race conditions resulting in 0 active super admins
    PERFORM pg_advisory_xact_lock(hashtext('super_admin_membership_guard'));

    SELECT COUNT(*) INTO v_super_admin_count
    FROM public.profiles
    WHERE role = 'SUPER_ADMIN' AND is_active = TRUE;

    IF v_super_admin_count <= 1 THEN
      RAISE EXCEPTION 'CONFLICT: Cannot demote the platform sole active SUPER_ADMIN' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 7. Apply role change
  UPDATE public.profiles
  SET
    role = p_new_role,
    updated_at = now()
  WHERE id = p_user_id;

  -- 8. Audit logging
  PERFORM public.log_audit_event(
    'USER_ROLE_CHANGED'::public.audit_action,
    'profile',
    p_user_id,
    jsonb_build_object('role', v_target_role),
    jsonb_build_object('role', p_new_role),
    jsonb_build_object(
      'action_type', 'ADMIN_ROLE_UPDATE',
      'target_user_id', p_user_id,
      'caller_id', v_caller_id,
      'caller_role', v_caller_role
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_update_user_role(UUID, public.user_role) IS
  'Updates a user role with strict role hierarchy checks and audit logging. Restricted to ADMIN and SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 2. RPC: public.admin_set_user_status
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_user_status(
  p_user_id UUID,
  p_is_active BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role public.user_role;
  v_caller_active BOOLEAN;
  v_target_role public.user_role;
  v_target_active BOOLEAN;
  v_super_admin_count INT;
  v_action public.audit_action;
  v_sanitized_reason TEXT;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate arguments
  IF p_user_id IS NULL OR p_is_active IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: user_id and is_active are required' USING ERRCODE = '22023';
  END IF;

  v_sanitized_reason := SUBSTRING(TRIM(COALESCE(p_reason, '')) FROM 1 FOR 500);

  -- 3. Retrieve caller role and status
  SELECT role, is_active INTO v_caller_role, v_caller_active
  FROM public.profiles
  WHERE id = v_caller_id;

  IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Caller profile not found or inactive' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN' USING ERRCODE = '42501';
  END IF;

  -- 4. Retrieve target user role and status (lock target row to serialize updates on same user)
  SELECT role, is_active INTO v_target_role, v_target_active
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Target user profile not found' USING ERRCODE = 'P0002';
  END IF;

  -- 5. No-op check
  IF v_target_active = p_is_active THEN
    RETURN TRUE;
  END IF;

  -- 6. Hierarchy & lockout guards when DEACTIVATING:
  IF p_is_active IS FALSE THEN
    -- A. Self-deactivation protection: Cannot deactivate own account
    IF v_caller_id = p_user_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Administrators cannot deactivate their own account' USING ERRCODE = '42501';
    END IF;

    -- B. ADMIN cannot deactivate SUPER_ADMIN
    IF v_caller_role = 'ADMIN' AND v_target_role = 'SUPER_ADMIN' THEN
      RAISE EXCEPTION 'FORBIDDEN: ADMIN cannot deactivate a SUPER_ADMIN account' USING ERRCODE = '42501';
    END IF;

    -- C. Final active SUPER_ADMIN protection (concurrency-safe via transaction advisory lock):
    IF v_target_role = 'SUPER_ADMIN' THEN
      -- Serialize super admin status modifications to prevent race conditions resulting in 0 active super admins
      PERFORM pg_advisory_xact_lock(hashtext('super_admin_membership_guard'));

      SELECT COUNT(*) INTO v_super_admin_count
      FROM public.profiles
      WHERE role = 'SUPER_ADMIN' AND is_active = TRUE;

      IF v_super_admin_count <= 1 THEN
        RAISE EXCEPTION 'CONFLICT: Cannot deactivate the platform sole active SUPER_ADMIN' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  -- 7. Apply status update
  UPDATE public.profiles
  SET
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_user_id;

  -- 8. Audit logging
  IF p_is_active THEN
    v_action := 'USER_REACTIVATED'::public.audit_action;
  ELSE
    v_action := 'USER_DEACTIVATED'::public.audit_action;
  END IF;

  PERFORM public.log_audit_event(
    v_action,
    'profile',
    p_user_id,
    jsonb_build_object('is_active', v_target_active),
    jsonb_build_object('is_active', p_is_active),
    jsonb_build_object(
      'action_type', CASE WHEN p_is_active THEN 'ADMIN_USER_REACTIVATED' ELSE 'ADMIN_USER_DEACTIVATED' END,
      'reason', NULLIF(v_sanitized_reason, ''),
      'target_user_id', p_user_id,
      'caller_id', v_caller_id,
      'caller_role', v_caller_role
    )
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_set_user_status(UUID, BOOLEAN, TEXT) IS
  'Activates or deactivates a user account with lockout protection and audit logging. Restricted to ADMIN and SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 3. RPC: public.admin_get_audit_logs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_audit_logs(
  p_action public.audit_action DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_target_type TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  action public.audit_action,
  actor_id UUID,
  actor_name TEXT,
  actor_email TEXT,
  target_type TEXT,
  target_id UUID,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_offset INT;
  v_limit INT;
BEGIN
  -- 1. Authorization: strictly is_admin() (ADMIN or SUPER_ADMIN)
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN' USING ERRCODE = '42501';
  END IF;

  -- 2. Pagination bounds: clamp page_size between 1 and 50
  v_limit := GREATEST(1, LEAST(COALESCE(p_page_size, 20), 50));
  v_offset := (GREATEST(1, COALESCE(p_page, 1)) - 1) * v_limit;

  RETURN QUERY
  WITH filtered_logs AS (
    SELECT
      a.id,
      a.action,
      a.actor_id,
      p.display_name AS actor_name,
      p.email AS actor_email,
      a.target_type,
      a.target_id,
      a.old_data,
      a.new_data,
      a.metadata,
      a.created_at
    FROM public.audit_logs a
    LEFT JOIN public.profiles p ON p.id = a.actor_id
    WHERE (p_action IS NULL OR a.action = p_action)
      AND (p_actor_id IS NULL OR a.actor_id = p_actor_id)
      AND (p_target_type IS NULL OR a.target_type = p_target_type)
      AND (p_target_id IS NULL OR a.target_id = p_target_id)
      AND (p_start_date IS NULL OR a.created_at >= p_start_date)
      AND (p_end_date IS NULL OR a.created_at <= p_end_date)
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered_logs
  )
  SELECT
    f.id,
    f.action,
    f.actor_id,
    f.actor_name,
    f.actor_email,
    f.target_type,
    f.target_id,
    f.old_data,
    f.new_data,
    f.metadata,
    f.created_at,
    c.cnt AS total_count
  FROM filtered_logs f
  CROSS JOIN counted c
  ORDER BY f.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_get_audit_logs(public.audit_action, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) IS
  'Fetches paginated and filtered audit logs with actor profile details. Restricted to ADMIN and SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 4. RPC: public.admin_get_platform_metrics
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_platform_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_total_users INT;
  v_active_users INT;
  v_total_persons INT;
  v_total_families INT;
  v_pending_claims INT;
  v_pending_verifications INT;
  v_open_duplicates INT;
BEGIN
  -- Authorization: strictly is_admin() (ADMIN or SUPER_ADMIN)
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = TRUE)
  INTO v_total_users, v_active_users
  FROM public.profiles;

  SELECT COUNT(*) INTO v_total_persons
  FROM public.persons
  WHERE deleted_at IS NULL;

  SELECT COUNT(*) INTO v_total_families
  FROM public.families
  WHERE deleted_at IS NULL;

  SELECT COUNT(*) INTO v_pending_claims
  FROM public.person_claims
  WHERE status = 'PENDING';

  SELECT COUNT(*) INTO v_pending_verifications
  FROM public.verification_requests
  WHERE status = 'PENDING';

  SELECT COUNT(*) INTO v_open_duplicates
  FROM public.duplicate_flags
  WHERE status = 'OPEN';

  RETURN jsonb_build_object(
    'total_users', COALESCE(v_total_users, 0),
    'active_users', COALESCE(v_active_users, 0),
    'total_persons', COALESCE(v_total_persons, 0),
    'total_families', COALESCE(v_total_families, 0),
    'pending_claims', COALESCE(v_pending_claims, 0),
    'pending_verifications', COALESCE(v_pending_verifications, 0),
    'open_duplicates', COALESCE(v_open_duplicates, 0),
    'generated_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.admin_get_platform_metrics() IS
  'Aggregates platform KPI counts for administrative overview dashboards. Restricted strictly to ADMIN and SUPER_ADMIN.';

-- -----------------------------------------------------------------------------
-- 5. Execution Grants & Revocations
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.admin_update_user_role(UUID, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, public.user_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_user_status(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_audit_logs(public.audit_action, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_audit_logs(public.audit_action, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_platform_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_platform_metrics() TO authenticated, service_role;
