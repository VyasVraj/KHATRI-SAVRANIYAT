# Security — Community Roots

**Document Type**: Security Architecture Reference
**Classification**: Internal Engineering
**Status**: Phase 5 Complete & Formally Closed — Phase 6 Discovery Complete (Implementation Not Started) (2026-10-05)

---

## Table of Contents

1. [Security Model Overview](#1-security-model-overview)
2. [Threat Model](#2-threat-model)
3. [Authentication Architecture](#3-authentication-architecture)
4. [Authorization Model](#4-authorization-model)
5. [Privacy Model](#5-privacy-model)
6. [PERSON ≠ USER Principle](#6-person--user-principle)
7. [Frontend Security Boundary](#7-frontend-security-boundary)
8. [Secrets Management](#8-secrets-management)
9. [Input Validation Strategy](#9-input-validation-strategy)
10. [Storage Security](#10-storage-security)
11. [Audit Logging](#11-audit-logging)
12. [Rate Limiting and Abuse Prevention](#12-rate-limiting-and-abuse-prevention)
13. [Security Testing Requirements](#13-security-testing-requirements)

---

## 1. Security Model Overview

Community Roots handles sensitive personal and genealogical data for real individuals, including minors, deceased individuals, and living community members. The security model must protect this data from unauthorized disclosure, modification, and abuse.

### Guiding Principles

1. **Defense in depth**: Multiple layers of control; no single point of failure grants full access.
2. **Least privilege**: Users see only the data they are permitted to see. Default is restrictive.
3. **Server-side enforcement**: Authorization is enforced in the database, not in the client.
4. **Privacy by design**: Data visibility defaults to restricted; disclosure requires explicit grants.
5. **Separation of concerns**: Authentication (who are you?) and authorization (what can you do?) are handled at the appropriate layer.

### Security Stack

| Layer | Control |
|---|---|
| Transport | HTTPS/TLS (enforced by Supabase + CDN) |
| Authentication | Supabase Auth (JWTs, short-lived sessions) |
| Authorization | PostgreSQL RLS policies (per-row, per-operation) |
| Data Integrity | PostgreSQL CHECK constraints, NOT NULL, FKs |
| Input Validation | Zod (frontend UX) + DB constraints (trusted enforcement) |
| Secrets | Environment variables, never committed to source control |
| Storage | Signed URLs, MIME validation, size limits |

---

## 2. Threat Model

The following threats have been identified and are addressed (or noted for mitigation in a specific phase).

| Threat | Category | Mitigation |
|---|---|---|
| SQL Injection | Injection | Supabase client uses parameterized queries (PostgREST). No raw SQL concatenation in application code. |
| XSS (Cross-Site Scripting) | Client-side injection | React's JSX escaping by default. Content Security Policy (Phase 15). Sanitize any rich-text content before render. |
| CSRF (Cross-Site Request Forgery) | Session abuse | Supabase JWTs in Authorization headers (not cookies) mitigate traditional CSRF. SameSite cookie policy for auth cookies. |
| IDOR (Insecure Direct Object Reference) | Broken access control | RLS policies enforce ownership/relationship checks on every query. UUIDs used for all PKs (non-enumerable). |
| Broken Access Control | Authorization | RLS is the trust boundary. All policies are tested with positive AND negative cases. |
| Privilege Escalation | Authorization | Role updates (`is_admin`, verifier role) can only be performed by service-role (Edge Functions, migrations). Never via client. |
| Fake / Duplicate Accounts | Identity | Email verification required. Claim flow requires admin approval. Duplicate detection in Phase 9. |
| Brute Force (Auth) | Authentication | Supabase Auth rate limiting on login attempts. Account lockout after repeated failures. |
| Bot Abuse | Abuse | Rate limiting on sign-up and form submission (Phase 15). CAPTCHA consideration for public-facing forms. |
| Spam / Fake Records | Data integrity | Person creation requires authenticated user. Verification system (Phase 9) provides quality signal. |
| Malicious File Uploads | Storage | MIME type validation, file size limits, virus scanning consideration (Phase 11). Signed URLs, no public bucket access. |
| Data Leakage via API | Information disclosure | RLS restricts what PostgREST returns. Privacy levels enforced in SELECT policies. No raw `auth.users` exposure. |
| Admin Abuse | Insider threat | Audit log for all admin actions (Phase 13). Admin role changes require service-role key. |
| Session Theft / JWT Hijacking | Session security | Short-lived JWTs (1 hour). Refresh tokens rotated on use. HTTPS enforced. |
| Enumeration of Private Records | Information disclosure | UUIDs prevent sequential enumeration. RLS returns empty sets (not 403) to prevent confirmation of existence for private records where appropriate. |

---

## 3. Authentication Architecture

### Provider

Authentication is handled entirely by **Supabase Auth**. There is no custom authentication implementation.

### Supported Methods (planned by phase)

| Method | Phase |
|---|---|
| Email + Password | Phase 2 |
| Magic Link (passwordless email) | Phase 2 |
| OAuth (Google, etc.) | Post-Phase 2 (if authorized) |

### JWT Structure

Supabase Auth issues JWTs with the following relevant claims:

```json
{
  "sub": "<user-uuid>",           // auth.uid() in RLS
  "email": "user@example.com",
  "role": "authenticated",        // or "anon" for unauthenticated
  "exp": 1234567890,
  "app_metadata": {
    "is_admin": false             // set by service-role only
  }
}
```

The JWT is automatically attached to all Supabase client requests. RLS policies evaluate `auth.uid()` and `auth.jwt()` to determine permissions.

### Session Management

- Access tokens expire after **1 hour**.
- Refresh tokens are rotated on use (Supabase default behavior).
- Sessions are stored in `localStorage` by the Supabase JS client.
- On sign-out, the session is invalidated server-side and cleared from `localStorage`.
- Auth state changes are propagated to the React app via `supabase.auth.onAuthStateChange()`.

### Password Policy

- Minimum 8 characters (enforced by Supabase Auth configuration).
- Email verification required before the account is active.

---

## 4. Authorization Model

### Two-Gate Access Control Architecture

Data access from the client is governed by two sequential enforcement layers in PostgreSQL:

1. **Gate 1 — Table-Level Privileges (Discretionary Access Control)**: Determines whether the database role (`authenticated`, `anon`) is permitted to execute the requested statement (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on the table as a whole.
2. **Gate 2 — Row Level Security (Mandatory Access Control)**: Evaluates row-level policies (`USING` and `WITH CHECK`) to determine which specific records an actor can read or modify.

**Critical Principle**:
Table privileges determine whether an operation is possible on the table; RLS enforces row-level authorization. Table privileges do not bypass or replace RLS in any way. RLS remains the authoritative source of truth for all business and privacy authorization rules.

#### Authenticated Table Privilege Configuration (Hotfix Migration)

The original Phase 1 foundation migration established tables and RLS policies, but omitted explicit table-level grants to the PostgREST `authenticated` role. This caused authenticated requests to be rejected at Gate 1 with error `42501` (`insufficient_privilege` / `permission denied`) before RLS policies could evaluate the request.

To resolve this, additive migration `20261003100000_grant_authenticated_table_privileges.sql` was deployed under strict least privilege:

- `authenticated` receives only the explicit, minimum table grants required for browser operations:
  - `public.profiles`: `SELECT, UPDATE` (profile creation is handled via `SECURITY DEFINER` trigger; deletion is denied)
  - `public.persons`: `SELECT, INSERT, UPDATE` (soft-deletion via `deleted_at`; physical deletion is denied)
  - `public.families`: `SELECT, INSERT, UPDATE` (soft-deletion via `deleted_at`; physical deletion is denied)
  - `public.family_members`: `SELECT, INSERT, UPDATE, DELETE` (family creators/moderators manage members)
  - `public.audit_logs`: `SELECT` (admin log inspection; inserts via `SECURITY DEFINER` function; updates/deletions denied)
- `anon` receives **zero table-level privileges** on the five core tables, ensuring unauthenticated requests are blocked at Gate 1.
- RLS remains enabled and active on all five tables (`profiles`, `persons`, `families`, `family_members`, `audit_logs`).
- No broad `GRANT ALL` or schema-level wildcard grants exist.
- Core security invariants—least privilege, soft deletion, immutable audit logging, and zero client `service_role` credentials—remain strictly preserved.

### Row Level Security (RLS)

RLS is the **primary and sole trusted authorization mechanism** for all data access from the client.

- RLS is enabled on every table in the `public` schema.
- The default behavior (when no policy matches) is **DENY**.
- Every operation type (SELECT, INSERT, UPDATE, DELETE) must have an explicit policy or be implicitly denied.

### Policy Evaluation Context

Inside RLS policies, these functions are available:

| Function | Returns |
|---|---|
| `auth.uid()` | UUID of the authenticated user, or NULL if anonymous |
| `auth.role()` | `'authenticated'` or `'anon'` |
| `auth.jwt()` | Full JWT payload as JSONB (for custom claims) |

### Common Policy Patterns

```sql
-- Owner can read their own record
CREATE POLICY "persons: owner read" ON persons
  FOR SELECT USING (owner_user_id = auth.uid());

-- Public records are visible to everyone (including anon)
CREATE POLICY "persons: public read" ON persons
  FOR SELECT USING (privacy_level = 'PUBLIC');

-- Family members can see FAMILY-level records
CREATE POLICY "persons: family read" ON persons
  FOR SELECT USING (
    privacy_level = 'FAMILY'
    AND EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = persons.family_id
        AND fm.user_id = auth.uid()
    )
  );

-- Only admins can update verification status
CREATE POLICY "persons: admin update verification" ON persons
  FOR UPDATE USING (
    (auth.jwt() ->> 'is_admin')::boolean = true
  )
  WITH CHECK (
    (auth.jwt() ->> 'is_admin')::boolean = true
  );
```

### Admin Role & Security Helpers

Administrative checks are implemented via PostgreSQL `SECURITY DEFINER` functions in the database layer:
- `is_admin()`: Returns `TRUE` if `auth.uid()` has `ADMIN` or `SUPER_ADMIN` in `public.profiles` and `is_active = TRUE`. Runs with `SET search_path = public` and bypasses RLS safely.
- `is_community_moderator()`: Returns `TRUE` for `ADMIN`, `SUPER_ADMIN`, or `COMMUNITY_MODERATOR`.
- `get_my_role()`: Returns the caller's active role string (`SECURITY DEFINER`).

### Role-Escalation & Profile Protection
In `profiles_update_own`, normal users can update self-service fields (`display_name`, `avatar_url`), but role escalation and unauthorized deactivation are strictly blocked at the database level:
```sql
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role::TEXT = public.get_my_role()
    AND is_active = TRUE
  );
```
Admins update profiles under `profiles_update_admin` (`USING (public.is_admin())`).
- Admin policies check `(auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean`.

### Phase 1 Deployed RLS Architecture (33 Policies Across 5 Tables)

The Phase 1 canonical migration (`20261002140000_phase1_foundation.sql`, 1,077 lines) established 33 active RLS policies across all 5 public application tables in project `community-family-platform`:

1. **`public.profiles` (6 policies)**: Enforces self-management with role immutability.
2. **`public.persons` (8 policies)**: Enforces privacy-level visibility (`COMMUNITY`, `PUBLIC`), creator/own access, and strictly prevents account linking at insert time.
   - **Patch 1 (`persons_insert_authenticated`)**:
     ```sql
     CREATE POLICY "persons_insert_authenticated"
       ON public.persons
       FOR INSERT
       WITH CHECK (
         auth.uid() IS NOT NULL
         AND created_by = auth.uid()
         AND user_id IS NULL
       );
     ```
     *Enforces that normal authenticated users cannot link person records to another auth account during record creation (`PERSON != USER` boundary).*
3. **`public.families` (7 policies)**: Enforces creator and community visibility with soft-delete filtering.
4. **`public.family_members` (7 policies)**: Enforces membership visibility and integrity during updates.
   - **Patch 2 (`family_members_update_creator`)**:
     ```sql
     CREATE POLICY "family_members_update_creator"
       ON public.family_members
       FOR UPDATE
       USING (
         EXISTS (
           SELECT 1 FROM public.families f
           WHERE f.id = family_members.family_id
             AND f.created_by = auth.uid()
             AND f.deleted_at IS NULL
         )
       )
       WITH CHECK (
         EXISTS (
           SELECT 1 FROM public.families f
           WHERE f.id = family_members.family_id
             AND f.created_by = auth.uid()
             AND f.deleted_at IS NULL
         )
       );
     ```
     *Ensures a family creator cannot modify membership records to point to families they do not own or soft-deleted families.*
5. **`public.audit_logs` (5 policies)**: Append-only enforcement via `audit_logs_insert_deny` (`WITH CHECK (FALSE)`). No direct client INSERTs permitted; all audit writes flow through `public.log_audit_event()`.

### Auth Trigger Security & Ownership Boundaries

Triggers on the Supabase-managed `auth.users` relation are created via guarded `DO $$` blocks checking `pg_trigger`:
- `on_auth_user_created` (AFTER INSERT ON `auth.users`)
- `on_auth_user_email_confirmed` (AFTER UPDATE ON `auth.users`)
- Zero `DROP TRIGGER` or `COMMENT ON TRIGGER` statements target `auth.users`, preserving table ownership and privilege isolation with `supabase_auth_admin`.

---

## 5. Privacy Model

Person and family records have a `privacy_level` column that controls visibility. RLS policies enforce these levels.

| Level | Who Can See |
|---|---|
| `PRIVATE` | Only the record owner (linked user) |
| `FAMILY` | Owner + members of the same family unit |
| `CONNECTIONS` | Owner + accepted connections |
| `COMMUNITY` | All authenticated community members |
| `PUBLIC` | Everyone, including unauthenticated visitors |

### Privacy Defaults

- New person records created by a user default to `COMMUNITY` (visible to authenticated members).
- Person records created by an admin (e.g., during import) default to `PRIVATE` until claimed.
- Sensitive fields (e.g., contact information, exact date of birth) may have field-level privacy independent of the record-level privacy.

### Privacy Enforcement

Privacy is enforced at the RLS layer, not in application code. A SELECT policy on `persons` must include all applicable privacy level conditions in a single `USING` clause using `OR` logic:

```sql
CREATE POLICY "persons: visibility" ON persons
  FOR SELECT USING (
    -- Owner always sees their own record
    owner_user_id = auth.uid()
    -- Public records visible to all
    OR privacy_level = 'PUBLIC'
    -- Community-level visible to authenticated users
    OR (auth.role() = 'authenticated' AND privacy_level = 'COMMUNITY')
    -- Family-level: authenticated + family member
    OR (
      auth.role() = 'authenticated'
      AND privacy_level = 'FAMILY'
      AND EXISTS (/* family membership check */)
    )
    -- Connections-level: authenticated + connection
    OR (
      auth.role() = 'authenticated'
      AND privacy_level = 'CONNECTIONS'
      AND EXISTS (/* accepted connection check */)
    )
  );
```

### 5.1 Dual-Endpoint Graph Privacy Model (Phase 5 Interpersonal Relationships & Tree Canvas)

Architectural Baseline locked via [ADR: Canonical Database vs Legacy Android Compatibility](adr/20261004-canonical-database-legacy-android-compatibility.md) and [ADR: Family Tree Graph Model & Layout Architecture](adr/20261005-family-tree-graph-architecture.md).
*Phase 5 Subtask 1 schema and Subtask 2 UI are COMPLETE. Subtask 3 is DISCOVERY COMPLETE (zero schema, migration, or privilege changes; implementation awaits explicit human authorization).*

#### The Threat of Graph-Edge Leakage
In a social or genealogical network, relationship edges (`relationships`) link two human beings: `person_a` and `person_b`. If a viewer has permission to view Person A (e.g., `PUBLIC` or `COMMUNITY` privacy), but Person B has restricted privacy (`PRIVATE` or `FAMILY` where the viewer is not a member), exposing the relationship row creates a severe privacy leak:
- It reveals the existence of Person B.
- It reveals Person B's relationship type and genealogical connection to Person A.
- It exposes metadata and identifiers of Person B.

#### The Dual-Endpoint Authorization Rule
> **Relationship visibility must enforce the same effective authorization semantics as direct person visibility for BOTH endpoints. Existence of a matching persons.id is not sufficient.**

A relationship row is accessible to a user if and only if that user has permission to read **BOTH** endpoint persons under the `persons` RLS policies:

```sql
CREATE POLICY "relationships_select_dual_endpoint"
  ON public.relationships
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.persons pa
      WHERE pa.id = relationships.person_a_id
    )
    AND EXISTS (
      SELECT 1 FROM public.persons pb
      WHERE pb.id = relationships.person_b_id
    )
  );
```

#### Verified Phase 5 RLS Test Scenarios (64 Security Tests Passing)
The Phase 5 RLS test suite validates the following authorization scenarios (positive and negative):
1. **public / public**: Both endpoints have `PUBLIC` visibility -> edge visible to authenticated community members.
2. **community / community**: Both endpoints have `COMMUNITY` visibility -> edge visible to authenticated community members; denied to unauthenticated.
3. **private endpoint**: At least one endpoint is `PRIVATE` (unrelated caller) -> edge strictly denied.
4. **mixed visibility**: One endpoint is `PUBLIC`, other endpoint is `PRIVATE` (unrelated caller) -> edge strictly denied.
5. **deleted endpoint**: One or both endpoint persons are soft-deleted (`deleted_at IS NOT NULL`) -> edge strictly excluded.
6. **owner-visible endpoint**: Private endpoint where the caller is the linked owner user of that private person -> edge permitted if other endpoint is also visible to caller.
7. **moderator-visible endpoint**: Private endpoint where caller is moderator/admin (`is_community_moderator() = TRUE`) -> edge permitted under administrative access.
8. **unauthenticated access**: Anon caller attempts to select relationships -> edge strictly denied at Gate 1 (PostgreSQL privilege revocation) and Gate 2 (RLS).

#### Relationship Lifecycle Hardening & Identity Immutability
1. **Protected Identity Fields**: Under `handle_relationship_update_guard()` trigger, non-moderator callers are strictly prevented from altering `id`, `person_a_id`, `person_b_id`, `relationship_type`, `created_by`, or `created_at`.
2. **Verification Authority**: Normal creators cannot alter `verification_status`; only community moderators retain authority to update verification states.
3. **Physical DELETE Denial**: Hard DELETE operations are strictly prohibited across all application roles via `relationships_delete_deny` (`USING (FALSE)`). Table-level privileges for `authenticated` grant only `SELECT, INSERT, UPDATE` (zero `DELETE` privilege). The canonical lifecycle is soft deletion via `deleted_at`.
4. **Creator Soft-Delete Policy**: Creators may soft-delete their own active relationships (`auth.uid() = created_by AND deleted_at IS NULL`) via `relationships_soft_delete_creator` (`WITH CHECK (auth.uid() = created_by AND deleted_at IS NOT NULL)`), preventing un-deleting or altering other fields during soft-deletion.

#### Tree Visualization Graph Privacy Rule — Zero Synthetic Placeholders
In the family tree visualization (Phase 5 Subtask 3 & 4):
- **No Hidden-Edge Manufacturing**: If an endpoint person is private to the viewing caller, PostgreSQL RLS excludes the relationship row. The graph engine receives zero rows for that edge.
- **Zero Synthetic Placeholders**: The frontend canvas must **never** manufacture synthetic placeholder nodes like `[Private Person]` or `[Private Member]` to signify a hidden edge, because doing so confirms to unauthorized viewers that a confidential relationship exists.
- **Natural Boundary Termination**: The visible graph terminates cleanly at permitted endpoints. Unpermitted branches are omitted completely without leaking metadata, existence, or count.
- **No Privileged Client Fetches**: Zero use of `service_role`, zero client-side privacy reconstruction, and zero bypass of PostgreSQL RLS policies.

### 5.2 Directory Search Privacy & Anti-Scraping Protection (Phase 6 Architecture Lock)

Architectural Baseline locked via [ADR: Community Directory, Search Architecture & Discovery Privacy](adr/20261005-community-discovery-and-search-architecture.md).
*Phase 6 Discovery is COMPLETE. Zero schema, migration, or privilege changes; implementation awaits explicit human authorization.*

#### Two-Gate Directory Search Access Control
Directory search is an authenticated member capability designed for community discovery:
1. **Gate 1 (PostgreSQL Privilege Enforcement)**: Directory search queries run under the `authenticated` role. Unauthenticated (`anon`) callers have no access to private directory listings; they are presented with an authentication gate.
2. **Gate 2 (PostgreSQL RLS Filtering)**: All search queries on `public.persons` and `public.families` are executed directly against the database via PostgREST with the caller's JWT. RLS policies automatically filter out records where `profile_privacy IN ('PRIVATE', 'FAMILY')` unless the caller is the owner or an authorized administrator. Zero private records are returned in result sets.

#### Search Payload Projection & Field-Level Exclusion
To prevent data leakage through directory search summaries:
- **Strictly Excluded Contact Fields**: `phone`, `email_contact`, `phone_secondary`, and residential addresses of non-cohabitating family members are never projected into search card summaries.
- **Strictly Excluded Internal Identifiers**: `user_id`, `created_by`, `updated_at`, `deleted_at`, and raw audit fields are excluded from directory card DTOs.
- **Permitted Public Census Summary**: Only safe, publicly shareable census attributes are returned: `id`, `first_name`, `last_name`, `maiden_name`, location attributes (`birth_place` for persons; `city`, `state`, `country` for families), `gotra`, `nukh`, `kul`, `birth_year` / `death_year`, `gender`, `status`, `verification_status`.

#### Anti-Scraping, Abuse Prevention & High Concurrency
- **Hard Page Ceiling**: All directory search queries enforce a hard page limit (`MAX_PAGE_SIZE = 50`). Bulk scraping across pages is mitigated by rate limiting and deterministic pagination.
- **Fetch N+1 Pagination**: Rather than running expensive full-table `COUNT(*)` operations under peak concurrency (~9,000 active users), directory queries fetch `pageSize + 1` items to determine `hasNextPage` with zero extra database queries.
- **Client Debounce & Cache**: User search input is debounced (350ms) with a 5-minute TanStack Query cache (`staleTime: 1000 * 60 * 5`) to eliminate keystroke-driven query floods.

### 5.3 Connection-Aware Privacy & Social Graph Access Control (Phase 7)

#### USER ↔ USER Social Graph & Connection Privacy Boundary
In Phase 7, the community platform introduces user-to-user social connections (`public.connections`):
1. **USER ↔ USER Graph Isolation**:
   Connections operate between registered user identities (`public.profiles.id`), not census entities (`public.persons`).
2. **Canonical Linkage Rule (`PERSON != USER`)**:
   Only `public.persons.user_id` bridges a census individual to an authenticated account.
   If `persons.user_id IS NULL` (an unlinked/unclaimed individual), connection-based privacy can **never** be satisfied.
3. **Strict State Verification**:
   Only `status = 'ACCEPTED'` connections satisfy connection-aware privacy policies.
   `PENDING`, `REJECTED`, or `BLOCKED` states do NOT grant visibility.
4. **Row Level Security Policy (`persons_select_connections`)**:
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
5. **Least-Privilege Function Hardening & Anti-Oracle Protection**:
   `public.are_users_connected(UUID, UUID)` is a `SECURITY DEFINER` function with `search_path = public`.
   Execution privileges are explicitly revoked from `PUBLIC` and `anon`, and granted exclusively to `authenticated`.
   The function enforces database-level caller authorization (`auth.uid() = user_a OR auth.uid() = user_b OR is_community_moderator()`); third-party callers receive `FALSE`, completely preventing social graph edge probing (oracle attack).
6. **BLOCKED Connection Lifecycle & Anti-Bypass Protection**:
   `public.connections` RLS strictly prohibits normal participants from deleting `BLOCKED` connection rows (`status <> 'BLOCKED'`).
   - Normal participants may delete `PENDING`, `ACCEPTED`, or `REJECTED` connections.
   - `BLOCKED` rows can ONLY be deleted by community moderators or administrators (`is_community_moderator()`).
   - Because the `BLOCKED` row cannot be deleted by either participant, the canonical pair uniqueness index on `(LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))` remains permanently occupied.
   - This prevents the blocked participant from executing an unblock bypass (deleting the blocked connection row and re-requesting a new `PENDING` connection).
7. **Authoritative Lifecycle State Machine Guard**:
   Dedicated database trigger `connections_status_transition_guard` enforces valid state transitions (`PENDING -> ACCEPTED/REJECTED/BLOCKED`, `ACCEPTED/REJECTED -> BLOCKED`). Invalid transitions (`ACCEPTED -> REJECTED`, `REJECTED -> ACCEPTED`, `BLOCKED` participant mutations) are aborted at the PostgreSQL transaction level.

### 5.4 Community Groups Security & Membership Authorization (Phase 10 — Subtask 1)

#### 1. Domain Separation (`PERSON != USER` & `FAMILY != GROUP`)
- Community Groups (`public.groups` and `public.group_members`) represent civic, regional, or committee coordination bodies (e.g., village wings, cultural circles, youth wings).
- Group members are **user accounts** (`auth.users` / `public.profiles`), NOT census `public.persons` records. Group participation does not create or modify genealogical records.
- Groups and Families operate as distinct tables with independent lifecycles.

#### 2. Open Group Creation & Atomic Admin Membership
- Any authenticated user may create a group.
- Creation is atomic via `create_community_group(...)`: the creator is automatically inserted as the initial group `ADMIN` within the same transaction.
- Creating a group does **not** grant or alter global system privileges (`profiles.user_role`).

#### 3. Verification Boundary
- Groups start with `is_verified = FALSE`.
- The database trigger `handle_group_update_guard()` enforces that `is_verified` cannot be modified by ordinary group administrators; it can only be altered by global community moderators via `public.is_community_moderator()`.

#### 4. Sole Admin Protection
- Invariant triggers `handle_group_member_delete_guard` and `handle_group_member_update_guard` guarantee that an active group can never lose its sole administrator via deletion, member removal, self-leave, or role demotion.
- All member lifecycle operations (`leave_community_group`, `remove_group_member`, `update_group_member_role`) are backed by these database triggers.

#### 5. Least-Privilege Table Grants & Non-Recursive RLS Architecture
- Direct table permissions on `groups` and `group_members` are revoked from `PUBLIC` and `anon`.
- Direct mutations (`INSERT`, `UPDATE`, `DELETE`) on `group_members` and direct `INSERT` / `DELETE` on `groups` are strictly denied by RLS policies (`WITH CHECK (FALSE)` / `USING (FALSE)`).
- Execution privileges for internal RLS helper functions (`is_group_member`, `is_group_admin`, `can_view_group`) are explicitly denied from `PUBLIC, anon, authenticated` (`REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`).
- Execution privileges for all 8 authoritative application RPCs are revoked from `PUBLIC` and `anon` (`REVOKE EXECUTE ... FROM PUBLIC, anon`) and granted to `authenticated` (`GRANT EXECUTE ... TO authenticated`).

### 5.5 Community Announcements & Notice Board Security (Phase 10 — Subtask 2)

#### 1. Scope-Based Authorization Matrix
- **Community-Wide Notices (`group_id IS NULL`)**:
  - Visible to all authenticated members.
  - Creation, updating, archiving, and deletion strictly restricted to global community moderators (`is_community_moderator()`).
- **Group Notices (`group_id IS NOT NULL`)**:
  - Discoverable only by users with visibility into the target group.
  - Creation restricted to group `ADMIN`, `MODERATOR`, or global moderator.
  - Updating, archiving, and deletion restricted to the notice author, group `ADMIN`, or global moderator.

#### 2. RPC-Authoritative Mutation Boundary
- Direct table mutations (`INSERT`, `UPDATE`, `DELETE`) on `public.announcements` are strictly blocked via database-level RLS deny policies:
  * `announcements_insert_deny` (`WITH CHECK (FALSE)`)
  * `announcements_update_deny` (`USING (FALSE)`)
  * `announcements_delete_deny` (`USING (FALSE)`)
- All mutations route strictly through `SECURITY DEFINER` RPCs with `SET search_path = public` and audit logging.

#### 3. Database Trigger Field Immutability
- The trigger `handle_announcement_update_guard` prevents updates to immutable audit columns (`id`, `created_at`, `author_id`, `group_id`), ensuring that notices cannot be transferred across authors or hijacked across groups.

#### 4. Least-Privilege Grants & Acyclic RLS
- Table privileges: `REVOKE ALL ON public.announcements FROM PUBLIC, anon; GRANT SELECT ON public.announcements TO authenticated;`.
- Function privileges: `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION ... TO authenticated;`.
- RLS policy `announcements_select_authenticated` evaluates group privacy by querying `public.groups` acyclically without recursion.

### 5.6 Community Events & RSVP Security Model (Phase 10 — Subtask 3)

#### 1. Scope & Management Authorization
- **Community-Wide Events (`group_id IS NULL`)**:
  - Discoverable and open for RSVP to all authenticated users.
  - Creation, editing, archiving, cancellation, and deletion restricted to global community moderators (`is_community_moderator()`) or the event's original creator.
- **Group-Specific Events (`group_id IS NOT NULL`)**:
  - Discoverable only by members permitted to view the underlying group.
  - Creation and management restricted to group `ADMIN`, `MODERATOR`, or global moderator.

#### 2. Authoritative Capacity Enforcement & Row-Locking Concurrency Safety
- Attendance limits are enforced strictly inside `public.set_event_rsvp(UUID, event_rsvp_status, INT, TEXT)`.
- When reserving a seat (`status = 'GOING'`):
  - Row-level lock `SELECT id, capacity, status, group_id FROM public.events WHERE id = p_event_id FOR UPDATE` serializes concurrent registration attempts.
  - Seat consumption is computed as `1 + guest_count` (bounded 0..5).
  - Overbooking throws an authoritative exception `EVENT_CAPACITY_EXCEEDED`, completely eliminating race-condition overbooking vulnerabilities.
- Transitioning to `NOT_GOING` retains the row while freeing occupied capacity units immediately.

#### 3. RPC-Authoritative Direct Mutation Denials
- Direct client `INSERT`, `UPDATE`, and `DELETE` on `public.events` and `public.event_rsvps` are blocked via database-level RLS deny policies:
  * `events_insert_deny`, `events_update_deny`, `events_delete_deny`
  * `event_rsvps_insert_deny`, `event_rsvps_update_deny`, `event_rsvps_delete_deny`
- All mutations route strictly through `SECURITY DEFINER` RPCs with `search_path = public` and audit logging.

#### 4. Internal Helper Function Protection
- Internal RLS helpers `can_view_event(UUID, UUID)` and `can_manage_event(UUID, UUID)` have execution revoked from `PUBLIC`, `anon`, and `authenticated` to prevent unauthorized social/event probing.
- Table-level `SELECT` is granted to `authenticated`; all privileges revoked from `PUBLIC` and `anon`.

---

## 6. PERSON ≠ USER Principle

This is a foundational data model security rule.

### The Problem

In many platforms, the concept of "a person" and "a user account" are conflated. This creates problems for a community genealogy platform because:

- A deceased grandparent should exist in the family tree without a user account.
- An infant or child should be in the census without a user account.
- A family member who is not a platform user should be representable.
- A claimed person record must be linked to a user, but the person's existence predates that claim.

### Production Legacy Verification
Empirical evidence from the client's production Android app (`KhatriSetu`) and registry (`khatrisetu-families-2026-10-01.xlsx`):
1. **83% Unclaimed Census Individuals:** In the active community census registry, 20 out of 24 members have `Account: Not claimed`. They exist as legitimate census and genealogical entities without credentials.
2. **Account Deletion Preserves Census Integrity:** In the Android app (screenshot screen 42), the privacy policy explicitly states:
   > *"You can request deletion of your KhatriSetu login and private contact data. Shared census and family-tree records may remain so household records stay intact, as described in the Privacy Policy."*

### The Solution

| Concept | Table | Description |
|---|---|---|
| **User** | `auth.users` | An authentication identity. Someone who can log in. Managed by Supabase Auth. |
| **Person** | `public.persons` | A human being in the community census. May or may not have a user account. |

### Database Relationship

```sql
-- persons.user_id is NULLABLE
-- A person can exist without a user account
persons.user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
```

A user may be linked to **at most one** person record:

```sql
-- Enforced via unique partial index
CREATE UNIQUE INDEX idx_persons_user_id_unique ON public.persons (user_id) WHERE user_id IS NOT NULL;
```

### Code Rules

- Never use `auth.uid()` as a person identifier.
- Never use a person's UUID as a user identifier.
- When you need the "current user's person profile," look up the person record linked to `auth.uid()`.
- Types must reflect this: `User` (from Supabase Auth) and `Person` (from `public.persons`) are distinct TypeScript types.

---

## 6.1. FAMILY ≠ HOUSEHOLD Security Separation

A **Family** is a genealogical and community social entity; a **Household** is a physical residence.

### Security Implications
1. **Address Privacy Isolation:** In production data (`KS-MUC4SVE0`), family members often reside at different locations (e.g. parents in Palanpur, adult children in Pune). Viewing a family profile must never expose the current residential address of non-cohabitating members without field-level permission.
2. **Access Control Independence:** Belonging to a family does not automatically grant co-residence privileges or physical household authority.

---

## 6.2. Person Claim & Invitation Security Architecture (Phase 8 Foundation)

Phase 8 Subtask 1 establishes the database and access control foundation for claiming census person records and issuing family invitations:

### 1. Controlled Identity Linkage (`persons.user_id`)
- Normal clients have **zero direct update privileges** on `persons.user_id`. `persons_update_own` allows modifying a person record only if it is already owned by the caller (`auth.uid() = user_id`) and prevents changing `user_id`.
- Linking an account occurs strictly through privileged database functions (`public.approve_person_claim`) or verified invitation redemption.

### 2. Concurrency & Race-Condition Protection
- Dedicated partial unique indexes on `public.person_claims`:
  - `idx_person_claims_pending_person`: At most one pending claim per person.
  - `idx_person_claims_pending_claimant`: At most one pending claim per claimant.
- Prevents concurrent claimants from racing or dogpiling on the same census record.
- Atomic `approve_person_claim(p_claim_id UUID)` executes with `FOR UPDATE` row locks on both the claim and target person, guaranteeing serializability.

### 3. Absolute 1 User ↔ 1 Person Invariant
- A user account may be linked to at most ONE census person.
- The invariant check in `person_claims_insert_authenticated` and `approve_person_claim()` checks `SELECT 1 FROM persons WHERE user_id = claimant_id` across **ALL** person records, explicitly rejecting claimants linked to soft-deleted or archived persons.
- A previously linked person record never becomes claimable again, and an account previously linked never qualifies to claim another record.

### 4. Zero Direct Moderator Claim-Update Bypass
- `public.person_claims` contains **no direct UPDATE policy for moderators or administrators**.
- Normal claimants may only cancel their own pending claims (`PENDING -> CANCELLED`).
- Moderators/admins must execute approval or rejection strictly through the controlled `SECURITY DEFINER` RPC functions: `public.approve_person_claim(p_claim_id UUID)` and `public.reject_person_claim(p_claim_id UUID, p_reason TEXT)`.
- Eliminates administrative status tampering or reviewer attribution falsification.

### 5. Historical Claim Audit Preservation (`ON DELETE RESTRICT`)
- `person_claims.person_id` foreign key is configured with `ON DELETE RESTRICT` (not `CASCADE`).
- Deleting an individual census person record is rejected if historical claim workflow or audit records exist, preserving complete provenance.

### 6. Authoritative State Machine & Immutability Guards
- `handle_claim_status_transition_guard` enforces valid claim states (`PENDING -> APPROVED/REJECTED/CANCELLED`); terminal states are strictly immutable.
- `handle_claim_update_guard` prevents tampering with identity fields (`id`, `person_id`, `claimant_id`, `created_at`).
- `person_claims_reviewed_consistency` enforces that `CANCELLED` status requires `reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL`, preventing fabricated reviewer attribution or notes on withdrawn claims.
- `handle_invitation_status_transition_guard` and `handle_invitation_update_guard` protect invitation token lifecycles.

### 7. Cryptographic Invitation Tokens & Exposure Restriction
- Plaintext secret tokens are never stored in the database.
- `public.invitations` stores only the SHA-256 hash (`token_hash`), with expiration timestamps (`expires_at`) and single-use redemption status.
- **Column-Level SELECT & INSERT Restriction**: Authenticated clients are granted `SELECT` and `INSERT` strictly on invitation metadata (`id`, `family_id`, `person_id`, `invited_email`, `invited_by`, `role`, `status`, `expires_at`, `accepted_by`, `accepted_at`, `created_at`, `updated_at`). Ordinary client queries cannot read `token_hash`, and clients cannot supply or tamper with `token_hash` values.
- Future token generation and redemption will execute strictly through controlled server-side functions.

### 8. Immutable Audit Trail
- All claim approvals and rejections write immutable events (`PERSON_CLAIM_APPROVED`, `PERSON_CLAIM_REJECTED`) to `public.audit_logs` via `public.log_audit_event()`.

---

## 7. Frontend Security Boundary

> **The frontend is NOT a security boundary.**

React components, route guards, and UI state may restrict what a user *sees*, but they do not restrict what data the server returns or what operations are permitted.

### What Frontend Controls ARE

- **UX helpers**: Hiding buttons the user cannot use, redirecting unauthenticated users to the login page, disabling form fields.
- **Performance**: Avoiding unnecessary requests by not rendering components for unauthorized users.

### What Frontend Controls ARE NOT

- Authorization controls. A determined user can bypass any frontend check by calling the Supabase API directly.
- Data filters. If RLS does not restrict a record, the frontend cannot compensate.

### Implication

Every authorization rule **must** be implemented in RLS. Frontend checks are an optional UX layer on top of server-side enforcement.

---

## 8. Secrets Management

### Environment Variables

| Variable | Location | Commitment |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env`, `VITE_` prefix | Committed to `.env.example` (placeholder only) |
| `VITE_SUPABASE_ANON_KEY` | `.env`, `VITE_` prefix | Committed to `.env.example` (placeholder only) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` (no VITE_ prefix) | **Never committed. Edge Functions / CI only.** |
| `SUPABASE_DB_PASSWORD` | `.env` (no VITE_ prefix) | **Never committed.** |

### Rules

- `.env` is listed in `.gitignore`. Verify this before every commit.
- `.env.example` contains **placeholder values only** (e.g., `your-project-url-here`). It is committed and documents required variables with explanatory comments.
- `VITE_` prefix variables are **bundled into the JavaScript output** and visible to any user who inspects the bundle. Only values intended to be public (anon key, project URL) should use this prefix.
- In CI/CD pipelines, secrets are stored as encrypted repository secrets (GitHub Actions secrets, etc.), never hardcoded.
- Rotate keys immediately if any key is accidentally committed.

### Phase 2 Environment & Credential Isolation Verification

During Phase 2 setup:
1. **Remote Target Verified**: Linked to project `community-family-platform` (`ixhvsprwjalgcyievsrg`).
2. **Key Usability Confirmed**: `VITE_SUPABASE_ANON_KEY` tested against the project's GoTrue auth settings endpoint without leaking key material (`HTTP 200 OK`).
3. **PAT & Credential Isolation**:
   - No PAT or access token was persisted in the project repository.
   - No PAT or access token was written to source code, `.env`, migrations, documentation, or Git history.
   - No credential was exposed in project logs or application output.
   - The Supabase CLI authentication session is stored in the user's local Supabase CLI configuration outside the project repository.
   - The PAT is scoped to the project (`community-family-platform`), Database → Read only, and expires after 7 days.
4. **Git-Ignore Integrity**: Confirmed `.env` is untracked and excluded by `.gitignore`.

### Pre-Commit Check

Before every commit, verify no secrets are staged:

```bash
git diff --staged | grep -E '(SUPABASE_SERVICE_ROLE|DB_PASSWORD|eyJ)'
```

---

## 9. Input Validation Strategy

### Two-Layer Validation

| Layer | Tool | Purpose | Trusted? |
|---|---|---|---|
| Frontend | Zod + React Hook Form | UX feedback; prevent obviously invalid submissions | **No** — bypassed by API calls |
| Database | CHECK constraints, NOT NULL, FK, RLS | Data integrity and security enforcement | **Yes** — cannot be bypassed |

### Frontend Validation (UX)

Zod schemas define the expected shape of form data. Errors are surfaced to the user before a request is made.

```typescript
const personSchema = z.object({
  first_name: z.string().min(1).max(100),
  privacy_level: z.enum(['PRIVATE', 'FAMILY', 'CONNECTIONS', 'COMMUNITY', 'PUBLIC']),
});
```

This validation exists for user experience. A malicious actor can bypass it by sending raw HTTP requests.

### Database Validation (Security)

Database constraints are the trusted enforcement layer:

```sql
-- Enum constraint on privacy_level
ALTER TABLE persons ADD CONSTRAINT persons_privacy_level_check
  CHECK (privacy_level IN ('PRIVATE', 'FAMILY', 'CONNECTIONS', 'COMMUNITY', 'PUBLIC'));

-- NOT NULL on required fields
ALTER TABLE persons ALTER COLUMN first_name SET NOT NULL;

-- Length constraint
ALTER TABLE persons ADD CONSTRAINT persons_first_name_length
  CHECK (char_length(first_name) BETWEEN 1 AND 100);
```

### Rich Text / HTML

Any user-provided content that will be rendered as HTML must be sanitized server-side or treated as plain text. The platform should avoid allowing raw HTML input from users. If rich text is required, use a structured format (e.g., a whitelist of Markdown elements processed through a sanitizer).

---

## 10. Storage Security

### Supabase Storage & Phase 11 Hardening

Files (photos, documents) are stored in Supabase Storage across two dedicated private buckets:
1. **`avatars`**: Profile, person, and family avatars (Private, 5MB limit, image-only: JPEG, PNG, WebP, GIF).
2. **`family-media`**: Family photo albums, historical documents, records (Private, 20MB limit, images + PDF).

### Canonical Path & URL Storage Invariant
- **Zero Stored Signed URLs**: Under NO circumstances are temporary signed URLs persisted in the database.
- **Canonical Storage Path**: Database columns (`profiles.avatar_url`, `persons.avatar_url`, `families.avatar_url`) persist ONLY internal storage object paths (`avatars/profiles/...`, `avatars/persons/...`, `avatars/families/...`). `family_media.storage_object_path` persists ONLY canonical paths prefixed with `family-media/families/<family_id>/media/<media_id>/<filename>`.
- **Dynamic Signed Resolution**: Temporary 1-hour signed URLs are generated purely at display/read time on the client via `resolveAvatarUrl` (for avatars) and `resolveFamilyMediaUrl` (for family media).

### Access Control & Storage RLS Isolation
- Storage RLS is enforced at the database level on `storage.objects` table with zero cross-bucket contamination:
  - **`avatars` Bucket Policies**:
    - `avatars_select_policy`: Resolves through `can_read_avatar_object(name)`. Respects person/family privacy levels and active family lifecycle.
    - `avatars_insert_policy`, `avatars_update_policy`, `avatars_delete_policy`: Governs profiles, persons, and family avatars within exact 3 segments (`avatars/<scope>/<uuid>/<filename>`).
  - **`family-media` Bucket Policies**:
    - `family_media_select_policy`: Resolves through `can_read_family_media_object(name)`. Enforces that the object is actively registered in `public.family_media`, non-deleted, and belongs to an active family with authorized caller access.
    - `family_media_insert_policy`: Enforces 5 segments (`families/<family_id>/media/<media_id>/<filename>`) and requires `can_manage_family_media(family_id)`.
    - `family_media_update_policy` & `family_media_delete_policy`: Enforces 5 segments and requires `can_manage_family_media(family_id)`.

### Upload Validation & Limits
- **MIME type validation**: Whitelisted image formats for avatars; JPEG, PNG, WebP, GIF, and PDF for family media.
- **File size limits**: Enforced at 5MB for avatars and 20MB for family media records.
- **Filename sanitization**: Replaces non-alphanumeric characters with underscores, strictly stripping path traversal attempts.
- **Rollback on RPC failure**: Client service layer automatically deletes orphaned uploaded storage files if metadata registration fails.

### Table Mutation Control & Trigger Guards (Phase 11 Subtask 2 Hardening)
- **Zero Direct Table Mutations**: Direct `INSERT`, `UPDATE`, and `DELETE` on `public.family_albums`, `public.family_media`, and `public.family_stories` are blocked at the PostgreSQL permission layer (`REVOKE ALL`, `GRANT SELECT ... TO authenticated`) and RLS layer (`WITH CHECK (FALSE)`, `USING (FALSE)`).
- **Authoritative RPC Mutation Gate**: All mutations are executed strictly through audited, `SECURITY DEFINER` RPCs (`create_family_album`, `register_family_media`, `soft_delete_family_media`, `create_family_story`).
- **Same-Family Integrity Triggers**:
  - `handle_family_media_album_guard`: Media items cannot be associated with albums from another family.
  - `handle_family_album_cover_guard`: Album cover media must belong to the exact same family.
  - `handle_family_story_featured_media_guard`: Story featured media must belong to the exact same family.
  - `handle_family_media_storage_path_guard`: Storage object path UUIDs must match the record's `family_id` and `id`.
- **Identity Field Immutability Triggers**:
  - `handle_family_album_immutability_guard`: Enforces immutability of `id`, `family_id`, `created_by`, `created_at` on `family_albums`.
  - `handle_family_media_immutability_guard`: Enforces immutability of `id`, `family_id`, `uploaded_by`, `created_at`, `storage_object_path` on `family_media`.

---

### Architecture & Hardening (Phase 1 Baseline)

The `public.audit_logs` table provides an immutable, append-only security log:
- **Append-Only Policy:** Direct client `INSERT` is blocked via `audit_logs_insert_trigger_only` (`WITH CHECK (FALSE)`). Zero `UPDATE` or `DELETE` policies exist.
- **Trusted Function Execution:** All audit log creation flows through `public.log_audit_event(...)` (`SECURITY DEFINER`, `SET search_path = public`).
- **RPC Revocation:** `EXECUTE` on `public.log_audit_event` is revoked from `PUBLIC`, `anon`, and `authenticated` roles. Normal clients cannot call it directly via RPC to forge audit actions.
- **Privileged Invocations:** Only internal database triggers and trusted server environments (e.g. Edge Functions via `service_role`) can invoke `log_audit_event()`.
- **Tamper-Resistant Identity & Timestamps:** `actor_id` is automatically set to `auth.uid()` and `created_at` is generated by `NOW()` on the server.


---

## 12. Rate Limiting and Abuse Prevention

### Current State (Phase 0)

Supabase Auth provides built-in rate limiting on authentication endpoints (sign-in, sign-up, password reset, magic link). These are configured in the Supabase project settings.

### Planned (Phase 15)

- **API rate limiting**: Edge Function middleware to rate-limit calls to sensitive operations (claim submission, connection requests, invitation sends) per user per time window.
- **IP-level rate limiting**: At the Supabase/CDN layer for unauthenticated endpoints.
- **Bot protection**: CAPTCHA or Turnstile integration on public sign-up and contact forms.
- **Abuse detection**: Monitoring for patterns indicative of scraping or enumeration (e.g., excessive reads of directory data by a single user).

---

## 13. Security Testing Requirements

### Coverage Requirements

| Test Type | Coverage Requirement |
|---|---|
| RLS positive tests | Every RLS policy: at least one test confirming permitted access succeeds |
| RLS negative tests | Every RLS policy: at least one test confirming unauthorized access is denied |
| Auth flow tests | All authentication paths: sign-up, sign-in, sign-out, reset, magic link |
| IDOR tests | Verify that user A cannot access or modify user B's private records |
| Privilege escalation tests | Verify that regular users cannot set admin claims or roles |
| Storage access tests | Verify that private file URLs are not accessible without signed URL |

### RLS Test Pattern

```typescript
describe('persons RLS — SELECT', () => {
  let ownerClient: SupabaseClient;
  let otherClient: SupabaseClient;
  let anonClient: SupabaseClient;

  beforeAll(async () => {
    // Set up test users and test person record
  });

  it('[POSITIVE] owner can read their own private person record', async () => {
    const { data, error } = await ownerClient
      .from('persons')
      .select('*')
      .eq('id', testPersonId)
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBe(testPersonId);
  });

  it('[NEGATIVE] unrelated user cannot read a PRIVATE person record', async () => {
    const { data, error } = await otherClient
      .from('persons')
      .select('*')
      .eq('id', testPersonId)
      .single();
    // Expect empty result (not an error — RLS silently filters)
    expect(data).toBeNull();
  });

  it('[NEGATIVE] unauthenticated user cannot read any non-PUBLIC person record', async () => {
    const { data, error } = await anonClient
      .from('persons')
      .select('*')
      .eq('id', testPersonId)
      .single();
    expect(data).toBeNull();
  });
});
```

### Security Review Cadence

- Full RLS policy audit: before every phase completion.
- Dependency vulnerability audit (`npm audit`): monthly and on every new dependency addition.
- OWASP Top 10 review: Phase 15 (pre-production hardening).

---

## 14. Notifications & Alerting Security (Phase 12 Subtask 1)

### Core Architectural Invariants

1. **`PERSON != USER` Security Boundary**:
   - Notifications and user preferences are bound strictly to `auth.users(id)`.
   - Raw census records (`public.persons`) cannot receive notifications, hold device tokens, or configure alert preferences.
   - Census records with `user_id IS NULL` remain decoupled from notification inboxes.

2. **Server-Authoritative Mutations & Anti-Tampering**:
   - Direct client `INSERT`, `UPDATE`, and `DELETE` on `public.notifications` and `public.notification_outbox` are denied at both PostgreSQL grant and RLS layers.
   - Malicious clients cannot create forged notifications, alter notification text, spoof actor identities, or target arbitrary recipients.
   - Client interaction routes exclusively through audited `SECURITY DEFINER` RPCs (`mark_notification_read`, `mark_all_notifications_read`, `dismiss_notification`).
   - Trigger `handle_notification_immutability_guard` guarantees notification content, recipient, actor, and timestamps are immutable once created.

3. **Strict Recipient Isolation**:
   - RLS policy `notifications_select_recipient` ensures users can query only their own notifications (`recipient_id = auth.uid() AND deleted_at IS NULL`).
   - Anonymous and unauthenticated access is completely rejected (`REVOKE ALL FROM PUBLIC, anon`).

4. **Privacy-Preserving Notification Content**:
   - Notification titles and bodies are plain text and bounded in length.
   - Notifications never store or transmit sensitive census lineage details (gotra, nukh, date of birth, personal address, phone number).

5. **Asynchronous Outbox Isolation**:
   - `public.notification_outbox` is completely private to system dispatchers (`REVOKE ALL FROM PUBLIC, anon, authenticated`).
   - External delivery workers process dispatches out-of-band without exposing email addresses or delivery tokens to the browser client.

---

## 15. Comprehensive RLS, Administrative Authorization & OWASP Top 10 Security Audit (Phase 15 Subtask 5)

### 15.1 Audit Scope & Methodology

A full static and schema-level security audit was executed across all 24 PostgreSQL application tables, 129 Row Level Security policies, 102 `SECURITY DEFINER` functions across 22 migrations, and 269 frontend source files in `src/`. The audit assessed compliance against database security invariants, least privilege, privilege escalation prevention, and the OWASP Top 10 vulnerability categories.

### 15.2 Database RLS & Privileges Inventory (24 Public Tables)

| Table | RLS Enabled | Allowed SELECT | Allowed INSERT | Allowed UPDATE | Allowed DELETE | Notes |
|---|:---:|---|---|---|---|---|
| `profiles` | ✅ | Own, Admin | Trigger only (`WITH CHECK (FALSE)`) | Own (`is_active = TRUE`, `role = get_my_role()`), Admin | Denied (`USING (FALSE)`) | Self-role escalation blocked at SQL check level |
| `persons` | ✅ | Privacy level + owner / admin | Authenticated (`created_by = auth.uid()`) | Creator, Admin | Denied (`USING (FALSE)`) | Soft-delete only via `deleted_at`; `user_id` untouched |
| `families` | ✅ | Privacy level + member / creator / admin | Authenticated (`created_by = auth.uid()`) | Creator, Admin | Denied (`USING (FALSE)`) | Soft-delete only via `deleted_at` |
| `family_members` | ✅ | Family privacy + member / creator / admin | Family creator, Moderator | Family creator, Moderator | Creator, Moderator | Join table protected against arbitrary membership injection |
| `relationships` | ✅ | Dual-endpoint privacy + person owner / admin | Authenticated (subject to person ownership) | Creator, Admin | Denied (`USING (FALSE)`) | Soft-delete only via `deleted_at` |
| `connections` | ✅ | Either party, Admin | Authenticated (`requester_id = auth.uid()`) | Target party (accept/reject), Admin | Either party (revoke/block) | Connection-aware privacy graph |
| `person_claims` | ✅ | Claimant, Admin / Moderator | Authenticated (`claimant_id = auth.uid()`) | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Approval/rejection exclusively via `approve_person_claim` RPC |
| `invitations` | ✅ | Creator, Moderator; preview via RPC | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Created via `create_family_invitation`; accepted via `accept_invitation` |
| `verification_requests` | ✅ | Requester, Moderator | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Managed via `submit_verification_request`, `approve_verification_request` RPCs |
| `duplicate_flags` | ✅ | Flagger, Moderator | Authenticated (`flagger_id = auth.uid()`) | Moderator | Denied (`USING (FALSE)`) | Resolution exclusively via `resolve_duplicate_flag` RPC |
| `groups` | ✅ | Group privacy + member / creator / admin | Authenticated | Group admin, Community admin | Denied (`USING (FALSE)`) | Soft-delete only via `deleted_at` |
| `group_members` | ✅ | Group visibility + member / admin | Self (open), Group Admin | Group Admin, Community Admin | Self (leave), Group Admin | Role hierarchy within community groups |
| `announcements` | ✅ | Group visibility / community / public | Group admin, Community moderator | Author, Community moderator | Denied (`USING (FALSE)`) | Soft-delete only via `deleted_at` |
| `events` | ✅ | Group visibility / community / public | Group admin, Community moderator | Creator, Community moderator | Denied (`USING (FALSE)`) | Soft-delete only via `deleted_at` |
| `event_rsvps` | ✅ | Event viewers, Admin | Authenticated (`user_id = auth.uid()`) | Self (`user_id = auth.uid()`) | Self (`user_id = auth.uid()`) | Strictly user-scoped RSVPs |
| `family_albums` | ✅ | Family members / privacy level / admin | Family head / creator / moderator | Creator, Moderator | Denied (`USING (FALSE)`) | Soft-delete only via `deleted_at` |
| `family_media` | ✅ | Family members / privacy level / admin | Family head / creator via RPC | Creator, Moderator | Denied (`USING (FALSE)`) | Soft-delete only via `soft_delete_family_media` RPC |
| `family_stories` | ✅ | Family members / privacy level / admin | Family head / creator via RPC | Creator, Moderator | Denied (`USING (FALSE)`) | Soft-delete only via `deleted_at` |
| `notifications` | ✅ | Recipient only (`auth.uid() = recipient_id`) | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Managed via `mark_notification_read`, `dismiss_notification` RPCs |
| `notification_preferences` | ✅ | User only (`auth.uid() = user_id`) | User (`auth.uid() = user_id`) | User (`auth.uid() = user_id`) | Denied (`USING (FALSE)`) | Guarded by trigger against tampering |
| `notification_outbox` | ✅ | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Private to background dispatchers (`service_role` RPCs) |
| `import_batches` | ✅ | Active Admin / Super Admin only | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Controlled via `create_import_batch`, `cancel_import_batch`, `promote_import_batch` |
| `staging_records` | ✅ | Active Admin / Super Admin only | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Managed via `stage_import_records`, `set_staging_record_status` |
| `audit_logs` | ✅ | Active Admin / Super Admin only | Trigger only (`WITH CHECK (FALSE)`) | Denied (`USING (FALSE)`) | Denied (`USING (FALSE)`) | Immutable; append-only via `log_audit_event()` |

### 15.3 SECURITY DEFINER & Search Path Guarantees

All 102 `SECURITY DEFINER` functions across all migrations:
1. Declare explicit search path: `SET search_path = public` or `SET search_path = public, auth`.
2. Do not execute dynamic SQL (`EXECUTE '...'` or `EXECUTE format(...)`).
3. Check caller authentication (`auth.uid() IS NOT NULL`) and authorization (`is_admin()` or `is_community_moderator()`).
4. Prevent token leakage: plaintext invitation tokens are never stored, returned, or logged.

### 15.4 Privilege Escalation & Last SUPER_ADMIN Protection

- **MEMBER -> ADMIN / SUPER_ADMIN**: `public.profiles` RLS policy `profiles_update_own` compares `NEW.role` to `public.get_my_role()`. A non-admin cannot alter their role.
- **ADMIN -> SUPER_ADMIN**: `admin_update_user_role` explicitly raises exception if caller role is `ADMIN` and target role is `SUPER_ADMIN`.
- **ADMIN altering SUPER_ADMIN**: `admin_update_user_role` forbids an `ADMIN` from editing any `SUPER_ADMIN` account.
- **Last SUPER_ADMIN Lock**: `admin_update_user_role` and `admin_set_user_status` acquire a transaction advisory lock (`pg_advisory_xact_lock(hashtext('super_admin_membership_guard'))`) and verify `v_super_admin_count > 1` before allowing demotion or deactivation.

### 15.5 OWASP Top 10 Evaluation Matrix

| Category | Finding | Control Implemented | Status |
|---|---|---|---|
| **A01: Broken Access Control** | IDOR, unauthorized data disclosure, cross-family/cross-user manipulation | 129 PostgreSQL RLS policies covering 24 tables. Route guards (`AdminRoute`, `ModeratorRoute`, `ProtectedRoute`) in UI. Safe user-facing error mapping. | PASS |
| **A02: Cryptographic Failures** | Token exposure, plain secrets in DB/logs, frontend key leakage | Only SHA-256 token hashes stored in `invitations`. `SUPABASE_SERVICE_ROLE_KEY` absent from client. Only `VITE_SUPABASE_ANON_KEY` in frontend. | PASS |
| **A03: Injection** | SQL injection, XSS, DOM injection | PostgREST parameterized queries. Zero dynamic SQL in DB migrations. Zero `eval()`, `Function()`, `innerHTML`, `dangerouslySetInnerHTML`, `document.write` in `src/`. HTML/control-character sanitization in Zod schemas. | PASS |
| **A04: Insecure Design** | Persona conflation, unverified promotion, orphan accounts | Strict PERSON != USER boundary. Import promotion requires same-batch family head lineage. Dual-endpoint RLS for relationships and connections. | PASS |
| **A05: Security Misconfiguration** | Missing search_path, permissive CORS/CSP, debug leaks | 100% of SECURITY DEFINER functions set search_path. Vite security headers (CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff). React Error Boundary masks internal errors. | PASS |
| **A06: Vulnerable Components** | Outdated or vulnerable third-party dependencies | Comprehensive dependency audit in Phase 15 Subtask 3. Development tooling vulnerabilities bounded to local dev scripts; zero high/critical runtime vulnerabilities. | PASS |
| **A07: Identification Failures** | Anonymous data exposure, session fixation | Table-level SELECT revoked from anon for private tables. Supabase Auth session tokens managed with secure rotation. | PASS |
| **A08: Software & Data Integrity** | Tampering with audit logs or import staging | `audit_logs`, `import_batches`, `staging_records`, `notification_outbox` block direct client INSERT/UPDATE/DELETE. Server-side authoritative RPC validation. | PASS |
| **A09: Logging & Monitoring** | Audit evasion, log tampering, PII in logs | Centralized `log_audit_event()` called on administrative actions. Immutability guaranteed by RLS and PostgreSQL triggers. No passwords, tokens, or hashes logged. | PASS |
| **A10: SSRF** | Uncontrolled server-side fetches | Frontend executes zero raw `fetch()` calls. Storage uploads restricted to pre-defined bucket paths (`avatars`, `family-media`). | PASS |

### 15.6 Role-Based Authorization Matrix

| Domain / Action | SUPER_ADMIN | ADMIN | COMMUNITY_MODERATOR | COMMITTEE_MEMBER | FAMILY_HEAD | MEMBER | GUEST | ANONYMOUS |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **User Role Management** | Full | Up to ADMIN | None | None | None | None | None | None |
| **User Status (Deactivate)**| Full | Non-Super-Admins | None | None | None | None | None | None |
| **View Audit Logs** | Full | Full | None | None | None | None | None | None |
| **Duplicate Resolution** | Full | Full | Full | None | None | None | None | None |
| **Verification Approval** | Full | Full | Full | None | None | None | None | None |
| **Import & Promotion** | Full | Full | None | None | None | None | None | None |
| **Manage Family Members** | Full | Full | Full | None | Own Family | None | None | None |
| **Create Family Album/Media**| Full | Full | Full | None | Own Family | None | None | None |
| **Manage Group Content** | Full | Full | Full | Own Group | None | None | None | None |
| **RSVP to Events** | Yes | Yes | Yes | Yes | Yes | Yes | Yes (if member) | None |
| **View Community Census** | Full | Full | Full | Full | Full | Full | Public only | Public only |
| **View Private Tree Nodes**| Dual-party/Full | Dual-party/Full | Dual-party | Dual-party | Family/Self | Family/Self | Public only | Public only |
| **Claim Person Record** | Yes (own) | Yes (own) | Yes (own) | Yes (own) | Yes (own) | Yes (own) | Yes (own) | None |
| **Redeem Invitation Token** | Yes | Yes | Yes | Yes | Yes | Yes | Yes (upon sign-in)| Token preview only |
| **View Full DOB (Day & Month)** | Full | Full | Full | Own only | Own only | Own only | Own only | None |
| **View Phone & Email Contact** | Full | Full | Full | Own only | Own only | Own only | Own only | None |
| **Direct Mukhi Phone/Email** | Full | Full | Full | Platform request | Platform request | Platform request | Platform request | None |
| **Manage Privacy Settings** | Full | Full | Full (Mukhi-equiv) | None | None | None | None | None |

---

## 16. Protected Personal Data & Visibility Governance (CLIENT-PRIVACY-1)

### 16.1 Client Governance Policy
Under the updated client privacy and data-governance specification, the following personal data points are classified as **Protected Personal Data by Default**:
1. **Full Date of Birth**: The exact day and month of birth must NEVER be exposed to base community members or public users. Only the birth year (via generated `dob_year`) and derived `age` are visible for community directory and genealogical browsing.
2. **Primary Phone (`phone`) & Secondary Phone (`phone_secondary`)**: Kept strictly private and hidden across all directory, search, and family member listings.
3. **Contact Email (`email_contact`)**: Kept strictly private and excluded from general community queries.
4. **Residential / Full Address**: Precise physical street address, building/flat, and household identifiers are protected (`FAMILY != HOUSEHOLD != PERSON`). City and state are public community fields.

### 16.2 Server-Authoritative Triple-Lock Architecture
To guarantee that protected fields cannot be harvested by inspecting browser developer tools, PostgREST query parameters, or client caches, enforcement is implemented at the database layer:
1. **Column Defaults & Data Hardening**: Default privacy for `dob_privacy`, `contact_privacy`, and `profile_privacy` is locked to `'PRIVATE'`. Pre-existing census records have been migrated to `'PRIVATE'`.
2. **Security Barrier Masking View (`public.community_persons`)**:
   - Built with `security_barrier = true` to prevent PostgreSQL query optimization leaks.
   - Conditionally projects `date_of_birth`, `phone`, `phone_secondary`, and `email_contact` as `NULL` unless `public.can_manage_privacy_settings()` is TRUE or `user_id = auth.uid()`.
   - Always exposes generated `dob_year` and derived `age` for living community members.
3. **Authoritative RPC Boundaries**:
   - `public.get_person_protected_details(UUID)`: `SECURITY DEFINER` function that returns full DOB, phone numbers, and email ONLY to record owners or authorized Mukhis/Admins. Rejects unauthorized callers with PostgreSQL error `42501` and records immutable audit log entries.
   - `public.update_person_protected_details(UUID, ...)`: `SECURITY DEFINER` function enabling self-service maintenance by record owners or verified updates by regional Mukhis with full audit logging.
4. **Safe Query Projections in Codebase**:
   - Directory queries (`PERSON_DIRECTORY_COLUMNS`) and family member queries (`PERSON_MEMBER_SAFE_COLUMNS`) strictly omit contact columns and project `dob_year`.

### 16.3 Regional Mukhi Association & Contact Request Affordance
- Every person and user is linked to their respective regional Mukhi based on origin/location (Palanpur, Bhuj, Jodhpur, Ahmedabad, Mumbai, Pune, Barmer, Indore).
- Normal members viewing profiles see their assigned Mukhi (`name`, `designation`, `city`, `state`) along with a "Request Contact via Mukhi" platform affordance.
- Mukhi private contact details (phone, email) are shielded from base members and revealed only to authorized administrators and fellow council moderators.

---

*This document is a living reference. Update it whenever security policies, threat mitigations, or architectural decisions change.*

