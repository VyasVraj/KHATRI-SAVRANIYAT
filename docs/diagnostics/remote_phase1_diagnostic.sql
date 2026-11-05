-- =============================================================================
-- SCRIPT: remote_phase1_diagnostic.sql
-- Purpose: Read-only inspection of existing database objects in Supabase
-- Target:  community-family-platform (Mumbai: ixhvsprwjalgcyievsrg)
-- Phase:   1 Database Foundation Diagnostic
-- =============================================================================
-- SAFETY: This script is 100% READ-ONLY.
-- It executes ONLY SELECT queries against information_schema and pg_catalog.
-- It performs ZERO DDL, ZERO DML, and modifies NOTHING in the database.
-- =============================================================================

-- 1. Check Installed Extensions
SELECT
  extname AS extension_name,
  extversion AS version,
  n.nspname AS schema_name
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'unaccent')
ORDER BY extname;

-- 2. Check Domain Enums in public schema
SELECT
  t.typname AS enum_name,
  count(e.enumlabel) AS total_values,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

-- 3. Check Tables and RLS Status in public schema
SELECT
  schemaname,
  tablename,
  tableowner,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 4. Check Functions in public schema
SELECT
  routine_name,
  routine_type,
  security_type,
  data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'handle_updated_at',
    'is_admin',
    'is_community_moderator',
    'get_my_role',
    'handle_new_user',
    'handle_user_email_confirmed',
    'log_audit_event'
  )
ORDER BY routine_name;

-- 5. Check Triggers on public tables and auth.users
SELECT
  event_object_schema,
  event_object_table,
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE (event_object_schema = 'public' AND event_object_table IN ('profiles', 'persons', 'families', 'family_members', 'audit_logs'))
   OR (event_object_schema = 'auth' AND event_object_table = 'users')
ORDER BY event_object_schema, event_object_table, trigger_name;

-- 6. Check Active RLS Policies on public tables
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 7. Check Custom Indexes on public tables
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
