# Interpersonal Relationships Feature Domain

**Feature path**: `src/features/relationships/`  
**Phase introduced**: Phase 5 — Family Tree / Interpersonal Relationships  
**Status**: Subtasks 1 & 2 Complete (Schema, Migration, Privileges, Service Layer, Hooks & UI). Subtask 3 (Tree Layout Engine & React Flow) is NOT started.

---

## Domain Responsibility

The `relationships` domain manages direct interpersonal edges connecting two **Persons** (`public.persons`). Unlike family unit memberships (`family_members`), which tie individuals to a corporate family household, `relationships` models genealogical and matrimonial bonds:

- **PARENT**: Generational lineage (parent to child).
- **SPOUSE**: Marriage / civil partnership.
- **SIBLING**: Direct sibling bonds (assertable without requiring known parent records).

---

## Core Invariants & Semantics

### 1. PERSON ≠ USER Principle
- `person_a_id` and `person_b_id` refer exclusively to `public.persons` census records (human beings).
- They never refer to `auth.users`.
- `created_by` references `auth.users(id)` for actor provenance, but is never accepted from untrusted client input.

### 2. Canonical Relationship Models
- **PARENT (Directional)**:
  - `person_a_id` is always the parent.
  - `person_b_id` is always the child.
  - Reciprocal "child" records are **never** stored in the database.
  - The service layer dynamically projects directional roles (`parent` vs `child`) depending on which endpoint person is being inspected.
- **SPOUSE & SIBLING (Symmetric Canonical)**:
  - Symmetric bonds enforce canonical lexical ordering at both the database level (CHECK constraint) and Zod schema level: `person_a_id < person_b_id`.
  - Reciprocal reverse rows are prohibited.
  - Exactly one canonical row represents the relationship.
- **SIBLING Directly Assertable**:
  - Sibling relationships can be established directly between two persons without requiring parents to be known or recorded.

### 3. Cycle & Integrity Protection
- **No Self-Links**: `person_a_id <> person_b_id` enforced by CHECK constraint and schema validation.
- **Ancestry Cycle Detection**: The service layer traverses up to 10 generations of parentage to prevent creating impossible ancestry loops (a descendant becoming the ancestor of their parent).
- **Soft Deletion**: `deleted_at TIMESTAMPTZ` handles relationship departures. Active uniqueness is enforced via partial index `WHERE deleted_at IS NULL`, allowing recreation of previously soft-deleted edges.
- **Verification**: Reuses the core `public.verification_status` enum (`UNVERIFIED`, `COMMUNITY_VERIFIED`, `OFFICIALLY_VERIFIED`). No separate `relationship_status` enum is introduced.

---

## Database Contract

Migration file: `supabase/migrations/20261004150000_create_relationships.sql`

Table: `public.relationships`

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `person_a_id` | `UUID` | No | — | Endpoint A (`REFERENCES persons(id) ON DELETE RESTRICT`) |
| `person_b_id` | `UUID` | No | — | Endpoint B (`REFERENCES persons(id) ON DELETE RESTRICT`) |
| `relationship_type` | `relationship_type` | No | — | Enum: `PARENT`, `SPOUSE`, `SIBLING` |
| `notes` | `TEXT` | Yes | `NULL` | Optional relationship notes |
| `verification_status` | `verification_status` | No | `'UNVERIFIED'` | Moderation / verification state |
| `created_by` | `UUID` | Yes | `auth.uid()` | Provenance link to `auth.users(id)` |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Timestamp of creation |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Maintained by `handle_updated_at()` trigger |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | Soft-deletion timestamp |

### Indexes
- `idx_relationships_active_unique`: `(person_a_id, person_b_id, relationship_type) WHERE deleted_at IS NULL`
- `idx_relationships_person_a`: `(person_a_id) WHERE deleted_at IS NULL`
- `idx_relationships_person_b`: `(person_b_id) WHERE deleted_at IS NULL`
- `idx_relationships_type`: `(relationship_type) WHERE deleted_at IS NULL`
- `idx_relationships_created_by`: `(created_by) WHERE created_by IS NOT NULL`

---

## Two-Gate Access Control & Security Policies

### Gate 1: SQL Privileges
- `PUBLIC`: No privileges (`REVOKE ALL ON TABLE public.relationships FROM PUBLIC`).
- `anon`: No privileges (`REVOKE ALL ON TABLE public.relationships FROM anon`).
- `authenticated`:
  - Granted privileges: `SELECT`, `INSERT`, `UPDATE` (`GRANT SELECT, INSERT, UPDATE ON TABLE public.relationships TO authenticated`).
  - Denied privileges: No `DELETE`, no `TRUNCATE`, no `REFERENCES`, no `TRIGGER`.
- Application relationship deletion is exclusively soft deletion through `deleted_at`.

### Gate 2: Row Level Security (RLS) & Triggers
1. **`relationships_update_guard` (BEFORE UPDATE Trigger)**:
   Database-level immutability enforcement preventing non-moderator callers from altering `id`, `person_a_id`, `person_b_id`, `relationship_type`, `created_by`, `created_at`, or `verification_status`. Also prevents modifying already soft-deleted rows or altering notes during soft-deletion.
2. **`relationships_select_dual_endpoint`**:
   Active relationship edges (`deleted_at IS NULL`) are visible only when the caller is authorized to view **both** endpoint persons under active `public.persons` RLS policies.
3. **`relationships_select_admin`**:
   Community moderators can view all relationships including soft-deleted rows.
