# Family Members Feature Domain

**Feature path**: `src/features/family-members/`
**Phase introduced**: Phase 4 — Family Creation
**Status**: Complete (Phase 4 Subtasks 1–4). Service foundation, UI roster, creation wizard integration, reverse person-to-family lookup, and lifecycle integration tests all implemented and verified.

---

## Domain Responsibility

The `family-members` domain manages the junction between **Persons** (`public.persons`) and **Families** (`public.families`). It tracks who belongs to which family unit, their respective roles, temporal membership (`joined_at`, `left_at`), and head-of-family status.

---

## Relationship Model

- **Many-to-Many**: A person can belong to multiple families (e.g. family of origin and family of marriage).
- **Unique Membership per Family**: A person cannot have multiple concurrent membership rows in the same family (`UNIQUE (family_id, person_id)`).
- **PERSON ≠ USER Principle**:
  - `person_id` points to a `public.persons` census record (human being). It is NOT an authentication account (`auth.users`).
  - `added_by` points to `auth.users` (the authenticated account that added the member).
  - Regular client inputs cannot supply or modify `added_by`.

---

## Deployed Database Contract

Table: `public.family_members`

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `UUID` | No | Primary Key |
| `family_id` | `UUID` | No | Foreign Key → `families(id)` (`ON DELETE CASCADE`) |
| `person_id` | `UUID` | No | Foreign Key → `persons(id)` (`ON DELETE CASCADE`) |
| `role` | `public.family_role` | No | Relationship role (`HEAD`, `SPOUSE`, `CHILD`, etc.) |
| `is_head` | `BOOLEAN` | No | Flag indicating current head of family |
| `joined_at` | `TIMESTAMPTZ` | No | When person joined the family (defaults to `NOW()`) |
| `left_at` | `TIMESTAMPTZ` | Yes | Timestamp of departure (`NULL` = active member, `non-null` = former member) |
| `added_by` | `UUID` | Yes | Foreign Key → `auth.users(id)` (actor provenance) |
| `created_at` | `TIMESTAMPTZ` | No | Record creation timestamp |

### Single-Head Constraint

The database strictly enforces that a family can have **at most one active head** via a partial unique index:

```sql
CREATE UNIQUE INDEX idx_family_members_one_head
  ON public.family_members (family_id)
  WHERE is_head = TRUE AND left_at IS NULL;
```

Attempting to add or promote a second member with `is_head = TRUE` while another active head exists causes a PostgreSQL constraint violation (`23505`).

---

## Role Enum

The deployed `family_role` enum supports:

- `HEAD`: Head of family
- `SPOUSE`: Spouse / Partner
- `CHILD`: Child / Offspring
- `PARENT`: Parent / Guardian
- `SIBLING`: Brother / Sister
- `GRANDPARENT`: Grandparent
- `GRANDCHILD`: Grandchild
- `EXTENDED`: Extended family relative (default)

---

## Public Service API

File: [`services/family-members.service.ts`](./services/family-members.service.ts)

| Function | Purpose |
|---|---|
| `addFamilyMember(input, callerUserId)` | Add a person to a family. Sets `added_by = callerUserId`. Enforces RLS & unique constraints. |
| `listFamilyMembers(familyId, options?)` | List members of a family with joined person details. Defaults to active (`left_at IS NULL`). `options.includeFormer = true` includes former members. |
| `listPersonFamilies(personId, options?)` | Reverse lookup: list families a person belongs to with joined family summary details. Defaults to active memberships. |
| `getFamilyMember(memberId)` | Fetch a single membership row with joined person details. |
| `updateFamilyMember(memberId, input)` | Update role, `is_head`, or `left_at`. Protected fields cannot be modified. |
| `removeFamilyMember(memberId, options?)` | Remove a member. **Default: Soft-exit** (`left_at = NOW()`). Optional hard-delete when `options.hardDelete = true`. |
| `transferFamilyHead(familyId, newHeadMemberId)` | Client-orchestrated multi-step transfer of family head. Demotes old head, promotes new head, with rollback on failure. |

---

## TanStack Query Hooks

File: `hooks/`

| Hook | Type | Purpose | Cache Invalidation |
|---|---|---|---|
| `useFamilyMembers(familyId, options)` | Query | Fetches member roster for a family with joined person profiles. | — |
| `usePersonFamilies(personId, options)` | Query | Reverse lookup: fetches family units for a person. | — |
| `useFamilyMember(memberId)` | Query | Fetches a single family member record by UUID. | — |
| `useAddFamilyMember()` | Mutation | Adds a member; injects caller `user.id` into `added_by`. | `['family-members', 'list', familyId]` |
| `useUpdateFamilyMember(familyId)` | Mutation | Updates mutable member fields (`role`, `is_head`). | `['family-members', 'list', familyId]`, `['family-members', 'detail', memberId]` |
| `useRemoveFamilyMember(familyId)` | Mutation | Soft-removes member (`left_at = NOW()`). | `['family-members', 'list', familyId]` |
| `useTransferFamilyHead(familyId)` | Mutation | Transfers headship through client-orchestrated demote-then-promote sequence. | `['family-members', 'list', familyId]`, `['families', familyId]` |

