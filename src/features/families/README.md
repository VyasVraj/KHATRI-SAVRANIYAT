# Families Feature Domain

**Feature path**: `src/features/families/`
**Phase introduced**: Phase 3 — Person / Family Foundation
**Status**: Complete (Subtask 2: Service Layer & Schemas; Subtask 4: UI Layer — Hooks, Components & Pages).

> **Note on Naming & Legacy Stub**: There is a separate `src/features/family/` (singular) directory containing a placeholder `FamilyPage.tsx` for the `/family` route. That legacy stub is **not** this domain and must remain untouched. The canonical community families domain is `src/features/families/` (plural) with `/families` routes.

---

## Feature Purpose

The `families` domain manages **Family records** — the family unit entity in Community Roots. A Family groups people together under a shared family identity within the community register. Family records are distinct from both Person records and from family membership (the `family_members` join table, which is Phase 4 scope).

This domain provides:
1. Data access service layer for creating, reading, updating, listing, and soft-deleting family records against the `public.families` table in the deployed Supabase PostgreSQL database.
2. TanStack Query v5 hooks for querying and mutating family server state.
3. Accessible presentation and form components for viewing and managing family records.
4. Protected client-side pages and routes integrated into the application router.

---

## Family Membership — Strict Security Boundary

**Family membership is explicitly OUT OF SCOPE for this domain.**

- The `family_members` join table is **not** queried, mutated, or displayed anywhere in this domain.
- There are **zero** member counts, member rosters, member roles, invitations, or claim mechanisms in Phase 3.
- Family membership management belongs strictly to **Phase 4**.
- In `FamilyDetail`, a static informational callout informs users that family membership and roster management will arrive in Phase 4.

---

## Service Layer

File: [`services/families.service.ts`](./services/families.service.ts)

| Function | Purpose |
|---|---|
| `createFamily(input, createdBy)` | Insert a new family record. `createdBy` is the caller's `auth.uid()`. |
| `getFamily(familyId)` | Fetch a single non-deleted family by UUID. |
| `updateFamily(familyId, input)` | Update user-editable fields on a family record. |
| `listFamilies(params?)` | List family records visible to the current session (up to `limit`, default 50). |
| `softDeleteFamily(familyId)` | Set `deleted_at` timestamp. Never executes SQL DELETE. |

---

## Schemas & Validation

File: [`schemas/families.schemas.ts`](./schemas/families.schemas.ts)

Derived exclusively from the deployed `families` table definition in [`src/types/database.types.ts`](../../types/database.types.ts).

| Schema | Purpose |
|---|---|
| `createFamilySchema` | Validates user input for family creation. Required: `family_name`. Optional: all other user-editable fields. Defaults privacy fields to `COMMUNITY`. |
| `updateFamilySchema` | Validates partial updates. Requires at least one field. |

### Protected / System Fields (Excluded from UI & Schemas)

| Field | Reason |
|---|---|
| `id` | Database-generated UUID |
| `created_at` | Database-generated timestamp |
| `updated_at` | Managed by `update_updated_at_column()` trigger |
| `created_by` | Set from `auth.uid()` by `useCreateFamily` / service; never user input |
| `status` | System-managed state (`DRAFT` → `ACTIVE` via admin/moderation) |
| `verification_status` | System-managed state |
| `deleted_at` | Set only by `softDeleteFamily`; never user input |

---

## TanStack Query Hooks

Path: `src/features/families/hooks/`

All data fetching and server-state mutations use TanStack Query v5 (no `useEffect` data fetching).

| Hook | File | Query Key | Description |
|---|---|---|---|
| `useFamily(familyId)` | `useFamily.ts` | `['families', familyId]` | Fetches single family record by UUID; disabled if `familyId` is empty/undefined. |
| `useFamilyList(params?)` | `useFamilyList.ts` | `['families', 'list', params]` | Fetches family records visible to the current session based on RLS. |
| `useCreateFamily()` | `useFamilyMutations.ts` | Mutation | Creates record; sets `created_by` from `AuthContext`; invalidates `['families']`. |
| `useUpdateFamily()` | `useFamilyMutations.ts` | Mutation | Updates record; invalidates `['families', familyId]` and `['families', 'list']`. |
| `useSoftDeleteFamily()` | `useFamilyMutations.ts` | Mutation | Performs soft-delete; invalidates `['families']`. |

---

## UI Components

Path: `src/features/families/components/`

| Component | File | Description |
|---|---|---|
| `FamilyCard` | `FamilyCard.tsx` | Display-only summary card rendering family name, location (city, state, country), community identity (gotra, kul, nukh), description preview, and profile privacy badge. Accessible button mode with keyboard support when `onClick` provided. |
| `FamilyDetail` | `FamilyDetail.tsx` | Read-only presentation panel sectioned by Overview, Location, Community Identity, Privacy Settings, Membership Info, and Record Info. Safe text rendering only (no `dangerouslySetInnerHTML`). Embedded live `MemberList`. |
| `FamilyForm` | `FamilyForm.tsx` | Controlled form using React Hook Form + Zod resolver with native `<textarea>` for description and independent privacy selectors for `profile_privacy` and `members_privacy`. Excludes all protected fields. Used for `/families/:id/edit`. |
| `FamilyCreationWizard` | `FamilyCreationWizard.tsx` | 4-step creation wizard (Identity & Details, Privacy Settings, Optional Initial Member Staging, Review & Create). Handles sequential orchestration with partial failure recovery and explicit head conflict confirmation. Used for `/families/new`. |

---

## Pages & Routes

Path: `src/features/families/pages/`

All plural family routes are protected behind `ProtectedRoute`:

