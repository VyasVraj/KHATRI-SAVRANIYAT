-- =============================================================================
-- Migration: 20261002130002_create_utility_functions.sql
-- Purpose:   Core database trigger utility functions
-- Phase:     1 — Architecture & Database Foundation
-- =============================================================================
-- Contains foundational, table-independent utility functions.
-- Domain-specific functions and auth triggers are defined in their respective
-- domain migrations (e.g. 20261002130003_create_profiles.sql).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- handle_updated_at()
-- Auto-updates the updated_at timestamp on row modification.
-- Used as a trigger on all mutable tables.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER -- Runs as the calling user; no elevated privileges needed
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_updated_at() IS
  'Trigger function: auto-sets updated_at = NOW() on UPDATE operations.';
