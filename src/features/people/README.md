# People Feature Domain

**Feature path**: `src/features/people/`
**Phase introduced**: Phase 3 — Person / Family Foundation
**Status**: Complete (Subtask 1: Service Layer & Schemas; Subtask 3: UI Layer — Hooks, Components & Pages).

---

## Feature Purpose

The `people` domain manages **Person records** — the core community census entity in Community Roots. A Person represents a human being within the community register. Person records are independent of authentication accounts.

This domain provides:
1. Data access service layer for creating, reading, updating, listing, and soft-deleting person records against the `public.persons` table in the deployed Supabase PostgreSQL database.
2. TanStack Query v5 hooks for querying and mutating person server state.
3. Accessible presentation and form components for viewing and managing person census records.
4. Protected client-side pages and routes integrated into the application router.

---

## PERSON ≠ USER — Critical Domain Rule

A **Person** (`public.persons`) is a community census record.
A **User** (`auth.users` + `public.profiles`) is an authentication identity.

These are **strictly separate entities**:

- A Person can exist with no linked User (e.g., a deceased ancestor, an unregistered family member).
- A User may be linked to at most one Person via the `user_id` foreign key.
- `user_id` is `NULL` on all Person records created through this service. The claim/linking workflow is a future phase (Phase 8).
- **This service and UI never set `user_id` from user-controlled input.**

This boundary is enforced across layers:
1. Zod schemas — `user_id` is absent from all input schemas.
2. UI forms — `user_id` is omitted from `PersonForm` and rendered views.
3. Mutation hooks — `created_by` is read from `useAuthContext().user.id`, never form input.
4. Service functions — `createPerson` explicitly omits `user_id` from the insert payload.
5. Database RLS — `persons_insert_authenticated` policy enforces `user_id IS NULL` at the PostgreSQL level.

---

## Service Layer

File: [`services/people.service.ts`](./services/people.service.ts)

| Function | Purpose |
|---|---|
| `createPerson(input, createdBy)` | Insert a new person record. `createdBy` is caller's `auth.uid()`. |
| `getPerson(personId)` | Fetch a single non-deleted person by UUID. |
| `updatePerson(personId, input)` | Update user-editable fields on a person record. |
| `listPersons(params?)` | List person records visible to current session (up to `limit`, default 50). |
| `softDeletePerson(personId)` | Set `deleted_at` timestamp. Never executes SQL DELETE. |

---

## Schemas & Validation

File: [`schemas/people.schemas.ts`](./schemas/people.schemas.ts)

Derived exclusively from the deployed `persons` table definition in [`src/types/database.types.ts`](../../types/database.types.ts).

| Schema | Purpose |
|---|---|
| `createPersonSchema` | Validates user input for person creation. Required: `first_name`, `last_name`. Optional: all other user-editable fields. Defaults privacy fields to `COMMUNITY`. |
| `updatePersonSchema` | Validates partial updates. Requires at least one field. |

### Protected / System Fields (Excluded from UI & Schemas)

| Field | Reason |
|---|---|
| `id` | Database-generated UUID |
| `created_at` | Database-generated timestamp |
| `updated_at` | Managed by `update_updated_at_column()` trigger |
| `created_by` | Set from `auth.uid()` by `useCreatePerson` / service; never user input |
| `user_id` | Always `NULL` (PERSON ≠ USER) |
| `status` | System-managed state (`DRAFT` → `ACTIVE` via admin/moderation) |
| `verification_status` | System-managed state |
| `deleted_at` | Set only by `softDeletePerson`; never user input |

---

## TanStack Query Hooks

Path: `src/features/people/hooks/`

All data fetching and server-state mutations use TanStack Query v5 (no `useEffect` data fetching).

| Hook | File | Query Key | Description |
|---|---|---|---|
| `usePerson(personId)` | `usePerson.ts` | `['persons', personId]` | Fetches single person record by UUID; disabled if `personId` is empty/undefined. |
| `usePersonList(params?)` | `usePersonList.ts` | `['persons', 'list', params]` | Fetches person records visible to the current session based on RLS. |
| `useCreatePerson()` | `usePersonMutations.ts` | Mutation | Creates record; sets `created_by` from `AuthContext`; invalidates `['persons']`. |
| `useUpdatePerson()` | `usePersonMutations.ts` | Mutation | Updates record; invalidates `['persons', personId]` and `['persons', 'list']`. |
| `useSoftDeletePerson()` | `usePersonMutations.ts` | Mutation | Performs soft-delete; invalidates `['persons']`. |

---

## UI Components

Path: `src/features/people/components/`

