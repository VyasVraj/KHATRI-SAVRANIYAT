-- =============================================================================
-- Migration: 20261003100000_grant_authenticated_table_privileges.sql
-- Purpose:   Grant minimum table-level privileges to the authenticated role
-- Phase:     Foundation Hotfix (PostgREST Access Control Gate 1)
-- =============================================================================
--
-- ARCHITECTURE & SECURITY EXPLANATION:
--
-- 1. TWO-GATE ACCESS CONTROL:
--    PostgreSQL evaluates authorization in two sequential steps:
--      Gate 1 (Table Privileges): Discretionary table grants (GRANT SELECT, ...)
--      Gate 2 (Row Level Security): RLS policies (USING / WITH CHECK clauses)
--    Without Gate 1 table grants, PostgREST requests immediately fail with
--    error 42501 (insufficient_privilege / permission denied) before Gate 2
--    RLS policies can be evaluated.
--
-- 2. RLS POLICIES REMAIN THE SOURCE OF TRUTH:
--    RLS is enabled on all tables (profiles, persons, families, family_members,
--    audit_logs) and remains fully active. These table grants DO NOT bypass RLS.
--    Every query executed by an authenticated user is still strictly governed
--    by existing RLS policies (e.g., profiles_select_own, persons_select_community).
--
-- 3. STRICT LEAST PRIVILEGE:
--    - NO table privileges are granted to `anon`. Anonymous visitors cannot
--      access private application tables directly.
--    - NO `GRANT ALL` or schema-level wildcards are used.
--    - `profiles`: SELECT + UPDATE only. INSERT is reserved for the
--      SECURITY DEFINER trigger `handle_new_user()`. DELETE is prohibited.
--    - `persons`: SELECT + INSERT + UPDATE only. DELETE is soft-deletion
--      managed via UPDATE on `deleted_at`. Physical DELETE is prohibited.
--    - `families`: SELECT + INSERT + UPDATE only. DELETE is soft-deletion
--      managed via UPDATE on `deleted_at`. Physical DELETE is prohibited.
--    - `family_members`: SELECT + INSERT + UPDATE + DELETE. Family creators
--      and moderators are permitted to remove members per existing RLS.
--    - `audit_logs`: SELECT only (for administrators via is_admin() RLS).
--      INSERT is handled exclusively by SECURITY DEFINER function
--      `log_audit_event()`. UPDATE and DELETE are strictly prohibited.
--
-- =============================================================================

-- 1. Profiles
-- Authenticated users can read permitted profiles (own/admin) and update
-- permitted fields under existing profiles RLS policies.
GRANT SELECT, UPDATE
ON TABLE public.profiles
TO authenticated;

-- 2. Persons
-- Authenticated users can search/view active community records, draft/create
-- new person records, and update records they own or moderate under existing RLS.
GRANT SELECT, INSERT, UPDATE
ON TABLE public.persons
TO authenticated;

-- 3. Families
-- Authenticated users can view community families, create families via the wizard,
-- and update families they created or moderate under existing families RLS.
GRANT SELECT, INSERT, UPDATE
ON TABLE public.families
TO authenticated;

-- 4. Family Members
-- Authenticated creators and moderators can view memberships, add members,
-- update membership roles, and remove member records under existing RLS.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.family_members
TO authenticated;

-- 5. Audit Logs
-- Authenticated administrators can read audit entries governed by audit_logs_select_admin.
-- Direct table INSERT remains blocked by audit_logs_insert_trigger_only WITH CHECK (FALSE);
-- all audit logging occurs via the SECURITY DEFINER function public.log_audit_event().
GRANT SELECT
ON TABLE public.audit_logs
TO authenticated;
