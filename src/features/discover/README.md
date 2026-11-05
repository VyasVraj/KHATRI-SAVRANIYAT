# Community Discovery Domain (`src/features/discover`)

## Purpose
The **Discovery** feature domain provides privacy-respecting, high-concurrency search and multi-criteria filtering for community members and family units. It enables exploring the community census registry across Vedic lineage, clans, and regional clusters.

---

## Domain Architecture & Core Principles

1. **`PERSON != USER`**:
   - The directory searches human census records (`public.persons`), not authentication identities (`auth.users`).
   - User account credentials, passwords, and tokens are never queried.
2. **`FAMILY != HOUSEHOLD`**:
   - Family discovery explores genealogical family lineages (`public.families`), not physical housing units or residential cohabitation.
3. **`FAMILY MEMBERSHIP != GENEALOGY`**:
   - Family cards link to rosters; person records link to profiles and family tree graphs (`/people/:id/tree`).

---

## Supported Discovery Filters (Phase 6)

### People Directory (Subtask 2)
- `search` / `query`: Free-text name search matching `first_name`, `last_name`, and `maiden_name` (accelerated by `idx_persons_name_fts` and trigram indexes).
- `gotra`: Vedic ancestral lineage (accelerated by `idx_persons_gotra`).
- `nukh`: Ancestral sub-lineage (accelerated by `idx_persons_nukh`).
- `kul`: Clan / deity lineage.
- `birth_place`: Birth town / ancestral origin.
- `status`: Lifecycle state (`ACTIVE`, `DECEASED`, `DRAFT`).
- `verification_status`: Record verification state (`VERIFIED`, `PENDING`, `UNVERIFIED`, `REJECTED`).

### Family Directory (Subtask 3)
- `search` / `query`: Free-text search matching `family_name` and `description` (accelerated by `idx_families_fts` and `idx_families_name_trgm`).
- `family_name`: Family name search.
- `gotra`: Family Vedic lineage (accelerated by `idx_families_gotra`).
- `nukh`: Family sub-lineage (accelerated by `idx_families_nukh`).
- `kul`: Family clan lineage (accelerated by `idx_families_kul`).
- `city`: Residential city (accelerated by `idx_families_location`).
- `state`: Residential state (accelerated by `idx_families_location`).
- `country`: Residential country (accelerated by `idx_families_location`).
- `status`: Lifecycle state (`ACTIVE`, `DRAFT`, `ARCHIVED`).
- `verification_status`: Record verification state (`VERIFIED`, `PENDING`, `UNVERIFIED`, `REJECTED`).

---

## Unsupported & Deferred Filters

- **Person `city` / `state` / `country`**: In the deployed schema, residential location is stored on `families`, while `persons` only stores `birth_place`. Person queries do not support current residence filters.
- **Mukhi Leadership Filter & Directory**: The deployed database schema has no `mukhi` column on `persons` or `families`. Mukhi leadership and Panchayat committee directories belong to **Phase 10 (Community Features)**.
- **Family `native_place`**: Not a column on `families`; ancestral origin is captured via `persons.birth_place`.

---

## Directory UI Architecture

### People Directory (`src/features/discover/components/PeopleDirectory.tsx`)
- Search debouncing (~300ms) via `useDebounce`.
- Multi-criteria filter drawer (`PeopleFilters`) and removable chips (`PeopleFilterChips`).
- Privacy-safe `PersonDirectoryCard` with navigation to `/people/:id`.
- Fetch N+1 pagination controls (`DirectoryPagination`).
- Query hook: `usePeopleDirectory` (query key: `['people-directory', filters, page, pageSize]`).

### Family Directory (`src/features/discover/components/FamilyDirectory.tsx`)
- Search debouncing (~300ms) matching family name and description.
- Lineage (`gotra`, `nukh`, `kul`) and geographic location (`city`, `state`, `country`) filter drawer (`FamilyFilters`).
- Removable chips (`FamilyFilterChips`) and "Clear all" action.
- Privacy-safe `FamilyDirectoryCard` with navigation to `/families/:id`.
- Fetch N+1 pagination controls (`DirectoryPagination`).
- Query hook: `useFamilyDirectory` (query key: `['family-directory', filters, page, pageSize]`).

### Page Container (`src/features/discover/pages/DiscoverPage.tsx`)
- Mounted at `/discover` within the authenticated route layout (`ProtectedRoute`).
- Accessible tabbed interface switching seamlessly between People Directory and Family Directory.

---

## Pagination Contract: Fetch N+1

Under anticipated peak traffic of **~9,000 active concurrent community members**, issuing `COUNT(*)` queries on every search incurs severe database CPU and lock contention. 

