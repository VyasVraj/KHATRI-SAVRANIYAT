-- =============================================================================
-- Migration: 20261016160000_create_notification_outbox_worker_rpcs.sql
-- Purpose:   Create server-authoritative, concurrency-safe RPCs for the
--             notification outbox email worker:
--             1. public.claim_notification_outbox_batch
--                (Atomic queue claim using FOR UPDATE SKIP LOCKED)
--             2. public.complete_notification_outbox_delivery
--                (Transition status = 'SENT', sent_at = now())
--             3. public.fail_notification_outbox_delivery
--                (Transition status = 'FAILED' or 'DEAD_LETTER' with backoff)
--             4. Strict least-privilege security:
--                - REVOKE ALL FROM PUBLIC, anon, authenticated
--                - GRANT EXECUTE TO service_role only
-- Phase:     Phase 12 — Subtask 4 (Email Dispatch Infrastructure & Outbox Worker)
-- =============================================================================
--
-- ARCHITECTURAL INVARIANTS:
-- 1. CONCURRENCY SAFETY:
--    Multiple workers claiming batches simultaneously will NEVER claim the same
--    outbox record due to PostgreSQL 'FOR UPDATE SKIP LOCKED'.
--
-- 2. LEAST PRIVILEGE / ZERO CLIENT MUTATION:
--    These functions are executable EXCLUSIVELY by the trusted backend worker
--    (service_role). Access is explicitly revoked from anon and authenticated.
--
-- 3. BOUNDED RETRIES & DEAD LETTER:
--    Transient errors increment attempts and reschedule delivery.
--    Terminal errors or attempts >= max_attempts transition directly to DEAD_LETTER.
--
-- 4. PRIVACY & PROJECTION MINIMIZATION:
--    Only the minimum necessary recipient email and notification content
--    are returned to the worker. Sensitive census person data is never exposed.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC: claim_notification_outbox_batch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_notification_outbox_batch(
  p_batch_size INT DEFAULT 10,
  p_max_attempts INT DEFAULT 3
)
RETURNS TABLE (
  outbox_id UUID,
  notification_id UUID,
  recipient_id UUID,
  channel public.notification_channel,
  attempts INT,
  recipient_email TEXT,
  recipient_name TEXT,
  title VARCHAR(255),
  body TEXT,
  action_url VARCHAR(500),
  category public.notification_category,
  notification_type VARCHAR(64)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Atomically claim eligible pending/failed records with SKIP LOCKED
  RETURN QUERY
  WITH eligible AS (
    SELECT o.id
    FROM public.notification_outbox o
    WHERE o.channel = 'EMAIL'
      AND o.status IN ('PENDING', 'FAILED')
      AND o.attempts < p_max_attempts
      AND o.scheduled_at <= now()
    ORDER BY o.scheduled_at ASC, o.created_at ASC
    LIMIT GREATEST(1, LEAST(p_batch_size, 50))
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.notification_outbox o
    SET
      status = 'PROCESSING',
      attempts = o.attempts + 1
    FROM eligible e
    WHERE o.id = e.id
    RETURNING
      o.id AS outbox_id,
      o.notification_id,
      o.recipient_id,
      o.channel,
      o.attempts
  )
  SELECT
    u.outbox_id,
    u.notification_id,
    u.recipient_id,
    u.channel,
    u.attempts,
    COALESCE(p.email, u_auth.email::TEXT) AS recipient_email,
    p.display_name AS recipient_name,
    n.title,
    n.body,
    n.action_url,
    n.category,
    n.type AS notification_type
  FROM updated u
  INNER JOIN public.notifications n ON n.id = u.notification_id
  LEFT JOIN public.profiles p ON p.id = u.recipient_id
  LEFT JOIN auth.users u_auth ON u_auth.id = u.recipient_id;
END;
$$;

COMMENT ON FUNCTION public.claim_notification_outbox_batch(INT, INT) IS
  'Atomically claims eligible outbox records for email dispatch with FOR UPDATE SKIP LOCKED. Restricted to service_role.';

-- -----------------------------------------------------------------------------
-- 2. RPC: complete_notification_outbox_delivery
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_notification_outbox_delivery(
  p_outbox_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF p_outbox_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: outbox_id is required' USING ERRCODE = '22023';
  END IF;

  -- Strict state transition guard: MUST ONLY allow PROCESSING -> SENT
  UPDATE public.notification_outbox
  SET
    status = 'SENT',
    sent_at = now(),
    last_error = NULL
  WHERE id = p_outbox_id
    AND status = 'PROCESSING';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.complete_notification_outbox_delivery(UUID) IS
  'Marks a PROCESSING outbox record as SENT. Restricted to service_role.';

-- -----------------------------------------------------------------------------
-- 3. RPC: fail_notification_outbox_delivery
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fail_notification_outbox_delivery(
  p_outbox_id UUID,
  p_error_message TEXT,
  p_is_terminal BOOLEAN DEFAULT FALSE,
  p_retry_delay_seconds INT DEFAULT 300,
  p_max_attempts INT DEFAULT 3
)
RETURNS public.notification_delivery_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status public.notification_delivery_status;
  v_current_attempts INT;
  v_new_status public.notification_delivery_status;
  v_sanitized_error TEXT;
BEGIN
  IF p_outbox_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: outbox_id is required' USING ERRCODE = '22023';
  END IF;

  -- Sanitize error message to prevent excessive log bloat
  v_sanitized_error := SUBSTRING(COALESCE(p_error_message, 'Unknown delivery error') FROM 1 FOR 1000);

  SELECT status, attempts INTO v_current_status, v_current_attempts
  FROM public.notification_outbox
  WHERE id = p_outbox_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: outbox item not found' USING ERRCODE = 'P0002';
  END IF;

  -- Strict state transition guard: MUST ONLY operate on a currently PROCESSING row.
  -- Reject transitions from PENDING, FAILED, SENT, or DEAD_LETTER without modifying row.
  IF v_current_status <> 'PROCESSING' THEN
    RETURN v_current_status;
  END IF;

  -- Determine whether failure is terminal or can be retried
  IF p_is_terminal OR v_current_attempts >= p_max_attempts THEN
    v_new_status := 'DEAD_LETTER';
  ELSE
    v_new_status := 'FAILED';
  END IF;

  UPDATE public.notification_outbox
  SET
    status = v_new_status,
    last_error = v_sanitized_error,
    scheduled_at = CASE
      WHEN v_new_status = 'FAILED' THEN
        now() + (GREATEST(10, LEAST(p_retry_delay_seconds, 86400)) || ' seconds')::INTERVAL
      ELSE
        scheduled_at
    END
  WHERE id = p_outbox_id
    AND status = 'PROCESSING';

  RETURN v_new_status;
END;
$$;

COMMENT ON FUNCTION public.fail_notification_outbox_delivery(UUID, TEXT, BOOLEAN, INT, INT) IS
  'Records an outbox delivery failure for a PROCESSING row, scheduling retry or moving to DEAD_LETTER. Restricted to service_role.';

-- -----------------------------------------------------------------------------
-- 4. Execution Grants (Strict Server-to-Server Only)
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.claim_notification_outbox_batch(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox_batch(INT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.complete_notification_outbox_delivery(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_notification_outbox_delivery(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.fail_notification_outbox_delivery(UUID, TEXT, BOOLEAN, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_notification_outbox_delivery(UUID, TEXT, BOOLEAN, INT, INT) TO service_role;
