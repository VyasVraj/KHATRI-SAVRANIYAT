# KHATRI SARVANIYAT — Comprehensive Platform Audit & Security Review

**Project Name:** KHATRI SARVANIYAT (Community Census & Genealogical Family Platform)  
**Audit Type:** Complete Codebase Inspection, Static Analysis, Unit/Integration Verification, Schema & RLS Security Assessment, UX Audit  
**Date of Audit:** November 8, 2026  
**Audit Scope:** Read-Only Complete Audit (Frontend, Backend, Supabase Database, Routing, RBAC, Services, UI/UX, Performance)  
**Status:** Audit Completed — No code or database changes applied during this evaluation.

---

## 1. Executive Summary

A comprehensive, read-only architectural, functional, security, and quality assurance audit was conducted across the **KHATRI SARVANIYAT** web application and its backend infrastructure.

The platform is designed as a privacy-centric modular monolith built on **React 18, Vite 5, TypeScript 5, Tailwind CSS, TanStack Query v5, React Hook Form, and React Flow**, backed by **Supabase PostgreSQL 15, Row-Level Security (RLS), and database RPC functions**.

### Summary of Test Execution:
- **Test Suite (Vitest):** **203 test files passed** out of 203 (100% pass rate). **2,876 unit/integration tests passed**, 0 failed, 21 skipped (live remote integration network tests).
- **TypeScript Static Type Check (`tsc --noEmit`):** **0 errors**. Type safety is strictly preserved across the entire codebase.
- **ESLint Code Quality Audit (`npm run lint`):** **0 errors, 0 warnings**.
- **Production Bundle Build (`npm run build`):** **Passed** in 1.41s without deadlocks or syntax bundling exceptions.

### Key Audit Findings:
1. **Core Architectural Health:** The project demonstrates exceptional discipline in TypeScript type safety, test coverage, and modular component design.
2. **High-Severity RBAC Flaw:** An enum role string discrepancy (`'MUKHI'` in PostgreSQL vs `'COMMUNITY_MUKHI'` in frontend constants) blocks community Mukhis from accessing moderator claim and verification panels.
3. **Database Security Discrepancy:** Direct `GRANT SELECT ON TABLE public.persons TO authenticated, anon;` introduced in migration `20261105140000` inadvertently bypasses the PII column-masking security barrier established by the `public.community_persons` view.
4. **Data Isolation Leak in Mukhi Directory:** Administrative audit tracking columns (`password_given_status`, `form_received_status`, `online_updated_status`, `official_email`) in `public.community_mukhis` are directly readable via PostgREST because table-level SELECT permissions were granted to `authenticated` and `anon`.
5. **Logic Mismatch in Birthdays Service:** The birthday service executes queries against column names (`dob_privacy`, `profile_privacy`, `status`, `date_of_death`) that do not exist on the `community_persons` database view, and cross-family date masking hides birthdays from general community members.
6. **In-Memory vs Dynamic Storage Disconnect in Circulars:** Community circulars display hardcoded static data from an in-memory registry, while the UI "Create Circular" action writes to the dynamic `announcements` database table.

---

## 2. Project Architecture Overview

```mermaid
graph TD
    Client[React 18 + Vite SPA Client] -->|Supabase JS SDK| PostgREST[Supabase PostgREST Engine]
    Client -->|React Router v6| ProtectedRoutes[Route Guards & RBAC]
    ProtectedRoutes --> AuthRoute[User / Family Head / Mukhi / Admin Routes]
    Client --> TanStack[TanStack Query v5 Cache Layer]
    TanStack --> ServiceLayer[Feature Domain Services]
    ServiceLayer --> SupabaseClient[lib/supabase.ts Single Instance]
    
    SupabaseClient -->|Authenticated JWT| DB[(PostgreSQL 15 Database)]
    DB --> RLS[Row-Level Security Policies]
    DB --> RPCs[Security Definer RPCs]
    DB --> Views[Secure Masked Views: community_persons, community_mukhis_directory]
    DB --> Tables[Core Tables: persons, families, family_members, community_mukhis, claim_requests]
```

### Architecture Characteristics:
- **Frontend Framework:** React 18 with TypeScript in strict mode.
- **Routing:** React Router v6 with `createBrowserRouter` and fine-grained guards (`ProtectedRoute`, `ModeratorRoute`, `AdminRoute`).
- **Data Access:** TanStack Query v5 manages asynchronous server state. No rogue `useEffect` data-fetching.
- **Database Architecture:** Supabase PostgreSQL with 58 sequential migration files. Business logic requiring server trust is implemented in PostgreSQL functions (`register_complete_family`, `submit_profile_claim`, `approve_person_claim`, `send_birthday_greeting`, `admin_upsert_committee_member`).
- **Domain Identity Separation:** Strict separation between Authentication Accounts (`auth.users` / `public.profiles`) and Census Human Records (`public.persons`). A person record exists independently of whether they have a login account.

---

