# Admin & Moderation Feature Domain

> **Phase 13 — Administration & Moderation**
> Community Roots Platform

---

## 1. Overview & Purpose

The **Admin & Moderation** feature domain provides platform administrators and community moderators with authoritative tools to oversee user accounts, role delegations, community data verification, duplicate resolution, and platform-wide audit logs.

Administrative authority is strictly separated between **Platform Administrators** (`SUPER_ADMIN`, `ADMIN`) and **Community Moderators** (`COMMUNITY_MODERATOR`).

---

## 2. Role Hierarchy & Boundaries

| Role | Scope & Permissions | Route Guard | Administrative RPC Access |
|---|---|---|---|
| `SUPER_ADMIN` | Full platform authority, can promote/demote `ADMIN` and `SUPER_ADMIN`, manage all accounts, view audit logs. | `AdminRoute` | Yes (full) |
| `ADMIN` | Platform administrator, can promote members up to `ADMIN`, deactivate non-super-admin accounts, view audit logs. Cannot appoint or demote/deactivate `SUPER_ADMIN`. | `AdminRoute` | Yes (bounded) |
| `COMMUNITY_MODERATOR` | Community content & record moderator (claims, verifications, duplicate flags, platform metrics). Strictly blocked from user administration, role assignment, and audit logs. | `ModeratorRoute` | No (metrics only) |
| `COMMITTEE_MEMBER` | Community group / event organizer. Standard member privileges for admin domain. | — | No |
| `FAMILY_HEAD` | Family tree management authority. Standard member privileges for admin domain. | — | No |
| `MEMBER` | Standard authenticated community member. | — | No |
| `GUEST` | Read-only unverified community visitor. | — | No |

---

## 3. Core Architectural Invariants

### 1. PERSON != USER
- A **User** (`auth.users`, `public.profiles`) is an authentication account capable of logging into the platform.
- A **Person** (`public.persons`) is a historical or living human being registered in the community census.
- Administrative operations on accounts modify `public.profiles` (`is_active`, `role`), **never** `public.persons`.
- Deactivating an account disables login sessions, but preserves all historical census records, relationships, and lineage.

### 2. Least Privilege & Server Authority
- Client applications **never** execute direct `UPDATE` queries on `public.profiles.role` or `is_active`.
- All role changes and account suspensions route through `SECURITY DEFINER` database RPCs with parameter validation and hierarchy enforcement.
- Community moderators are strictly forbidden from executing user administration RPCs or querying `public.audit_logs`.

### 3. Anti-Lockout Protections
- **Self-Demotion:** Administrators cannot demote their own account to a non-administrative role.
- **Self-Deactivation:** Administrators cannot deactivate their own account.
- **Sole SUPER_ADMIN Protection:** The system prevents demoting or deactivating the final active `SUPER_ADMIN` on the platform.

### 4. Immutable Audit Trail
- Every administrative action generates an immutable audit record in `public.audit_logs` via `public.log_audit_event()`.
- Recorded actions include:
  - `USER_ROLE_CHANGED`
  - `USER_DEACTIVATED`
  - `USER_REACTIVATED`

---

## 4. Subtask 1 Database Changes & RPCs

Implemented in `supabase/migrations/20261016180000_create_admin_authorization_rpcs.sql`:

0. **Profiles RLS Hardening**:
   - `DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;`
   - Closes the direct table update bypass where an `ADMIN` could previously update `public.profiles.role` or `is_active` directly via Supabase table client without triggering hierarchy validation or audit logging.
   - Re-asserts `profiles_update_own`: allows users to update only their own profile, while strictly preventing self-role alteration (`role::TEXT = public.get_my_role()`) and self-deactivation (`is_active = TRUE`).
   - Ensures all role transitions and account status changes MUST flow through the server-authoritative RPCs below.

1. `public.admin_update_user_role(p_user_id UUID, p_new_role public.user_role)`
   - Updates target user's role in `public.profiles`.
   - Locks target row (`FOR UPDATE`) to serialize updates on the same user.
   - Restricts caller to active `ADMIN` or `SUPER_ADMIN`.
   - Prevents `ADMIN` from granting `SUPER_ADMIN` or modifying `SUPER_ADMIN` accounts.
   - Prevents self-demotion from administrative standing.
   - Protects sole active `SUPER_ADMIN` from demotion with concurrency-safe transaction advisory locking (`pg_advisory_xact_lock(hashtext('super_admin_membership_guard'))`).
   - Emits `USER_ROLE_CHANGED` audit event.

2. `public.admin_set_user_status(p_user_id UUID, p_is_active BOOLEAN, p_reason TEXT)`
   - Activates or deactivates target user's account in `public.profiles`.
   - Locks target row (`FOR UPDATE`) to serialize updates on the same user.
   - Prevents self-deactivation.
   - Prevents `ADMIN` from deactivating `SUPER_ADMIN`.
   - Protects sole active `SUPER_ADMIN` from deactivation with concurrency-safe transaction advisory locking (`pg_advisory_xact_lock(hashtext('super_admin_membership_guard'))`).
   - Emits `USER_DEACTIVATED` or `USER_REACTIVATED` audit event with reason.

3. `public.admin_get_audit_logs(...)`
   - Paginated, filterable query interface for `public.audit_logs`.
   - Clamped page size (1–50) with total count calculation.
   - Projects actor profile name and email.
   - Restricted strictly to `ADMIN` and `SUPER_ADMIN`.

