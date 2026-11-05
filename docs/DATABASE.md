# Database Architecture — Community Roots

**Document Type**: Database Architecture Reference
**Status**: Phase 4 Complete — Phase 5 Architecture Locked (Implementation Not Started — Subtask 1 Awaiting Explicit Authorization) (2026-10-04)
**Last Updated**: Phase 5 Pre-Implementation Architecture Lock (Pre-Phase 5 Baseline)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Core Design Principles](#2-core-design-principles)
3. [PERSON ≠ USER Principle](#3-person--user-principle)
4. [Migration Discipline](#4-migration-discipline)
5. [RLS Strategy](#5-rls-strategy)
6. [Privacy Model](#6-privacy-model)
7. [Index Strategy](#7-index-strategy)
8. [Entity Overview by Domain](#8-entity-overview-by-domain)
9. [Phase 0 Status](#9-phase-0-status)
10. [Type Codegen Workflow](#10-type-codegen-workflow)
11. [Backup and Recovery](#11-backup-and-recovery)

---

## 1. Overview

Community Roots uses **PostgreSQL** as its primary database, managed through **Supabase**. The database layer is the authoritative source of truth for all application data and the primary enforcement layer for security and data integrity.

The database design follows a normalized relational model with:
- Explicit foreign key relationships
- Enforced data constraints at the column and table level
- Row Level Security (RLS) on all exposed tables
- Clear domain boundaries reflected in table naming conventions

PostgreSQL version: 15+ (Supabase-managed).
Extensions used: `uuid-ossp` (UUID generation), `pgcrypto`, `unaccent` (search normalization), `pg_trgm` (fuzzy search).

---

## 2. Core Design Principles

### UUID Primary Keys

All tables use `UUID` primary keys generated via `gen_random_uuid()` (pgcrypto). UUIDs:
- Prevent sequential enumeration (security).
- Are safe to expose in URLs and API responses.
- Support distributed generation without coordination.

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

### Foreign Key Integrity

All relationships between tables use explicit `REFERENCES` constraints with appropriate `ON DELETE` behavior:

| Relationship Type | ON DELETE Action |
|---|---|
| Required parent (cascade) | `CASCADE` |
| Optional parent | `SET NULL` |
| Parent that must not be deleted | `RESTRICT` |

### Mandatory Fields

Columns that are required for data integrity are declared `NOT NULL`. Nullable columns are explicitly nullable for a documented reason.

### CHECK Constraints

Business rules that can be expressed as column constraints are enforced with `CHECK` constraints:

```sql
-- Privacy level is an enum
CHECK (privacy_level IN ('PRIVATE', 'FAMILY', 'CONNECTIONS', 'COMMUNITY', 'PUBLIC'))

-- Dates must be plausible
CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE)

-- String lengths
CHECK (char_length(first_name) BETWEEN 1 AND 100)
```

### Timestamps

Every table includes `created_at` and `updated_at` timestamps:

```sql
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

`updated_at` is maintained by a reusable trigger:

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Soft Deletes

Where data deletion may be legally or genealogically significant, soft deletes are preferred:

```sql
deleted_at TIMESTAMPTZ  -- NULL = active, set = soft-deleted
```

RLS policies exclude soft-deleted records from regular queries.

---

## 3. PERSON ≠ USER Principle

This is the most important data model rule. See [`SECURITY.md`](SECURITY.md) for the full rationale.

### Table Separation

| Table | Schema | Purpose |
|---|---|---|
| `users` | `auth` | Supabase-managed authentication identities. **Do not query directly.** |
| `user_profiles` | `public` | Application-level user settings linked to `auth.users`. |
| `persons` | `public` | Community census records. Humans, living or deceased. |

### Linking Rule

```sql
-- A person MAY be linked to a user (claimed account)
-- A person MAY exist without any user account (deceased, unregistered)
-- A user MUST have at most one linked person (unique constraint)

ALTER TABLE persons
  ADD COLUMN owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT persons_owner_user_unique UNIQUE (owner_user_id);
```

### Query Pattern

To find the person profile for the currently authenticated user:

```sql
SELECT p.*
FROM persons p
JOIN user_profiles up ON up.person_id = p.id
WHERE up.user_id = auth.uid();
```

Never use `auth.uid()` as a `person_id`.

---

## 3.1. FAMILY ≠ HOUSEHOLD Principle

A **Family** and a **Household** are fundamentally distinct domain concepts:
- **Family (`public.families`)**: A social, lineage, and genealogical unit (e.g., Keria Family of Palanpur, Gotra Sudarshan, Nukh Keria).
- **Household**: A physical dwelling unit where individuals currently reside together.

### Production Legacy Verification
In client census data (`khatrisetu-families-2026-10-01.xlsx`), Family `KS-MUC4SVE0` (Head: Prakash Mulchand Keria, Palanpur, Gujarat) includes adult son Rohan and daughter-in-law Kavita who have `Same Household = No` and reside in **Pune, Maharashtra**.

### Architecture Rules
1. Never assume all members of a family live at the family's physical address.
2. Individual persons maintain optional residential location overrides (`current_city`, `current_state`, `address`).
3. Family membership reflects community and genealogical affiliation; household co-residence is an independent physical attribute.

---

## 3.2. Derived Fields Exclusion Principle

To avoid data anomalies and maintain 3NF relational integrity, the database strictly excludes calculated/temporal fields from source-of-truth tables:
- **`age`**: Derived dynamically via `EXTRACT(YEAR FROM age(CURRENT_DATE, date_of_birth))`. Never stored.
- **`under_18`**: Derived dynamically via `age < 18`. Never stored.
- **`members_count`**: Derived dynamically via `COUNT(family_members)` for active memberships (`left_at IS NULL`). Never stored as a counter column on `families`.

---

## 4. Migration Discipline

### Immutability Rule

**Migrations are immutable once applied.** A migration file that has been run against any environment (local, staging, production) must not be modified. To fix a mistake, create a new migration.

### Naming Convention

```
YYYYMMDDHHMMSS_description.sql
```

| Part | Format | Example |
|---|---|---|
| Date | `YYYYMMDD` | `20240115` |
| Time | `HHMMSS` (24h UTC) | `120000` |
| Description | `snake_case`, concise | `create_persons_table` |

Full example: `20240115120000_create_persons_table.sql`

### Migration Authoring Standards

1. **Single logical unit**: Each migration addresses one schema change or closely related group of changes.
2. **Include RLS in the same migration**: When creating a table, enable RLS and add initial policies in the same file.
3. **Idempotent where possible**: Use `IF NOT EXISTS`, `IF EXISTS`, `OR REPLACE` to allow safe re-application during development.
4. **Document non-obvious changes**: SQL comments explaining the purpose of complex DDL.
5. **Test locally first**: Apply with `supabase db reset` on the local instance before pushing.

### Migration File Structure

```sql
-- Migration: 20240115120000_create_persons_table.sql
-- Description: Creates the persons table with initial RLS policies.
-- Phase: 1

-- ============================================================
-- TABLE: persons
-- ============================================================
CREATE TABLE IF NOT EXISTS public.persons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL UNIQUE,
  first_name      TEXT NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 100),
  last_name       TEXT NOT NULL CHECK (char_length(last_name) BETWEEN 1 AND 100),
  privacy_level   TEXT NOT NULL DEFAULT 'COMMUNITY'
                  CHECK (privacy_level IN ('PRIVATE','FAMILY','CONNECTIONS','COMMUNITY','PUBLIC')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: persons
-- ============================================================

-- Owners can always read their own record
CREATE POLICY "persons: owner select"
  ON public.persons FOR SELECT
  USING (owner_user_id = auth.uid());

-- Public records are visible to everyone
CREATE POLICY "persons: public select"
  ON public.persons FOR SELECT
  USING (privacy_level = 'PUBLIC' AND deleted_at IS NULL);

-- Owners can update their own record
CREATE POLICY "persons: owner update"
  ON public.persons FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Authenticated users can insert (creating a person record for themselves)
CREATE POLICY "persons: authenticated insert"
  ON public.persons FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
```

### Running Migrations

**Local Development:**
```bash
# Apply to local Supabase instance
supabase db push

# Reset local DB and re-apply all migrations (development only)
supabase db reset

# Generate updated TypeScript types after migration
npx supabase gen types typescript --local > src/types/database.types.ts
```

**Production Deployment:**
Production migrations are **never applied via `db push`**. They are deployed manually through the **Supabase Dashboard SQL Editor** in sequential timestamp order with remote verification after each migration.

---

## 5. RLS Strategy

### Mandatory Coverage

Every table in the `public` schema that is exposed to the Supabase client **must** have:

1. `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
2. An explicit policy for every operation type it supports (SELECT, INSERT, UPDATE, DELETE).
3. Operations not supported by regular users must have no policy (default deny).

### Policy Categories

| Category | Description | Example Condition |
|---|---|---|
| Owner | Record belongs to authenticated user | `owner_user_id = auth.uid()` |
| Family membership | User is a member of the family this record belongs to | `EXISTS (SELECT 1 FROM family_members WHERE ...)` |
| Connection status | User has an accepted connection with the record owner | `EXISTS (SELECT 1 FROM connections WHERE ...)` |
| Privacy level | Record's privacy allows this user's access level | `privacy_level = 'PUBLIC'` |
| Role | User has an elevated role (verifier, admin) | `(auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean` |
| Verification status | Only verified records are visible at certain levels | `verification_status = 'VERIFIED'` |

### Policy Naming Convention

```
"<table>: <actor> <operation> [qualifier]"
```

Examples:
- `"persons: owner select"`
- `"persons: family member select"`
- `"persons: public select"`
- `"family_members: admin delete"`

### Admin Bypass

The `service_role` key bypasses RLS entirely. This is used for:
- Migration scripts
- Edge Functions performing trusted operations (bulk import, admin actions)
- Test setup and teardown

The `service_role` key must **never** be used in frontend code.

### Two-Gate Authorization Architecture (Table Privileges & RLS)

PostgreSQL evaluates authorization through two sequential layers for client operations:

1. **Gate 1 — Table-Level Privileges (Discretionary Access Control)**:
   Determines whether a database role has permission to execute the requested SQL operation (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on the target table. If table privileges are missing, PostgreSQL terminates the query immediately with error `42501` (`insufficient_privilege` / `permission denied`), and the request never reaches Gate 2.
2. **Gate 2 — Row Level Security (Mandatory Access Control)**:
   Evaluates row-filtering `USING` and `WITH CHECK` policies to restrict precisely which rows an authenticated actor can view or mutate. RLS is the authoritative source of truth for all data access rules.

#### Post-Deployment Table Privilege Hotfix

The original Phase 1 foundation migration established tables and RLS policies but omitted explicit table-level grants for the PostgREST `authenticated` role. Migration `20261003100000_grant_authenticated_table_privileges.sql` was applied as an additive privilege correction to supply the minimum required table grants:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|:---:|:---:|:---:|:---:|
| `profiles` | `authenticated` | — | `authenticated` | — |
| `persons` | `authenticated` | `authenticated` | `authenticated` | — |
| `families` | `authenticated` | `authenticated` | `authenticated` | — |
| `family_members` | `authenticated` | `authenticated` | `authenticated` | `authenticated` |
| `audit_logs` | `authenticated` | — | — | — |

**Key Security Properties**:
- `anon` receives **no table-level privileges** from this migration; unauthenticated table queries continue to fail at Gate 1.
- No `GRANT ALL` or schema-level wildcards are used.
- RLS was neither disabled nor weakened; all tables remain fully secured under existing RLS policies.
- This is an additive privilege correction, not an RLS replacement; table grants open Gate 1 solely to allow PostgreSQL to reach and enforce Gate 2 RLS policies.

---

## 6. Privacy Model

Privacy is enforced at the row level via RLS policies that evaluate the record's `privacy_level` column.

| Level | Constant | Accessible To |
|---|---|---|
| `PRIVATE` | `'PRIVATE'` | Record owner only |
| `FAMILY` | `'FAMILY'` | Owner + family members |
| `CONNECTIONS` | `'CONNECTIONS'` | Owner + accepted connections |
| `COMMUNITY` | `'COMMUNITY'` | All authenticated users |
| `PUBLIC` | `'PUBLIC'` | Everyone including anonymous |

### Field-Level Privacy & Protected Personal Data Governance (CLIENT-PRIVACY-1)

Under the updated client privacy specification, personal information is protected by default across the schema:
- **`dob_year`**: Generated stored column on `public.persons` (`EXTRACT(YEAR FROM date_of_birth)::INTEGER`). Publicly readable for community directory and tree lifespans (`b. 1985`) without exposing exact birth day or month.
- **`calculate_person_age(DATE)`**: Database helper function returning safe current age in years.
- **`public.community_persons`**: Security barrier view (`WITH (security_barrier = true)`) that conditionally projects `date_of_birth`, `phone`, `phone_secondary`, and `email_contact` as `NULL` unless the caller has privacy management authority (`can_manage_privacy_settings()`) or is the record owner (`user_id = auth.uid()`).
- **`public.get_person_protected_details(UUID)`**: `SECURITY DEFINER` RPC allowing record owners and authorized Mukhis/Admins to retrieve full DOB and phone/email, while raising PostgreSQL `42501` on unauthorized access.
- **`public.update_person_protected_details(UUID, ...)`**: `SECURITY DEFINER` RPC allowing self-service maintenance of protected fields by the owner or authorized Mukhi with audit logging.

---

## 7. Index Strategy

Indexes are created to support the expected query patterns of each feature phase. These are guidelines; actual indexes are determined by EXPLAIN ANALYZE on real query plans.

### Name Search

```sql
-- Full-text search on name fields
CREATE INDEX persons_name_fts ON persons
  USING gin(to_tsvector('simple', unaccent(first_name || ' ' || last_name)));

-- Trigram index for fuzzy matching
CREATE INDEX persons_first_name_trgm ON persons
  USING gin(first_name gin_trgm_ops);
```

### Location

```sql
-- Index on location fields for directory filtering
CREATE INDEX persons_location_country ON persons(location_country);
CREATE INDEX persons_location_city ON persons(location_city);
```

### Community Identity (Gotra / Nukh / Mukhi)

```sql
-- Index for community-specific genealogical search
CREATE INDEX persons_gotra ON persons(gotra) WHERE gotra IS NOT NULL;
CREATE INDEX persons_nukh ON persons(nukh) WHERE nukh IS NOT NULL;
CREATE INDEX persons_mukhi ON persons(mukhi) WHERE mukhi IS NOT NULL;
```

### Verification and Timestamps

```sql
CREATE INDEX persons_verification_status ON persons(verification_status);
CREATE INDEX persons_created_at ON persons(created_at DESC);
```

### Foreign Key Indexes

All foreign key columns must be indexed (PostgreSQL does not auto-index FKs):

```sql
CREATE INDEX family_members_family_id ON family_members(family_id);
CREATE INDEX family_members_person_id ON family_members(person_id);
CREATE INDEX family_members_user_id ON family_members(user_id);
```

---

## 8. Entity Overview by Domain

This is a high-level overview of planned entities by domain. Actual schema is defined in migration files.

### Identity Domain

| Table | Description |
|---|---|
| `auth.users` | Supabase-managed. Authentication identity. |
| `user_profiles` | App-level user settings, preferences, linked person. |

### People Domain

| Table | Description |
|---|---|
| `persons` | Core community census record. Name, dates, location, privacy level. |
| `person_names` | Alternate names, maiden names, religious names. |
| `person_contacts` | Email, phone, social links (with field-level privacy). |

### Families Domain

| Table | Description |
|---|---|
| `families` | A family unit. Head of family, family name, privacy. |
| `family_members` | Join table: person ↔ family, with role and status. |

### Relationships Domain (Phase 5 Deployed Schema & Subtask 3 Architecture)

Architectural Baseline locked via [ADR: Canonical Database vs Legacy Android Compatibility](adr/20261004-canonical-database-legacy-android-compatibility.md) and [ADR: Family Tree Graph Model & Layout Architecture](adr/20261005-family-tree-graph-architecture.md).
*Phase 5 Subtask 1 schema and Subtask 2 UI are COMPLETE. Subtask 3 is DISCOVERY COMPLETE (no schema, migration, or database changes; implementation awaits explicit human authorization).*

| Object | Type | Description |
|---|---|---|
| `relationship_type` | ENUM | `'PARENT'`, `'SPOUSE'`, `'SIBLING'` |
| `relationships` | Table | Normalized relationship graph between `person_a_id` and `person_b_id`. |

#### Canonical Constraints, Lifecycle & Invariants
- `CHECK (person_a_id <> person_b_id)`: Disallows self-referential relationship edges.
- `PARENT`: Directional edge where `person_a_id` = Parent and `person_b_id` = Child. The inverse (`child_of`) is dynamically derived in queries; storing reciprocal rows is prohibited.
- `SPOUSE`: Symmetric edge canonicalized with `CHECK (relationship_type = 'PARENT' OR person_a_id < person_b_id)`. Prevents duplicate opposing rows `(A, B)` and `(B, A)`.
- `SIBLING` Model:
  - Explicit sibling relationships are canonical relationships when asserted directly (`person_a_id < person_b_id`).
  - Do not require known parents for an explicit sibling relationship.
  - Shared-parent sibling relationships may be derived later.
  - Do not persist duplicate derived sibling rows.
- `UNIQUE (person_a_id, person_b_id, relationship_type)`: Prevents duplicate edges.
- `ON DELETE RESTRICT` on foreign keys: Prevents physical deletion of persons referenced in active genealogical records.
- Soft delete via `deleted_at TIMESTAMPTZ`. Marriage/divorce/dispute workflows are deferred.
- **Physical DELETE Denied**: Application hard DELETE is blocked (`relationships_delete_deny USING (FALSE)`); `authenticated` table privileges grant only `SELECT, INSERT, UPDATE`.
- **Protected Identity Fields**: `handle_relationship_update_guard()` trigger strictly enforces database-level immutability for `id`, `person_a_id`, `person_b_id`, `relationship_type`, `created_by`, `created_at`, restricts `verification_status` mutation to moderators, and isolates the soft-delete transition.
- Verification: Uses the existing `verification_status` architecture where verification is needed; a separate `relationship_status` enum is not introduced for Phase 5.
- **Dual-Endpoint Authorization**: Relationship visibility must enforce the same effective authorization semantics as direct person visibility for BOTH endpoints. Existence of a matching `persons.id` is not sufficient. SELECT RLS requires the viewer to have permission to view **BOTH** `person_a` and `person_b`.
  - The eventual Phase 5 RLS implementation must be tested for:
    - public/public
    - community/community
    - private endpoint
    - mixed visibility
    - deleted endpoint
    - owner-visible endpoint
    - moderator-visible endpoint
    - unauthenticated access

### External Integration Domain (Future Compatibility Domain)

Defined as a future compatibility domain; implementation is deferred to Phase 14. Note: No such table currently exists in the database schema.

Planned Phase 14 registry:
- `external_references`: Mapping registry linking external/legacy source identifiers (e.g. `source_system: 'khatrisetu_android'`, `source_record_id: 'KS-MUC4SVE0'`) to canonical UUIDs (`canonical_entity_type`, `canonical_entity_id`).

### Location Domain

| Table | Description |
|---|---|
| `locations` | Canonical location records (city, region, country). |
| `person_locations` | Person ↔ location with type (birth, current, ancestral). |

### Community Identity Domain

| Table | Description |
|---|---|
| `gotra_references` | Lookup table for gotra values. |
| `nukh_references` | Lookup table for nukh values. |
| `mukhi_references` | Lookup table for mukhi values. |

### Connections Domain (Phase 7 Architecture)

| Table | Description |
|---|---|
| `connections` | Canonical user ↔ user connection graph with status (`PENDING`, `ACCEPTED`, `REJECTED`, `BLOCKED`). Unordered pair uniqueness via `(LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))`. |

- **`20261005170000_create_connections.sql`**: Created `connections` table, `connection_status` enum, RLS policies, update guard triggers, table privileges, and `public.are_users_connected(UUID, UUID)` security-definer helper.
  - **DELETE Policy Hardening**: `connections_delete_participants` allows participants to delete `PENDING`, `ACCEPTED`, or `REJECTED` connections, but explicitly disallows participants from deleting `BLOCKED` connections (`status <> 'BLOCKED'`). Only `is_community_moderator()` (moderators/admins) can remove `BLOCKED` rows. Coupled with canonical pair uniqueness `(LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))`, this guarantees that a blocked user cannot bypass a block by deleting the row and issuing a new request.
  - **Lifecycle Status Transition Guard**: Dedicated `connections_status_transition_guard` BEFORE UPDATE trigger enforcing authoritative state transitions (`PENDING -> ACCEPTED/REJECTED/BLOCKED`, `ACCEPTED/REJECTED -> BLOCKED`). Disallows invalid transitions (`ACCEPTED -> REJECTED`, `REJECTED -> ACCEPTED`, `BLOCKED` mutations by participants).
  - **Caller-Authorized Helper**: `public.are_users_connected(user_a, user_b)` enforces database-level caller authorization: caller must be `user_a`, `user_b`, or an active moderator/admin; unauthenticated or arbitrary third-party callers receive `FALSE`, completely preventing social-graph probing (oracle attack).
- **`20261005180000_add_connections_privacy_to_persons.sql`**:
  - Privilege hardening & caller authorization: Revoked execution on `public.are_users_connected(UUID, UUID)` from `PUBLIC` and `anon`; granted exclusively to `authenticated`. Re-asserts caller authorization guard.
  - Added RLS policy `persons_select_connections` on `public.persons`:
    ```sql
    CREATE POLICY "persons_select_connections" ON public.persons
      FOR SELECT USING (
        auth.uid() IS NOT NULL
        AND profile_privacy = 'CONNECTIONS'
        AND user_id IS NOT NULL
        AND deleted_at IS NULL
        AND status != 'ARCHIVED'
        AND public.are_users_connected(auth.uid(), user_id)
      );
    ```
  - Preserves `PERSON != USER` boundary: Only `persons.user_id` establishes user account identity. Unlinked records (`user_id IS NULL`) never grant connection-based visibility.

### Claim & Invitation Domain (Phase 8 Architecture)

| Table | Description |
|---|---|
| `person_claims` | Formal claim requests submitted by authenticated users to establish identity ownership over an unclaimed census person record (`persons.user_id`). Status: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`. Foreign key `person_id` uses `ON DELETE RESTRICT` to preserve historical audit records. |
| `invitations` | Cryptographically hashed invitation tokens (SHA-256) sent to emails to join a family unit or claim a census member seat. Status: `PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`. Ordinary client SELECT privileges exclude `token_hash`. |

- **`20261006090000_create_claims_and_invitations.sql` (Local Only — Re-Hardened Baseline)**:
  - **Enums**: `claim_status` (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`), `invitation_status` (`PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`).
  - **Historical Audit Preservation**: `person_claims.person_id` enforces `ON DELETE RESTRICT` ensuring census deletions cannot wipe historical claim workflows.
  - **Unique Partial Indexes**: `idx_person_claims_pending_person` (at most one pending claim per person) and `idx_person_claims_pending_claimant` (at most one pending claim per claimant), preventing concurrent race conditions.
  - **Guard Triggers**:
    - `handle_claim_update_guard`: Protects `id`, `person_id`, `claimant_id`, `created_at` against mutation.
    - `handle_claim_status_transition_guard`: Enforces state transitions (`PENDING -> APPROVED/REJECTED/CANCELLED`); terminal states are immutable.
    - `handle_invitation_update_guard`: Protects `id`, `family_id`, `person_id`, `invited_by`, `token_hash`, `created_at`.
    - `handle_invitation_status_transition_guard`: Enforces state transitions (`PENDING -> ACCEPTED/REVOKED/EXPIRED`).
  - **Privileged Functions (Controlled Workflow Pathways)**:
    - `public.approve_person_claim(p_claim_id UUID)` (`SECURITY DEFINER`, `search_path = public`): Atomically verifies moderator authorization, locks target person and claim row, verifies eligibility (`user_id IS NULL`, `deleted_at IS NULL`, `status = 'ACTIVE'`, `date_of_death IS NULL`), verifies claimant has no existing linked person across ALL person records (even soft-deleted, upholding the absolute 1 user ↔ 1 person rule), updates `persons.user_id = claim.claimant_id`, marks claim `APPROVED`, and writes an immutable event to `public.audit_logs`.
    - `public.reject_person_claim(p_claim_id UUID, p_reason TEXT)` (`SECURITY DEFINER`, `search_path = public`): Atomically rejects claim with mandatory reason and writes to `public.audit_logs`.
  - **RLS Policies**: Full isolation across both tables for claimants, inviters, family creators, and administrators.
    - `person_claims`: Normal claimants can create and cancel their own pending claims. Direct table UPDATE by moderators/admins is completely blocked (no update bypass); approval/rejection must execute via privileged RPCs. Physical deletions denied (`USING (FALSE)`).
    - `invitations`: Inviters can view and revoke their own pending invitations; family creators and moderators can view/create; moderators can revoke pending invitations. Physical deletions denied (`USING (FALSE)`).
  - **Gate 1 Privileges & Token Hash Protection**: Table and function privileges revoked from `PUBLIC` and `anon`. On `invitations`, authenticated role is granted column-level `SELECT` and column-level `INSERT` on metadata only — `token_hash` is withheld from client-level reads and writes so clients cannot supply arbitrary token hashes. Execution on approval and rejection functions granted to `authenticated`.
  - **Audit Integrity on Cancellation**: `person_claims_reviewed_consistency` enforces that cancelled claims must have `reviewed_by`, `reviewed_at`, and `rejection_reason` all strictly `NULL`.


### Discovery Domain (Phase 6 Architecture Lock)

Architectural Baseline locked via [ADR: Community Directory, Search Architecture & Discovery Privacy](adr/20261005-community-discovery-and-search-architecture.md).
*Phase 6 Discovery & Architecture Assessment is COMPLETE. Zero database or migration changes required; implementation NOT started and awaits explicit human authorization.*

#### Core Discovery Entities & Deployed Indexes
Discovery leverages existing normalized tables (`public.persons` and `public.families`) and their pre-deployed GIN/B-tree indexes from Phase 1 (`20261002140000_phase1_foundation.sql`):

| Table | Index Name | Type | Indexed Expression / Columns | Purpose |
|---|---|---|---|---|
| `persons` | `idx_persons_name_fts` | GIN | `to_tsvector('english', coalesce(first_name, '') \|\| ' ' \|\| coalesce(last_name, '') \|\| ' ' \|\| coalesce(maiden_name, ''))` | Full-text name search |
| `persons` | `idx_persons_first_name_trgm` | GIN | `first_name gin_trgm_ops` | Fuzzy first name matching |
| `persons` | `idx_persons_last_name_trgm` | GIN | `last_name gin_trgm_ops` | Fuzzy last name matching |
| `persons` | `idx_persons_name_lower` | B-tree | `lower(last_name), lower(first_name)` | Case-insensitive deterministic sorting |
| `persons` | `idx_persons_gotra` | B-tree | `lower(gotra)` (partial `WHERE gotra IS NOT NULL`) | Vedic lineage filter |
| `persons` | `idx_persons_nukh` | B-tree | `lower(nukh)` (partial `WHERE nukh IS NOT NULL`) | Ancestral lineage filter |
| `persons` | `idx_persons_status` | B-tree | `status, verification_status` | Composite lifecycle & verification filter |
| `persons` | `idx_persons_privacy` | B-tree | `profile_privacy` | RLS visibility filter |
| `persons` | `idx_persons_created_at` | B-tree | `created_at DESC` | Temporal sorting |
| `families` | `idx_families_fts` | GIN | `to_tsvector('english', coalesce(family_name, '') \|\| ' ' \|\| coalesce(description, '') \|\| ' ' \|\| coalesce(city, ''))` | Full-text family search |
| `families` | `idx_families_name_trgm` | GIN | `family_name gin_trgm_ops` | Fuzzy family name matching |
| `families` | `idx_families_name_lower` | B-tree | `lower(family_name)` | Case-insensitive deterministic sorting |
| `families` | `idx_families_gotra` | B-tree | `lower(gotra)` (partial `WHERE gotra IS NOT NULL`) | Vedic lineage filter |
| `families` | `idx_families_nukh` | B-tree | `lower(nukh)` (partial `WHERE nukh IS NOT NULL`) | Ancestral lineage filter |
| `families` | `idx_families_kul` | B-tree | `lower(kul)` (partial `WHERE kul IS NOT NULL`) | Clan lineage filter |
| `families` | `idx_families_location` | B-tree | `lower(country), lower(state), lower(city)` | Residential location filter |
| `families` | `idx_families_status` | B-tree | `status, verification_status` | Composite lifecycle & verification filter |
| `families` | `idx_families_privacy` | B-tree | `profile_privacy` | RLS visibility filter |

*Verification Clarifications on Deployed Columns*:
- `persons` table has `birth_place` (TEXT), but does NOT have `city`, `state`, `country`, `location_*`, or `mukhi` columns.
- `families` table has `city`, `state`, `country`, but does NOT have a `native_place` column.
- Mukhi leadership directories and committee attributes are partitioned into Phase 10 (Community Features).

#### Query Execution & Privacy Guarantees
- **RLS Preserved**: Queries execute via PostgREST through Supabase client using caller's JWT. PostgreSQL RLS policies evaluate on every candidate row; records where `profile_privacy IN ('PRIVATE', 'FAMILY')` are omitted before payload generation.
- **Field-Level Security**: Contact fields (`phone`, `email_contact`) and internal identity keys (`user_id`, `created_by`, timestamps) are explicitly omitted from directory search projections.
- **Pagination & Concurrency**: Deterministic ordered pagination (`ORDER BY last_name ASC, first_name ASC, id ASC`) capped at `MAX_PAGE_SIZE = 50`. Implements Fetch N+1 (`hasNextPage`) without requiring expensive full-table `COUNT(*)` queries under peak concurrent community loads (~9,000 active users).

### Privacy Domain

| Table | Description |
|---|---|
| `privacy_overrides` | Field-level privacy overrides for specific person-viewer pairs. |
| `blocked_users` | User ↔ blocked user; blocked users see no data. |

### Verification Domain

| Table | Description |
|---|---|
| `verification_requests` | Request for a person record to be community-verified. |
| `verifier_roles` | Tracks which users hold the verifier role. |

### Data Quality Domain

| Table / View | Description |
|---|---|
| `duplicate_flags` | Flagged potential duplicate persons for admin review. |
| `data_quality_scores` | Computed completeness metrics per person record. |

### Community Domain (Phase 10 — Subtasks 1, 2 & 3 Schema)

Migrations:
- `supabase/migrations/20261007100000_create_community_groups.sql` *(Deployed remotely)*
- `supabase/migrations/20261007120000_create_community_announcements.sql` *(Local only — NOT deployed remotely)*
- `supabase/migrations/20261007140000_create_community_events.sql` *(Local only — NOT deployed remotely)*

#### Enums
- `public.group_type`: `'VILLAGE_ASSOCIATION'`, `'COMMITTEE'`, `'CULTURAL'`, `'YOUTH'`, `'OTHER'`
- `public.group_role`: `'ADMIN'`, `'MODERATOR'`, `'MEMBER'`
- `public.announcement_type`: `'GENERAL'`, `'URGENT'`, `'EVENT'`, `'BEREAVEMENT'`, `'CELEBRATION'`
- `public.announcement_status`: `'DRAFT'`, `'PUBLISHED'`, `'ARCHIVED'`
- `public.event_type`: `'GENERAL'`, `'FESTIVAL'`, `'MEETING'`, `'SPORTS'`, `'YOUTH'`, `'CULTURAL'`, `'WORKSHOP'`, `'OTHER'`
- `public.event_status`: `'DRAFT'`, `'PUBLISHED'`, `'CANCELLED'`, `'COMPLETED'`, `'ARCHIVED'`
- `public.event_rsvp_status`: `'GOING'`, `'MAYBE'`, `'NOT_GOING'`

#### Tables
| Table | Description |
|---|---|
| `groups` | Community groups beyond family units. Includes `name`, `slug` (unique, lowercase alphanumeric), `group_type`, `location`, `description`, `is_verified` (default FALSE), `is_private` (default FALSE), `created_by`, `deleted_at` (soft-delete). |
| `group_members` | Membership join table linking `group_id` ↔ `user_id` (auth.users/profiles) with role. Constraint `UNIQUE (group_id, user_id)`. |
| `announcements` | Community notice board posts. Includes `title` (1–200), `content` (1–10000), `announcement_type`, `status`, `group_id` (nullable FK to groups; NULL = community-wide), `author_id` (FK to auth.users), `is_pinned` (default FALSE), `published_at`, `deleted_at`. |
| `events` | Community events and gatherings. Includes `title` (1–200), `description` (1–10000), `event_type`, `status`, `start_time`, `end_time`, `location`, `location_url`, `group_id` (nullable FK to groups), `creator_id` (FK to auth.users), `capacity`, `cancellation_reason`, `cancelled_at`, `published_at`, `deleted_at`. |
| `event_rsvps` | Attendance declarations. Includes `event_id` (FK to events), `user_id` (FK to auth.users), `status` (GOING, MAYBE, NOT_GOING), `guest_count` (0..5), `notes` (max 300). Constraint `UNIQUE (event_id, user_id)`. |

#### Triggers & Guards
- `handle_group_update_guard()`: Protects `id`, `created_by`, `created_at` against mutation. Strictly enforces that only `is_community_moderator()` can modify `is_verified`.
- `handle_group_member_update_guard()`: Protects `id`, `group_id`, `user_id`, `joined_at` against mutation. Enforces sole-admin demotion protection.
- `handle_group_member_delete_guard()`: Protects sole admin from deletion/removal/self-leave in active groups.
- `handle_announcement_update_guard()`: Protects immutable fields (`id`, `created_at`, `author_id`, `group_id`) on `public.announcements`.
- `handle_event_update_guard()`: Protects immutable fields (`id`, `created_at`, `creator_id`, `group_id`) on `public.events`.
- `handle_event_rsvp_update_guard()`: Protects immutable fields (`id`, `created_at`, `event_id`, `user_id`) on `public.event_rsvps`.

#### Non-Recursive RLS Helper Functions (`SECURITY DEFINER`, `search_path = public`)
- `is_group_member(p_group_id, p_user_id)`: Checks membership without recursive RLS evaluation.
- `is_group_admin(p_group_id, p_user_id)`: Checks admin status without recursive RLS evaluation.
- `can_view_group(p_group_id, p_user_id)`: Checks parent group visibility for member queries without recursive RLS evaluation.
- `can_view_event(p_event_id, p_user_id)`: Checks parent group/community visibility for event and RSVP queries without recursive RLS evaluation.
- `can_manage_event(p_event_id, p_user_id)`: Evaluates creator, group manager, or global moderator status for event management.

#### Server RPC Functions (`SECURITY DEFINER`, `search_path = public`)
- **Groups RPCs:**
  - `create_community_group(...)`: Atomically creates a group, sets caller as initial `ADMIN`, and logs `ADMIN_ACTION` audit event.
  - `join_community_group(...)`: Allows authenticated self-join into active public groups as `MEMBER`.
  - `leave_community_group(...)`: Allows members to leave; enforces sole-admin protection via delete guard trigger.
  - `add_group_member(...)`: Allows group `ADMIN` or global moderator (or `MODERATOR` adding `MEMBER`) to add members.
  - `remove_group_member(...)`: Allows group `ADMIN` or global moderator to remove members; protected by delete guard trigger.
  - `update_group_member_role(...)`: Restricted to group `ADMIN` or global community moderators; protected by update guard trigger.
  - `archive_community_group(...)`: Soft-deletes group (`deleted_at = NOW()`), restricted to group `ADMIN` or global moderator.
  - `verify_community_group(...)`: Guarded strictly by `is_community_moderator()`.
- **Announcements RPCs:**
  - `create_community_announcement(...)`: Validates scope (global notices restricted to `is_community_moderator()`; group notices restricted to group admin/mod or global mod), validates length bounds, and logs `CREATE_ANNOUNCEMENT` audit event.
  - `update_community_announcement(...)`: Validates author/manager permissions, updates content/status/pin, and logs `UPDATE_ANNOUNCEMENT` audit event.
  - `archive_community_announcement(...)`: Transitions announcement to `ARCHIVED` status with authorization checks and audit log.
  - `delete_community_announcement(...)`: Authoritatively soft-deletes announcement (`deleted_at = NOW()`) with authorization checks and audit log.
- **Events & RSVP RPCs:**
  - `create_community_event(...)`: Validates scope, date constraints (`end_time > start_time`), capacity, and logs `CREATE_EVENT` audit event.
  - `update_community_event(...)`: Enforces organizer permissions and date constraints with audit logging.
  - `cancel_community_event(...)`: Transitions status to `CANCELLED`, records cancellation timestamp and reason with audit logging.
  - `archive_community_event(...)`: Transitions status to `ARCHIVED` with audit logging.
  - `delete_community_event(...)`: Soft-deletes event (`deleted_at = NOW()`) with audit logging.
  - `set_event_rsvp(...)`: Concurrency-safe attendance registration with `SELECT ... FOR UPDATE` row locking and capacity enforcement (`1 + guest_count`).
  - `cancel_event_rsvp(...)`: Transitions RSVP record to `NOT_GOING` or removes row with audit logging.

#### Privilege & Security Model
- Privileges revoked from `PUBLIC` and `anon` on all community tables and functions.
- `authenticated` role granted `SELECT` on `public.announcements`, `public.events`, `public.event_rsvps`, `SELECT, UPDATE` on `groups`, and `SELECT` on `group_members`. Direct mutations (`INSERT`, `UPDATE`, `DELETE`) denied via RLS deny policies.
- Internal RLS helper functions have `EXECUTE` revoked from `PUBLIC, anon, authenticated` (evaluated strictly in database/RLS context, preventing client probing).
- Authoritative RPCs have `EXECUTE` revoked from `PUBLIC` and `anon`, and explicitly granted to `authenticated`.
- Group visibility checks in announcements/events RLS query `public.groups` acyclically without recursion.


### Media Domain

| Table | Description |
|---|---|
| `media_items` | Metadata for uploaded files (photos, documents). |
| `person_media` | Join: person ↔ media item. |
| `family_media` | Join: family ↔ media item. |

### Admin Domain

| Table | Description |
|---|---|
| `audit_logs` | Append-only log of sensitive admin and data actions. |
| `admin_flags` | Content moderation flags. |

---

## 9. Phase 1 Migration Architecture & Baseline (Deployed & Verified)

Phase 1 database objects are consolidated into **ONE canonical baseline migration**:
`supabase/migrations/20261002140000_phase1_foundation.sql` (1,077 lines)

- **Target Project:** `community-family-platform` (`ixhvsprwjalgcyievsrg`, South Asia - Mumbai)
- **Deployment Status:** Successfully deployed; post-deployment verification passed.
- **Architectural Reference:** [ADR: Phase 1 Migration Consolidation](file:///c:/Users/HP/OneDrive/Live%20Project/03_Development/family%20Tree/docs/adr/20261002-phase1-migration-consolidation.md).

### Deployed Database Objects Summary:

1. **4 PostgreSQL Extensions**:
   - `uuid-ossp` (1.1), `pgcrypto` (1.3), `pg_trgm` (1.6), `unaccent` (1.1)
2. **8 Domain Enums**:
   - `privacy_level` (5 values: PRIVATE, FAMILY, CONNECTIONS, COMMUNITY, PUBLIC)
   - `user_role` (7 values: MEMBER, CONTRIBUTOR, VERIFIED_MEMBER, ELDER, COMMUNITY_MODERATOR, ADMIN, SUPER_ADMIN)
   - `person_status` (4 values: LIVING, DECEASED, UNKNOWN, ARCHIVED)
   - `family_status` (3 values: ACTIVE, INACTIVE, MERGED)
   - `verification_status` (4 values: UNVERIFIED, PENDING, VERIFIED, REJECTED)
   - `gender` (4 values: MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY)
   - `family_role` (8 values: HEAD, SPOUSE, CHILD, PARENT, SIBLING, EXTENDED, OTHER, ANCESTOR)
   - `audit_action` (21 values: complete system audit vocabulary)
3. **5 Application Tables (RLS Enabled on All 5)**:
   - `public.profiles`: 1:1 user profile extension of `auth.users`, display preferences, application role
   - `public.persons`: Core community human entity (`PERSON != USER`), nullable `user_id`
   - `public.families`: Family units with `created_by`
   - `public.family_members`: Temporal membership (`left_at`), role, unique active head constraint
   - `public.audit_logs`: Immutable, append-only security audit log
4. **7 Database Functions**:
   - `public.handle_updated_at()`: Trigger function automatically refreshing `updated_at` timestamps
   - `public.is_admin()`: `SECURITY DEFINER`, checks if caller is `ADMIN` or `SUPER_ADMIN`
   - `public.is_community_moderator()`: `SECURITY DEFINER`, checks if caller is moderator or admin
   - `public.get_my_role()`: `SECURITY DEFINER`, returns active role string of caller
   - `public.handle_new_user()`: `SECURITY DEFINER`, creates profile row upon user registration
   - `public.handle_user_email_confirmed()`: `SECURITY DEFINER`, synchronizes email verification
   - `public.log_audit_event(...)`: `SECURITY DEFINER`, trusted server/trigger audit logging helper
5. **5 Triggers**:
   - **3 Public Triggers:** `profiles_handle_updated_at` ON `public.profiles`, `persons_handle_updated_at` ON `public.persons`, `families_handle_updated_at` ON `public.families`
   - **2 Auth Triggers:** `on_auth_user_created` (AFTER INSERT ON `auth.users`), `on_auth_user_email_confirmed` (AFTER UPDATE ON `auth.users`), attached via guarded idempotent `DO $$` blocks without altering `auth.users` ownership
6. **33 Row Level Security Policies**:
   - `public.profiles` (6 policies): select own/admin, update own (immutable role)/admin, delete admin
   - `public.persons` (8 policies): select public/community/own/admin, insert auth, update own/admin, delete admin
   - `public.families` (7 policies): select public/community/creator/admin, insert auth, update creator/admin, delete admin
   - `public.family_members` (7 policies): select community/own/admin, insert creator/admin, update creator/admin, delete creator/admin
   - `public.audit_logs` (5 policies): select admin/actor, insert deny-all (`WITH CHECK (FALSE)`), update deny-all, delete deny-all
7. **26 Performance & Search Indexes**:
   - B-tree indexes on foreign keys, status, dates, and privacy levels
   - GIN trigram indexes on `first_name`, `last_name`, and `family_name` for fast fuzzy search
8. **Two Final RLS / Data-Integrity Patches Enforced**:
   - **Patch 1 (`persons_insert_authenticated`)**: Added `AND user_id IS NULL` to ensure normal authenticated users cannot link person records to other users at insert time.
   - **Patch 2 (`family_members_update_creator`)**: Added `WITH CHECK` verifying the target `family_id` still belongs to an active, creator-owned family.

Diagnostic script for inspecting remote database status: `docs/diagnostics/remote_phase1_diagnostic.sql`.

---

## 10. Type Codegen Workflow

TypeScript types for the database schema are **generated**, not hand-written.

### Generate from Local Supabase

```bash
# Requires local Supabase running (supabase start)
npx supabase gen types typescript --local > src/types/database.types.ts
```

### Generate from Remote Supabase Project

For the deployed `community-family-platform` project (`ixhvsprwjalgcyievsrg`), types are generated using:

```bash
npx supabase gen types typescript --project-id ixhvsprwjalgcyievsrg --schema public > src/types/database.types.ts
```

### Deployed Type Generation Status (Phase 2 Baseline)

- **Source Project**: `community-family-platform` (`ixhvsprwjalgcyievsrg`, South Asia - Mumbai)
- **Target File**: `src/types/database.types.ts` (543 lines, UTF-8 without BOM)
- **Schema Coverage**:
  - **5 Tables**: `profiles`, `persons`, `families`, `family_members`, `audit_logs` (complete definitions for `Row`, `Insert`, `Update`, and foreign-key `Relationships`)
  - **8 Enums**: `privacy_level`, `user_role`, `person_status`, `family_status`, `verification_status`, `gender`, `family_role`, `audit_action`
  - **4 Database Functions**: `is_admin`, `is_community_moderator`, `get_my_role`, `log_audit_event`
- **Application Integration**: `src/lib/supabase.ts` imports `Database` from `@/types/database.types` and instantiates `createClient<Database>(...)`.
- **Validation**: Zero TypeScript errors (`npm run type-check` PASS: 0 errors).

### Usage in Application Code

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// Fully typed client
const supabase = createClient<Database>(URL, ANON_KEY);

// Typed query result
const { data } = await supabase
  .from('persons')    // TypeScript knows this table exists and auto-completes fields
  .select('id, first_name, last_name, privacy_level')
  .eq('id', personId)
  .single();
// data is typed as { id: string; first_name: string; last_name: string; privacy_level: Database['public']['Enums']['privacy_level'] } | null
```

### Rules

- `database.types.ts` is **generated output**. Do not hand-edit.
- Regenerate after every schema migration.
- Commit the updated `database.types.ts` with the migration that produced it.
- If the generated types break existing TypeScript usage, the migration or the application code must be fixed — do not suppress type errors.

---

## 11. Backup and Recovery

### Supabase-Managed Backups

Supabase provides automated daily backups for paid plans. Configuration:
- Backup retention: 7 days (Free/Pro) or 30 days (Team/Enterprise).
- Point-in-time recovery (PITR): available on Team/Enterprise plans.

### Recovery Plan Intent (Phase 16)

- Define and document RTO (Recovery Time Objective) and RPO (Recovery Point Objective).
- Test restoration from backup in a staging environment before go-live.
- Document manual recovery procedure for critical tables.
- Verify that backup includes storage objects (photos, documents) as well as database rows.

### Migration Safety

- All migrations are immutable and version-controlled. In a disaster recovery scenario, the schema can be reconstructed by replaying migrations from the beginning.
- Seed data for development is in `supabase/seed.sql` — this is not production data.

---

## 12. Family Media, Albums & History (Phase 11 Subtask 2)

### Schema Overview

- **`family_albums`**: Groups family photos and documents into collections.
  - Columns: `id` (UUID PK), `family_id` (FK `families.id`), `title` (VARCHAR 200), `description` (TEXT), `privacy_level` (enum), `cover_media_id` (UUID), `created_by` (FK `auth.users`), `created_at`, `updated_at`, `deleted_at`.
- **`family_media`**: Individual photos, documents, and historical records.
  - Columns: `id` (UUID PK), `family_id` (FK `families.id`), `album_id` (FK `family_albums.id` nullable), `storage_object_path` (TEXT canonical path `family-media/families/...`), `media_type` (`PHOTO`, `DOCUMENT`, `HISTORICAL_RECORD`), `original_filename` (TEXT), `mime_type` (TEXT), `file_size` (BIGINT <= 20MB), `caption` (TEXT <= 500), `description` (TEXT <= 2000), `display_order` (INT >= 1), `uploaded_by` (FK `auth.users`), `created_at`, `updated_at`, `deleted_at`.
- **`family_stories`**: Preserved oral history and narratives attached to families.
  - Columns: `id` (UUID PK), `family_id` (FK `families.id`), `title` (VARCHAR 300), `content` (TEXT), `summary` (TEXT <= 500), `author_id` (FK `auth.users`), `privacy_level` (enum), `featured_media_id` (UUID), `created_at`, `updated_at`, `deleted_at`.

### Storage Namespace & RLS

- Storage bucket: dedicated private `family-media` (20MB limit, image + PDF allowlist).
- Media objects stored under: `families/<family_id>/media/<media_id>/<filename>`.
- `avatars` bucket remains isolated for profile, person, and family avatars (5MB limit, image-only).
- RLS function `can_read_family_media_object(name)` ensures only authorized viewers can read the underlying object.
- Direct client table mutations (`INSERT`, `UPDATE`, `DELETE`) on `family_albums`, `family_media`, and `family_stories` are completely blocked at the RLS and grant levels (table grant is `SELECT` only to `authenticated`; mutation policies evaluate to `FALSE`).
- Mutations strictly orchestrated via authoritative `SECURITY DEFINER` RPCs (`register_family_media`, `soft_delete_family_media`, `create_family_album`, `create_family_story`) running with audit logging.
- Database trigger guards:
  - `handle_family_media_album_guard`: Media album cross-family association guard.
  - `handle_family_album_cover_guard`: Album cover media same-family integrity guard.
  - `handle_family_media_storage_path_guard`: Canonical storage path and record UUID integrity guard.
  - `handle_family_story_featured_media_guard`: Story featured media cross-family guard.
  - `handle_family_album_immutability_guard`: Album identity fields (`id`, `family_id`, `created_by`, `created_at`) are immutable.
  - `handle_family_media_immutability_guard`: Media identity fields (`id`, `family_id`, `uploaded_by`, `created_at`, `storage_object_path`) are immutable.

---

## 13. Notifications Foundation (Phase 12 Subtask 1)

### Schema Overview

- **`notifications`**: Canonical in-app notification inbox.
  - Columns: `id` (UUID PK), `recipient_id` (FK `auth.users.id` ON DELETE CASCADE), `actor_id` (FK `auth.users.id` ON DELETE SET NULL), `category` (`notification_category` enum: `CONNECTION`, `INVITATION`, `CLAIM`, `VERIFICATION`, `COMMUNITY`, `EVENT`, `FAMILY`, `SECURITY`), `type` (VARCHAR 100), `title` (VARCHAR 200), `body` (TEXT), `action_url` (VARCHAR 500), `entity_type` (VARCHAR 50), `entity_id` (UUID), `metadata` (JSONB), `read_at` (TIMESTAMPTZ), `created_at` (TIMESTAMPTZ), `deleted_at` (TIMESTAMPTZ).
  - Constraints: Bounded lengths on `title` (1-200), `body` (1-2000), `action_url` (<=500), `entity_type` (<=50); `metadata` must be a JSON object (`jsonb_typeof(metadata) = 'object'`).
- **`notification_preferences`**: User communication channel and category toggle settings (1:1 with `auth.users`).
  - Columns: `user_id` (UUID PK FK `auth.users.id` ON DELETE CASCADE), `in_app_enabled` (BOOL default TRUE), `email_enabled` (BOOL default TRUE), `email_connections` (BOOL default TRUE), `email_invitations` (BOOL default TRUE), `email_claims` (BOOL default TRUE), `email_verifications` (BOOL default TRUE), `email_announcements` (BOOL default FALSE), `email_events` (BOOL default TRUE), `email_family_media` (BOOL default FALSE), `created_at`, `updated_at`.
- **`notification_outbox`**: Asynchronous external delivery queue (email, push).
  - Columns: `id` (UUID PK), `notification_id` (FK `notifications.id` ON DELETE CASCADE), `recipient_id` (FK `auth.users.id` ON DELETE CASCADE), `channel` (`notification_channel` enum: `EMAIL`, `PUSH`), `status` (`notification_delivery_status` enum: `PENDING`, `PROCESSING`, `SENT`, `FAILED`, `DEAD_LETTER`), `attempts` (INT >= 0), `last_error` (TEXT), `scheduled_at` (TIMESTAMPTZ), `sent_at` (TIMESTAMPTZ), `created_at` (TIMESTAMPTZ).

### Indexes & Performance
- `idx_notifications_recipient_unread`: `(recipient_id, created_at DESC) WHERE read_at IS NULL AND deleted_at IS NULL` (sub-millisecond unread counts via index-only scan).
- `idx_notifications_recipient_feed`: `(recipient_id, created_at DESC) WHERE deleted_at IS NULL` (paginated feed index).
- `idx_notifications_entity_lookup`: `(entity_type, entity_id)` (target entity lookup index).
- `idx_notification_outbox_pending`: `(status, scheduled_at) WHERE status = 'PENDING'` (worker poll index).

### Access Control, RLS & Trigger Guards
- `PERSON != USER`: All notification entities reference `auth.users(id)` strictly; zero references to `public.persons`.
- Direct client `INSERT`, `UPDATE`, and `DELETE` on `notifications` and `notification_outbox` are completely blocked via RLS (`WITH CHECK (FALSE)`, `USING (FALSE)`) and table privileges (`REVOKE ALL FROM PUBLIC, anon; GRANT SELECT ON notifications TO authenticated`).
- Mutation is server-authoritative via `SECURITY DEFINER` RPCs: `mark_notification_read`, `mark_all_notifications_read`, `dismiss_notification`, `get_unread_notification_count`, `get_my_notification_preferences`, `update_my_notification_preferences`.
- Trigger guards:
  - `handle_notification_immutability_guard`: Enforces immutability of `id`, `recipient_id`, `actor_id`, `category`, `type`, `title`, `body`, `action_url`, `entity_type`, `entity_id`, and `created_at`.
  - `handle_notification_preferences_guard`: Enforces immutability of `user_id` and `created_at`; auto-updates `updated_at`.
  - `handle_notification_outbox_guard`: Enforces immutability of `id`, `notification_id`, `recipient_id`, `channel`, and `created_at`.
- Realtime publication: `public.notifications` added to `supabase_realtime` publication.

---

*This document reflects the intended architecture. Actual schema is authoritatively defined in migration files under `supabase/migrations/`. When there is a discrepancy between this document and a migration file, the migration file is the source of truth.*