---

## UI Components

File: `components/`

| Component | Responsibility |
|---|---|
| `MemberCard` | Renders a member's name (linked to `/people/:personId`), role badge, head indicator, joined/left dates, and management action controls. |
| `MemberList` | Renders active roster and toggleable departed members. Embeds Add, Edit, and Transfer Head modals. Displays empty and loading states. |
| `PersonFamiliesList` | Reverse lookup list mounted on `/people/:personId`. Displays family name linked to `/families/:familyId`, role badge, head indicator, location, joined/left dates, and former membership toggle. |
| `AddMemberModal` | Accessible modal form to add a person from the community census (`usePersonList`), assign a role, set joined date, and optionally designate as head. |
| `EditMemberModal` | Modal to update a member's role or head status. |
| `TransferHeadModal` | Confirmation modal for transferring head of family with explicit disclosure of sequential non-atomic execution. |

---

## Architectural & Security Boundaries

1. **`added_by` Provenance**: Sourced directly from caller's authenticated user ID; never accepted from user input.
2. **Soft-Exit by Default**: Preserves genealogical ties and historical records by updating `left_at`. Hard delete is not casually exposed in the UI.
3. **Head Transfer Non-Atomicity**: Supabase REST does not support multi-statement transactions without custom PostgreSQL RPCs. `transferFamilyHead` is client-orchestrated (demote old head, promote new head, rollback if promotion fails). It is explicitly documented as non-atomic at the database level.
4. **RLS Authorization Authority**:
   - Family creator and community moderators can add, update, and remove members.
   - Community members can view members of `COMMUNITY` and `PUBLIC` families.
   - Individual members can view their own membership rows across all families.
   - Unauthenticated callers receive `42501 permission denied`.
5. **Privacy Model Reality**:
   - The deployed database RLS policy (`family_members_select_community`) evaluates `family.profile_privacy IN ('COMMUNITY', 'PUBLIC')`. It does NOT check `family.members_privacy`.
   - The UI reflects this exact deployed behavior.
6. **Management Capability**:
   - `canManageMembers = isCreator || isCommunityModerator`.
   - Action buttons are conditionally shown based on this check for UX, with PostgreSQL RLS acting as the final enforcement barrier.

---

## Testing Strategy

- **Service Unit Tests** (`tests/unit/family-members.service.test.ts`):
  - Mocked Supabase client testing all CRUD operations, reverse lookups (`listPersonFamilies`), error mapping, validation failures, head transfer recovery, and protected field rejection.
- **Static RLS Specification Tests** (`tests/security/rls-family-members.test.ts`):
  - Tests covering positive and negative logic for all 9 deployed RLS policy rules on `public.family_members`.
- **Component Unit Tests**:
  - `tests/unit/MemberCard.test.tsx`: Person name, badges, action controls visibility.
  - `tests/unit/MemberList.test.tsx`: Active/former tabs, empty states, Add trigger.
  - `tests/unit/PersonFamiliesList.test.tsx`: Reverse lookup component, loading/error/empty states, badges, former memberships.
  - `tests/unit/AddMemberModal.test.tsx`: Person list integration, role options, head warning.
  - `tests/unit/EditMemberModal.test.tsx`: Role modification, modal actions.
  - `tests/unit/TransferHeadModal.test.tsx`: Current vs new head display, process disclosure.
- **Lifecycle Integration Tests** (`tests/integration/phase4-lifecycle.integration.test.ts`):
  - End-to-end integration validation across the entire Phase 4 lifecycle: family creation, initial head staging, member addition, active roster listing, head transfer, reverse lookup, soft departure, former membership filtering, and domain boundary enforcement.

---

## Known Deferrals

| Item | Deferred to |
|---|---|
| Interpersonal relationships (parent/child/spouse edges) | Phase 5 (Family Tree) |
| Member invitation system (tokens, search by name, email) | Phase 8 (Claim / Join / Invitation) |
| Full-text server-side combobox person search | Phase 6 (Discovery) |
| Atomic transactional head-transfer RPC | Phase 15 (Hardening) |
| Live authenticated RLS integration tests | Phase 15 (Hardening) |