4. `public.admin_get_platform_metrics()`
   - Aggregates platform KPIs (users, active users, persons, families, pending claims, pending verifications, open duplicates).
   - Restricted strictly to `ADMIN` and `SUPER_ADMIN` (`is_admin()`), withholding user account counts from community moderators.

---

## 5. Route Protection: AdminRoute

`src/components/common/AdminRoute.tsx` provides client-side route guarding for admin pages:
- Authenticated `SUPER_ADMIN` and `ADMIN` can access nested routes via `<Outlet />`.
- Unauthenticated users are redirected to `/sign-in`.
- `COMMUNITY_MODERATOR`, `MEMBER`, and other roles see an accessible "Administrator Access Restricted" alert with a return-home option.

---

## 6. Subtask 2: Admin Hub, Layout & Platform Metrics

Implemented in Phase 13 Subtask 2:

### 1. Dedicated Admin Layout (`AdminLayout`)
- File: `src/features/admin/components/AdminLayout.tsx`
- Reusable administrative shell wrapping all `/admin` routes.
- **Desktop**: Persistent sidebar with active route highlighting (`aria-current="page"`), role badges, user identity display, and exit link back to community.
- **Mobile**: Top header with hamburger button and accessible modal slide-out drawer (`role="dialog"`, `aria-modal="true"`, Escape-to-close).
- **Accessibility**: Skip link to `#admin-main-content` (`tabIndex={-1}`), semantic `<nav>`, focus rings on all interactive elements.

### 2. Central Admin Hub (`/admin`)
- Route: `/admin`
- Guarded by: `AdminRoute` (`PLATFORM_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']`).
- Page Component: `src/features/admin/pages/AdminDashboardPage.tsx`.
- Visual Callout: Explicit `PERSON ≠ USER` architectural banner explaining account identities vs. census entities.
- Integrates TanStack Query hook `usePlatformMetrics` calling security-definer RPC `admin_get_platform_metrics()`.

### 3. Platform Metrics & KPI Cards
- **User Accounts**: Total accounts (`metrics.total_users`) and active account breakdown (`metrics.active_users`).
- **Census Persons**: Total registered census records (`metrics.total_persons`).
- **Census Families**: Total family households (`metrics.total_families`).
- **Pending Claims**: Awaiting review count (`metrics.pending_claims`) with direct link to `/admin/claims`.
- **Pending Verifications**: Awaiting review count (`metrics.pending_verifications`) with direct link to `/admin/verifications`.
- **Open Duplicates**: Flagged duplicates counter (`metrics.open_duplicates`).
- State handling: Loading skeletons, error state with retry button, zero-value resilience, and manual "Refresh" trigger.

### 4. Admin Navigation & Existing Workflow Integration
- Integrated links to existing moderation queues:
  - `/admin` (Overview / Dashboard)
  - `/admin/users` (User Administration)
  - `/admin/audit` (Audit Logs)
  - `/admin/claims` (Claim Review Queue)
  - `/admin/verifications` (Verification Review Queue)
  - `/admin/duplicates` (Duplicate Review Queue)
- Preserves existing `ModeratorRoute` accessibility for community moderators on `/admin/claims` and `/admin/verifications` while providing centralized access for administrators from the Admin Hub.
- Added "Admin Hub" navigation link in `AppHeader` user dropdown and mobile menu for platform administrators (`SUPER_ADMIN` and `ADMIN`).

### 5. Scope Boundaries
- **User Administration UI**: Implemented in **Subtask 3** (`/admin/users`).
- **Audit Log Viewer**: Implemented in **Subtask 3** (`/admin/audit`).
- **Duplicate Review Queue & Resolution UI**: Implemented in **Subtask 4** (`/admin/duplicates`).
- **Phase 13 Scope**: **COMPLETE**.

---

## 7. Subtask 3: User Administration & Audit Log Viewer

Implemented in Phase 13 Subtask 3:

### 1. User Administration (`/admin/users`)
- **Route**: `/admin/users`
- **Guard**: `AdminRoute` (`SUPER_ADMIN` and `ADMIN` only).
- **Page Component**: `src/features/admin/pages/UserManagementPage.tsx`.
- **Architectural Guardrail**:
  - `PERSON ≠ USER` is strictly maintained. The page manages platform accounts (`auth.users`, `public.profiles`), NOT community census entities (`public.persons`).
  - No direct browser queries to `auth.users`. Data is read from `public.profiles` protected by `profiles_select_admin` RLS.
  - No direct table updates to `profiles.role` or `profiles.is_active` (which are blocked by RLS policies). All mutations route exclusively through the server-authoritative RPCs.
- **Features**:
  - Desktop responsive table + mobile stacked cards with accessible labels.
  - Search by name or email with debouncing (300ms).
  - Role filter dropdown (`ALL`, `SUPER_ADMIN`, `ADMIN`, `COMMUNITY_MODERATOR`, `COMMITTEE_MEMBER`, `FAMILY_HEAD`, `MEMBER`, `GUEST`).
  - Account status filter (`ALL`, `Active`, `Deactivated`).
  - Bounded pagination (10, 25, 50 per page) with record count summary and accessible previous/next navigation.
  - Role badge indicators with distinct visual styling.
  - Quick action buttons: "Change Role" and "Deactivate" / "Reactivate".