| Page | File | Route | Description |
|---|---|---|---|
| `FamilyListPage` | `FamilyListPage.tsx` | `/families` | Lists community families with empty/loading/error states and action to add family. |
| `FamilyCreatePage` | `FamilyCreatePage.tsx` | `/families/new` | Renders `FamilyCreationWizard` with multi-step progress, member staging, and error handling. |
| `FamilyDetailPage` | `FamilyDetailPage.tsx` | `/families/:familyId` | Displays `FamilyDetail`, live member roster, edit navigation, and soft-delete with 2-step confirmation. |
| `FamilyEditPage` | `FamilyEditPage.tsx` | `/families/:familyId/edit` | Pre-fills `FamilyForm` with existing data and handles updates. |

---

## Privacy Model

Two independent privacy fields exist on each family record:

1. `profile_privacy`: Controls visibility of the family record itself (enforced by RLS policies `families_select_public` and `families_select_community`).
2. `members_privacy`: Controls visibility of the family's member list (stored on the `families` record).

*Database RLS Reality*: In the deployed schema, `family_members_select_community` evaluates `f.profile_privacy IN ('COMMUNITY', 'PUBLIC')`. Both fields are collected and stored by the wizard, but profile privacy governs RLS access for member rows.

Values: `PRIVATE` | `FAMILY` | `CONNECTIONS` | `COMMUNITY` | `PUBLIC` (both default to `COMMUNITY`).
Both fields are selected using the shared [`PrivacyLevelSelect`](../../components/forms/PrivacyLevelSelect.tsx) component.

---

## Security Boundaries & Rules

1. **`created_by` & `added_by` Authenticity**: Injected from `AuthContext` user ID, never form payload.
2. **`PERSON != USER` Preservation**: Census members reference `public.persons(id)`. Authenticated users in `auth.users` are never automatically converted into census Person records.
3. **No Direct Hard Deletes**: Soft-delete updates `deleted_at`. Hard DELETE is denied by DB RLS (`families_delete_deny`).
4. **No Raw DB Error Exposure**: Sanitized application-level errors via `mapFamilyError()` and `mapFamilyMemberError()`.
5. **No Client Privilege Assumption**: `ProtectedRoute` and UI controls are UX-only; database RLS is the true authorization boundary.
6. **Sequential Orchestration**: Multi-step creation inserts the family record first, then sequentially attaches staged members. If a member attachment fails, processing halts immediately, preserving the created family and reporting the failure with navigation to `FamilyDetail`.

---

## Testing Approach

- **Service Layer**: 36 unit tests in `tests/unit/families.service.test.ts` (mocked Supabase client).
- **RLS Specification**: 30 tests in `tests/security/rls-families.test.ts` (all 7 deployed policies).
- **FamilyCard Component**: 12 tests in `tests/unit/FamilyCard.test.tsx` (text collection & structure verification without DOM dependency).
- **FamilyForm Schema & Security**: 22 tests in `tests/unit/FamilyForm.test.tsx` (validation, constraints, privacy defaults, protected fields rejection).

---

## Public API (`index.ts`)

```typescript
// Service functions and types
export { createFamily, getFamily, updateFamily, listFamilies, softDeleteFamily }
export type { FamilyRow, ListFamiliesParams }

// Schemas and input types
export { createFamilySchema, updateFamilySchema }
export type { CreateFamilyInput, CreateFamilyParsed, UpdateFamilyInput }

// TanStack Query hooks
export { useFamily, useFamilyList, useCreateFamily, useUpdateFamily, useSoftDeleteFamily }

// UI components
export { FamilyCard, FamilyDetail, FamilyForm }

// Pages
export { FamilyListPage, FamilyCreatePage, FamilyDetailPage, FamilyEditPage }
```

---

## Known Limitations

| Limitation | Deferred to |
|---|---|
| Pagination — `listFamilies` uses a fixed limit (default 50) | Phase 6 (Discovery) |
| Family membership (add/remove/invite members, member rosters, roles) | Phase 4 (Implemented) |
| `members_privacy` enforcement on member list queries | Phase 4 (Implemented) |
| Person ↔ Family relationships | Phase 4 (Implemented) |
| Multi-step family creation wizard | Phase 4 (Implemented) |
| Family tree visualization (React Flow) | Phase 5 (Implemented) |
| Admin-only field updates (`status`, `verification_status`) | Phase 13 (Implemented) |
| Full authenticated live RLS integration tests | Phase 15 (Implemented) |

---

## Android Parity (ANDROID-5 — Family Census)

The following Android reference parity features (Screens 11–16) are integrated into this domain:
1. **Family Census Navigation & Registration**: `/families` provides a mobile-first Family Census view with dynamic multilingual headers, total registered families count, real-time client search filtering across name/lineage/city, and direct registration triggers.
2. **Ghar Mukhi (Head of Family) Highlight**: `FamilyDetail` prominently displays the designated Ghar Mukhi at the top of the census view with crown recognition, role/lineage badges, profile navigation, and clear alert handling if no head is designated.
3. **Census Completeness & Lineage Metrics**: Canonical data calculation displays roster member count, Ghar Mukhi status, lineage completeness (Gotra, Kul, Nukh), and one-click navigation to the visual genealogical tree.
4. **Searchable Member Staging**: `AddMemberModal` and `FamilyCreationWizard` feature inline text search to easily filter census individuals by name, gotra, or birthplace.
5. **Relationship Linkage**: `MemberCard` connects each census member to interpersonal relationships (`/people/:id#relationships`).
6. **Privacy Enforcement**: ANDROID-2 privacy lock remains strictly enforced; privacy settings are completely hidden and immutable for non-moderator roles.

