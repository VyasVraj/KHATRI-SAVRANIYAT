# Community Roots — Project Roadmap

This document tracks the phased delivery of the Community Roots platform. Each phase represents a cohesive unit of work with its own scope, deliverables, and Definition of Done.

**Phase transitions require explicit human authorization.** Agents must not self-authorize moving to the next phase.

---

## Phase Summary

| Phase | Name | Status |
|---|---|---|
| 0 | Engineering Foundation | ✅ Complete |
| 1 | Architecture & Database Foundation | ✅ Complete |
| 2 | Authentication & Identity | ✅ Complete |
| 3 | Person / Family Foundation | ✅ Complete |
| 4 | Family Membership & Relationships | ✅ Complete |
| 5 | Family Tree | ✅ Complete |
| 6 | Discovery | ✅ Complete |
| 7 | Connections | ✅ Complete |
| 8 | Claim / Join / Invitation | ✅ Complete |
| 9 | Verification / Data Quality | ✅ Complete |
| 10 | Community Features | ✅ Complete |
| 11 | Media / Family History | ✅ Complete |
| 12 | Notifications | ✅ Complete |
| 13 | Admin | ✅ Complete |
| 14 | Import / Data Migration | ✅ Complete |
| 15 | Hardening | ✅ Complete |
| 16 | Load / Production Readiness | ✅ Complete |

---

## Phase Detail

---

### Phase 0 — Engineering Foundation ✅

**Status**: Complete — This is the current baseline.

**What is built**:
- Project scaffolded with Vite + React + TypeScript (strict mode).
- Tailwind CSS configured with CSS custom properties.
- shadcn/ui initialized with base component library.
- ESLint and Prettier configured.
- Vitest and Testing Library configured for unit testing.
- Playwright configured for end-to-end testing.
- `tsconfig.json` with path aliases (`@/` → `src/`).
- `.env.example` with documented environment variable template.
- `AGENTS.md`, `README.md`, `ROADMAP.md`, and `docs/` documentation written.
- Directory structure established (`src/app/`, `src/features/`, `src/components/`, etc.).
- Supabase CLI configured (`supabase/config.toml`).
- Git repository initialized with `.gitignore` covering `node_modules/`, `dist/`, `.env`.

---

### Phase 1 — Architecture & Database Foundation ✅

**Status**: Complete — Successfully deployed to project `community-family-platform` (`ixhvsprwjalgcyievsrg`) and verified (2026-10-02)

**What is built**:
- Supabase project linked and configured.
- Supabase client singleton (`src/lib/supabase.ts`) with `Database` generic type.
- TanStack Query client configured (`src/lib/query-client.ts`).
- React Router configured with `createBrowserRouter` (`src/app/router.tsx`).
- Application providers wrapper (`src/app/providers.tsx`).
- Initial database schema migrations:
  - `extensions` migration (uuid-ossp, pgcrypto, unaccent).
  - `persons` table with core fields, RLS enabled.
  - `user_profiles` table linking `auth.users` to `persons`.
  - `families` table with core fields, RLS enabled.
  - Core enums: privacy levels, relationship types, verification status.
- TypeScript types generated from schema (`src/types/database.types.ts`).
- Base RLS policies for all Phase 1 tables (positive + negative tests).
- App shell layout (navigation skeleton, route placeholders).

---

### Phase 2 — Authentication & Identity ✅

**Status**: Complete (All 4 Subtasks Complete & Validated, 2026-10-02)

**Completed Subtasks**:
- **Subtask 1 (Baseline & Remote Type Generation)**:
  - Supabase Project ref: `community-family-platform` (`ixhvsprwjalgcyievsrg`).
  - Environment & Key Verification: Verified `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` against live auth service; `.env` strictly Git-ignored; no PAT/access token persisted in project repository, source code, .env, migrations, documentation, or Git history; no credentials exposed in project logs or application output; CLI authentication session stored in local Supabase CLI configuration outside project repository; PAT scoped to project, Database → Read only, with 7-day expiration.
  - Remote Codegen: Generated `src/types/database.types.ts` (543 lines, UTF-8 without BOM) using `npx supabase gen types typescript --project-id ixhvsprwjalgcyievsrg --schema public`.
  - Client Integration: `src/lib/supabase.ts` typed with `createClient<Database>` importing from `@/types/database.types`.