Phase 6 implements the **Fetch N+1** pagination contract:
- Request range is set to `[(page - 1) * pageSize, (page - 1) * pageSize + pageSize]`.
- For `pageSize = 20`, the service fetches 21 records.
- If 21 records return: `hasNextPage = true`, and the 21st record is trimmed.
- If $\le 20$ records return: `hasNextPage = false`.
- `hasPreviousPage` is derived as `page > 1`.
- Maximum page size is strictly capped at `pageSize <= 50`.
- Zero database count queries are executed.

---

## Two-Gate Security & RLS Authority

1. **Gate 1 (SQL Discretionary Privileges)**:
   - Only `authenticated` sessions possess SELECT privileges on `persons` and `families`.
   - `anon` callers are denied access with PostgreSQL error `42501 (insufficient_privilege)`.
2. **Gate 2 (Row-Level Security)**:
   - PostgreSQL RLS policies evaluate on every query row using the caller's JWT.
   - `profile_privacy IN ('PRIVATE', 'FAMILY')` records are automatically omitted unless the caller is the owner or an authorized administrator (`is_community_moderator() = TRUE`).
   - Soft-deleted rows (`deleted_at IS NOT NULL`) are omitted.
   - Archived rows (`status = 'ARCHIVED'`) are omitted from directory results by default.
3. **Payload Sanitization**:
   - Contact fields (`phone`, `email_contact`, `phone_secondary`) are strictly excluded from directory projections.
   - Internal keys (`user_id`, `created_by`, timestamps) are strictly excluded.

---

## Subtask Phasing Boundary

- **Subtask 1 (Complete)**: Discovery domain types, Zod schemas, service query layer, and unit tests.
- **Subtask 2 (Complete & Closed)**: People directory UI, multi-criteria filtering, search cards, and pagination.
- **Subtask 3 (Complete & Closed)**: Family directory UI, location/lineage filters, family search cards, and DiscoverPage tab integration.
- **Subtask 4 (Complete & Closed)**: Discovery integration, mobile responsive polish, unified header, and Phase 6 completion verification.

---

## ANDROID-6: Directory, Filters & Discovery UX Parity (Screens 03, 16–20)

### 1. Screen Mapping & Parity
- **Screen 03 (Directory Search Entry)**: Full-text search with 300ms debouncing, accessible clear button (`X`), and mobile keyboard responsiveness.
- **Screen 16 (Directory Main View & Tab Navigation)**: Seamless switching between `People Directory` and `Family Directory` tabs, total result count indicators (`Showing X members` / `Showing X families`), and quick entity creation CTAs.
- **Screens 17 & 18 (Multi-Criteria Filter Drawer & Active Chips)**: Collapsible filter panels for Gotra, Nukh, Kul, Location (Birth Place on Person; City, State, Country on Family), Living Status, and Verification Status. Active filters rendered as removable chips with a one-tap "Clear all" action.
- **Screen 19 (Person Directory Card)**: Displays avatar initials, full name, maiden name (`née ...`), verification badge, living status/lifespan, birthplace with MapPin icon, and lineage tags. Enhanced with direct quick-action buttons for "View Profile" (`/people/:id`) and "Family Tree" (`/tree?rootPersonId=:id`).
- **Screen 20 (Family Directory Card)**: Displays family avatar, family name, location (City, State, Country) with MapPin icon, description preview, lineage tags, status badge, and verification badge. Enhanced with direct quick-action buttons for "View Family" (`/families/:id`) and "Family Tree" (`/tree?familyId=:id`).

### 2. Multi-Language Support (Section 13)
All visible directory strings are connected to the central i18n system with complete translations across:
- **English (`en`)**
- **Hindi (`hi`)** (`समुदाय डायरेक्टरी`, `सदस्य डायरेक्टरी`, `परिवार डायरेक्टरी`, `गोत्र`, `नुख`, `कुल`, `प्रोफ़ाइल देखें`, `वंशवृक्ष देखें`)
- **Gujarati (`gu`)** (`સમુદાય ડિરેક્ટરી`, `સભ્યો ડિરેક્ટરી`, `પરિવાર ડિરેક્ટરી`, `ગોત્ર`, `નૂખ`, `કુળ`, `પ્રોફાઇલ જુઓ`, `કુટુંબ વૃક્ષ જુઓ`)

### 3. Invariants & Scope Boundaries
- **Zero Database Migrations**: Relies entirely on canonical `persons` and `families` schema, PostgreSQL FTS indexes, and existing RLS policies.
- **`PERSON ≠ USER`**: Exposes human census records; never queries authentication credentials or exposes internal user metadata.
- **Privacy Model**: Respects 5-tier privacy (`PRIVATE`, `FAMILY`, `CONNECTIONS`, `COMMUNITY`, `PUBLIC`). Contact data (`phone`, `email_contact`) is omitted from directory projections.
- **ANDROID-7 Scope Isolation**: Claim and verification approval flows are intentionally deferred to ANDROID-7.