| Component | File | Description |
|---|---|---|
| `PersonCard` | `PersonCard.tsx` | Display-only summary card rendering full name, maiden name, initials avatar, gender badge, and community identity (gotra/kul/nukh). Accessible button mode with keyboard support when `onClick` provided. |
| `PersonDetail` | `PersonDetail.tsx` | Read-only presentation component displaying all user-visible profile sections (Identity, Community, Contact, Privacy, Record info). Renders text only (no `dangerouslySetInnerHTML`). |
| `PersonForm` | `PersonForm.tsx` | Controlled form using React Hook Form + Zod resolver. Provides clean sectioned inputs for name, identity, community, contact, and independent privacy controls. Disallows protected fields. |
| `PrivacyLevelSelect` | `src/components/forms/PrivacyLevelSelect.tsx` | Shared native `<select>` with Tailwind styling for independent selection of privacy levels (`profile_privacy`, `contact_privacy`, `dob_privacy`). |

---

## Pages & Routes

Path: `src/features/people/pages/`

All person routes are protected behind `ProtectedRoute`:

| Page | File | Route | Description |
|---|---|---|---|
| `PersonListPage` | `PersonListPage.tsx` | `/people` | Lists census persons with empty/loading/error states and action to add person. |
| `PersonCreatePage` | `PersonCreatePage.tsx` | `/people/new` | Renders `PersonForm` in create mode; navigates to detail on success. |
| `PersonDetailPage` | `PersonDetailPage.tsx` | `/people/:personId` | Displays `PersonDetail`, edit navigation, and soft-delete with confirmation. |
| `PersonEditPage` | `PersonEditPage.tsx` | `/people/:personId/edit` | Pre-fills `PersonForm` with existing data and handles updates. |

---

## Privacy Model

Three independent privacy fields exist on each person record:

1. `profile_privacy`: Overall record visibility.
2. `contact_privacy`: Contact info visibility (email, phone).
3. `dob_privacy`: Date of birth visibility.

Values: `PRIVATE` | `FAMILY` | `CONNECTIONS` | `COMMUNITY` | `PUBLIC` (default: `COMMUNITY`).
Database RLS enforces actual visibility; the UI respects the privacy levels returned by the server.

---

## Security Boundaries & Rules

1. **PERSON ≠ USER**: `persons.user_id` is never set or mutated by this UI or service.
2. **`created_by` Authenticity**: Injected from `AuthContext` user ID, never form payload.
3. **No Direct Hard Deletes**: Soft-delete updates `deleted_at`. Hard DELETE is denied by DB RLS.
4. **No Raw DB Error Exposure**: Sanitized application-level errors via `mapPersonError()`.
5. **No Client Privilege Assumption**: `ProtectedRoute` is UX-only; database RLS is the real authorization boundary.

---

## Testing Approach

- **Service Layer**: 35 unit tests in `tests/unit/people.service.test.ts` (mocked Supabase client).
- **RLS Specification**: 20 tests in `tests/security/rls-persons.test.ts`.
- **PersonCard Component**: 19 tests in `tests/unit/PersonCard.test.tsx` (text collection & structure verification without DOM dependency).
- **PersonForm Schema & Security**: 28 tests in `tests/unit/PersonForm.test.tsx` (validation, constraints, privacy defaults, protected fields rejection).
- **Total Suite Passing**: 312 tests across 14 test files.

---

## Public API (`index.ts`)

```typescript
// Service functions & types
export { createPerson, getPerson, updatePerson, listPersons, softDeletePerson }
export type { PersonRow, ListPersonsParams }

// Schemas & types
export { createPersonSchema, updatePersonSchema }
export type { CreatePersonInput, CreatePersonParsed, UpdatePersonInput }

// TanStack Query hooks
export { usePerson, usePersonList, useCreatePerson, useUpdatePerson, useSoftDeletePerson }

// Components
export { PersonCard, PersonDetail, PersonForm }

// Pages
export { PersonListPage, PersonCreatePage, PersonDetailPage, PersonEditPage }
```

---

## Known Limitations

| Limitation | Deferred to |
|---|---|
| Pagination — `listPersons` uses a fixed limit (default 50) | Phase 6 (Discovery) |
| Family UI (`FamilyCard`, `FamilyDetail`, Family pages) | Phase 3 Subtask 4 |
| Person ↔ Family relationships and membership UI | Phase 4 |
| Admin-only field updates (`status`, `verification_status`) | Phase 13 |
| Claim/linking person record to auth user | Phase 8 |
| Full authenticated live RLS integration tests | Phase 15 |