- **Subtask 2 (Authentication & Identity Implementation & Testing)**:
  - Auth Service & Schemas: `auth.service.ts` (sign up, sign in, sign out, password reset, exchange code, session restore) and `auth.schemas.ts` (Zod schemas with complexity and sanitization rules).
  - Profile Service & Schemas: `profile.service.ts` (get and update `public.profiles` preserving `PERSON != USER` boundary).
  - Context & Hooks: `AuthContext.ts` and `AuthProvider.tsx` managing active session and profile synchronization via Supabase `onAuthStateChange`.
  - UX Route Guards: `ProtectedRoute.tsx` and `LoadingScreen.tsx` for protected members and guest-only routes.
  - UI Pages & Navigation: `SignInPage.tsx`, `SignUpPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `AuthCallbackPage.tsx`, `ProfilePage.tsx`, and auth-aware `AppHeader.tsx`.
  - Testing Expansion: 4 new unit test suites (`auth.schemas.test.ts`, `auth.service.test.ts`, `profile.service.test.ts`, `ProtectedRoute.test.tsx`), expanding test coverage to **79 passing tests** across 7 suites.
- **Subtask 3 (Supabase Schema Integration Validation)**:
  - Fixed `src/types/index.ts` barrel export: `Database` now re-exports from `./database.types` (canonical generated file).
  - Created `tests/integration/schema-integration.test.ts`: 66 static type-contract tests (5 tables, 8 enums, 4 DB functions, typed query patterns, typed mutations, RLS specifications).
  - Created `tests/integration/remote-connectivity.test.ts`: 19 real HTTPS integration tests against the deployed project (table existence confirmed via PostgreSQL error codes, anon access denial confirmed, DB function RPC behavior confirmed). CI-safe (skip when real credentials absent).
  - **Security discovery**: Deployed project revokes table-level SELECT from `anon` at PostgreSQL privilege layer (stricter than RLS-only). Unauthenticated queries return `42501` (permission denied), not empty results.
  - Test count after Subtask 3: **164 passing** across 9 suites.
- **Subtask 4 (Final Phase 2 Security Audit, Documentation Correction & Phase-Gating Report)**:
  - Security audit of all Phase 2 deliverables against threat model, AGENTS.md security rules, and SECURITY.md.
  - Zero security defects found in authentication, authorization, identity boundary, credential handling, or code patterns.
  - Documentation corrections applied (see below).
  - Final validation: 164/164 tests passing, 0 type-check errors, 0 lint errors, build passing.

**E2E / Playwright Deferral (planned, not a defect)**:
- The ROADMAP originally listed "E2E user journey validation (where configured)" as Phase 2 remaining work.
- `docs/TESTING.md` explicitly assigns Playwright setup to Phase 15.
- `@playwright/test` is not installed; no `playwright.config.ts` exists; `npm run test:e2e` does not exist in `package.json`.
- The ROADMAP qualifier "where configured" is controlling and not currently satisfied.
- The AGENTS.md Definition of Done qualifies E2E as "where applicable" — not applicable in Phase 2.
- Browser-based E2E (auth flows, person creation, family creation, tree view) is **formally deferred to Phase 15**.
- This is a planned architectural decision, not an unrecognised omission.
- The 19 real remote HTTP integration tests in `remote-connectivity.test.ts` provide the closest available substitute.

**Documentation Corrections Applied in Subtask 4**:
- `AGENTS.md` Section 3: `npm run test:e2e` annotated as Phase 15 only, not currently configured.
- `ROADMAP.md` Phase 2 section: Updated to record all 4 subtasks and document E2E deferral.
- `PROJECT_STATUS.md`: Subtask 4 audit record added.

**Final Validation (Subtask 4)**:
- `npm run type-check`: 0 errors (PASS)
- `npm run lint`: 0 errors, 0 warnings (PASS)
- `npm run test`: 164/164 passing (PASS)
- `npm run build`: passing (PASS)

---

### Phase 3 — Person / Family Foundation ✅

**Status**: Complete

**What is built**:
- Subtask 1 — Person Service Layer, Schemas & Unit Tests (`src/features/people/`)
- Subtask 2 — Family Service Layer, Schemas & Unit Tests (`src/features/families/`)
- Subtask 3 — Person UI Layer — Hooks, Components & Pages (`/people/*`)
- Subtask 4 — Family UI Layer — Hooks, Components & Pages (`/families/*`)

**Deliverables**:
- `PersonCard` and `PersonDetail` components.
- Person profile create / read / update flows (`/people`, `/people/new`, `/people/:id`, `/people/:id/edit`).
- Privacy level selector on person records (`profile_privacy`, `contact_privacy`, `dob_privacy`).
- `persons` service layer (`src/features/people/services/people.service.ts`).
- Family record create / read / update flows (`/families`, `/families/new`, `/families/:id`, `/families/:id/edit`).
- `FamilyCard` and `FamilyDetail` components.
- `families` service layer (`src/features/families/services/families.service.ts`).
- Family privacy controls (`profile_privacy`, `members_privacy`).
- Shared `PrivacyLevelSelect` component (`src/components/forms/`).
- Person feature domain (`src/features/people/`).
- Family feature domain (`src/features/families/`).
- Full unit test coverage for service functions, components, and schemas (357 tests total).
- RLS static positive and negative specification tests for persons and families (50 tests).
- Legacy singular stub `src/features/family/pages/FamilyPage.tsx` and `/family` route preserved untouched.
- Zero `family_members` queries or mutations (Phase 4 boundary strictly preserved).

**Final Validation (Phase 3)**:
- `npm run type-check`: 0 errors (PASS)
- `npm run lint`: 0 errors, 0 warnings (PASS)
- `npm run test`: 357/357 passing across 16 test files (PASS)
- `npm run build`: passing (PASS)
- Security scan: clean (0 violations)

---

### Phase 4 — Family Membership & Relationships ✅

**Status**: Complete

**What is built**:
- **Subtask 1 — Family Members Service Layer, Schemas & Unit Tests (`src/features/family-members/`) ✅**:
  - Full CRUD and head-transfer service methods for `public.family_members` (`addFamilyMember`, `listFamilyMembers`, `getFamilyMember`, `updateFamilyMember`, `removeFamilyMember`, `transferFamilyHead`).
  - Zod validation schemas (`familyRoleEnum`, `addFamilyMemberSchema`, `updateFamilyMemberSchema`) protecting system fields.
  - Role constants (`FAMILY_ROLES`, `FAMILY_ROLE_LABELS`) in `src/constants/app.ts`.
  - Comprehensive unit test suite (36 tests) in `tests/unit/family-members.service.test.ts`.
  - Complete static RLS specification test suite (28 tests) covering all 9 deployed policies in `tests/security/rls-family-members.test.ts`.
  - Feature README (`src/features/family-members/README.md`) and barrel exports.
- **Subtask 2 — Family Members Hooks & UI (`src/features/family-members/`) ✅**:
  - Query & Mutation hooks: `useFamilyMembers`, `useFamilyMember`, `useFamilyMemberMutations` (`useAddFamilyMember`, `useUpdateFamilyMember`, `useRemoveFamilyMember`, `useTransferFamilyHead`) with TanStack Query v5 cache management.
  - Interactive UI components: `MemberCard`, `MemberList`, `AddMemberModal`, `EditMemberModal`, `TransferHeadModal`.
  - Integration: Live roster embedded into `FamilyDetail` and `FamilyDetailPage`, replacing the Phase 3 placeholder notice.
  - Security & Permission derivation: `canManageMembers = isCreator || isModerator` derived cleanly from `useAuthContext()` without bypassing RLS.
  - Person picker using `usePersonList({ limit: 50 })` via accessible native `<select>`.
  - Default soft-removal (`removeFamilyMember({ hardDelete: false })`) preserving genealogical lineage.
  - Client-orchestrated head transfer with full transparency on non-atomic rollback limitations.
  - 5 unit test suites (32 tests) in `tests/unit/` (`MemberCard.test.tsx`, `MemberList.test.tsx`, `AddMemberModal.test.tsx`, `EditMemberModal.test.tsx`, `TransferHeadModal.test.tsx`).
- **Subtask 3 — Multi-Step Family Creation Wizard (`src/features/families/`) ✅**:
  - `FamilyCreationWizard.tsx`: 4-step guided creation flow (Step 1: Family Identity & Details, Step 2: Privacy Controls, Step 3: Optional Initial Member Staging, Step 4: Review & Create).
  - Integration: `FamilyCreatePage.tsx` at `/families/new` renders the wizard.
  - Member Staging: Optional staging of census persons from `usePersonList({ limit: 50 })` with duplicate prevention and explicit head-conflict replacement dialog.
  - Orchestration & Partial Failure Recovery: Creates family record first, then sequentially attaches staged members. If a member attachment fails, processing halts immediately, preserves the created family, and renders a partial-success recovery screen guiding user to `FamilyDetail`.
  - Security & Domain Boundaries: `PERSON != USER` strictly preserved; creator is not auto-converted to a Person; protected fields remain server/DB controlled; zero transactional RPC or RLS bypass.
  - Unit test suite (`tests/unit/FamilyCreationWizard.test.tsx`): 9 tests covering navigation, validation, member staging, head conflict, sequential orchestration, and security boundaries.
- **Subtask 4 — Person-Family Membership Integration, RLS Audit & Phase 4 Completion (`src/features/family-members/`) ✅**:
  - Reverse lookup service method: `listPersonFamilies(personId, options?)` joining family summary details, defaulting to active memberships (`left_at IS NULL`) with former membership inclusion option.
  - TanStack Query hook: `usePersonFamilies(personId, options?)`.
  - UI Component: `PersonFamiliesList` mounted on `PersonDetailPage` at `/people/:id`.
  - Testing: 5 new service unit tests in `tests/unit/family-members.service.test.ts`, 7 component unit tests in `tests/unit/PersonFamiliesList.test.tsx`, and 7 lifecycle integration tests in `tests/integration/phase4-lifecycle.integration.test.ts`. Total test suite expanded to **488 passing tests** across 27 test files.
  - Checkpoint commit: `49f0fc5`.
- **Foundation Authenticated Table Privilege Hotfix & Documentation ✅**:
  - Migration `20261003100000_grant_authenticated_table_privileges.sql` applied table-level privileges (SELECT, INSERT, UPDATE, DELETE) to `authenticated` role on `family_members` and application tables. Tested via `tests/security/migration-privileges.test.ts` (checkpoint `e1de426`).
  - Privilege documentation updated in `docs/DATABASE.md` and `docs/SECURITY.md` (checkpoint `65f0c38`).
  - `anon` retains zero privileges on core application tables.

**Functional Capabilities Delivered**:
- Family creation (standard edit form and 4-step wizard).
- Family member addition with role assignment.
- Family member listing (active roster and departed section).
- Family member editing (role, head status).
- Family member departure / soft-exit (`left_at` timestamp).
- Former membership lookup.
- Family head designation with single-active-head constraint.
- Explicit head transfer with rollback disclosure.
- Person → Family reverse membership lookup on `/people/:id`.
- Family → Member roster on `/families/:id`.
- Privacy-aware family membership visibility (`family.profile_privacy IN ('COMMUNITY', 'PUBLIC')`).
- Creator / moderator authorization (`canManageMembers`).
- RLS-protected membership operations.
- `PERSON != USER` domain boundary strictly maintained.

**Database & Security Model Reality**:
- `family_members` schema was established in Phase 1 canonical migration; no schema changes were required for Phase 4.
- Authenticated table privileges explicitly granted via `20261003100000_grant_authenticated_table_privileges.sql`.
- Deployed DB RLS evaluates `family.profile_privacy` for community visibility (does NOT evaluate `members_privacy`).
- Moderator authorization is authoritative via `is_community_moderator()` (`COMMUNITY_MODERATOR`, `ADMIN`, `SUPER_ADMIN`).

**Final Validation (Phase 4)**:
- `npm run type-check`: 0 errors (PASS)
- `npm run lint`: 0 errors, 0 warnings (PASS)
- `npm run test`: 488/488 passing across 27 test files (PASS)
- `npm run build`: passing (PASS)
- `git diff --check`: clean (PASS)
- Security scan: clean (0 matches for `service_role`, `localStorage`, `sessionStorage`, `console.log`, `dangerouslySetInnerHTML`)

**Known Limitations (Non-Blocking / Deferred)**:
1. Head transfer remains client-orchestrated and non-atomic (sequential demote/promote with programmatic rollback).
2. Person selection in modals/wizard is currently capped to 50 persons (full-text search deferred to Phase 6 Discovery).
3. Browser E2E / Playwright testing deferred to Phase 15.
4. Live authenticated multi-user RLS testing deferred to Phase 15.
5. Atomic database-level head transfer RPC deferred to Phase 15.

**Future Phase Boundaries (NOT Implemented in Phase 4)**:
- **Phase 5 (Family Tree / Interpersonal Relationships)**: `relationships` table, parent/child/spouse/sibling edges, relationship RLS, React Flow genealogy graph — **NOT IMPLEMENTED in Phase 4**.
- **Phase 8 (Claim / Join / Invitation)**: Claims, invitations, invitation tokens, self-service person claiming, identity linking — **NOT IMPLEMENTED in Phase 4**.

---

### Phase 5 — Family Tree / Interpersonal Relationships ✅

**Status**: Complete (Formally Closed: 2026-10-05)

**Subtask Breakdown**:
- **Subtask 1 — Relationships Schema, Migration, Privileges & Service Layer**: ✅ COMPLETE
- **Subtask 2 — Interpersonal Relationships UI & Person Detail Integration**: ✅ COMPLETE
- **Subtask 3 — Tree Layout Engine & React Flow Graph Canvas**: ✅ COMPLETE
- **Subtask 4 — Full Family Tree Page & Phase Integration**: ✅ COMPLETE

**Architectural Lock & ADR**:
Locked via [`docs/adr/20261004-canonical-database-legacy-android-compatibility.md`](docs/adr/20261004-canonical-database-legacy-android-compatibility.md) following analysis of production artifacts (`khatrisetu-families-2026-10-01.xlsx` and 49-screen Android app capture):
- **Normalized Canonical Graph**: Relationships are relational foreign-key edges (`PARENT`, `SPOUSE`, `SIBLING`), NOT denormalized text pointers.
- **Minimal MVP Model**: Types are `PARENT`, `SPOUSE`, `SIBLING`. No separate `relationship_status` enum; soft-delete via `deleted_at`; verification via existing `verification_status` architecture; marriage/divorce/dispute workflows deferred.
- **Directional Invariants**: `PARENT` stored parent-to-child; inverse `child_of` is dynamically derived.
- **Symmetric Invariants**: `SPOUSE` stored with `CHECK (person_a_id < person_b_id)` to prevent dual opposing rows.
- **Sibling Model**:
  - Explicit sibling relationships are canonical relationships when asserted directly (`person_a_id < person_b_id`).
  - Do not require known parents for an explicit sibling relationship.
  - Shared-parent sibling relationships may be derived later.
  - Do not persist duplicate derived sibling rows.
- **Dual-Endpoint Authorization**: Relationship visibility must enforce the same effective authorization semantics as direct person visibility for BOTH endpoints. Existence of a matching persons.id is not sufficient.
- **Domain Independence**: `FAMILY != HOUSEHOLD` and `PERSON != USER` strictly preserved.
- **External Compatibility**: Defined as a future compatibility domain (`external_references`); implementation is deferred to Phase 14. No such table currently exists.

**Subtask 1 Deliverables (`src/features/relationships/`, `supabase/migrations/`) ✅**:
- **Canonical Schema & Migration**: `supabase/migrations/20261004150000_create_relationships.sql` creating `public.relationships` and `public.relationship_type` enum (`PARENT`, `SPOUSE`, `SIBLING`).
- **Data Integrity & Constraints**:
  - `relationships_no_self_reference`: `CHECK (person_a_id <> person_b_id)`.
  - `relationships_symmetric_ordering`: `CHECK (relationship_type = 'PARENT' OR (person_a_id < person_b_id))`.
  - Foreign keys: `REFERENCES public.persons(id) ON DELETE RESTRICT`.
  - Partial unique active index: `idx_relationships_active_unique` on `(person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL`.
- **Two-Gate Access Control**:
  - **Gate 1 (SQL Privileges)**: All privileges revoked from `PUBLIC`, `anon`, and `authenticated`. Selective operational grant: `GRANT SELECT, INSERT, UPDATE ON TABLE public.relationships TO authenticated;`. Strictly zero `DELETE`, `TRUNCATE`, `REFERENCES`, or `TRIGGER` privileges granted to `authenticated`.
  - **Gate 2 (RLS & Triggers)**:
    - `relationships_select_dual_endpoint`: Dual-endpoint person privacy rule. Relationship edge is visible only if caller can view BOTH endpoint persons under active `public.persons` RLS.
    - `relationships_select_admin`: Community moderators can view all relationships (including soft-deleted).
    - `relationships_insert_authenticated`: Authenticated users can insert relationships between visible persons (`created_by = auth.uid()`).
    - `relationships_insert_admin`: Community moderators can insert with verified provenance (`public.is_community_moderator() AND created_by = auth.uid()`).
    - `relationships_update_creator`: Record creator can update notes on active rows (`auth.uid() = created_by AND deleted_at IS NULL`).
    - `relationships_soft_delete_creator`: Dedicated creator soft-delete policy (`deleted_at IS NOT NULL` in `WITH CHECK`).
    - `relationships_update_admin`: Community moderators can update any relationship.
    - `relationships_delete_deny`: Physical hard DELETE strictly denied across all roles (`USING (FALSE)`).
    - `handle_relationship_update_guard()`: BEFORE UPDATE trigger protecting identity fields (`id`, `person_a_id`, `person_b_id`, `relationship_type`, `created_by`, `created_at`), restricting `verification_status` mutations to moderators, and isolating soft-deletion.
- **Service Layer & Validation**:
  - `src/features/relationships/services/relationships.service.ts`: Full service layer with CRUD, cycle detection (preventing ancestry loops up to 10 generations), and perspective-based role projection (`parents`, `children`, `spouses`, `siblings`).
  - `src/features/relationships/schemas/relationships.schema.ts`: Zod validation schemas enforcing protected field exclusion and canonical ordering.
  - `src/features/relationships/types.ts`: Domain types aligned with database contract.
  - `src/features/relationships/README.md`: Feature architecture documentation.
- **Remote Deployment & Codegen**:
  - Deployed to Supabase project `community-family-platform` (`ixhvsprwjalgcyievsrg`) via SQL Editor.
  - Remote schema, RLS policies, triggers, constraints, and privilege hardening verified.
  - Official TypeScript database types regenerated from deployed remote schema into `src/types/database.types.ts`.
- **Testing**:
  - Unit tests: 36 tests in `tests/unit/relationships.service.test.ts`.
  - Security tests: 64 tests in `tests/security/rls-relationships.test.ts` covering full RLS policy evaluation and Gate 1 privilege assertions.
  - Total test suite expanded to **588 passing tests** across 29 test files.

**Final Validation (Subtask 1)**:
- `npm run type-check`: 0 errors (PASS)
- `npm run lint`: 0 errors, 0 warnings (PASS)
- `npm run test`: 588/588 passing across 29 test files (PASS)
- `npm run build`: production bundle builds cleanly (PASS)
- `git diff --check`: clean (PASS)
- Security scan: clean (zero `service_role`, zero secrets, zero `localStorage`, zero `console.log`, zero `dangerouslySetInnerHTML`)
- Remote schema verification: PASS
- Database type generation: PASS

**Subtask 2 Deliverables (`src/features/relationships/components/`, `src/features/relationships/hooks/`) ✅**:
- **Components**: `PersonRelationshipsList`, `RelationshipCard`, `AddRelationshipModal`, `EditRelationshipModal`, `RemoveRelationshipDialog`.
- **Hooks**: `usePersonRelationships` (gated to authenticated sessions), `useRelationshipMutations` (`useAddRelationship`, `useUpdateRelationship`, `useSoftDeleteRelationship`, `mapRoleToCanonicalRelationship`).
- **Integration**: `PersonRelationshipsList` mounted on `PersonDetailPage` at `/people/:id`.
- **Discovery Corrections Applied**:
  1. Correction 1: Zero guest/anon relationship access (unauthenticated sessions render `null` with zero DB queries).
  2. Correction 2: Zero synthetic placeholders (`[Private Person]`) for unpermitted edges. Neutral fallback `"Unavailable Record"` for redacted metadata.
- **Validation**: 6 new unit test suites, 619 total tests passing.

**Subtask 3 Deliverables (`src/features/tree/`) ✅ (Completed: 2026-10-05)**:
- **Bounded Family-Tree Graph Engine**:
  - `TreeGraph` domain model (`TreeNode`, `TreeEdge`, generation tiers) completely decoupled from presentation coordinates.
  - Bounded BFS traversal centered on a root `public.persons` individual.
  - Generation range strictly clamped to `-2` (grandparents) through `+2` (grandchildren).
  - One-hop spouse and sibling lateral traversal (`isLateral: true` prevents recursive chain expansion).
  - Hard safety limits: `MAX_TREE_NODES = 100` and `MAX_TREE_EDGES = 150` strictly enforced with bounding warning indication.
  - Cycle detection and duplicate edge protection.
  - Deterministic generation-tiered layout engine (`computeTreeLayout`) using pure TypeScript coordinate calculation ($Y = \text{gen} \times 220\text{px}$; symmetrical horizontal centering).
- **React Flow Visualization Foundation**:
  - `FamilyTreeCanvas`: Responsive canvas container with `ReactFlowProvider`, loading, error, empty, and bounded traversal notices.
  - `PersonNode`: Custom compact $220\times90\text{px}$ node card displaying census summary, lifespan, root person highlight, roles, and link to `/people/:id`.
  - `RelationshipEdge`: Custom SVG edge rendering directional arrow for `PARENT`, dashed stroke for `SPOUSE`, and dotted stroke for `SIBLING`.
  - `TreeControls`: Canvas navigation bar (Zoom In, Zoom Out, Fit View, Recenter on Root).
  - `TreeLegend`: Collapsible visual key explaining edge styles and root node indicator.
- **Architectural & Security Invariants**:
  - Authenticated-only tree access (Gate 1 privilege alignment; unauthenticated sessions render a sign-in prompt with zero queries).
  - RLS remains authoritative (Gate 2 dual-endpoint filtering).
  - Zero synthetic private placeholders manufactured (`[Private Person]`, etc.); edges terminate naturally at visible boundaries.
  - Zero `public.family_members` dependency (genealogy strictly decoupled from family membership).
  - Zero database migrations, schema alterations, RLS changes, grants, triggers, or RPCs.
  - Zero new dependencies installed (built with existing `reactflow@11.11.4`, `lucide-react`, Tailwind CSS).
- **Subtask 3 Audit & Testing**:
  - Final read-only audit: 28 / 28 checks PASS.
  - Unit tests: 27 new tests across 4 test suites; total suite: 649 / 649 tests passing across 40 test files.
  - TypeScript: 0 errors; ESLint: 0 errors, 0 warnings; Production build: clean.
- **Scope Boundary Note**: Full dedicated `/tree` page is NOT complete (assigned to Subtask 4). Phase 5 remains IN PROGRESS.

**Subtask 4 Deliverables (`src/features/tree/pages/`, `src/app/router.tsx`, `src/features/people/pages/`) ✅ (Completed: 2026-10-05)**:
- **Dedicated Family Tree Page**:
  - `FamilyTreePage.tsx` mounted at `/people/:personId/tree` inside `ProtectedRoute`.
  - Validates personId UUID format (RFC 4122) with friendly error fallback.
  - Contextual header displaying root individual metadata (full name, birth/death years, gender, status badge) with zero sensitive or internal identity leaks.
  - Back navigation button returning to `/people/:personId` and link to census directory.
  - Seamlessly embeds `<FamilyTreeCanvas rootPersonId={personId} />` with full pan/zoom, recenter, and legend support.
- **Person Detail Navigation Integration**:
  - `PersonDetailPage.tsx` integrates "Family tree" action button navigating directly to `/people/:personId/tree`.
  - PersonNode in tree graph links back to `/people/:id`.
- **Authorization Consistency Check**:
  - Database function `public.is_community_moderator()` (`SUPER_ADMIN`, `ADMIN`, `COMMUNITY_MODERATOR`) verified 100% consistent with frontend `ADMIN_ROLES`.
- **Zero Database Changes**:
  - Zero migrations, zero schema alterations, zero RLS changes, zero privilege changes, zero `family_members` queries.
- **Unit Testing**:
  - Comprehensive unit test suite in `tests/unit/FamilyTreePage.test.tsx` (7 tests). Total test suite expanded to 656 passing tests across 41 files.

**Final Phase 5 Validation & Audit Record (2026-10-05)**:
- Tests: **656/656 PASS** across 41 test files
- TypeScript: **PASS, 0 errors** (`npm run type-check`)
- ESLint: **PASS, 0 errors, 0 warnings** (`npm run lint`)
- Build: **PASS**, clean Vite production build (`npm run build`)
- Git diff: **PASS, 0 whitespace errors** (`git diff --check`)
- Security scan: **PASS** (clean: 0 unauthorized matches for `service_role`, `console.log`, `localStorage`, `sessionStorage`, `dangerouslySetInnerHTML`)
- Final read-only audit: **28/28 checks PASS**
- Closure readiness: **READY FOR CLOSURE**
- Phase 5 is formally **CLOSED**.

**Architectural Guarantees Established**:
1. `PERSON != USER`: Relationships connect census persons, not user accounts.
2. `FAMILY MEMBERSHIP != GENEALOGICAL RELATIONSHIP`: Interpersonal relationships are independent from family group rosters.
3. `FAMILY != HOUSEHOLD`: Census grouping decoupled from genealogical lineage.
4. Canonical relationship types: Strictly `PARENT`, `SPOUSE`, `SIBLING`.
5. `PARENT` is directional: Stored parent &rarr; child; reciprocal `CHILD` rows are prohibited.
6. `SPOUSE` and `SIBLING` are symmetric: Enforces canonical lexical ordering (`person_a_id < person_b_id`).
7. No `CHILD` relationship type exists in database or schema.
8. Soft deletion only: Physical hard DELETE denied at Gate 1 and Gate 2; managed via `deleted_at`.
9. `ON DELETE RESTRICT` protects relationship history and prevents cascade loss.
10. Dual-endpoint visibility: Caller must have visibility into BOTH participants under active `persons` RLS.
11. No synthetic placeholders: Zero `[Private Person]` or `[Hidden Relative]` nodes manufactured.
12. Missing intermediary individuals are never invented.
13. Bounded tree traversal: Generational depth clamped to $[-2, +2]$; lateral spouse/sibling traversal strictly 1-hop; hard limits `MAX_TREE_NODES = 100`, `MAX_TREE_EDGES = 150`.
14. React Flow is presentation only; domain graph (`TreeGraph`) remains fully independent.
15. Tree layout is pure TypeScript, deterministic, and dependency-free (no Dagre/ELK).
16. `public.family_members` is strictly NOT used for genealogical tree traversal.
17. Scope discipline: Phase 5 does not introduce claims, invitations, genealogy inference, household modeling, search/pagination, imports, or future-phase functionality.

**Next Available Phase**:
- **Phase 6 (Discovery)**: **NOT AUTHORIZED / NOT STARTED**.

**Legacy Android Feature Parity Mapping (Non-Bloat Scope Partition)**:
- Mukhi Directory & Advanced Search Filters: Assigned to **Phase 6 (Discovery)**.
- Family Invite Links & Census Seat Claims: Assigned to **Phase 8 (Claim / Join / Invitation)**.
- Verification Badges: Assigned to **Phase 9 (Verification / Data Quality)**.
- Panchang, Sindhi Calendar, Birthdays, Committees, Circulars: Assigned to **Phase 10 (Community Features)**.
- Historical Photos & Family Media: Assigned to **Phase 11 (Media)**.
- Push Notifications & Alerts: Assigned to **Phase 12 (Notifications)**.
- Legacy Excel & Android Import Staging: Assigned to **Phase 14 (Import / Data Migration)**.

---

### Phase 6 — Discovery ✅ (Complete)

**Status**: Complete (All Subtasks 1–4 Complete & Closed)

**Architectural Lock & ADR**:
Locked via [`docs/adr/20261005-community-discovery-and-search-architecture.md`](docs/adr/20261005-community-discovery-and-search-architecture.md) following analysis of legacy production artifacts (`khatrisetu-families-2026-10-01.xlsx` and 49-page Android app capture):
- **Database Search Engine**: In-database PostgreSQL full-text search (`tsvector`, `unaccent`) and trigram fuzzy matching (`pg_trgm`). Zero external search cluster dependencies.
- **Deployed Index Utilization**: Leverages existing GIN and B-tree indexes from Phase 1: `idx_persons_name_fts`, `idx_persons_first_name_trgm`, `idx_persons_last_name_trgm`, `idx_persons_name_lower`, `idx_persons_gotra`, `idx_persons_nukh`, `idx_persons_status`, `idx_persons_privacy`, `idx_persons_created_at`, `idx_families_fts`, `idx_families_name_trgm`, `idx_families_name_lower`, `idx_families_gotra`, `idx_families_nukh`, `idx_families_kul`, `idx_families_location`, `idx_families_status`, `idx_families_privacy`. **Zero database migrations or schema alterations required**.
- **Privacy Model**: Two-gate access control (Gate 1: `authenticated` role required; Gate 2: PostgreSQL RLS filters out `PRIVATE` and `FAMILY` profiles). Sensitive contact details (`phone`, `email_contact`) and internal IDs (`user_id`, `created_by`, timestamps) strictly excluded from search card payloads.
- **Scalability for High Concurrency (~9,000 active users)**: Deterministic ordered pagination (`ORDER BY last_name ASC, first_name ASC, id ASC`) capped at `MAX_PAGE_SIZE = 50`, Fetch N+1 (`hasNextPage`) to avoid expensive table counts, 350ms input debouncing, and 5-minute TanStack Query caching (`staleTime: 5m`).
- **Domain Boundaries Preserved**:
  - `PERSON != USER`: Directory exposes census individuals; user credentials are never queried.
  - `FAMILY != HOUSEHOLD`: Family discovery queries genealogical units, not physical residences.
  - `FAMILY MEMBERSHIP != GENEALOGY`: Family cards link to rosters; person cards link to profiles/trees.

**Subtask Implementation Plan**:
- **Subtask 1 — Discovery Service Layer, Query Architecture, Zod Filter Schemas & Unit Tests ✅**:
  - `discovery.service.ts`: Query functions for persons and families with Fetch N+1 pagination and directory projection sanitization.
  - `discovery.schemas.ts`: Strict Zod validation schemas.
  - Unit tests: 52 tests passing in `tests/unit/discovery.*`.
- **Subtask 2 — People Directory UI & Multi-Criteria Filtering (`/discover` People Tab) ✅ (Formally Closed: 2026-10-05)**:
  - `PeopleDirectory`: 300ms debounced search, lineage/origin/status filters, active filter badge chips, Fetch N+1 pagination, loading/error/empty states.
  - `PersonDirectoryCard`: Privacy-safe person card with navigation to `/people/:id`.
  - 4 test suites added (28 tests); 736/736 total tests passing; type-check, lint, build all green.
  - Read-only audit passed with 0 blocking and 0 non-blocking findings. Formally closed.
- **Subtask 3 — Family Directory UI & Lineage/Location Filtering (`/discover` Families Tab) ✅ (Formally Closed: 2026-10-05)**:
  - `FamilyDirectory`: Family search with 300ms debounce, location filters (`city`, `state`, `country`), lineage filters (`gotra`, `nukh`, `kul`), lifecycle and verification filters.
  - `FamilyDirectoryCard`: Privacy-safe family card with navigation to `/families/:id`.
  - `FamilyFilters` & `FamilyFilterChips`: Collapsible multi-criteria filter panel with active tag removal and "Clear all" action.
  - `useFamilyDirectory`: TanStack Query hook with `['family-directory', filters, page, pageSize]` and authenticated-only gate.
  - Tabbed integration on `DiscoverPage` mounted at `/discover`.
  - 4 test suites added (18 tests); 754/754 total tests passing across 51 test files; type-check, lint, build, security scan all green.
  - Read-only audit passed with 0 blocking and 0 non-blocking findings. Formally closed.
- **Subtask 4 — Discovery Integration, Mobile Optimization, Lineage/Location Polish & Phase 6 Final Verification ✅ (Formally Closed: 2026-10-05)**:
  - Unified DiscoverPage layout with shared title, context description, and accessible tab switcher.
  - Mobile, tablet, and desktop responsive validation with zero horizontal overflow.
  - Lineage and location badge presentation polished with graceful omission when attributes are null.
  - Tested truncation and text clamping resilience on lengthy family/person descriptions.
  - 1 new integration test suite added (9 tests) in `tests/unit/discovery.integration.test.tsx`.
  - Total test suite expanded to **763 / 763 passing tests** across 52 test files.
  - Type-check, lint, production build, diff check, security scan all green. Phase 6 is formally **CLOSED**.

**Legacy Feature Scope Partitioning**:
- Included in Phase 6: Free-text search (Screen 03), Surname filters (Screen 16), Family Location filters (Screen 17), Birth Place filter (Screen 17), Gotra/Nukh/Kul filters (Screen 18), Living/Deceased filter (Screen 19), Verification filter (Screen 20).
- Out of Scope for Phase 6:
  - Mukhi Leadership Directory & Committee Zones (Screens 32–35) &rarr; **Phase 10 (Community Features)**
  - Account Claiming (Screens 04, 21–24) &rarr; **Phase 8**
  - Verification Badges & Scoring (Screens 06, 36–38) &rarr; **Phase 9**
  - Panchang & Community Calendar (Screens 25–31) &rarr; **Phase 10**
  - Panchayat Committees & Governance (Screens 39, 43–48) &rarr; **Phase 10**
  - Batch Excel/Android Data Import &rarr; **Phase 14**

---

### Phase 7 — Connections ✅

**Status**: Complete (All 4 Subtasks Complete & Validated, 2026-10-05)

**Subtask Breakdown**:
- **Subtask 1 — Connections Schema, RLS, Table Privileges, Service Layer & Unit/Security Tests ✅ (Completed: 2026-10-05)**:
  - Migration prepared: `supabase/migrations/20261005170000_create_connections.sql`
  - Created `connection_status` enum (`PENDING`, `ACCEPTED`, `REJECTED`, `BLOCKED`).
  - Created `public.connections` table linking `requester_id` and `addressee_id` to `public.profiles(id)` (`ON DELETE CASCADE`).
  - Constraint `connections_no_self_connection (requester_id <> addressee_id)`.
  - Expression index `idx_connections_canonical_pair` on `(LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))` enforcing one-row-per-pair uniqueness.
  - Immutability guard trigger `connections_update_guard` preventing mutation of IDs and timestamps.
  - Helper function `public.are_users_connected(user_a, user_b)` (`SECURITY DEFINER`, `search_path = public`).
  - Strict RLS policies for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
  - Gate 1 table-level privileges granted to `authenticated` role; revoked from `anon`.
  - Service layer in `src/features/connections/services/connections.service.ts` with validation schemas in `src/features/connections/schemas/connections.schemas.ts`.
- **Subtask 2 — Connections UI, Hooks, Modals & Management Pages ✅ (Completed: 2026-10-05)**:
  - Mounted `/connections` protected route in router.
  - Linked Connections in `AppHeader` user dropdown and mobile auth menu.
  - Implemented hooks: `useConnections`, `usePendingRequests`, `useConnectionMutations`, `useMutualConnections`.
  - Created UI components: `ConnectionCard`, `ConnectionsList`, `RequestsList`, `SendConnectionModal`, `RemoveConnectionDialog`, `BlockUserDialog`.
  - Created `ConnectionsPage` with accessible tabbed navigation (`Connected`, `Requests`, `Blocked`).
  - Unit test suites added in `tests/unit/`: `connections.hooks.test.ts`, `ConnectionCard.test.tsx`, `ConnectionsList.test.tsx`, `RequestsList.test.tsx`, `ConnectionDialogs.test.tsx`, `ConnectionsPage.test.tsx`.
- **Subtask 3 — Connection-Aware Privacy RLS Integration & Cross-Domain Access ✅ (Completed: 2026-10-05)**:
  - Created migration `supabase/migrations/20261005180000_add_connections_privacy_to_persons.sql`.
  - Hardened execution privileges on `public.are_users_connected(UUID, UUID)` (revoked from `PUBLIC` and `anon`; granted to `authenticated`).
  - Added RLS policy `persons_select_connections` on `public.persons` allowing SELECT when `auth.uid() IS NOT NULL AND profile_privacy = 'CONNECTIONS' AND user_id IS NOT NULL AND deleted_at IS NULL AND status != 'ARCHIVED' AND public.are_users_connected(auth.uid(), user_id)`.
  - Enforced strict `PERSON != USER` boundary: unlinked census individuals (`user_id IS NULL`) never grant connection-based visibility.
  - Cross-domain integration verified across People domain (`getPerson`) and Community Directory search (`searchPersons`).
  - Added security test suite `tests/security/rls-connections-privacy.test.ts` (23 tests) and updated `tests/security/rls-persons.test.ts` (28 tests).
  - **Security Correction & Pre-Deployment Hardening (BLOCKED Lifecycle & Transition Guard)**:
    * Hardened `connections_delete_participants` DELETE policy in `20261005170000_create_connections.sql` to restrict participant deletion to `status <> 'BLOCKED'`.
    * Restricts deletion of `BLOCKED` rows exclusively to `public.is_community_moderator()` (moderators/admins). Combined with canonical pair uniqueness `(LEAST, GREATEST)`, completely prevents block/unblock re-request bypasses.
    * Added `handle_connection_status_transition_guard()` BEFORE UPDATE trigger on `public.connections` authoritatively enforcing lifecycle transitions (`PENDING -> ACCEPTED/REJECTED/BLOCKED`, `ACCEPTED/REJECTED -> BLOCKED`) and blocking invalid mutations (`ACCEPTED -> REJECTED`, `REJECTED -> ACCEPTED`, `BLOCKED` mutations by participants).
    * Hardened `public.are_users_connected(user_a, user_b)` with database-level caller authorization: caller must be `user_a`, `user_b`, or an active moderator/admin; unauthenticated or arbitrary third parties receive `FALSE`, completely preventing social-graph probing (oracle attack).
    * Hardened `removeConnection` and `blockUser` in `connections.service.ts` for lifecycle integrity and idempotency.
    * Total test suite: **958 / 958 passing tests** across 62 test files.
- **Subtask 4 — Mutual Connections, Person Detail Integration, Mobile Polish & Final Phase Verification ✅ (Completed: 2026-10-05)**:
  - Integrated real-time connection status (`Not connected`, `Pending sent`, `Pending received`, `Connected`, `Blocked`), mutual connection count badge, and interactive actions (`Connect`, `Accept`, `Decline`, `Disconnect`) on `PersonDetailPage` via `PersonConnectionSection`.
  - Preserved strict `PERSON != USER` domain boundary: unlinked census records (`user_id IS NULL`) render zero connection controls or fake states.
  - Implemented `getConnectionWithUser` in `connections.service.ts` and `useConnectionWithUser` hook in `useConnectionWithUser.ts`.
  - Cache invalidation hierarchy: connection mutations automatically invalidate connection queries, keeping `PersonDetailPage` in sync.
  - Mobile/responsive verification across cards, lists, dialogs, and detail pages.
  - Edge cases verified: self-connection rejection, duplicate pair rejection, reverse request rejection, persistent blocked lifecycle, mutual count aggregation.
  - Added 14 new tests across service, hook, and component suites (`PersonConnectionSection.test.tsx`).
  - Total test suite expanded to **972 / 972 passing tests** across 63 test files.
  - Production build passes cleanly, strict type-check passes (0 errors), ESLint passes (0 warnings), git diff check passes, zero security findings.
  - Phase 7 is formally **COMPLETE**.

**Architectural Boundaries Preserved**:
- `USER ↔ USER`: Operates strictly on `public.profiles.id` (`auth.users`), NOT `public.persons`.
- `PERSON != USER`: Census individuals cannot be connected, requested, or blocked.
- One-row-per-pair: No duplicate reciprocal rows.

---

### Phase 8 — Claim / Join / Invitation ✅

**Status**: Complete (Formally Closed: 2026-10-06)

**Subtask Breakdown**:
- **Subtask 1 — Claim & Invitation Schema, RLS, Functions & Privileges ✅ (Completed & Deployed: 2026-10-05)**:
  - Migration prepared and deployed: `supabase/migrations/20261006090000_create_claims_and_invitations.sql`
  - Created enums `public.claim_status` (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`) and `public.invitation_status` (`PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`).
  - Created `public.person_claims` table linking `person_id` (`ON DELETE RESTRICT`) and `claimant_id` (`profiles.id`), with `evidence_notes`, `rejection_reason`, and reviewer metadata.
  - Created `public.invitations` table supporting family-scoped invitations and person seat assignments with SHA-256 token hash storage.
  - Concurrency constraints: Partial unique indexes `idx_person_claims_pending_person` and `idx_person_claims_pending_claimant` guaranteeing at most one pending claim per person and per claimant.
  - Immutability and state machine guard triggers: `trg_person_claims_update_guard`, `trg_person_claims_status_guard`, `trg_invitations_update_guard`, `trg_invitations_status_guard`.
  - Privileged atomic functions: `public.approve_person_claim(UUID)` and `public.reject_person_claim(UUID, TEXT)` (`SECURITY DEFINER`, `search_path = public`, requiring moderator/admin authority and recording immutable audit logs).
  - RLS policies on both tables for claimants, inviters, family creators, and administrators.
  - Gate 1 table-level privileges granted to `authenticated` role; revoked from `anon` and `PUBLIC`.
  - Security test suite `tests/security/rls-claims.test.ts` (51 tests). Remote verification 100% PASS.
- **Subtask 2 — Claim Service Layer, Hooks & PersonDetail UI ✅ (Completed: 2026-10-06)**:
  - Created `src/features/claims/`:
    * `types.ts`: `ClaimStatus`, `PersonClaim`, `SubmitClaimInput`, `CancelClaimInput`.
    * `schemas/claims.schemas.ts`: Zod validation schemas enforcing RFC 4122 UUID format and 1000-character evidence notes limits.
    * `services/claims.service.ts`: Client-side operations for submitting and cancelling claims, error sanitization mapping DB codes (`23505`, `42501`, `23514`) to user-safe messages.
    * `hooks/usePersonClaim.ts`: TanStack Query hooks (`usePersonClaim`, `useMyClaims`, `useClaimMutations`) with targeted cache invalidation.
    * `components/PersonClaimSection.tsx`: UI section mounted on `PersonDetailPage` handling 8 distinct UX states (ineligible, unauthenticated, self-linked, claimed by other, loading, pending review, rejected with feedback, and eligible unclaimed).
    * `components/ClaimPersonModal.tsx`: Accessible dialog for submitting claim with evidence notes and character counter.
    * `components/CancelClaimDialog.tsx`: Confirmation dialog for withdrawing pending claims.
    * `src/features/claims/README.md`: Feature domain documentation.
  - Integration: Mounted `<PersonClaimSection person={person} />` on `PersonDetailPage.tsx`.
  - Unit tests: Added 4 test suites (44 tests total) in `tests/unit/claims.schemas.test.ts`, `tests/unit/claims.service.test.ts`, `tests/unit/usePersonClaim.test.ts`, `tests/unit/PersonClaimSection.test.tsx`.
  - Total test suite expanded to **1067 / 1067 passing tests** across 68 test files.
  - TypeScript: 0 errors; ESLint: 0 errors, 0 warnings; Production build: clean.
- **Subtask 3 — Review Queue, Moderator Review & Approval ✅ (Completed: 2026-10-06)**:
  - Created moderator claim review infrastructure:
    * `src/features/claims/pages/ClaimReviewQueuePage.tsx`: Review queue page at `/admin/claims` with pending badge counts, search/filter, loading/empty/error states, quick actions, and status feedback banners.
    * `src/features/claims/components/ClaimReviewDetailModal.tsx`: Comprehensive inspection modal showing target person census details (name, DOB, place, gotra, nukh, verification status), claimant account info, and submitted evidence notes.
    * `src/features/claims/components/ClaimReviewRejectModal.tsx`: Rejection dialog enforcing mandatory reason (1–1000 characters) with real-time character counter.
    * `src/components/common/ModeratorRoute.tsx`: Route guard enforcing `ADMIN_ROLES` (`SUPER_ADMIN`, `ADMIN`, `COMMUNITY_MODERATOR`) with accessible Access Denied fallback.
    * Route integration: Added `CLAIM_REVIEW_QUEUE: '/admin/claims'` in `src/constants/app.ts`, mounted in `src/app/router.tsx`, and conditionally rendered navigation in `AppHeader.tsx`.
  - Service & Hook extensions:
    * `listPendingClaimsForReview()`: Fetches pending claims joined with safe target person fields and claimant summary.
    * `getClaimForReview()`: Fetches single claim details for modal inspection.
    * `approveClaim()`: Invokes secure database function `public.approve_person_claim(p_claim_id)` (`SECURITY DEFINER`), atomically linking `persons.user_id = claim.claimant_id`, transitioning to `APPROVED`, writing immutable audit log, and sanitizing concurrency errors.
    * `rejectClaim()`: Invokes secure database function `public.reject_person_claim(p_claim_id, p_reason)`, transitioning to `REJECTED`, writing immutable audit log, and sanitizing concurrency errors.
    * Concurrency resilience: Gracefully translates stale-claim errors (`P0001` / "already reviewed or cancelled") and triggers queue invalidation.
    * Strict role boundary: Reviewer authority strictly requires `is_community_moderator()`. Family Head has NO moderator authority.
    * Zero direct client mutation: Client never mutates `persons.user_id` or `person_claims.status` directly.
  - Unit tests: Added 5 new test suites (46 tests total) in `tests/unit/claims.review.service.test.ts`, `tests/unit/claims.review.hooks.test.ts`, `tests/unit/ClaimReviewModals.test.tsx`, `tests/unit/ClaimReviewQueuePage.test.tsx`, `tests/unit/ModeratorRoute.test.tsx`.
  - Total test suite expanded to **1113 / 1113 passing tests** across 73 test files.
- **Subtask 4A — Invitation RPC Database Hardening & Migration Implementation ✅ (Completed: 2026-10-06)**:
  - Created migration `supabase/migrations/20261006120000_create_invitation_rpcs.sql`:
    * Secure functions `create_family_invitation`, `get_invitation_by_token`, and `accept_invitation`.
    * Enforces exact schema column compatibility on `family_members` (`added_by`, `left_at`, `UNIQUE (family_id, person_id)`) with zero assumptions of `created_by` or `deleted_at`.
    * Handles existing active and historical family memberships gracefully without violating unique constraints.
    * Row-level locking via `FOR UPDATE` preventing concurrent redemptions.
    * Partial unique index `idx_invitations_one_pending_per_person` on `(family_id, person_id) WHERE status = 'PENDING'` enforcing database-level active-invitation uniqueness.
    * Concurrency-safe `FOR UPDATE` locking and automatic transition of expired PENDING invitations in `create_family_invitation`.
    * Gate 1 privilege hardening: mutating RPCs restricted strictly to `authenticated`; `service_role` omitted under least-privilege review.
    * Resets `is_head = FALSE` when reactivating historical memberships to guarantee single active-head constraint.
  - Added static database security test suite `tests/security/invitation-rpcs.test.ts` (39 tests). Total test suite expanded to **1152 / 1152 passing tests** across 74 test files.
  - TypeScript: 0 errors; ESLint: 0 errors, 0 warnings; Production build: clean.
- **Subtask 4B — Family Invitations UI, Token Redemption Page, Mobile Verification & Phase 8 Closure ✅ (Completed: 2026-10-06)**:
  - Created `src/features/invitations/`:
    * `types.ts`: `InvitationStatus`, `InvitationPreview`, `CreateFamilyInvitationInput`, `CreatedInvitationResult`.
    * `utils/token.ts`: Web Crypto CSPRNG token generator (`generateInvitationToken`) and SHA-256 hasher (`hashInvitationToken`). Plaintext tokens are NEVER stored in DB or client storage.
    * `schemas/invitation.schemas.ts`: Zod validation schemas for invitation creation and acceptance.
    * `services/invitations.service.ts`: Client data access functions (`createFamilyInvitation`, `getInvitationByToken`, `acceptInvitation`) routing exclusively through deployed RPCs with comprehensive error sanitization.
    * `hooks/useInvitations.ts`: TanStack Query hooks (`useInvitationPreview`, `useInvitationMutations`) with targeted cache invalidation.
    * `components/MobileVerificationNotice.tsx`: Transparent boundary indicator establishing that SMS/OTP infrastructure is not configured and invitations operate securely via link redemption.
    * `components/CreateInvitationModal.tsx`: Accessible dialog for family creators and moderators to issue invitations with single-click URL copy.
    * `pages/InvitationRedemptionPage.tsx`: Public preview and authenticated redemption page mounted at `/invite/:token`.
    * `src/features/invitations/README.md`: Feature domain documentation.
  - UI Integration:
    * Integrated `CreateInvitationModal` and "Invite Member" action into `MemberList.tsx` on `FamilyDetailPage`.
    * Added `/invite/:token` public route in `src/app/router.tsx` and `INVITATION_REDEMPTION` helper in `src/constants/app.ts`.
  - Testing & Validation:
    * Added unit test suite `tests/unit/invitations.service.test.ts` (12 tests) covering token generation, hashing, RPC arguments, and error sanitization.
    * Added static security test suite `tests/security/invitation-security.test.ts` (8 tests) verifying no service_role, no console.log, no direct table mutations, no Math.random, no token persistence in localStorage/sessionStorage, and preservation of `PERSON != USER` and `INVITATION != CLAIM`.
    * Total test suite expanded to **1,172 / 1,172 passing tests** across 76 test files.
    * TypeScript: 0 errors; ESLint: 0 errors, 0 warnings; Production build: clean.
  - Phase 8 is formally **COMPLETE**.

---

### Phase 8 Summary & Architectural Guarantees
1. `PERSON != USER`: Claiming a person requires moderator review via `approve_person_claim`; invitations seat persons in families without setting `persons.user_id`.
2. `INVITATION != CLAIM`: Family invitations are membership mechanisms only; they never claim identity or modify `person_claims`.
3. `FAMILY MEMBERSHIP != PERSON OWNERSHIP`: Joining a family roster does not grant ownership over census person records.
4. Active Head Uniqueness: Invitations strictly assign `is_head = FALSE`. Family Head status cannot be acquired via invitation.
5. Plaintext Token Security: Tokens generated with 256-bit CSPRNG; only SHA-256 `token_hash` sent to DB; zero plaintext token persistence in DB, localStorage, sessionStorage, or logs.
6. Transparent Boundaries: Honest representation of SMS/OTP boundary (no fake SMS/OTP).
7. Zero Direct Mutation: Client code routes strictly through audited, deployed PostgreSQL functions.

---

### Phase 9 — Verification / Data Quality ✅ (COMPLETE)

**Status**: Complete (All Subtasks 1, 2, 3 & 4 Complete & Verified)

**Subtask Breakdown**:
- **Subtask 1 — Verification Requests Schema, RLS & Secure Review RPCs ✅ (Completed: 2026-10-06)**:
  - Created migration `supabase/migrations/20261006200000_create_verification_requests.sql`:
    * Enum: `public.verification_request_status` (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`).
    * Table: `public.verification_requests` with entity scoping strictly to `'PERSON'` and `'FAMILY'`.
    * Concurrency protection: Partial unique index `idx_verification_requests_one_pending` on `(entity_type, entity_id) WHERE status = 'PENDING'` guaranteeing at most one pending verification per target entity.
    * Trigger guard: `handle_verification_request_update_guard()` preventing mutation of terminal statuses.
    * Secure RPCs (`SECURITY DEFINER`, `search_path = public`):
      - `submit_verification_request(p_entity_type TEXT, p_entity_id UUID, p_supporting_notes TEXT)`: Atomically transitions target entity to `PENDING` and inserts verification request. Authorization restricted to creator, linked person, or moderator.
      - `approve_verification_request(p_request_id UUID)`: Locks target `FOR UPDATE`, enforces target `verification_status = 'PENDING'`, raises controlled `P0002` on missing targets, updates target to `VERIFIED`, updates request to `APPROVED`, and writes immutable audit log (`PERSON_VERIFIED` or `ADMIN_ACTION/FAMILY_VERIFIED`). Requires `is_community_moderator()`.
      - `reject_verification_request(p_request_id UUID, p_rejection_reason TEXT)`: Locks target `FOR UPDATE`, enforces target `verification_status = 'PENDING'`, raises controlled `P0002` on missing targets, reverts target to `UNVERIFIED`, requires mandatory reason, updates request to `REJECTED`, and writes immutable audit log (`PERSON_VERIFICATION_REJECTED` or `ADMIN_ACTION/FAMILY_VERIFICATION_REJECTED`). Requires `is_community_moderator()`.
      - `cancel_verification_request(p_request_id UUID)`: Locks target `FOR UPDATE`, enforces target `verification_status = 'PENDING'`, raises controlled `P0002` on missing targets, reverts target to `UNVERIFIED`, updates request to `CANCELLED`, and writes immutable audit log using existing `ADMIN_ACTION` (`PERSON_VERIFICATION_CANCELLED` or `FAMILY_VERIFICATION_CANCELLED`). Allowed only for original requester or moderator.
    * Row Level Security:
      - Authenticated users can SELECT own requests (`requester_id = auth.uid()`).
      - Moderators can SELECT all requests (`is_community_moderator()`).
      - Direct client INSERT, UPDATE, DELETE denied via RLS policies (`WITH CHECK (FALSE)`, `USING (FALSE)`).
    * Least privilege hardening:
      - Table privileges revoked from `PUBLIC` and `anon`; SELECT only granted to `authenticated`.
      - RPC EXECUTE granted to `authenticated`; revoked from `PUBLIC` and `anon`.
      - Zero privileges granted to `service_role`.
  - Added comprehensive security & concurrency regression test suite `tests/security/verification-requests.test.ts` (62 tests).
  - Total test suite expanded to **1,236 / 1,236 passing tests** across 77 test files.
  - Strict type-check PASS, ESLint PASS (0 warnings), production build PASS.
- **Subtask 2 — Verification Service Layer, Hooks & Submission UI ✅ (Completed: 2026-10-06)**:
  - Created `src/features/verification/`:
    * `types.ts`: `VerificationEntityType`, `VerificationStatus`, `VerificationRequestStatus`, `SubmitVerificationRequestInput`, `SubmitVerificationResult`.
    * `schemas/verification.schemas.ts`: Zod validation schema `submitVerificationRequestSchema` enforcing entity type (`'PERSON' | 'FAMILY'`), UUID format, and optional `supportingNotes` (max 1000 characters).
    * `services/verification.service.ts`: Client data access layer routing strictly through canonical PostgreSQL RPC `submit_verification_request`. Zero direct table mutations. Error sanitization masking database schemas and constraints.
    * `hooks/useVerification.ts`: TanStack Query mutation hook `useSubmitVerificationRequest` with automatic cache invalidation for target entity details and directory listings (`['persons', id]`, `['families', id]`, etc.).
    * `components/VerificationBadge.tsx`: Accessible status indicator for all verification lifecycle states (`VERIFIED`, `PENDING`, `REJECTED`, `UNVERIFIED`).
    * `components/VerificationSubmitModal.tsx`: Accessible dialog modal with real-time character counter, form validation, error banners, and architectural disclosures.
    * `components/PersonVerificationSection.tsx`: Verification status display and submission trigger for census person records, enforcing UI/application-level living-person eligibility guidance.
    * `components/FamilyVerificationSection.tsx`: Verification status display and submission trigger for family records.
    * `src/features/verification/index.ts`: Feature public API barrel exports.
    * `src/features/verification/README.md`: Feature domain documentation.
  - Detail Page Integration:
    * `PersonDetailPage` (`/people/:id`): Rendered `PersonVerificationSection` alongside census record details.
    * `FamilyDetailPage` (`/families/:id`): Rendered `FamilyVerificationSection` alongside family roster details.
  - Testing & Validation:
    * `tests/unit/verification.schemas.test.ts`: 7 tests covering input validation, entity constraints, and notes length boundaries.
    * `tests/unit/verification.service.test.ts`: 15 tests covering unauthenticated rejection, schema validation, RPC arguments, and error sanitization.
    * `tests/unit/useVerification.test.ts`: 3 tests covering mutation execution and targeted query cache invalidation.
    * `tests/unit/VerificationComponents.test.tsx`: 20 tests covering badge rendering, modal behavior, person verification conditions, and family verification conditions.
    * Total test suite expanded to **1,281 / 1,281 passing tests** across 81 test files.
    * TypeScript: 0 errors; ESLint: 0 errors, 0 warnings; Production build: clean.
- **Subtask 3 — Moderator Verification Review Queue ✅ (Completed: 2026-10-06)**:
  - Domain Types & Schemas:
    * `src/features/verification/types.ts`: Added `VerificationRequestForReview`, `ApproveVerificationRequestInput`, `RejectVerificationRequestInput`, `VerificationReviewFilters`.
    * `src/features/verification/schemas/verification.schemas.ts`: Added `approveVerificationRequestSchema` and `rejectVerificationRequestSchema` (requiring non-empty reason <= 1000 characters).
  - Service Layer:
    * `src/features/verification/services/verification.review.service.ts`:
      - `listVerificationRequestsForReview(filters?, callerUserId?)`: Selects requests via moderator RLS, batch-joins target `persons`, `families`, and requester/reviewer `profiles`, performs client search filtering, and handles empty/error states.
      - `getVerificationRequestForReview(requestId, callerUserId?)`: Retrieves single enriched request with target Person/Family and Requester details.
      - `approveVerificationRequest(input, callerUserId?)`: Invokes authoritative database RPC `approve_verification_request`.
      - `rejectVerificationRequest(input, callerUserId?)`: Invokes authoritative database RPC `reject_verification_request`.
      - `sanitizeVerificationReviewError(...)`: Concurrency-safe, user-friendly error formatting. Zero direct table mutations.
  - Hooks:
    * `src/features/verification/hooks/useVerificationReview.ts`:
      - `useVerificationRequestsReview(filters?)`: Administrative-role guarded query hook for the review queue.
      - `useVerificationRequestDetailReview(requestId)`: Detailed modal inspection query hook.
      - `useVerificationReviewMutations()`: Review mutation hooks invalidating review queries, person/family records, and directories.
  - UI Components & Pages:
    * `src/features/verification/components/VerificationReviewRejectModal.tsx`: Accessible dialog collecting mandatory rejection reason (1-1000 characters) with live counter and error feedback.
    * `src/features/verification/components/VerificationReviewDetailModal.tsx`: Comprehensive modal inspecting full Person/Family record fields, supporting notes, requester info, reviewer outcome, and approval/rejection triggers.
    * `src/features/verification/pages/VerificationReviewQueuePage.tsx`: Moderator queue page with pending badge count, filter tabs (Pending, All, Approved, Rejected), entity filters (All, Persons, Families), search input, quick approve / quick reject buttons, detailed item cards, loading skeleton, error states, and empty states.
  - Routing & Navigation Integration:
    * `src/constants/app.ts`: Added `ROUTES.VERIFICATION_REVIEW_QUEUE: '/admin/verifications'`.
    * `src/app/router.tsx`: Mounted `VerificationReviewQueuePage` under `ModeratorRoute`.
    * `src/components/layout/AppHeader.tsx`: Added `Verification Reviews` nav links with `CheckCircle` icon to desktop dropdown and mobile menu.
    * `src/features/verification/index.ts`: Re-exported review service functions, hooks, modals, and queue page.
  - Testing & Validation:
    * `tests/unit/verification.review.service.test.ts`: 22 tests covering review queue listing, filters, search, detail retrieval, approve/reject RPC calls, validation, and error sanitization.
    * `tests/unit/verification.review.hooks.test.ts`: 6 tests covering moderator role authorization guards and query cache invalidations.
    * `tests/unit/VerificationReviewModals.test.tsx`: 5 tests covering reject modal validation and detail modal rendering for Person and Family entities.
    * `tests/unit/VerificationReviewQueuePage.test.tsx`: 4 tests covering queue header, counter, filter controls, item list, empty state, and error handling.
    * Total test suite expanded to **1,318 / 1,318 passing tests** across 85 test files.
    * Strict type-check PASS, ESLint PASS (0 warnings), production build PASS.
- **Subtask 4 — Verification Hardening, Data Quality & Duplicate Detection ✅ (Completed: 2026-10-06)**:
  - Database Migration (Deployed and verified remotely):
    * `supabase/migrations/20261006230000_create_duplicate_flags.sql`:
      - Enums: `duplicate_entity_type` (`'PERSON'`, `'FAMILY'`), `duplicate_flag_status` (`'OPEN'`, `'CONFIRMED_DUPLICATE'`, `'NOT_DUPLICATE'`), `duplicate_confidence` (`'STRONG'`, `'POSSIBLE'`, `'WEAK'`).
      - Table: `public.duplicate_flags` enforcing canonical pair ordering `CHECK (record_a_id < record_b_id)` and unique pair index `idx_duplicate_flags_canonical_pair`.
      - Secure RPCs: `flag_duplicate_record(...)` and `resolve_duplicate_flag(...)` with `SECURITY DEFINER`, `search_path = public`, and immutable audit logging using existing `ADMIN_ACTION`.
      - RLS policies and least privilege grants.
  - Data Quality Engine (`DATA QUALITY != VERIFICATION`):
    * `src/features/verification/types/quality.types.ts`: `DataQualityScore`, `DataQualityTier`, category breakdowns.
    * `src/features/verification/services/dataQuality.service.ts`: Pure deterministic scoring for Person (100 pts) and Family (100 pts) with missing fields, recommendations, and consistency warnings.
    * `src/features/verification/components/DataQualityIndicator.tsx`: Visual completeness indicator with progress bar, collapsible category breakdown, and explicit disclaimer that data quality does not replace official verification. Embedded in `PersonVerificationSection` and `FamilyVerificationSection`.
  - Duplicate Detection Engine (`DETECT != MERGE`):
    * `src/features/verification/types/duplicate.types.ts`: Duplicate types, candidate interfaces, enriched flags.
    * `src/features/verification/services/duplicateDetection.service.ts`: Conservative matching algorithm producing explainable match signals, differing signals, and confidence tiers (`STRONG`, `POSSIBLE`, `WEAK`), strictly excluding self-matching and deleted records. RPC mutation functions and enriched flag query methods.
    * `src/features/verification/hooks/useDuplicateDetection.ts`: React Query hooks `useDuplicateFlags`, `useFlagDuplicate`, `useResolveDuplicate`, `usePersonDuplicateCandidates`, `useFamilyDuplicateCandidates`.
  - Moderator Review Workflow:
    * `src/features/verification/components/DuplicateReviewModal.tsx`: Side-by-side comparison of Record A vs Record B with match signals and non-destructive Confirm Duplicate / Dismiss actions.
    * `src/features/verification/components/DuplicateFlagsQueueSection.tsx`: Filterable queue of duplicate flags for moderator review.
    * `src/features/verification/pages/VerificationReviewQueuePage.tsx`: Integrated top-level tab switcher toggling between "Verification Requests" and "Duplicate Record Flags".
  - Verification Lifecycle Hardening:
    * Exposed `cancelVerificationRequest` in service and `useCancelVerificationRequest` hook.
  - Testing & Validation:
    * `tests/security/duplicate-flags.test.ts`: 11 tests covering schema constraints, canonical ordering, RLS policies, and RPC definitions.
    * `tests/unit/dataQuality.service.test.ts`: 9 tests covering deterministic scores, tier thresholds, missing fields, and date warnings.
    * `tests/unit/duplicateDetection.service.test.ts`: 10 tests covering candidate matching, signal explainability, RPC wrappers, and empty listings.
    * `tests/unit/useDuplicateDetection.test.ts`: 4 tests covering hook queries, mutations, and cache invalidation.
    * `tests/unit/DataQualityIndicator.test.tsx`: 3 tests covering score display, category breakdown, and disclaimer.
    * `tests/unit/DuplicateReviewModal.test.tsx`: 2 tests covering side-by-side cards, safety notice, and action buttons.
    * Added cancel request test cases in `tests/unit/verification.service.test.ts`.
    * Total test suite expanded to **1,393 / 1,393 passing tests** across 91 test files.
    * Strict type-check PASS, ESLint PASS (0 warnings), production build PASS.
  - Phase 9 is formally **COMPLETE**.


---

### Phase 10 — Community Features 🔲

**Status**: In Progress (Subtasks 1 & 2 Complete; Subtasks 3–4 Not Started)

**Subtask Breakdown**:
- **Subtask 1 — Community Groups Schema, RLS, Services & Catalog UI ✅ (Completed: 2026-10-07)**:
  - Database Migration (Deployed Remotely to Supabase):
    * `supabase/migrations/20261007100000_create_community_groups.sql`:
      - Enums: `public.group_type` (`'VILLAGE_ASSOCIATION'`, `'COMMITTEE'`, `'CULTURAL'`, `'YOUTH'`, `'OTHER'`), `public.group_role` (`'ADMIN'`, `'MODERATOR'`, `'MEMBER'`).
      - Tables: `public.groups` with name/slug constraints, `is_verified` (default FALSE), `is_private` (default FALSE), `deleted_at` soft-delete; `public.group_members` with `UNIQUE (group_id, user_id)`.
      - Triggers: `groups_handle_updated_at` auto-updating timestamp; `handle_group_update_guard` guarding immutable fields (`id`, `created_by`, `created_at`) and restricting `is_verified` mutations strictly to `is_community_moderator()`.
      - Authoritative RPCs: `create_community_group` (atomic group creation + initial creator ADMIN membership + `ADMIN_ACTION` audit log), `join_community_group` (self-join into public groups as MEMBER), `leave_community_group` (self-leave with sole-admin protection), `update_group_member_role` (admin/moderator role management), `verify_community_group` (moderator group verification).
      - RLS policies and least-privilege table grants: `REVOKE ALL FROM PUBLIC, anon; GRANT SELECT, INSERT, UPDATE ON groups TO authenticated; GRANT SELECT, INSERT, UPDATE, DELETE ON group_members TO authenticated;`.
  - Frontend Domain (`src/features/community/`):
    * Types: `Group`, `GroupMember`, `GroupType`, `GroupRole`, `GroupWithMembership`, `CreateGroupInput`, `GroupFilters`.
    * Schemas: `createGroupSchema`, `generateSlugFromName`, `groupFiltersSchema`.
    * Services: `groups.service.ts` with typed queries, error sanitization, and RPC integration.
    * Hooks: `useGroups`, `useGroupBySlug`, `useGroupMembers`, `useCreateGroup`, `useJoinGroup`, `useLeaveGroup`.
    * Components: `GroupTypeBadge`, `GroupCard`, `GroupFiltersBar`, `CreateGroupModal`, `GroupsCatalog`.
    * Page: Updated `CommunityPage` mounted at `/community`.
- **Subtask 2 — Community Announcements / Notice Board Schema, RLS & Feed UI ✅ (Completed: 2026-10-07)**:
  - Database Migration (Local Only — NOT Deployed Remotely):
    * `supabase/migrations/20261007120000_create_community_announcements.sql`:
      - Enums: `public.announcement_type` (`'GENERAL'`, `'URGENT'`, `'EVENT'`, `'BEREAVEMENT'`, `'CELEBRATION'`), `public.announcement_status` (`'DRAFT'`, `'PUBLISHED'`, `'ARCHIVED'`).
      - Table: `public.announcements` with title (1–200), content (1–10000), `group_id` (nullable FK to `groups`), `author_id` (FK to `auth.users`), `is_pinned` (default FALSE), `published_at`, and `deleted_at` soft-delete.
      - Triggers: `announcements_handle_updated_at` auto-updating timestamp; `handle_announcement_update_guard` guarding immutable fields (`id`, `created_at`, `author_id`, `group_id`).
      - Authoritative RPCs (`SECURITY DEFINER`, `search_path = public`):
        * `create_community_announcement`: Scope validation (global moderator vs group admin/mod), input length validation, audit logging.
        * `update_community_announcement`: Author/group manager/global moderator validation, input validation, audit logging.
        * `archive_community_announcement`: Transitions status to ARCHIVED with authorization checks and audit logging.
        * `delete_community_announcement`: Soft-deletes announcement (`deleted_at = NOW()`) with authorization checks and audit logging.
      - RLS Policies & Privilege Hardening:
        * Table-level: `REVOKE ALL ON public.announcements FROM PUBLIC, anon; GRANT SELECT ON public.announcements TO authenticated;`. Direct client INSERT, UPDATE, and DELETE strictly denied via RLS deny policies.
        * RPC privileges: `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION ... TO authenticated;`.
  - Frontend Domain (`src/features/community/`):
    * Types: `AnnouncementType`, `AnnouncementStatus`, `AnnouncementAuthorProfile`, `Announcement`, `CreateAnnouncementInput`, `UpdateAnnouncementInput`, `AnnouncementFilters`.
    * Schemas: `createAnnouncementSchema`, `updateAnnouncementSchema`, `announcementFiltersSchema`, `ANNOUNCEMENT_TYPES`, `ANNOUNCEMENT_STATUSES`.
    * Services: `announcements.service.ts` with profile/group join queries, search filtering, error sanitization, and RPC invocations.
    * Hooks: `useAnnouncements`, `useAnnouncement`, `useCreateAnnouncement`, `useUpdateAnnouncement`, `useArchiveAnnouncement`, `useDeleteAnnouncement`.
    * Components: `AnnouncementTypeBadge`, `AnnouncementCard`, `AnnouncementFiltersBar`, `AnnouncementDetailModal`, `CreateAnnouncementModal`, `EditAnnouncementModal`, `AnnouncementsFeed`.
    * Page: Tabbed `CommunityPage` seamlessly toggling between Groups & Associations (Subtask 1) and Notice Board (Subtask 2).
  - Testing & Validation:
    * `tests/security/community-announcements-schema.test.ts`: 12 contract tests covering schema, enums, triggers, RPC permissions, RLS policies, and least privilege.
    * `tests/unit/announcement.schemas.test.ts`: 16 unit tests covering zod schemas, bounds, enums, and defaults.
    * `tests/unit/announcements.service.test.ts`: 14 unit tests covering service error sanitization, list filtering, detail query, and RPC invocations.
    * `tests/unit/useAnnouncements.test.ts`: 5 unit tests covering mutation execution and query cache invalidations.
    * `tests/unit/AnnouncementsComponents.test.tsx`: 11 component unit tests covering badges, cards, filters, and detail/edit/create modals.
    * Full suite passes: **1,514 / 1,514 tests passing** across 101 test files.
    * TypeScript: 0 errors; ESLint: 0 errors, 0 warnings; Production build: clean.
- **Subtask 3 — Community Events & RSVP System Schema, RLS & Calendar/List UI ✅ (Completed: 2026-10-07)**:
  - Database Migration (Local Only — NOT Deployed Remotely):
    * `supabase/migrations/20261007140000_create_community_events.sql`:
      - Enums: `public.event_type` (`'GENERAL'`, `'FESTIVAL'`, `'MEETING'`, `'SPORTS'`, `'YOUTH'`, `'CULTURAL'`, `'WORKSHOP'`, `'OTHER'`), `public.event_status` (`'DRAFT'`, `'PUBLISHED'`, `'CANCELLED'`, `'COMPLETED'`, `'ARCHIVED'`), `public.event_rsvp_status` (`'GOING'`, `'MAYBE'`, `'NOT_GOING'`).
      - Tables: `public.events` with title (1–200), description (max 10000), `start_time`, `end_time` (`CHECK (end_time IS NULL OR end_time > start_time)`), `location`, `location_url`, `group_id` (nullable FK to `groups`), `creator_id` (FK to `auth.users`), `capacity` (`CHECK (capacity IS NULL OR capacity > 0)`), `cancellation_reason`, and `deleted_at` soft-delete; `public.event_rsvps` with `UNIQUE (event_id, user_id)`, `guest_count` (`CHECK (guest_count >= 0 AND guest_count <= 5)`), and `notes`.
      - Triggers: `events_handle_updated_at`, `event_rsvps_handle_updated_at`, `handle_event_update_guard`, `handle_event_rsvp_update_guard`.
      - Authoritative RPCs (`SECURITY DEFINER`, `search_path = public`):
        * `create_community_event`: Validates scope, date constraints, and logs audit record.
        * `update_community_event`: Enforces organizer permissions and date constraints with audit logging.
        * `cancel_community_event`: Transitions status to `CANCELLED`, records cancellation timestamp and mandatory reason with audit logging.
        * `archive_community_event`: Transitions status to `ARCHIVED` with audit logging.
        * `delete_community_event`: Soft-deletes event (`deleted_at = NOW()`) with audit logging.
        * `set_event_rsvp`: Concurrency-safe attendance registration with `SELECT ... FOR UPDATE` row locking and capacity enforcement (`1 + guest_count`).
        * `cancel_event_rsvp`: Transitions RSVP record to `NOT_GOING` or removes row with audit logging.
      - RLS Policies & Privilege Hardening:
        * Table-level: `REVOKE ALL ON public.events, public.event_rsvps FROM PUBLIC, anon; GRANT SELECT ON public.events, public.event_rsvps TO authenticated;`. Direct client INSERT, UPDATE, and DELETE strictly denied via RLS deny policies.
        * RPC privileges: `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION ... TO authenticated;`.
        * Internal helpers (`can_view_event`, `can_manage_event`): Revoked from `PUBLIC`, `anon`, and `authenticated`.
  - Frontend Domain (`src/features/community/`):
    * Types: `EventType`, `EventStatus`, `EventRsvpStatus`, `EventOrganizerProfile`, `CommunityEvent`, `EventRsvp`, `CreateEventInput`, `UpdateEventInput`, `CancelEventInput`, `SetEventRsvpInput`, `EventFilters`.
    * Schemas: `createEventSchema`, `updateEventSchema`, `cancelEventSchema`, `setEventRsvpSchema`, `eventFiltersSchema`, `EVENT_TYPES`, `EVENT_STATUSES`, `EVENT_RSVP_STATUSES`.
    * Services: `events.service.ts` with error sanitization, query listings, detail queries, and RPC invocations.
    * Hooks: `useEvents`, `useEvent`, `useEventRsvps`, `useCreateEvent`, `useUpdateEvent`, `useCancelEvent`, `useArchiveEvent`, `useDeleteEvent`, `useSetEventRsvp`, `useCancelEventRsvp`.
    * Components: `EventTypeBadge`, `EventStatusBadge`, `RsvpButtonGroup`, `EventCard`, `EventFiltersBar`, `EventDetailModal`, `CreateEventModal`, `EditEventModal`, `CancelEventModal`, `EventsFeed`.
    * Page: 3-tab `CommunityPage` at `/community` supporting Groups & Associations (Subtask 1), Notice Board (Subtask 2), and Events & Calendar (Subtask 3).
  - Testing & Validation:
    * `tests/security/community-events-schema.test.ts`: 16 contract tests covering schema, enums, triggers, RPC permissions, RLS policies, and least privilege.
    * `tests/unit/event.schemas.test.ts`: 17 unit tests covering zod schemas, bounds, enums, and dates.
    * `tests/unit/events.service.test.ts`: 24 unit tests covering service error sanitization, list filtering, detail query, and RPC invocations.
    * `tests/unit/useEvents.test.ts`: 8 unit tests covering hook queries and mutations.
    * `tests/unit/EventsComponents.test.tsx`: 17 component unit tests covering badges, cards, filters, and detail/edit/create/cancel modals.
    * Full suite passes: **1,601 / 1,601 tests passing** across 106 test files (+82 new tests in Subtask 3).
    * TypeScript: 0 errors; ESLint: 0 errors, 0 warnings; Production build: clean.
- **Subtask 4 — Community Dashboard Integration, Role Hardening & Audit Verification ✅**:
  - Unified Community Hub at `/community` (`CommunityPage.tsx`) integrating Groups & Associations (Subtask 1), Notice Board (Subtask 2), and Events & Calendar (Subtask 3).
  - Real-time Community Pulse metric cards with responsive layout, count badges, and direct navigation.
  - WAI-ARIA tab navigation with Arrow key keyboard controls (`ArrowRight`, `ArrowLeft`, `Home`, `End`).
  - Deeplinking and URL parameter synchronization (`?tab=groups|announcements|events`).
  - Complete dialog accessibility hardening across all 8 community modal dialogs (Escape key handling, backdrop click dismissal, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`).
  - Strict security audit: Zero `service_role` leaks, zero unauthenticated DB bypass, zero console logs, zero sensitive localStorage/sessionStorage.
  - Testing & Validation: `tests/unit/CommunityPage.test.tsx` (6 unit tests). Full test suite passes: **1,607 / 1,607 tests passing** across 107 test files.
  - TypeScript: 0 errors; ESLint: 0 errors, 0 warnings; Production build: clean (12.54s).

---

### Phase 11 — Media / Family History ✅ (COMPLETE)

**Status**: Complete (All Subtasks 1, 2, 3 & 4 Complete, Remotely Verified & Hardened)

**Subtask Breakdown**:
- **Subtask 1 — Storage Infrastructure, Buckets & Profile/Family Avatars ✅ (Completed & Remotely Verified: 2026-10-10)**:
  - Private `avatars` bucket with MIME restriction (`image/jpeg`, `image/png`, `image/webp`, `image/gif`) and 5MB size limit.
  - Canonical internal object path format `avatars/...` stored in DB; signed URLs resolved dynamically at display time (zero persistent signed URLs in database).
  - Storage RLS on `storage.objects` enforcing path isolation (`profiles/<uid>/...`, `persons/<person_id>/...`, `families/<family_id>/...`).
  - Authoritative RPCs `set_profile_avatar`, `set_person_avatar`, `set_family_avatar` with audit logging.
  - Avatars UI: `AvatarImage`, `AvatarUploadDialog` with aspect-ratio cropping, live preview, and error handling.
- **Subtask 2 — Family & Community Media / Photo Albums / Family History ✅ (Hardened & Remotely Verified: 2026-10-15)**:
  - Storage Architecture & Isolation:
    * Dedicated private `family-media` bucket (`public = false`, 20MB limit) accepting `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`.
    * Existing `avatars` bucket contract preserved 100% UNTOUCHED (5MB limit, image-only).
    * Storage RLS policies on `storage.objects` isolated to `bucket_id = 'family-media'` (`family_media_select_policy`, `family_media_insert_policy`, `family_media_update_policy`, `family_media_delete_policy`).
    * Canonical storage path format: `family-media/families/<family_id>/media/<media_id>/<filename>`.
  - Database Migration (Deployed & Remotely Verified):
    * `supabase/migrations/20261010140000_create_family_media_and_history.sql`:
      - Tables: `public.family_albums`, `public.family_media`, `public.family_stories` with strict CHECK constraints, soft deletes (`deleted_at`), and audit logging.
      - Enum: `public.family_media_type` (`'PHOTO'`, `'DOCUMENT'`, `'HISTORICAL_RECORD'`).
      - Trigger Guards: `handle_family_media_album_guard` (cross-family album rejection), `handle_family_media_storage_path_guard` (storage path ID consistency), `handle_family_story_featured_media_guard` (cross-family featured media rejection).
      - Authoritative RPCs (`SECURITY DEFINER`, `search_path = public`): `create_family_album`, `register_family_media`, `soft_delete_family_media`, `create_family_story`.
      - Security functions: `can_manage_family_media`, `can_read_family_item`, `can_read_family_media_object` enforcing active family and membership lifecycle (`status = 'ACTIVE'`, `deleted_at IS NULL`, `left_at IS NULL`).
- **Subtask 3 — Media & Family History UI Integration ✅ (Completed: 2026-10-15)**:
  - Integrated UI Components & Modals:
    * `FamilyMediaSection` (`src/features/media/components/FamilyMediaSection.tsx`): Dual-tab browser for Albums & Photos vs. Family History & Stories, album filter chips, mobile-responsive media grid, PDF document previews, and story cards.
    * `MediaViewerModal` (`src/features/media/components/MediaViewerModal.tsx`): Accessible lightbox dialog with dynamic signed URL resolution, full metadata (file size, MIME, caption, date), safe PDF download/view (`target="_blank" rel="noopener noreferrer"`), and delete confirmation.
    * `MediaUploadModal` (`src/features/media/components/MediaUploadModal.tsx`): File drag-and-drop and file picker, client-side validation (<= 20MB, allowed MIME types), album assignment, caption, description, and automatic storage rollback on RPC failure.
    * `AlbumCreateModal` (`src/features/media/components/AlbumCreateModal.tsx`): Photo album authoring modal with privacy selector (`FAMILY`, `COMMUNITY`, `PUBLIC`, `PRIVATE`) routing to `create_family_album` RPC.
    * `StoryViewerModal` (`src/features/media/components/StoryViewerModal.tsx`): Oral history modal with executive summary callout, pure-text rendering with line breaks (`whitespace-pre-line`, zero `dangerouslySetInnerHTML`), and featured photo preview.
    * `StoryCreateModal` (`src/features/media/components/StoryCreateModal.tsx`): Oral narrative authoring modal with title, summary, narrative content, privacy level, and featured photo attachment picker routing to `create_family_story` RPC.
  - Security Invariants:
    * Zero `dangerouslySetInnerHTML`.
    * Zero signed URLs or credentials stored in `localStorage` or `sessionStorage`.
    * Zero direct table mutations (`INSERT`, `UPDATE`, `DELETE` on `family_albums`, `family_media`, `family_stories` are denied). All mutations flow through authoritative RPC service calls (`createFamilyAlbum`, `uploadFamilyMedia`, `deleteFamilyMedia`, `createFamilyStory`).
    * Full keyboard accessibility (Escape-to-close on all modals, backdrop click dismissal, `aria-modal="true"`, `role="dialog"`).
  - Testing & Validation:
    * Added `tests/unit/FamilyMediaModals.test.tsx` (11 tests) and updated `tests/unit/FamilyMediaSection.test.tsx` (2 tests), `tests/unit/image.utils.test.ts` (12 tests).
    * Total test suite expanded to **1,709 / 1,709 passing tests** across 117 test files.
    * TypeScript: 0 errors; ESLint: 0 errors, 0 warnings; Production build: clean (11.91s).
- **Subtask 4 — Final Media/History Integration, Hardening & Release Readiness ✅ (Completed: 2026-10-15)**:
  - Error Resilience & Expired Signed URL Protection:
    * Hardened `MediaViewerModal` and `StoryViewerModal` with local `imageError` handling and fallback notice ("Image preview unavailable or link expired.") for broken or expired dynamic signed URLs.
  - Storage Upload Rollback Assurance:
    * Verified atomic storage rollback in `uploadFamilyMedia` (`familyMedia.service.ts` line 290) removing the uploaded object from `family-media` bucket if `register_family_media` RPC fails.
  - Remote Verification:
    * Verified deployed tables `family_albums`, `family_media`, and `family_stories` with RLS deny-by-default on remote Supabase project `community-family-platform` (`ixhvsprwjalgcyievsrg`).
    * Verified deployed RPCs `soft_delete_family_media`, `create_family_album`, `register_family_media`, and `create_family_story` with restricted execution.
    * Verified private storage buckets `avatars` (5MB, images) and `family-media` (20MB, images + PDF).
  - Documentation Consistency:
    * Harmonized RPC naming across frontend, database, and docs strictly to canonical `soft_delete_family_media`.
    * Updated `PROJECT_STATUS.md`, `ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`, and `src/features/media/README.md`.
  - Quality Gates & Release Verification:
    * Full test suite: **1,709 / 1,709 passing tests** across 117 test files.
    * TypeScript: 0 errors (`npm run type-check`).
    * ESLint: 0 errors, 0 warnings (`npm run lint`).
    * Production build: clean (`npm run build`).
    * Phase 11 is formally **READY FOR RELEASE REVIEW**.

---

### Phase 12 — Notifications ✅

**Status**: Complete (Subtasks 1, 2, 3, 4 & 5 Complete; Released)

**Subtask Breakdown**:
- **Subtask 1 — Notification Database Foundation, RLS & Mutation RPCs ✅ (Completed: 2026-10-16)**:
  - Database Migration: `supabase/migrations/20261016100000_create_notifications_foundation.sql` (Deployed & Verified remotely).
  - Enums: `notification_category`, `notification_channel`, `notification_delivery_status`.
  - Tables: `notifications`, `notification_preferences`, `notification_outbox` with strict RLS and immutability guards.
  - Server-authoritative RPCs: `mark_notification_read`, `mark_all_notifications_read`, `dismiss_notification`, `get_unread_notification_count`, `get_my_notification_preferences`, `update_my_notification_preferences`.
  - Feature domain foundation in `src/features/notifications/`.

- **Subtask 2 — Domain Event Notification Triggers & Outbox Generator ✅ (Completed: 2026-10-16)**:
  - Database Migration: `supabase/migrations/20261016140000_create_notification_domain_pipeline.sql` (Deployed & Verified remotely).
  - Helper: `emit_domain_notification` (`SECURITY DEFINER`, search_path = public, self-notification suppression).
  - Idempotency: `uq_notifications_recipient_event_key` and `uq_notification_outbox_notification_channel`.
  - 8 lifecycle triggers: connections, claims, invitations, verifications, group roles, event cancellations, event RSVPs (transition-aware idempotency), and family media/stories.

- **Subtask 3 — In-App Notification Center, Header Popover & Real-Time Sync ✅ (Completed: 2026-10-16)**:
  - Components: `NotificationBell`, `NotificationPopover`, `NotificationItemRow`, `NotificationFilters`, `NotificationCategoryIcon`.
  - Main center: `NotificationsPage` mounted at route `/notifications`.
  - Real-time synchronization: `useNotificationRealtime` listening to Supabase Realtime channel `notifications:user_${userId}` and invalidating query caches on PostgreSQL mutations.

- **Subtask 4 — Notification Preferences UI & Email Dispatch Infrastructure ✅ (Completed: 2026-10-16)**:
  - Preferences UI: `NotificationPreferencesPage` mounted at route `/settings/notifications`.
  - Navigation: Profile page card, AppHeader desktop and mobile menus, and Notification Center header action.
  - Outbox Worker Migration: `supabase/migrations/20261016160000_create_notification_outbox_worker_rpcs.sql`:
    * `claim_notification_outbox_batch` with PostgreSQL `FOR UPDATE SKIP LOCKED`.
    * `complete_notification_outbox_delivery` and `fail_notification_outbox_delivery` (bounded retries, exponential backoff, DEAD_LETTER).
    * Least privilege: revoked from `PUBLIC, anon, authenticated`, granted exclusively to `service_role`.
  - Edge Function: `supabase/functions/dispatch-notification-emails/`:
    * Providers: Resend, Mock, and Unconfigured fallback.
    * Data minimization: zero sensitive census data in emails.

- **Subtask 5 — Final Integration, Accessibility, Hardening & Release ✅ (Completed: 2026-10-16)**:
  - End-to-end accessibility, keyboard navigation, focus management, and focus-visible states across all notification UI.
  - Responsive mobile optimization (popover viewport width constraints, touch targets, filter bar wrapping).
  - Security regression verified (zero secrets in client, strict service_role execution, PERSON != USER, RLS authoritative).
  - Comprehensive documentation, full test suite (125 test files, 1,870 tests passing), and release readiness.

**What is built across Phase 12**:
- In-app notification center.
- `notifications`, `notification_preferences`, and `notification_outbox` tables with RLS.
- Notification triggers: connection requests, claim updates, verification results, family join requests, invitations.
- Real-time notifications via Supabase Realtime.
- Notification read/unread state management.
- Email notification dispatch via Supabase Edge Function + email provider.
- Notification preferences per user.
- Notifications feature domain (`src/features/notifications/`).

---

### Phase 13 — Admin & Moderation ✅

**Status**: Complete (Subtasks 1, 2, 3 & 4 Complete; Released)

**Subtask Breakdown**:
- **Subtask 1 — Admin Authorization Infrastructure, Database RPCs & AdminRoute Guard ✅ (Completed: 2026-10-16)**:
  - Database Migration: `supabase/migrations/20261016180000_create_admin_authorization_rpcs.sql` (Deployed & Verified remotely).
  - Server-authoritative RPCs: `admin_update_user_role`, `admin_set_user_status`, `admin_get_audit_logs`, `admin_get_platform_metrics` (`SECURITY DEFINER`, search_path = public, auth).
  - Concurrency-safe super admin protection via transaction lock `pg_advisory_xact_lock(hashtext('admin_super_admin_role_lock'))` to prevent race conditions and zero-super-admin lockout.
  - Profiles RLS hardening: `profiles_update_admin` restricted to personal profile fields (`first_name`, `last_name`, `avatar_url`), ensuring `role` and `is_active` mutations flow exclusively through authoritative RPCs.
  - Client route guard: `<AdminRoute>` restricting admin access strictly to `ADMIN` and `SUPER_ADMIN` (blocking `COMMUNITY_MODERATOR` and standard users).

- **Subtask 2 — Admin Hub Layout, Navigation & Platform Metrics Dashboard ✅ (Completed: 2026-10-16)**:
  - UI Components: `AdminLayout`, `AdminDashboardPage` mounted at route `/admin`.
  - Platform overview: 6 metric cards (total users, active users, total persons, total families, pending claims, open duplicate flags) and administrative quick-action workflow cards.
  - Responsive navigation: Sidebar with active-route highlighting on desktop; collapsible drawer with keyboard accessibility on mobile.
  - Defect Repair: Hardened `useNotificationRealtime` channel lifecycle to eliminate StrictMode double-subscribe / subscription churn.

- **Subtask 3 — User Administration & Audit Log Viewer ✅ (Completed: 2026-10-17)**:
  - User Administration: `UserManagementPage` mounted at `/admin/users` with server-side pagination, search, role filters, and status filters.
  - Administrative Modals: `ChangeRoleModal` (strict hierarchy rules) and `SetUserStatusModal` (activation/deactivation with mandatory audit reason).
  - Audit Log Viewer: `AuditLogPage` mounted at `/admin/audit-logs` with pagination, action/entity filters, user filter, and `AuditDetailsModal` inspecting structured JSON changesets and metadata.
  - Navigation integration: AppHeader shield icon visible exclusively to administrators.

- **Subtask 4 — Duplicate Review Queue, Final Hardening & Release Preparation ✅ (Completed: 2026-10-17)**:
  - Duplicate Review Queue: `DuplicateManagementPage` mounted at `/admin/duplicates` with bounded server pagination, status/entity/confidence filters, and responsive views (table on desktop, card stack on mobile).
  - Candidate Review Modal: `AdminDuplicateReviewModal` with side-by-side / stacked Candidate A vs B comparison, safe census-only metadata projections (`PERSON ≠ USER`), match signals, and resolution actions (`CONFIRMED_DUPLICATE` vs `NOT_DUPLICATE`).
  - Architectural Invariants: Strict enforcement of `DETECT ≠ MERGE` (human review only, no destructive merges) and server-authoritative mutation via `public.resolve_duplicate_flag`.
  - Concurrency & Stale Protection: Detection of PostgreSQL error `23514` on resolved flags with user-facing conflict alerts and live refresh trigger.
  - End-to-end accessibility, security regression testing, full 2,024 test suite execution, and release readiness.

**What is built across Phase 13**:
- Central Admin Hub dashboard (`/admin`) with platform metrics and quick workflows.
- User management interface (`/admin/users`) with role administration and account activation controls.
- Immutable audit log viewer (`/admin/audit-logs`) with detailed diff inspection.
- Duplicate review queue (`/admin/duplicates`) with side-by-side candidate comparison and resolution actions.
- Hardened server-authoritative RPC layer with advisory locks and strict RLS.
- Admin feature domain (`src/features/admin/`).

---

### Phase 14 — Import / Data Migration ✅

**Status**: Complete (Subtasks 1–4 Verified & UI Mounted)

**What is built**:
- Import batches container (`public.import_batches`) and generic staging store (`public.staging_records`).
- Architectural invariants: `PERSON != USER` (census entities only; never auth accounts) and `DETECT != MERGE` (no automated deduplication/destructive merges).
- Chunked staging ingestion RPC (`stage_import_records`), batch validation RPC (`validate_import_batch`), and staging record status update RPC (`set_staging_record_status`).
- Safe atomic promotion RPC (`promote_import_batch`) with duplicate detection integration (`public.duplicate_flags`).
- Client services: `import.service.ts` and `importParser.service.ts` supporting standard CSV/JSON normalization.
- Dedicated admin console: `ImportManagementPage.tsx` (`/admin/import`) mounted under `AdminRoute` / `AdminLayout` with batch filters, batch inspection, safe cancellation, and promotion confirmation modal.
- 95 unit and integration tests passing across parser, service, and promotion UI.

---

### Phase 15 — Hardening ✅

**Status**: Complete (Subtasks 1–5 Audited & Verified)

**What is built**:
- Automated Playwright E2E browser smoke suite (`tests/e2e/specs/smoke.spec.ts`) running across core routes.
- Strict input sanitization library (`src/lib/sanitization.ts`) applied across all forms and services to defend against stored XSS and prototype pollution.
- Application error boundary (`src/components/common/ErrorBoundary.tsx`) and route-level error page (`src/features/errors/pages/RouteErrorPage.tsx`) preventing stack trace or database detail leakage.
- Production security headers configured in `public/_headers` (nosniff, DENY, strict referrer, zero-permission, strict CSP).
- Production build sourcemap suppression configured in `vite.config.ts`.
- Comprehensive OWASP Top 10 and database RLS security audit suite (`tests/security/owasp-top-10-and-rls-audit.test.ts`).

---

### Phase 16 — Load / Production Readiness ✅

**Status**: Complete (Subtasks 1–5 Audited & Verified)

**What is built**:
- Production hosting configuration for Cloudflare Pages (`public/_headers`, `public/_redirects`).
- Production database migration and pooler connection audit; established manual Supabase Dashboard SQL Editor sequential deployment procedure.
- Load testing simulation suites (`tests/load/community-load.js`) modeling realistic concurrent community workflows.
- Authoritative operational documentation: `docs/PRODUCTION_RUNBOOK.md`, `docs/RELEASE_CHECKLIST.md`, and `docs/OPERATIONS.md`.
- Observability and health monitoring service (`src/lib/observability.ts`, `/health.json`, `docs/OBSERVABILITY.md`).

---

*This roadmap is a living document. Phase scope may be refined based on community feedback and technical discoveries. All changes to phase scope require documentation and human sign-off.*
