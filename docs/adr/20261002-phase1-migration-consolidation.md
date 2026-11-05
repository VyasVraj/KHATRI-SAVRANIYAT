# ADR: Phase 1 Migration Consolidation

- **Status:** Accepted & Deployed (Verified)
- **Date:** 2026-10-02
- **Deployment Project:** `community-family-platform` (`ixhvsprwjalgcyievsrg`)
- **Context Area:** Database Migrations / Phase 1 Architecture Foundation

---

## 1. Context

In Phase 1, the foundational schema and security policies were initially authored as seven granular migration files:
1. `20261002130000_enable_extensions.sql`
2. `20261002130001_create_enums.sql`
3. `20261002130002_create_utility_functions.sql`
4. `20261002130003_create_profiles.sql`
5. `20261002130004_create_persons.sql`
6. `20261002130005_create_families.sql`
7. `20261002130006_create_audit_logs.sql`

During deployment against a clean remote Supabase project (`community-family-platform`, Mumbai), this granular structure failed due to architectural and ordering issues:
- `20261002130002_create_utility_functions.sql` declared functions (`is_admin()`, `is_community_moderator()`, `get_my_role()`) written in `LANGUAGE sql` that referenced `public.profiles` before `public.profiles` had been created. In PostgreSQL, `LANGUAGE sql` functions parse and validate table references at definition time (`CREATE FUNCTION`), halting execution with `ERROR: 42P01: relation "public.profiles" does not exist`.
- Subsequent attempts to patch individual migration boundaries revealed fragile cross-file interdependencies where generic utilities (`handle_updated_at()`) were mixed with domain-specific auth/profile triggers and RLS helpers.
- The remote deployment state became uncertain across partial manual runs.

---

## 2. Decision

We replace the seven fragmented Phase 1 migration files with **ONE canonical, dependency-safe baseline migration**:
`supabase/migrations/20261002140000_phase1_foundation.sql`

The old Phase 1 migration files are preserved for historical auditability in:
`docs/archive/migrations-phase1-old/`
and removed from `supabase/migrations/` so that database tools and developers treat the canonical baseline as the single source of truth.

### Key Architectural Principles of the Baseline Migration:
1. **Strict Linear Dependency Ordering:**
   `Extensions → Enums → Foundational Utilities → Profiles Table & Indexes → Role Helpers → Auth Triggers → Profiles RLS → Persons Domain → Families Domain → Audit Logs Domain`
   No function or policy references an object that is created later in the file.
2. **Idempotency & Safe Manual Execution:**
   The migration is safe to run in the Supabase Dashboard SQL Editor on an empty or partially populated database:
   - Enums use conditional `DO $$ BEGIN IF NOT EXISTS (...) THEN CREATE TYPE ... END IF; END $$;` blocks to prevent type collision errors.
   - Tables and indexes use `IF NOT EXISTS`.
   - Triggers and policies use `DROP ... IF EXISTS` followed by `CREATE` to ensure clean application without duplicate errors.
3. **Non-Destructive Remote Philosophy:**
   Destructive resets (`DROP SCHEMA public CASCADE`, deleting `auth.users`, or dropping system objects) are strictly prohibited. A read-only diagnostic script (`docs/diagnostics/remote_phase1_diagnostic.sql`) is provided to inspect remote database objects without mutations.
4. **Manual SQL Editor Deployment Mode:**
   Due to CLI token constraints in this environment, migration deployment is executed directly via the Supabase Dashboard SQL Editor as the administrative database role. The local migration file is the canonical specification.
5. **Security Enforcement:**
   - The `profiles_update_own` policy is hardened with `WITH CHECK (auth.uid() = id AND role::TEXT = public.get_my_role() AND is_active = TRUE)` to prevent role self-promotion and unauthorized account deactivation.
   - All tables enforce Row-Level Security (RLS).
   - Audit logs remain strictly append-only: direct client `INSERT` is denied via `audit_logs_insert_trigger_only` (`WITH CHECK (FALSE)`).
   - `EXECUTE` on `public.log_audit_event(...)` is revoked from `PUBLIC`, `anon`, and `authenticated` roles to prevent forging audit events via PostgREST RPC. All audit events must be emitted from trusted database triggers or server-side workflows (via `service_role`).
   - The `PERSON != USER` architectural boundary is strictly enforced.

---

## 3. Consequences

### Positive
- **Deterministic Deployment:** A single unified script eliminates multi-file coordination failures and circular dependencies.
- **Maintainable by AI Agents & Developers:** Future phases have a clear, verified foundation to build on.
- **Zero Ambiguity:** Developers and automated tools execute exactly one baseline for Phase 1.
- **Safe Re-runs:** The script is resilient to partial executions without leaving corrupt schema states.

### Negative / Trade-offs
- The canonical migration is 1,077 lines long. However, it is logically partitioned into numbered sections matching domain boundaries.

---

## 4. Deployment Resolution & Verified State

During initial execution of the canonical baseline in the Supabase SQL Editor, `ERROR: 42501: must be owner of relation users` occurred due to `DROP TRIGGER IF EXISTS ... ON auth.users` and `COMMENT ON TRIGGER ... ON auth.users`. In Supabase Cloud, `auth.users` is owned by `supabase_auth_admin`, while the SQL Editor runs as `postgres` (which holds `TRIGGER` privilege but not table ownership).

### Architectural Resolutions Applied:
1. **Guarded Trigger Creation on `auth.users`:**
   Replaced `DROP TRIGGER` and `COMMENT ON TRIGGER` with idempotent `DO $$` blocks inspecting `pg_trigger`:
   - `on_auth_user_created` (AFTER INSERT ON `auth.users`)
   - `on_auth_user_email_confirmed` (AFTER UPDATE ON `auth.users`)
2. **Two Final RLS / Data-Integrity Patches:**
   - `persons_insert_authenticated`: Added `AND user_id IS NULL` to enforce the `PERSON != USER` boundary during creation.
   - `family_members_update_creator`: Added `WITH CHECK` validating that `family_id` points to a non-deleted, creator-owned family.

### Verified Remote State:
- **Project:** `community-family-platform` (`ixhvsprwjalgcyievsrg`)
- **Extensions:** 4 (`uuid-ossp`, `pgcrypto`, `unaccent`, `pg_trgm`)
- **Domain Enums:** 8
- **Tables:** 5 (`profiles`, `persons`, `families`, `family_members`, `audit_logs`)
- **Functions:** 7
- **Triggers:** 5 (3 public, 2 auth)
- **RLS Policies:** 33 active policies (RLS enabled on all 5 tables)
- **Post-Deployment Diagnostic:** Passed (all objects verified on remote instance).

---

## 5. Future Migration Rules
- Future phases (Phase 3+) will each introduce targeted, incremental migrations numbered sequentially after `20261002140000`.
- Every future migration must maintain internal linear dependency ordering (tables before functions that query them, functions before policies that call them).