4. **`relationships_insert_authenticated`**:
   Authenticated users can insert relationships between persons they are authorized to view, with `created_by = auth.uid()`.
5. **`relationships_insert_admin`**:
   Moderators can insert relationships with verified provenance (`created_by = auth.uid()`).
6. **`relationships_update_creator`**:
   The record creator can update active relationship records (notes only) (`auth.uid() = created_by AND deleted_at IS NULL`). `WITH CHECK` enforces that the record remains active (`deleted_at IS NULL`) and `created_by` cannot be reassigned.
7. **`relationships_soft_delete_creator`**:
   Narrowly-scoped dedicated policy allowing the creator to soft-delete their own active relationship (`auth.uid() = created_by AND deleted_at IS NULL`). `WITH CHECK` strictly enforces that `created_by` cannot be modified and `deleted_at IS NOT NULL`. Once soft-deleted, it cannot be modified or un-deleted by the creator.
8. **`relationships_update_admin`**:
   Moderators can update any relationship record (including verification status and administrative lifecycle management).
9. **`relationships_delete_deny`**:
   Physical DELETE is denied (`USING (FALSE)`). The canonical lifecycle is soft deletion via `deleted_at`.

---

## Service Layer API

All methods are located in `src/features/relationships/services/relationships.service.ts` and exported via `src/features/relationships/index.ts`:

- `createRelationship(input, callerUserId)`: Validates input, prevents ancestry cycles, rejects duplicate active edges, and inserts the canonical row.
- `listPersonRelationships(personId, options)`: Returns all active relationships connected to the target person, projecting directional roles (`parent`, `child`, `spouse`, `sibling`) and populating person metadata.
- `getRelationship(id)`: Fetches a single relationship record joined with both endpoint person profiles.
- `updateRelationship(id, input, callerUserId)`: Updates mutable fields (`notes`) on active records.
- `softDeleteRelationship(id, callerUserId)`: Sets `deleted_at = NOW()` on active records via `relationships_soft_delete_creator`, returning `Promise<ApiResponse<void>>`.

---

## TanStack Query Hooks

Exported via `src/features/relationships/index.ts`:

- `usePersonRelationships(personId, options?)`:
  - Fetches grouped relationship summary (`parents`, `children`, `spouses`, `siblings`, `all`).
  - Query key: `['relationships', 'person', personId, options]`.
  - **Gate 1 Enforcement**: Automatically disabled when unauthenticated (`enabled: Boolean(personId) && isAuthenticated`), preventing 42501 permission denied errors.
- `useAddRelationship()`:
  - Translates user relative role to canonical `CreateRelationshipInput` via `mapRoleToCanonicalRelationship`.
  - Injects authenticated user ID from `useAuthContext()`.
  - Invalidates `['relationships']` on success.
- `useUpdateRelationship()`:
  - Updates mutable `notes`.
  - Injects authenticated user ID from `useAuthContext()`.
  - Invalidates `['relationships']` on success.
- `useSoftDeleteRelationship()`:
  - Calls `softDeleteRelationship` to logically remove edge.
  - Injects authenticated user ID from `useAuthContext()`.
  - Invalidates `['relationships']` on success.

---

## Canonical Role Mapping

Human-friendly relationship roles are mapped to canonical database representations via `mapRoleToCanonicalRelationship`:

| User Role Selection | Canonical Mapping |
|---|---|
| **Parent** | `person_a_id = selectedParentId`, `person_b_id = targetPersonId`, `relationship_type = 'PARENT'` |
| **Child** | `person_a_id = targetPersonId`, `person_b_id = selectedChildId`, `relationship_type = 'PARENT'` |
| **Spouse** | `person_a_id = min(target, selected)`, `person_b_id = max(target, selected)`, `relationship_type = 'SPOUSE'` |
| **Sibling** | `person_a_id = min(target, selected)`, `person_b_id = max(target, selected)`, `relationship_type = 'SIBLING'` |

---

## UI Components & Person Detail Integration

Located in `src/features/relationships/components/` and exported via `index.ts`:

- `PersonRelationshipsList`: Container section embedded on `PersonDetailPage` at `/people/:personId`. Categorizes active edges into Parents, Children, Spouses, and Siblings. Renders nothing for unauthenticated visitors (Gate 1 compliance).
- `RelationshipCard`: Presentational card rendering related person link, role badge, notes, and management actions (Edit notes, Remove).
- `AddRelationshipModal`: Accessible modal for adding relationships. Uses `usePersonList({ limit: 50 })`, excludes self-selection, and performs canonical mapping.
- `EditRelationshipModal`: Accessible modal for updating `notes`. Endpoints and relationship type remain immutable.
- `RemoveRelationshipDialog`: Accessible confirmation dialog for soft-deleting relationship edges.

### Privacy & RLS Guarantees
- **No Anonymous Access**: Unauthenticated visitors have zero Gate 1 privileges on `public.relationships`. The relationship UI renders nothing for unauthenticated sessions.
- **No Inferred Hidden Relationships**: If RLS excludes an edge because an endpoint is private, the row is not returned by the database. The UI does NOT manufacture `[Private Person]` placeholders for excluded rows.
- **Elevation Fallback**: If an authorized moderator query returns a relationship row where person metadata is null, the UI renders a neutral `Unavailable Record` without profile links or leaked attributes.
- **Person Selector Limit**: Person selection is currently limited to 50 census records (`usePersonList({ limit: 50 })`). Advanced searchable pagination is deferred to Phase 6 (Discovery).