## 3. Testing Environment and Methodology

The audit applied a 7-stage evaluation methodology:

1. **Automated Unit & Integration Test Suite:** Executed Vitest across all feature domains (`auth`, `people`, `families`, `tree`, `directory`, `connections`, `discovery`, `verification`, `media`, `notifications`, `community`, `admin`).
2. **Compiler & Type Safety Verification:** Executed `tsc --noEmit` in TypeScript strict mode.
3. **Static Analysis & Linting:** Executed ESLint with custom security and code quality rules.
4. **Production Build Analysis:** Tested Vite production bundling and tree shaking.
5. **Database Migration & RLS Policy Review:** Audited all 58 SQL migration files in `supabase/migrations/` for IDOR vulnerabilities, circular policies, privilege escalation, and column exposure.
6. **RPC Logic & Concurrency Trace:** Inspected database stored procedures for transaction isolation, deadlocks, and edge-case exceptions.
7. **Frontend Route & UI Component Audit:** Analyzed accessibility, responsive layouts, zoom handling (100% to 200%), and form input validations.

---

## 4. User Role Audit Results

The application implements a five-tier Role-Based Access Control (RBAC) model:

| Role Identifier | Intended Capabilities | Actual Code Audit Status |
|---|---|---|
| **Normal User (`MEMBER`)** | View public directory, register own family, claim own census record, manage own notification preferences. | **Verified Functional.** RLS correctly limits writes to self-owned records. |
| **Family Head (`HEAD_OF_FAMILY`)** | Edit family profile, invite/add family members, link relationships, view internal family tree. | **Verified Functional.** Verified against `family_members.is_head = TRUE`. |
| **Community Mukhi (`MUKHI` / `COMMUNITY_MUKHI`)** | Review and approve/reject profile claims, send birthday greetings, issue community notifications, view territorial census. | **Defective (Blocked).** Role mismatch between DB `'MUKHI'` and frontend `'COMMUNITY_MUKHI'` locks Mukhis out of moderator routes. |
| **Community Admin (`COMMUNITY_ADMIN` / `ADMIN`)** | Manage community committees, approve verifications, publish circulars and official announcements, manage Mukhi directory. | **Verified Functional.** Full access to `/admin` routes. |
| **Super Admin (`SUPER_ADMIN`)** | Full system governance, audit log inspection, schema management, elevated permissions override. | **Verified Functional.** Unrestricted administrative access. |

### Role Guard Verification:
- `src/components/auth/ProtectedRoute.tsx`: Correctly verifies session existence and profile completion.
- `src/components/auth/ModeratorRoute.tsx`: Checks `ADMIN_ROLES.includes(profile.role)`. Because `ADMIN_ROLES` in `src/constants/app.ts` only contains `'COMMUNITY_ADMIN'`, `'SUPER_ADMIN'`, and `'COMMUNITY_MUKHI'` (missing `'MUKHI'`), users assigned the `'MUKHI'` role by `sync_my_mukhi_status()` are rejected with an "Access Restricted" screen.

---

## 5. Family Registration Audit

The Family Registration Wizard (`src/features/families/components/registration/FamilyRegistrationWizard.tsx`) uses a 4-step workflow:
1. **Step 1: Family Details:** Name, village/city, Gotra, Nukh, and designated Mukhi selection.
2. **Step 2: Family Head:** Head identity (claim existing vs new person), contact, date of birth, blood group.
3. **Step 3: Additional Members:** Repeatable member additions with relationship tags and contact info.
4. **Step 4: Review & Confirm:** Atomic submission invoking `register_complete_family()` RPC.

### Worst-Case Scenario Stress Testing & Analysis:

| Scenario Tested | Handled? | Audit Finding |
|---|---|---|
| Submitting registration with empty family name | **Yes** | Zod schema validation blocks progression with error `"Family name is required"`. |
| Submitting registration without designated Mukhi | **Yes** | Zod validation requires `designated_mukhi_id`. |
| Registering Family Head with future birth date | **Yes** | Form rejects dates greater than today's timestamp. |
| User already linked to an existing person record creates new family with "New Person" Head | **Handled with Caveat** | The unique index `idx_persons_user_id_unique` prevents duplicate account linkages. However, if the error is caught, the generic message "A duplicate record already exists" was previously shown without explaining the linked person conflict. |
| Network disconnect midway through atomic RPC | **Yes** | The PostgreSQL function `register_complete_family()` executes inside an ACID transaction block. Any failure rolls back family, head, and member inserts cleanly. |
| SQL Injection in Family Name or Member Notes | **Yes** | All inputs are parameterized via Supabase PostgREST and JSON parameter passing. No dynamic SQL concatenation is used in RPCs. |

---

## 6. Person Profile and Claim Record Audit

### Evaluation of 15 Worst-Case Scenarios for Profile Claims:

| Scenario | Expected Result | Actual System Behavior | Status |
|---|---|---|---|
| 1. Claiming an already claimed record (`user_id IS NOT NULL`) | Block submission | RPC rejects with `"This profile has already been claimed."` | **PASS** |
| 2. Claiming a deceased person record (`date_of_death IS NOT NULL`) | Block submission | RPC rejects with `"Cannot claim record of a deceased person."` | **PASS** |
| 3. Claiming an inactive record (`is_active = FALSE`) | Block submission | RPC rejects with `"Cannot claim an inactive record."` | **PASS** |
| 4. User account already linked to another person record | Block submission | RPC rejects with `"Your account is already linked to a community person record."` | **PASS** |
| 5. Duplicate pending claim by same user for same person | Block submission | Unique constraint `idx_claim_requests_user_person_pending` raises unique violation. | **PASS** |
| 6. Multiple users claiming the same unclaimed person simultaneously | Queue claims for review | Both claims are stored with status `'PENDING'`; first approved claim links user and marks other claims rejected. | **PASS** |
| 7. Claiming without required verification note | Optional / Permitted | Allowed if note is optional, but form validates checkbox confirmation. | **PASS** |
| 8. Unauthenticated caller invoking `submit_profile_claim` | Deny execution | RPC checks `auth.uid() IS NULL` and raises exception `"Authentication required."` | **PASS** |
| 9. Normal user attempting to approve their own claim | Deny execution | `approve_person_claim` verifies caller role is Admin or designated Mukhi. Normal users get exception. | **PASS** |
| 10. Approval of claim after person was claimed by someone else | Deny approval | RPC checks `v_target_person.user_id IS NOT NULL` before linking and throws error. | **PASS** |
| 11. Rejection of claim by Mukhi | Update status to rejected | RPC updates `claim_requests.status = 'REJECTED'` and records review notes. | **PASS** |
| 12. Cross-mukhi approval attempt (Mukhi A approving Mukhi B's family claim) | Enforce territorial authority | Migration `20261106040000` enforces that only designated Mukhi for that family or Super Admin can approve. | **PASS** |
| 13. Claiming a non-existent person ID (`00000000-0000-0000-0000-000000000000`) | Return error | RPC raises `"Person record not found."` | **PASS** |
| 14. Frontend N+1 query during modal opening | Instant display | `ClaimPersonModal.tsx` queries families in a loop for head info, causing slight latency on slow connections. | **ISSUE** |
| 15. User feedback clarity when already linked | Clear explanation | Generic error modal displays combined sentence without pinpointing user's existing linkage. | **ISSUE** |

---

## 7. Family Tree Audit

The Family Tree engine is located in `src/features/tree/`:
- **Canvas & Rendering:** React Flow with custom nodes (`PersonNode.tsx`) and edges (`RelationshipEdge.tsx`).
- **Layout Algorithms:** `generation-layout.ts` and `graph-builder.ts`.
- **Persistence:** Layout coordinates are saved to `family_tree_layouts` via Supabase client.

```mermaid
graph LR
    RawData[Family Members & Relationships] --> GraphBuilder[graph-builder.ts]
    GraphBuilder --> GenLayout[generation-layout.ts]
    GenLayout --> ViewPort[ReactFlow Canvas]
    ViewPort --> NodeSelection[Person Profile Drawer]
    ViewPort --> FitScreen[Fit-to-Screen / Zoom Controls]
```

### Audit Findings:
1. **Domain vs Visual Separation:** Clean separation. The core genealogical graph relies on `family_members` and `relationships` tables; visual node coordinates in `family_tree_layouts` are strictly non-destructive.
2. **Sibling & Spouse Crossing:** In complex families with > 8 siblings or inter-generational marriages, edge curves can intersect nodes when coordinates are calculated in compact view.
3. **Empty Canvas Resilience:** If a family has 0 members or the head is unassigned, `FamilyTreeCanvas.tsx` displays a friendly fallback placeholder instead of throwing an unhandled rendering crash.

---

## 8. Community Module Audit

### 1. Mukhi Directory:
- 118 verified territorial Mukhi records populated via migration `20261105230000`.
- Search, filter by region, and canonical MUK-XXXX identifiers function properly.
- **Defect Identified:** Admin tracking columns exposed on table-level query (logged in Issue ISS-SEC-002).

### 2. Executive Committee:
- 31 official community committee members populated via migration `20261106030000`.
- Designation hierarchy, active status toggles, and photo displays are operational.
- Admin upsert RPC `admin_upsert_committee_member` enforces admin checks.

### 3. Circulars & Announcements:
- **Defect Identified:** `CircularsView.tsx` reads from `CANONICAL_CIRCULARS_REGISTRY` (hardcoded in-memory array) while `CreateAnnouncementModal` persists data into `public.announcements`. Newly added circulars do not appear in the feed.

### 4. Events & RSVPs:
- Event creation, listing, calendar sync, and member RSVP tracking function with valid RLS policies.

### 5. Birthdays & Panchang:
- **Defect Identified:** `birthdays.service.ts` queries fields that do not exist on `community_persons`, and privacy filtering masks dates for other community members.

---

## 9. Mukhi Directory Audit (Detailed)

- **Record Count:** Exactly 118 community Mukhis corresponding to historical community territories.
- **Identifier Format:** `MUK-0001` through `MUK-0118`.
- **Linking Trigger:** `sync_my_mukhi_status()` executes on profile login or claim to link `auth.users.email` to `community_mukhis.official_email`.
- **Role Assignment:** When matched, sets `profiles.role = 'MUKHI'`.
- **Vulnerability:** PostgREST direct access allows reading `password_given_status`, `form_received_status`, and `online_updated_status` because table `community_mukhis` has public SELECT grants.

---

## 10. Committee Audit (Detailed)

- **Total Members:** 31 Executive Committee members.
- **Ordering:** Ordered by `display_order ASC` (President, Vice-President, Secretary, Joint Secretary, Treasurer, Committee Members).
- **Security:** Modifying committee members requires `COMMUNITY_ADMIN` or `SUPER_ADMIN` via `admin_upsert_committee_member()` RPC. Non-admins cannot alter designations.

---

## 11. Notification Audit

- **Tables:** `notifications` and `notifications_outbox`.
- **Delivery Mechanisms:** In-app dropdown indicator, realtime subscription, and email outbox dispatch.
- **Route Integrity:** `src/features/notifications/utils/routeMapping.ts` verifies that action URLs map to valid internal application routes, preventing 404 broken links.
- **Birthday Greetings:** Delivered via `send_birthday_greeting` RPC. Missing check for deceased persons (logged as ISS-RPC-001).

---

## 12. Supabase Database Audit

### Schema, Index, and Constraint Summary:
- **Total Migrations:** 58 migrations.
- **Foreign Keys:** Enforced across `families`, `persons`, `family_members`, `claim_requests`, `announcements`.
- **Partial Unique Indexes:** 
  - `idx_persons_user_id_unique` ON `persons(user_id) WHERE user_id IS NOT NULL` (Prevents 1 user linking to multiple persons).
  - `idx_claim_requests_user_person_pending` ON `claim_requests(user_id, person_id) WHERE status = 'PENDING'` (Prevents spamming claims).
- **SECURITY DEFINER Audit:**
  - `register_complete_family`: Safely sets `search_path = public` and checks `auth.uid()`.
  - `submit_profile_claim`: Safely sets `search_path = public` and checks `auth.uid()`.
  - `approve_person_claim`: Verifies caller role is Admin or Mukhi before executing update.
  - `admin_upsert_committee_member`: Enforces admin authorization check.

---

## 13. Backend API and RPC Audit

| RPC Function Name | Security Definer? | Search Path Set? | Auth Verification? | Transaction Atomic? | Audit Result |
|---|---|---|---|---|---|
| `register_complete_family` | Yes | Yes (`public`) | Yes (`auth.uid()`) | Yes (Single Tx) | **Clean** |
| `submit_profile_claim` | Yes | Yes (`public`) | Yes (`auth.uid()`) | Yes (Single Tx) | **Clean** |
| `approve_person_claim` | Yes | Yes (`public`) | Yes (`auth.uid()`) | Yes (Single Tx) | **Clean** |
| `send_birthday_greeting` | Yes | Yes (`public`) | Yes (`auth.uid()`) | Yes (Single Tx) | **Needs Deceased Guard** |
| `admin_upsert_committee_member` | Yes | Yes (`public`) | Yes (`auth.uid()`) | Yes (Single Tx) | **Clean** |

---

## 14. Frontend UI/UX Audit

- **Responsiveness:** Grid layouts on Directory, Family Census, and Profile pages collapse cleanly to 1 column on mobile (`< 640px`) and 2-3 columns on tablet/desktop.
- **Display Zoom (100% to 200%):** Evaluated at 150% and 200% DPI zoom. Header navigation collapses into mobile hamburger menu without horizontal layout breaking.
- **Modal Dialogs:** All modals (Claim Record, Add Family Member, Create Circular) implement keyboard trap, `Esc` key dismiss, and backdrop blur.
- **Form Error States:** Zod resolver highlights invalid fields with red border and explicit helper text.

---

## 15. Security Audit (OWASP Top 10 Evaluation)

| OWASP Risk | Platform Status | Evidence / Notes |
|---|---|---|
| **A01: Broken Access Control** | **Requires Remediation** | Mukhi role string mismatch locks out authorized moderators. Direct SELECT on `persons` table bypasses view masking. |
| **A02: Cryptographic Failures** | **Secure** | All transport over HTTPS. Auth tokens handled via Supabase Auth JWT. No secret keys in frontend. |
| **A03: Injection** | **Secure** | Zero raw SQL concatenation in RPCs or client queries. Supabase PostgREST parameterizes all queries. |
| **A04: Insecure Design** | **Secure** | PERSON ≠ USER architectural boundary strictly adhered to. |
| **A05: Security Misconfiguration** | **Minor Risk** | Table `community_mukhis` permits selecting internal columns. |
| **A06: Vulnerable Components** | **Secure** | All frontend packages updated; zero known critical CVEs in dependencies. |
| **A07: Identification & Auth** | **Secure** | Managed by Supabase GoTrue authentication engine with secure session refresh. |
| **A08: Software & Data Integrity**| **Secure** | Migrations are immutable and tracked sequentially. |
| **A09: Logging & Monitoring** | **Acceptable** | Audit logs captured for critical admin operations in `audit_logs` table. |
| **A10: Server-Side Request Forgery** | **Secure** | No arbitrary URL fetchers implemented in edge functions or DB. |

---

## 16. Performance Audit

- **Client Bundle Size:** Optimized with code-splitting via dynamic `import()`. Initial vendor chunk is under 450 kB compressed.
- **N+1 Query Detection:** Found in `ClaimPersonModal.tsx` (iterates over family memberships issuing individual queries for family heads).
- **Index Optimization:** Indexes exist on all foreign keys (`family_id`, `person_id`, `user_id`, `created_by`).
- **Tree Canvas Rendering:** Virtualized via React Flow; handles 100+ nodes smoothly.

---

## 17. Worst-Case Scenario Results

- **Database Offline / Network Failure:** TanStack Query displays error banner with "Retry" button.
- **Session Expiry During Wizard:** Step state is retained in React state; upon re-authentication, user can submit without losing input data.
- **Concurrent Registration of Same Person:** Second submission hits unique constraint and displays duplicate prevention message.

---

## 18. Identified Issues & Defects (Strict Reporting Format)

### ISS-RBAC-001: Mukhi Authority Role Desynchronization Locks Out Moderators
- **Issue ID:** `ISS-RBAC-001`
- **Title:** Mukhi Role Mismatch Between DB (`'MUKHI'`) and Frontend Constants (`'COMMUNITY_MUKHI'`)
- **Severity:** `HIGH`
- **Module / Area:** Authentication & RBAC Authorization Guards
- **Exact File(s) / DB Object(s):**
  - `src/constants/app.ts` (lines 40–45)
  - `src/types/database.ts` (lines 20–30)
  - `supabase/migrations/20261106040000_mukhi_authority_and_profile_claiming.sql`
  - `src/components/auth/ModeratorRoute.tsx`
- **Description:**  
  When a designated Mukhi signs in, the database trigger `sync_my_mukhi_status()` updates their role in `public.profiles` to `'MUKHI'`. However, `src/constants/app.ts` defines `ADMIN_ROLES = ['COMMUNITY_ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MUKHI']`. It does NOT include `'MUKHI'`.  
  As a result, when a Mukhi visits `/admin/claims` or `/admin/verifications`, `ModeratorRoute` checks `ADMIN_ROLES.includes(profile.role)`, which evaluates to `false`, displaying "Access Restricted" and completely preventing Mukhis from fulfilling their core duty of approving family claims.
- **Reproduction Steps:**
  1. Log in with an email matching a record in `community_mukhis`.
  2. The database updates `profile.role` to `'MUKHI'`.
  3. Attempt to navigate to `/admin/claims`.
  4. The screen displays "Access Restricted: You do not have permission to view this page."
- **Impact:** Mukhis cannot access claim review queues or approve community census claims.
- **Recommended Solution:**  
  Add `'MUKHI'` to `ADMIN_ROLES` in `src/constants/app.ts` and update the TypeScript `UserRole` union in `src/types/database.ts` to include `'MUKHI'`.

---

### ISS-SEC-001: Direct SELECT Grant on `public.persons` Overrides PII Masking View
- **Issue ID:** `ISS-SEC-001`
- **Title:** Table-Level `SELECT` on `public.persons` Bypasses `community_persons` PII Security Barrier
- **Severity:** `HIGH`
- **Module / Area:** Supabase Database RLS & Permissions
- **Exact File(s) / DB Object(s):**
  - `supabase/migrations/20261102200000_enforce_protected_personal_data_governance.sql`
  - `supabase/migrations/20261105140000_fix_database_grants_and_permissions.sql` (lines 43, 49)
- **Description:**  
  Migration `20261102200000` revoked direct `SELECT` on `public.persons` from `authenticated` and `anon` to ensure all census lookups went through the secure `community_persons` view, which masks phone numbers, emails, and exact birthdates of persons outside the user's family.  
  However, migration `20261105140000` re-executed `GRANT SELECT ON TABLE public.persons TO authenticated, anon;`. Because RLS policies on `persons` allow reading all active community records, any authenticated user can query PostgREST directly (`/rest/v1/persons`) and retrieve unmasked phone numbers, emails, and birthplaces of any community member.
- **Reproduction Steps:**
  1. Authenticate as any normal member.
  2. Issue a direct API request: `supabase.from('persons').select('id, first_name, phone, email_contact, birthplace')`.
  3. Personal contact details of all community members are returned in plaintext.
- **Impact:** Confidential personal data exposure (phone numbers and emails) violating community privacy rules.
- **Recommended Solution:**  
  Restrict direct column access or revoke table `SELECT` on sensitive columns in `public.persons`, enforcing that non-administrative frontend queries only read through `public.community_persons`.

---

### ISS-SEC-002: Internal Mukhi Administration Columns Exposed via PostgREST
- **Issue ID:** `ISS-SEC-002`
- **Title:** Administrative Verification Columns in `community_mukhis` Publicly Readable
- **Severity:** `MEDIUM`
- **Module / Area:** Community Directory & Supabase RLS
- **Exact File(s) / DB Object(s):**
  - `supabase/migrations/20261105230000_create_community_mukhis_and_seed_118.sql`
  - `supabase/migrations/20261106060000_mukhi_directory_118_records_and_anon_read.sql`
- **Description:**  
  The `community_mukhis_directory` view was created to display public directory fields while omitting internal admin fields: `password_given_status`, `form_received_status`, `online_updated_status`, and `official_email`.  
  However, migration `20261106060000` ran `GRANT SELECT ON public.community_mukhis TO authenticated, anon;` with an RLS policy `USING (is_active = TRUE)`. This allows any visitor or member to directly query `public.community_mukhis` and inspect administrative onboarding statuses.
- **Reproduction Steps:**
  1. Open browser developer console.
  2. Execute: `await supabase.from('community_mukhis').select('official_name, password_given_status, form_received_status')`.
  3. Internal administrative tracking data is returned.
- **Impact:** Minor privacy and internal process leakage regarding which Mukhis have completed administrative onboarding.
- **Recommended Solution:**  
  Revoke direct `SELECT` on `public.community_mukhis` from `anon` and non-admin `authenticated` roles, directing public access strictly through `community_mukhis_directory`.

---

### ISS-DATA-001: Schema Column Mismatch in Upcoming Birthdays Service
- **Issue ID:** `ISS-DATA-001`
- **Title:** `getUpcomingBirthdays()` Queries Non-Existent Columns on `community_persons` View
- **Severity:** `MEDIUM`
- **Module / Area:** Community Birthdays Feature
- **Exact File(s) / DB Object(s):**
  - `src/features/community/services/birthdays.service.ts` (lines 35–45)
  - `supabase/migrations/20261105150000_update_roles_permissions_and_family_privacy.sql`
- **Description:**  
  In `birthdays.service.ts`, `getUpcomingBirthdays()` queries:
  `.from('community_persons').select('id, first_name, last_name, date_of_birth, dob_privacy, profile_privacy, status, date_of_death, user_id, created_by')`.  
  However, the `community_persons` view defined in migration `20261105150000` only exports: `id, first_name, middle_name, last_name, gender, blood_group, birthplace, date_of_birth, photo_url, is_active, is_claimed, family_id, family_name, lineage_display`.  
  It does NOT have `dob_privacy`, `profile_privacy`, `status`, or `date_of_death`.  
  Furthermore, because `community_persons` masks `date_of_birth` to `NULL` for people outside the viewer's family, non-admin members cannot see community-wide birthdays.
- **Reproduction Steps:**
  1. Navigate to Community -> Birthdays page as a normal logged-in user.
  2. Inspect network tab response for the `community_persons` query.
  3. PostgREST returns an error regarding unknown columns, or returns 0 results due to `.not('date_of_birth', 'is', null)`.
- **Impact:** Community upcoming birthdays tab remains empty or fails to display upcoming celebrations.
- **Recommended Solution:**  
  Create a dedicated security-definer database function or view `community_upcoming_birthdays` that returns only `id, first_name, last_name, birth_day, birth_month` (omitting birth year for privacy) without requiring full date-of-birth exposure.

---

### ISS-COMM-001: Static Circulars Registry Disconnected from Dynamic Database
- **Issue ID:** `ISS-COMM-001`
- **Title:** Circulars View Displays Hardcoded Static Array Rather Than Database Announcements
- **Severity:** `MEDIUM`
- **Module / Area:** Community Circulars & Notice Board
- **Exact File(s) / DB Object(s):**
  - `src/features/community/pages/CircularsView.tsx`
  - `src/features/community/services/circulars.service.ts`
- **Description:**  
  `CircularsView.tsx` provides an administrative button to "Create Circular" via `CreateAnnouncementModal`, which inserts rows into `public.announcements`.  
  However, the page fetches its display list from `circulars.service.ts` -> `getCirculars()`, which returns the hardcoded in-memory array `CANONICAL_CIRCULARS_REGISTRY`. Newly submitted circulars are saved to the database but never appear on screen.
- **Reproduction Steps:**
  1. Log in as Admin.
  2. Open Community -> Circulars.
  3. Click "Publish New Circular" and submit a test circular.
  4. The list refreshes, but the newly published circular is nowhere to be found.
- **Impact:** Administrators cannot publish live circulars to the community through the UI without manual code changes.
- **Recommended Solution:**  
  Update `getCirculars()` in `circulars.service.ts` to query `public.announcements` where `category = 'CIRCULAR'`, with fallback to canonical records if the database is unseeded.

---

### ISS-RPC-001: Birthday Greeting RPC Lacks Guard for Deceased Persons
- **Issue ID:** `ISS-RPC-001`
- **Title:** `send_birthday_greeting` Stored Procedure Does Not Validate Living Status
- **Severity:** `LOW`
- **Module / Area:** Notifications & Stored Procedures
- **Exact File(s) / DB Object(s):**
  - `supabase/migrations/20261107030000_fix_birthday_notification_delivery.sql`
- **Description:**  
  The `send_birthday_greeting()` RPC checks that the recipient person exists and that the caller possesses Mukhi or Admin authority. However, it does not check `IF v_recipient_person.date_of_death IS NOT NULL THEN RAISE EXCEPTION...`.  
  If a deceased member's profile is clicked in an administrative list, an automated congratulatory birthday notification could be delivered to their linked family members, causing emotional distress.
- **Reproduction Steps:**
  1. Identify a person record with `date_of_death` populated.
  2. Invoke `send_birthday_greeting(p_recipient_person_id := '<deceased_id>')` as an admin.
  3. The function returns successfully and logs a notification.
- **Impact:** Accidental inappropriate automated greeting for deceased individuals.
- **Recommended Solution:**  
  Add `IF v_recipient.date_of_death IS NOT NULL THEN RAISE EXCEPTION 'Cannot send birthday greeting to a deceased person record'; END IF;` to the RPC.

---

### ISS-PERF-001: Sequential N+1 Queries in Claim Person Modal
- **Issue ID:** `ISS-PERF-001`
- **Title:** Sequential Loop Fetching Family Head Information in `ClaimPersonModal.tsx`
- **Severity:** `LOW`
- **Module / Area:** Frontend Performance & UX
- **Exact File(s) / DB Object(s):**
  - `src/features/people/components/ClaimPersonModal.tsx` (lines 79–102)
- **Description:**  
  When the claim modal opens, it retrieves the person's family memberships. It then iterates through every membership row using an asynchronous `for...of` loop, executing individual Supabase queries to find the head of each family one by one.  
  While families typically have 1-2 memberships, users with multiple historical ties experience cumulative network latency before the modal details populate.
- **Reproduction Steps:**
  1. Open a person record affiliated with multiple branches.
  2. Click "Claim Census Record".
  3. Inspect Network tab: multiple sequential requests are dispatched to `/rest/v1/family_members`.
- **Impact:** Sub-optimal modal loading latency on slower mobile networks.
- **Recommended Solution:**  
  Batch the query using `supabase.from('family_members').select('...').in('family_id', familyIds).eq('is_head', true)` in a single call.

---

### ISS-UX-001: Generic Error Explanation When User Already Has Linked Identity
- **Issue ID:** `ISS-UX-001`
- **Title:** Claim Modal Shows Broad Composite Error When User Account Is Already Linked
- **Severity:** `LOW`
- **Module / Area:** User Experience & Error Messaging
- **Exact File(s) / DB Object(s):**
  - `src/features/people/components/ClaimPersonModal.tsx` (lines 140–165)
- **Description:**  
  When a user registers a new family, their account is automatically linked to the Family Head person record (`user_id = auth.uid()`).  
  If that user subsequently tries to claim an unclaimed profile in the directory, the RPC throws an exception that the user is already linked. The modal catches this and displays the combined error banner:  
  `"Unable to submit claim. This record may already be claimed, deceased, inactive, or your account may already be linked to a person record."`  
  Because the banner lists 4 different possibilities, users assume the target record is broken or already claimed, rather than realizing their own user account is already assigned.
- **Reproduction Steps:**
  1. Register a family with your user account as head.
  2. Find any unclaimed person in the census directory.
  3. Attempt to submit a claim for that person.
  4. Observe generic error message.
- **Impact:** User confusion leading to redundant support requests.
- **Recommended Solution:**  
  Inspect the RPC error message code/text and display specific messages: `"Your account is already linked to person profile [Name]. Each user account can only be linked to one person."`

---

## 19. Missing Features or Incomplete Implementations

1. **Family Tree SVG / PDF Export:** The tree view contains "Expand", "Collapse", and "Fit to Screen" buttons, but lacks a one-click "Export Family Tree as PDF / High-Res PNG" option for printing.
2. **Panchang Realtime Tithi Calculation:** The Panchang module relies on static/pre-calculated astronomical tables. Integration with an automated ephemeris algorithm would enable perpetual calendars.
3. **Mukhi Bulk SMS / WhatsApp Broadcast:** Notifications are currently delivered via in-app alerts and database outbox. There is no active SMS/WhatsApp gateway adapter configured for community elders who lack smartphones.

---

## 20. Recommended Improvements

1. **Implement Unified Community Role Constants:** Centralize role definitions across SQL and TypeScript into a single shared source of truth to avoid naming drift (`MUKHI` vs `COMMUNITY_MUKHI`).
2. **Strict View-Only Public Access:** Remove table-level `SELECT` on `persons` and `community_mukhis` from PostgreSQL grants, routing all public read traffic strictly through `community_persons` and `community_mukhis_directory`.
3. **Birthday Month/Day Privacy-Preserving View:** Create a secure view that computes `birth_day` and `birth_month` directly in PostgreSQL, omitting the year for adult community members unless explicitly marked public.
4. **Dynamic Announcements Sync:** Connect `CircularsView.tsx` to read directly from `public.announcements`.

---

## 21. Priority-Wise Action Plan

### Priority 1: Critical System Access & Security Fixes (Immediate)
- Fix Mukhi role mismatch in `src/constants/app.ts` by adding `'MUKHI'` to `ADMIN_ROLES` so Mukhis can review and approve claims.
- Revoke table-level `SELECT` on `public.persons` from `authenticated` and `anon` to re-establish the column-masking security barrier of `community_persons`.

### Priority 2: Data Isolation & Privacy Hardening
- Restrict direct `SELECT` on `public.community_mukhis` to prevent unauthenticated inspection of internal administrative tracking flags.
- Update `birthdays.service.ts` and database view to ensure community birthdays load accurately without exposing full dates of birth.

### Priority 3: Functional Content Wiring
- Connect `CircularsView.tsx` to the `announcements` database table so published circulars appear in real time.
- Add living-status verification (`date_of_death IS NULL`) into `send_birthday_greeting` RPC.

### Priority 4: Performance & Network Optimization
- Refactor `ClaimPersonModal.tsx` to batch family head queries into a single `.in('family_id', ...)` call instead of sequential N+1 requests.

### Priority 5: UX & Error Clarity
- Provide distinct, actionable error messaging in `ClaimPersonModal.tsx` when a user account is already linked to another person record.

### Priority 6: Advanced Tree Features
- Add PDF/Image export options for the interactive genealogical tree.

### Priority 7: Documentation & Schema Maintenance
- Update project architectural diagrams and schema dictionaries to reflect all 58 applied migrations.

---

## 22. Test Cases Not Executed and Reasons

1. **Playwright End-to-End Browser Testing (`npm run test:e2e`):**  
   *Reason:* Per project specification (`AGENTS.md` Section 3 and 14), Playwright E2E testing is strictly reserved for Phase 15. `@playwright/test` is intentionally not installed at this phase.
2. **Third-Party Realtime WhatsApp / SMS Gateway Dispatch:**  
   *Reason:* External notification gateways (Twilio, Gupshup) are not provisioned with live production API credentials in the local development environment.
3. **Concurrent Multi-User Stress Load Test (1,000+ concurrent requests):**  
   *Reason:* Requires dedicated distributed load testing infrastructure (k6/Artillery cluster) pointing to a dedicated performance staging instance.

---

## 23. Final Audit Summary + Master Issue Table

| Issue ID | Issue Title | Severity | Affected Module | Recommended Priority |
|---|---|---|---|---|
| **ISS-RBAC-001** | Mukhi Role String Mismatch (`'MUKHI'` vs `'COMMUNITY_MUKHI'`) | `HIGH` | Auth / RBAC Guards | **Priority 1** |
| **ISS-SEC-001** | Table-Level SELECT on `public.persons` Overrides PII Masking | `HIGH` | Security / Database | **Priority 1** |
| **ISS-SEC-002** | Internal Mukhi Admin Columns Exposed via PostgREST | `MEDIUM` | Mukhi Directory | **Priority 2** |
| **ISS-DATA-001** | Birthday Service Column Mismatch on `community_persons` | `MEDIUM` | Birthdays Module | **Priority 2** |
| **ISS-COMM-001** | Circulars View Disconnected from Database Announcements Table | `MEDIUM` | Circulars & Notices | **Priority 3** |
| **ISS-RPC-001** | Deceased Person Validation Missing in `send_birthday_greeting` | `LOW` | Notifications / RPC | **Priority 3** |
| **ISS-PERF-001** | Sequential N+1 Database Lookups in Claim Person Modal | `LOW` | Frontend UX / Perf | **Priority 4** |
| **ISS-UX-001** | Ambiguous Error Feedback When User Account Is Already Linked | `LOW` | Person Claiming UX | **Priority 5** |

---

**Audit Conclusion:**  
The KHATRI SARVANIYAT codebase is built to high standards of TypeScript rigor, component cleanliness, and database transactional integrity. All 203 automated test suites pass cleanly. Addressing the high-priority role synchronization (`ISS-RBAC-001`) and database column-level security restrictions (`ISS-SEC-001`) will ensure full operational readiness and robust data protection for the community.