- **Modals**:
  - `ChangeRoleModal`:
    * Enforces role hierarchy rules on client while database RPC enforces on server.
    * Platform `ADMIN` cannot grant `SUPER_ADMIN` or modify existing `SUPER_ADMIN` accounts.
    * Self-demotion is prevented: admins cannot change their own role.
    * Warning callout for privileged assignments.
  - `SetUserStatusModal`:
    * Prevents self-deactivation.
    * Prevents `ADMIN` from deactivating `SUPER_ADMIN`.
    * Blocks deactivation of the sole active `SUPER_ADMIN`.
    * Requires a mandatory 1–500 character reason when deactivating an account.
    * Displays target user identity and clear confirmation action.

### 2. Audit Log Viewer (`/admin/audit`)
- **Route**: `/admin/audit`
- **Guard**: `AdminRoute` (`SUPER_ADMIN` and `ADMIN` only; strictly forbidden to `COMMUNITY_MODERATOR`).
- **Page Component**: `src/features/admin/pages/AuditLogPage.tsx`.
- **Architectural Guardrail**:
  - Direct browser queries to `public.audit_logs` table are denied by database RLS.
  - Reads route strictly through `public.admin_get_audit_logs()` RPC, which enforces administrative role, clamps page size, and joins actor profile details safely.
- **Features**:
  - Desktop responsive table + mobile stacked cards.
  - Action filter dropdown with all domain audit events (`USER_ROLE_CHANGED`, `USER_DEACTIVATED`, `USER_REACTIVATED`, `CLAIM_APPROVED`, `VERIFICATION_APPROVED`, `DUPLICATE_RESOLVED`, etc.).
  - Target type text filter and date range picker (`startDate`, `endDate`).
  - Bounded pagination (10, 25, 50 per page) with total event count.
  - Human-friendly relative and absolute timestamps.
  - Visual action badges with distinct color palettes.
  - "View Details" action opening `AuditDetailsModal`.
- **Modals**:
  - `AuditDetailsModal`:
    * Shows event action, actor name and email, target type, target record ID, IP address, and timestamp.
    * Structured Old vs. New state diff comparison.
    * Additional metadata viewer formatted as clean, structured JSON.

### 3. Service & Hooks Architecture
- `src/features/admin/services/admin.service.ts`:
  - `listAdminUsers`: Bounded pagination and filtering over `public.profiles`.
  - `updateUserRole`: Invokes server-authoritative `admin_update_user_role` RPC.
  - `setUserStatus`: Invokes server-authoritative `admin_set_user_status` RPC.
  - `getAuditLogs`: Invokes server-authoritative `admin_get_audit_logs` RPC.
- TanStack Query Hooks:
  - `useAdminUsers`: Fetches users with caching, automatic key invalidation on mutation.
  - `useAdminUserMutations`: Wraps `updateUserRole` and `setUserStatus` mutations with toast notifications and query invalidation.
  - `useAuditLogs`: Fetches paginated audit logs with search/filter params.

### 4. Admin Hub Integration
- `src/features/admin/pages/AdminDashboardPage.tsx`:
  - Added Quick Action links to `/admin/users` ("Manage platform user accounts, roles, and status") and `/admin/audit` ("Review platform security events, role changes, and actions").
  - Linked KPI cards to corresponding admin modules.
- `src/features/admin/constants.ts`:
  - `ADMIN_NAV_ITEMS` includes `Users` (`/admin/users`) and `Audit Logs` (`/admin/audit`).

---

## 8. Subtask 4: Duplicate Review Queue & Resolution

Implemented in Phase 13 Subtask 4 (Final Phase 13 Subtask):

### 1. Architectural Invariants
- **DETECT ≠ MERGE**:
  * Duplicate detection identifies similar census records for human moderation.
  * Resolving a duplicate flag (`CONFIRMED_DUPLICATE` or `NOT_DUPLICATE`) updates administrative status and audit logging.
  * It **never** triggers destructive merges, deletions, record overwrites, or claim reassignments.
- **PERSON ≠ USER**:
  * Candidates represent census persons (`public.persons`) or family records (`public.families`), never login accounts.
  * No authentication credentials, passwords, tokens, or private contact details (phone, email, identity documents) are exposed in the comparison interface.
- **Server-Authoritative Lifecycle**:
  * Client never updates or deletes from `public.duplicate_flags` directly (blocked by deny RLS policies).
  * All resolutions flow through the server-authoritative Phase 9 RPC `public.resolve_duplicate_flag(p_flag_id, p_resolution, p_resolution_notes)`.
- **Stale Review & Concurrency Protection**:
  * If another administrator resolves a duplicate flag before the current reviewer submits, the RPC throws an exception (`status <> 'OPEN'`).
  * The frontend detects this condition, flags the record as stale, presents an informative alert ("Stale Record: This duplicate flag has already been resolved by another administrator and cannot be modified."), and provides a one-click "Refresh Queue" action.

### 2. Duplicate Review Queue (`/admin/duplicates`)
- **Route**: `/admin/duplicates`
- **Guard**: `AdminRoute` (`SUPER_ADMIN` and `ADMIN` only; `COMMUNITY_MODERATOR` denied).
- **Page Component**: `src/features/admin/pages/DuplicateManagementPage.tsx`.
- **Features**:
  - Default queue prioritizes `OPEN` flags.
  - Bounded server-side pagination with selectable page sizes (10, 25, 50).
  - Multi-criteria filtering: Status (`OPEN`, `CONFIRMED_DUPLICATE`, `NOT_DUPLICATE`, `ALL`), Entity Type (`ALL`, `PERSON`, `FAMILY`), and Confidence (`ALL`, `STRONG`, `POSSIBLE`, `WEAK`).
  - Desktop table layout with column headers and accessible mobile stacked cards.
  - Visual status and confidence badges with distinct color palettes and dot indicators.
  - Match signals chips previewing automated detection signals.
  - "Review" button opening the candidate comparison modal.

### 3. Candidate Comparison Modal (`AdminDuplicateReviewModal`)
- **Component**: `src/features/admin/components/AdminDuplicateReviewModal.tsx`.
- **Accessibility**:
  - Full modal dialog (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`).
  - Keyboard Escape key closes modal.
  - Accessible focus management and touch targets >= 44px.
- **Side-by-Side Comparison**:
  - Desktop 2-column grid / mobile stacked cards clearly distinguishing **Candidate A** and **Candidate B**.
  - **Person Comparisons**: Full name, gender, census status, birth date, birth place, cultural lineage (Gotra, Nukh, Kul), verification status. Excludes all private user/contact fields.
  - **Family Comparisons**: Family name, cultural lineage (Gotra, Nukh, Kul), location (City, State, Country), description, verification status.
  - Displays match signals returned by automated detection.
- **Review Actions**:
  - Explicit decision buttons: "Confirm Duplicate" (`CONFIRMED_DUPLICATE`) and "Mark Not Duplicate" (`NOT_DUPLICATE`).
  - Optional resolution notes input (clamped to 1,000 characters).
  - Prominent architectural banner reiterating the `DETECT ≠ MERGE` guarantee.
  - If flag is already resolved, displays read-only resolution status, timestamp, and notes without action buttons.

### 4. Admin Hub Integration
- `src/features/admin/constants.ts`:
  - `ADMIN_NAV_ITEMS` includes `Duplicates` (`/admin/duplicates`) with `Copy` icon.
- `src/features/admin/pages/AdminDashboardPage.tsx`:
  - "Open Duplicate Flags" KPI metric card links directly to `/admin/duplicates`.
  - Added Workflow Card 5: "Duplicate Review Queue" under Operational Moderation Workflows.
- `src/app/router.tsx`:
  - Registered `/admin/duplicates` route under `AdminRoute` and `AdminLayout` with lazy chunk loading.

### 5. Service & Hooks Architecture
- `src/features/admin/services/admin.service.ts`:
  - `listAdminDuplicates`: Bounded server query with exact count, range pagination, and safe comparison projections.
  - `resolveAdminDuplicate`: Server-authoritative RPC wrapper calling `resolve_duplicate_flag` with stale-review error mapping.
- `src/features/admin/hooks/useAdminDuplicates.ts`:
  - `useAdminDuplicates`: TanStack Query hook with caching and filtering.
  - `useResolveAdminDuplicate`: Mutation hook with automatic query cache invalidation for duplicates, platform metrics, and verification flags.

---

## 7. Subtask 3: User Administration & Audit Log Viewer

Implemented in Phase 13 Subtask 3:

### 1. User Administration (`/admin/users`)
- **Route**: `/admin/users`
- **Guard**: `AdminRoute` (`SUPER_ADMIN` and `ADMIN` only).
- **Page Component**: `src/features/admin/pages/UserManagementPage.tsx`.
- **Architectural Guardrail**:
  - `PERSON ≠ USER` is strictly maintained. The page manages platform accounts (`auth.users`, `public.profiles`), NOT community census entities (`public.persons`).
  - No direct browser queries to `auth.users`. Data is read from `public.profiles` protected by `profiles_select_admin` RLS.
  - No direct table updates to `profiles.role` or `profiles.is_active` (which are blocked by RLS policies). All mutations route exclusively through the server-authoritative RPCs.
- **Features**:
  - Desktop responsive table + mobile stacked cards with accessible labels.
  - Search by name or email with debouncing (300ms).
  - Role filter dropdown (`ALL`, `SUPER_ADMIN`, `ADMIN`, `COMMUNITY_MODERATOR`, `COMMITTEE_MEMBER`, `FAMILY_HEAD`, `MEMBER`, `GUEST`).
  - Account status filter (`ALL`, `Active`, `Deactivated`).
  - Bounded pagination (10, 25, 50 per page) with record count summary and accessible previous/next navigation.
  - Role badge indicators with distinct visual styling.
  - Quick action buttons: "Change Role" and "Deactivate" / "Reactivate".
- **Modals**:
  - `ChangeRoleModal`:
    * Enforces role hierarchy rules on client while database RPC enforces on server.
    * Platform `ADMIN` cannot grant `SUPER_ADMIN` or modify existing `SUPER_ADMIN` accounts.
    * Self-demotion is prevented: admins cannot change their own role.
    * Warning callout for privileged assignments.
  - `SetUserStatusModal`:
    * Prevents self-deactivation.
    * Prevents `ADMIN` from deactivating `SUPER_ADMIN`.
    * Blocks deactivation of the sole active `SUPER_ADMIN`.
    * Requires a mandatory 1–500 character reason when deactivating an account.
    * Displays target user identity and clear confirmation action.

### 2. Audit Log Viewer (`/admin/audit`)
- **Route**: `/admin/audit`
- **Guard**: `AdminRoute` (`SUPER_ADMIN` and `ADMIN` only; strictly forbidden to `COMMUNITY_MODERATOR`).
- **Page Component**: `src/features/admin/pages/AuditLogPage.tsx`.
- **Architectural Guardrail**:
  - Direct browser queries to `public.audit_logs` table are denied by database RLS.
  - Reads route strictly through `public.admin_get_audit_logs()` RPC, which enforces administrative role, clamps page size, and joins actor profile details safely.
- **Features**:
  - Desktop responsive table + mobile stacked cards.
  - Action filter dropdown with all domain audit events (`USER_ROLE_CHANGED`, `USER_DEACTIVATED`, `USER_REACTIVATED`, `CLAIM_APPROVED`, `VERIFICATION_APPROVED`, `DUPLICATE_RESOLVED`, etc.).
  - Target type text filter and date range picker (`startDate`, `endDate`).
  - Bounded pagination (10, 25, 50 per page) with total event count.
  - Human-friendly relative and absolute timestamps.
  - Visual action badges with distinct color palettes.
  - "View Details" action opening `AuditDetailsModal`.
- **Modals**:
  - `AuditDetailsModal`:
    * Shows event action, actor name and email, target type, target record ID, IP address, and timestamp.
    * Structured Old vs. New state diff comparison.
    * Additional metadata viewer formatted as clean, structured JSON.

### 3. Service & Hooks Architecture
- `src/features/admin/services/admin.service.ts`:
  - `listAdminUsers`: Bounded pagination and filtering over `public.profiles`.
  - `updateUserRole`: Invokes server-authoritative `admin_update_user_role` RPC.
  - `setUserStatus`: Invokes server-authoritative `admin_set_user_status` RPC.
  - `getAuditLogs`: Invokes server-authoritative `admin_get_audit_logs` RPC.
- TanStack Query Hooks:
  - `useAdminUsers`: Fetches users with caching, automatic key invalidation on mutation.
  - `useAdminUserMutations`: Wraps `updateUserRole` and `setUserStatus` mutations with toast notifications and query invalidation.
  - `useAuditLogs`: Fetches paginated audit logs with search/filter params.

### 4. Admin Hub Integration
- `src/features/admin/pages/AdminDashboardPage.tsx`:
  - Added Quick Action links to `/admin/users` ("Manage platform user accounts, roles, and status") and `/admin/audit` ("Review platform security events, role changes, and actions").
  - Linked KPI cards to corresponding admin modules.
- `src/features/admin/constants.ts`:
  - `ADMIN_NAV_ITEMS` includes `Users` (`/admin/users`) and `Audit Logs` (`/admin/audit`).

---

## 9. Import & Data Migration Staging Foundation (Phase 14 — Subtask 1)

### Architectural Decisions & Schema Rationale
- **`PERSON ≠ USER` Invariant**: Staged and imported census data represents community persons (`public.persons`). Staging tables and import RPCs never create `auth.users`, never create `public.profiles`, and never assign `persons.user_id`.
- **`DETECT ≠ MERGE` Invariant**: Duplicate detection highlights potential collisions, but import staging never executes automatic deduplication or destructive merges.
- **Canonical Tables Untouched**: Subtask 1 operates strictly in isolated staging storage. Canonical tables (`persons`, `families`, `relationships`) are completely untouched. The addition of canonical provenance columns (`import_batch_id`) is deferred to the promotion subtask (Subtask 4) to eliminate premature schema coupling.
- **Hybrid Staging Architecture (Why Chosen)**:
  - Selected a unified, entity-scoped staging table (`public.staging_records`) with JSONB payload over rigid separate tables (`staging_persons`, `staging_families`, etc.).
  - *Rationale*: External datasets (CSV/JSON) exhibit variable headers, unparsed types, or irregular values that would fail strict DDL constraints. Entity-scoping (`entity_type`) preserves exact typing and lineage (`source_row_number`, `source_record_id`), while JSONB facilitates multi-stage validation and clean batch cascade drops.
- **Admin-Only Boundary**:
  - Restricts import batch creation, cancellation, and inspection to active `ADMIN` and `SUPER_ADMIN` accounts.
  - Direct client mutations on staging tables are denied by RLS (`WITH CHECK (FALSE)`).
  - All operations route through server-authoritative `SECURITY DEFINER` RPCs (`create_import_batch`, `cancel_import_batch`).

### Database Objects (Migration: `20261017100000_create_import_staging_infrastructure.sql`)
- **Enums**:
  - `import_batch_status`: `STAGED`, `VALIDATED`, `PROMOTED`, `CANCELLED`, `REVERTED`.
  - `import_entity_type`: `PERSON`, `FAMILY`, `RELATIONSHIP`.
  - `staging_validation_status`: `PENDING`, `VALID`, `WARNING`, `ERROR`, `EXCLUDED`.
- **Tables**:
  - `public.import_batches`: Batch container tracking file name, format, SHA-256 hash, status, row counts, and cancellation metadata.
  - `public.staging_records`: Staged rows with source row numbers, parsed JSONB, and validation status.
- **Authoritative RPCs**:
  - `public.create_import_batch`: Initializes a new batch in `STAGED` status with active file hash collision prevention and audit logging.
  - `public.cancel_import_batch`: Cancels an unpromoted batch with row locking and audit logging.
- **Service Layer**:
  - `src/features/admin/services/import.service.ts`: Client methods `createImportBatch`, `cancelImportBatch`, `listImportBatches`, `getImportBatch`, and `sanitizeImportError`.

---

## 10. Import Parsing, Mapping & Staging Ingestion (Phase 14 — Subtask 2)

### 1. Supported Input Formats
- **CSV (RFC 4180)**:
  - Header row supported.
  - Quoted values, commas inside quotes, and escaped quotes (`""`) fully supported.
  - Automatic UTF-8 Byte Order Mark (BOM: `\uFEFF`) stripping.
  - Safe handling of empty lines without disrupting line count.
  - Malformed rows (unclosed quotes, column count mismatches) produce structured row warnings/errors rather than crashing.
- **JSON**:
  - Top-level array of record objects: `[ { ... }, { ... } ]`.
  - Object-wrapped collections: `{ "records": [ ... ] }`, `{ "data": [ ... ] }`, or `{ "items": [ ... ] }`.
  - Non-object items in array produce structured row errors.
  - Malformed JSON produces a controlled `MALFORMED_JSON` error.

### 2. Operational Limits
- **Max File Size**: 10 MB (`IMPORT_LIMITS.MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024`).
- **Max Record Count**: 5,000 records per batch (`IMPORT_LIMITS.MAX_RECORDS_PER_BATCH = 5000`).
- **Max Field Length**: 10,000 characters per field.
- **Ingestion Chunk Size**: 500 records per RPC call to avoid HTTP payload limits.

### 3. Mapping Architecture
The pipeline establishes a 4-tier typed transformation:
```
RAW INPUT → NORMALIZED INPUT → MAPPED ENTITY → STAGING RECORD DRAFT
```
- **Entity Detection**:
  - Checks for explicit `entity_type` / `type` column.
  - Uses administrator option override (`defaultEntityType`).
  - Infers entity type based on present fields (`relationship_type` -> `RELATIONSHIP`, `family_name` -> `FAMILY`, otherwise `PERSON`).
- **Field Mappings**:
  - `PERSON`: `first_name`, `middle_name`, `last_name`, `maiden_name`, `gender`, `date_of_birth`, `birth_place`, `date_of_death`, `death_place`, `is_living`, `gotra`, `nukh`, `kul`, `current_address`, `city`, `state`, `country`, `postal_code`, `email`, `phone`.
  - `FAMILY`: `family_name`, `head_id`, `head_name`, `city`, `state`, `country`, `postal_code`, `description`.
  - `RELATIONSHIP`: `person_a_id`, `person_b_id`, `relationship_type`.
- **Zero Data Loss**:
  - Unmapped attributes are preserved in `parsed_data.unmapped_fields`.
  - Full raw source values are preserved in `raw_data`.

### 4. Normalization Rules
- Surrounding whitespace trimmed.
- Null literals (`"null"`, `"NULL"`, `"N/A"`, `"na"`, `"-"`, `""`) converted to `null`.
- Dates parsed into ISO `YYYY-MM-DD` (supports `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`). Unparseable dates are preserved as raw strings with an `UNRECOGNIZED_DATE_FORMAT` warning.
- Gender normalized to `'male'`, `'female'`, `'other'`.
- Relationship types normalized to `'parent'`, `'child'`, `'spouse'`, `'sibling'`.
- **Zero Secrets**: Any field matching credential keywords (`password`, `token`, `secret`, `jwt`, `api_key`) is redacted to `"[REDACTED_CREDENTIAL]"`.

### 5. Staging Lineage & Invariants
- `source_row_number`: 1-based index corresponding to data rows.
- `source_record_id`: Sourced from input ID columns if present, otherwise derived deterministically as `${entity_type}_ROW_${source_row_number}` (never random IDs).
- `canonical_id`: Strictly `NULL`.
- `validation_status`: `PENDING` (or `ERROR` if required fields like names or relationship targets are missing).

### 6. Staging Ingestion RPC (`20261017180000_create_staging_ingestion_rpc.sql`)
- `public.stage_import_records(p_batch_id UUID, p_records JSONB)`:
  - `SECURITY DEFINER`, `search_path = public, auth`.
  - Admin authorization check (`public.is_admin()`).
  - Idempotent upsert via `ON CONFLICT (batch_id, entity_type, source_row_number) DO UPDATE`.
  - Atomically synchronizes `import_batches.total_records`, `row_counts`, and `validation_summary`.
  - Records `STAGE_IMPORT_RECORDS` audit log.

---

## 11. Import Validation, Data Quality & Duplicate Review (Phase 14 — Subtask 3)

### 1. Architectural Decisions & Guardrails
- **`PERSON ≠ USER` Invariant**: Staged entities represent community census persons and families. Validation rules strictly evaluate census attributes and lineage. No authentication accounts, credentials, or user logins are created or modified.
- **`DETECT ≠ MERGE` Invariant**: Duplicate detection against canonical census records is non-destructive and advisory. Matches are flagged as `WARNING` with structured details (`DUPLICATE_CANDIDATE`). No automatic merges, overwrites, or record deletions occur.
- **`STAGING ≠ CANONICAL` Invariant**: All validation and review status transitions occur exclusively within `staging_records` and `import_batches`. Canonical tables (`persons`, `families`, `relationships`, `profiles`, `auth.users`) are completely untouched. Staging `canonical_id` remains strictly `NULL`.
- **Duplicate Flag Architecture**: Canonical `public.duplicate_flags` (Phase 9) requires two existing canonical UUIDs (`record_a_id < record_b_id`). Staging records are NOT inserted into `public.duplicate_flags` because they lack canonical identities and doing so would violate staging isolation. Candidate matches are preserved directly on `staging_records.validation_errors`.

### 2. Validation & Review RPCs (`20261017200000_create_import_validation_and_review_rpcs.sql`)
- `public.validate_import_batch(p_batch_id UUID) RETURNS JSONB`:
  - `SECURITY DEFINER`, `search_path = public, auth`.
  - Admin authorization check (`public.is_admin()`).
  - Row locking `FOR UPDATE` on `import_batches`, enforcing `status = 'STAGED'`.
  - Validates all records across `PERSON`, `FAMILY`, and `RELATIONSHIP` types against canonical domain constraints:
    - Name presence: BOTH `first_name` and `last_name` are strictly required (canonical schema alignment).
    - Name length bounds (1-100 characters).
    - Valid gender enum (`male`, `female`, `other`).
    - Date bounds: DOB between 1800-01-01 and CURRENT_DATE; DOD <= CURRENT_DATE; DOD >= DOB.
    - Safe `is_living` & vital status: safely evaluated without `::BOOLEAN` casting; validates against canonical `person_status` (`ACTIVE` / `DECEASED`); source `LIVING` normalizes to `ACTIVE`; unsupported status creates row-level warning; vital contradiction flagged if DOD present while living/`ACTIVE` or if `is_living` contradicts `status`.
    - Family name presence and length bounds.
    - Canonical relationship types: strictly `PARENT`, `SPOUSE`, `SIBLING` (no canonical `CHILD` type). Distinct endpoints (no self-reference).
  - Performs canonical candidate duplicate detection:
    - Persons: Matches canonical `public.persons` on full name + date of birth, or full name + Gotra.
    - Families: Matches canonical `public.families` on family name + Gotra or City.
    - Flags matches as `validation_status = 'WARNING'` with structured error code `DUPLICATE_CANDIDATE`, `canonical_candidate_id`, `confidence`, and `match_signals` array (without persisting canonical person's full name into message).
  - Re-aggregates and updates `import_batches.total_records`, `row_counts`, and `validation_summary`.
  - Logs `VALIDATE_IMPORT_BATCH` audit event via `log_audit_event()`.
- `public.set_staging_record_status(p_record_id UUID, p_status public.staging_validation_status, p_notes TEXT) RETURNS JSONB`:
  - Admin manual review override (`VALID`, `EXCLUDED`, etc.).
  - Transition integrity matrix:
    - `PENDING` records cannot be manually transitioned to `VALID`, `WARNING`, or `ERROR` (must run through `validate_import_batch()`; only `EXCLUDED` allowed).
    - `EXCLUDED` records cannot be manually manufactured into `VALID`, `WARNING`, or `ERROR` (must be reprocessed by `validate_import_batch()`).
    - `VALID` records cannot be downgraded to `ERROR` or `WARNING` manually.
    - `WARNING` and `ERROR` records cannot be changed to unvalidated states without validation.
    - Setting status `VALID` on records with unresolved `ERROR` severity strictly requires mandatory review notes (>= 3 chars).
  - Transforms resolved errors from severity `ERROR` to `RESOLVED` with reviewer ID, timestamp, and resolution notes, preserving original audit evidence.
  - Recalculates and updates batch `validation_summary`.
  - Logs `REVIEW_STAGING_RECORD` audit event.
- `public.finalize_batch_validation(p_batch_id UUID) RETURNS JSONB`:
  - Transitions batch status from `STAGED` to `VALIDATED` if and only if:
    - Zero `PENDING` records remain.
    - Zero records with `validation_status = 'ERROR'` remain.
    - Zero non-excluded records with unresolved `severity = 'ERROR'` payloads remain.
    - At least one eligible record (`VALID` or `WARNING`) exists in the batch.
  - Throws `PRECONDITION_FAILED` if any check fails.
  - Logs `FINALIZE_IMPORT_VALIDATION` audit event.
- **Security Posture**:
  - `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon;`
  - `GRANT EXECUTE ON FUNCTION ... TO authenticated;`
  - Zero `service_role` execute grants.

### 3. Application & Service Layer
- **Types** (`src/features/admin/types.ts`):
  - `BatchValidationResult`: Structured summary of validated records, counts, and status.
  - `SetStagingRecordStatusInput`: Payload for manual status override and reviewer notes.
  - `FinalizeBatchValidationResult`: Result of batch validation finalization.
  - `StagingDuplicateCandidate`: Typed candidate match structure with `matchSignals`.
  - `BatchDataQualityMetrics`: Quality score (0-100), tier, error rate, warning rate, completeness, and duplicate rate.
- **Service Layer** (`src/features/admin/services/import.service.ts`):
  - `validateImportBatch`: Executes server-authoritative validation RPC. Supports idempotent re-runs.
  - `setStagingRecordStatus`: Executes record review override RPC with error resolution guardrails.
  - `finalizeBatchValidation`: Executes validation finalization RPC with zero-unresolved-error gates.
  - `calculateBatchDataQuality`: Pure deterministic scoring formula:
    `Score = 100 - (errorRate * 0.7) - (warningRate * 0.3)`
    Tiers: `EXCELLENT (>=85)`, `GOOD (>=70)`, `ADEQUATE (>=50)`, `NEEDS_IMPROVEMENT (<50)`.
- **Pure Client Validation & Ingestion** (`src/features/admin/services/importParser.service.ts`):
  - Ingestion mapping: Automatically normalizes source `CHILD` relationships to canonical `PARENT` semantics with endpoints reversed.
  - Exports `validateDraftRecord()` for instantaneous, offline/pre-upload draft evaluation mirroring the database constraints.

---

## 12. Final Import Promotion, Provenance & Completion (Phase 14 — Subtask 4)

### 1. Architectural Principles & Transaction Boundaries
- **`PERSON ≠ USER` Invariant**: Promotion strictly inserts into `public.persons` with `user_id = NULL` and `verification_status = 'UNVERIFIED'`. Promoted persons remain unclaimed census entities. Promotion NEVER creates `auth.users`, NEVER creates `public.profiles`, and NEVER approves claims or invitations.
- **`DETECT != MERGE` Invariant**: Promotion NEVER overwrites, modifies, or deletes an existing canonical person or family. Validated records flagged with `DUPLICATE_CANDIDATE` that were left in `WARNING` status are promoted as new, distinct canonical entities, and an `OPEN` entry is automatically created in `public.duplicate_flags` linking the new and existing records for moderation review. Records marked `EXCLUDED` are ignored and never promoted.
- **Strict Server Eligibility Gate**:
  - `import_batches.status = 'VALIDATED'` required (rejects `STAGED`, `CANCELLED`, `REVERTED`, `PROMOTED`).
  - Zero `PENDING` records.
  - Zero `ERROR` records and zero unresolved error payloads.
  - At least one eligible record (`VALID` or `WARNING`).
  - All eligible records have `canonical_id IS NULL`.
- **Atomic Transaction & Locking**:
  - Entire promotion runs inside a single PostgreSQL transaction via `public.promote_import_batch(UUID)`.
  - Batch row locked `FOR UPDATE`.
  - Staging records locked deterministically `ORDER BY source_row_number ASC, id ASC FOR UPDATE`.
  - Any foreign key, constraint, or reference error aborts the transaction; zero canonical rows committed, staging `canonical_id` remains `NULL`, batch remains `VALIDATED`.
- **Deterministic Dependency Order**:
  1. `PERSON` records -> `public.persons` (canonical_id assigned).
  2. `FAMILY` records -> `public.families` (canonical_id assigned).
  3. `FAMILY HEAD LINKAGE` -> `public.family_members` (role = `'HEAD'`, `is_head = TRUE`, resolved strictly against same-batch promoted PERSON records; external/canonical UUID fallback is strictly forbidden; unresolvable head fails entire promotion transaction).
  4. `RELATIONSHIP` records -> `public.relationships` (both endpoints resolved to canonical IDs; symmetric ordering `person_a_id < person_b_id` enforced for `SPOUSE` and `SIBLING`; directional preserved for `PARENT`; no canonical `CHILD` type).
  5. `DUPLICATE FLAGS` -> `public.duplicate_flags` (creates `OPEN` flag for `WARNING` duplicates).
  6. `BATCH UPDATE` -> `import_batches` (`status = 'PROMOTED'`, `promoted_at = NOW()`, `promoted_by = auth.uid()`).
  7. `IMMUTABLE AUDIT LOG` -> `public.log_audit_event()`.

### 2. Authoritative Promotion RPC (`20261017220000_create_import_promotion_rpc.sql`)
- `public.promote_import_batch(p_batch_id UUID) RETURNS JSONB`:
  - `SECURITY DEFINER`, `search_path = public, auth`.
  - Admin authorization check (`auth.uid() IS NOT NULL AND public.is_admin() = TRUE`).
  - Idempotent: If already `PROMOTED`, returns existing promotion metrics without duplicate insertions.
  - Grants: `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated;`. Zero `service_role` execute grants.
- Index: `CREATE INDEX idx_staging_records_canonical_id ON public.staging_records (canonical_id) WHERE canonical_id IS NOT NULL;` for $O(1)$ source lineage lookups.

### 3. Application & UI Layer
- **Service** (`src/features/admin/services/import.service.ts`):
  - `promoteImportBatch(batchId: string)`: Calls `promote_import_batch` RPC with sanitized error handling (`PRECONDITION_FAILED`, `UNRESOLVED_REFERENCE`, `ALREADY_PROMOTED`, `FORBIDDEN`).
- **Components**:
  - `ImportBatchPromotionCard`: Displays promotion eligibility, valid/warning/error metric cards, and "Promote Import" trigger.
  - `ImportPromotionConfirmationModal`: Mandatory deliberate confirmation modal requiring explicit checkbox acknowledgment ("I understand that this operation will create real canonical census records") before calling promotion RPC. Displays post-promotion summary of created entities upon completion.
- **Rollback Boundary Note**: Reverse promotion of already-promoted data is explicitly out of scope for Phase 14; transaction atomicity guarantees all-or-nothing completion on failure.

