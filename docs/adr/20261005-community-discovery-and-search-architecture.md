# ADR: Community Directory, Search Architecture & Discovery Privacy (Phase 6)

- **Status:** Proposed & Corrected in Pre-Implementation Verification (Baseline for Phase 6 Architecture)
- **Date:** 2026-10-05
- **Target Systems:** Community Roots Platform (`community-family-platform`, Supabase / PostgreSQL)
- **Context Area:** Community Directory, Full-Text & Trigram Search, Lineage/Location Filtering, Privacy Protection, High-Concurrency Scalability

---

## 1. Context & Business Requirements

Following the completion of **Phase 5 (Genealogical Relationships & Family Tree)**, the platform's core relational graph—encompassing persons (`public.persons`), family units (`public.families`), memberships (`public.family_members`), and interpersonal relationships (`public.relationships`)—is fully established.

Community members now require the ability to **discover and search** for individuals and families across the community census.

### 1.1 Legacy System Alignment (KhatriSetu Android App & Excel Artifacts)
Analysis of the 49-page Android app capture (`khatrisetu app screenshots.pdf`, Screens 03, 16–20, 32–35) and production registry (`khatrisetu-families-2026-10-01.xlsx`) identified key legacy discovery workflows:
1. **Directory Search & Deep Filtering**:
   - Multi-criteria filtering by:
     - Free-text Name / Surname
     - Birth Place / Town (`birth_place` on `persons`)
     - Residential Location (`city`, `state`, `country` on `families`)
     - Gotra (Vedic lineage) & Nukh (Ancestral lineage) & Kul (Clan)
     - Verification status (`VERIFIED` vs All)
     - Life status (`LIVING` vs `DECEASED`)
2. **Mukhi Leadership Directory (Screens 32–35)**:
   - Directory of 118 community elders / regional leaders with state/city filters. Because no `mukhi` column exists on `persons` or `families` in the deployed database schema, full Mukhi leadership and committee governance is cleanly partitioned into **Phase 10 (Community Features)**.
3. **High-Concurrency Demographics**:
   - The platform is designed to serve a close-knit community with expected concurrent usage spikes of ~9,000 active users during community events and census updates.

---

## 2. Architectural Decisions

### 2.1 Search Execution Pattern: Database Full-Text Search (FTS) & Trigram Matching

#### Decision
Search will leverage PostgreSQL native extensions already enabled in Phase 1:
- `unaccent`: Diacritic-insensitive matching.
- `pg_trgm`: Trigram-based fuzzy similarity matching for names and surnames.
- Native PostgreSQL `tsvector` and `tsquery` (English / Simple dictionary).

#### Rationale
- **Zero External Search Cluster Overhead**: Elasticsearch, Meilisearch, or Algolia would introduce operational complexity, synchronization pipelines, and potential privacy synchronization lag.
- **Strict RLS Enforcement**: In-database search guarantees that PostgreSQL Row-Level Security policies are evaluated directly on every queried row. Private records are filtered out by the database engine before results are formed.
- **Existing Index Foundation**: Phase 1 migration `20261002140000_phase1_foundation.sql` already created GIN indexes:
  - `idx_persons_name_fts` on `to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(maiden_name, ''))`
  - `idx_persons_first_name_trgm` and `idx_persons_last_name_trgm`
  - `idx_families_fts` on `to_tsvector('english', coalesce(family_name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(city, ''))`
  - `idx_families_name_trgm`
  - B-tree lineage indexes: `idx_persons_gotra`, `idx_persons_nukh`, `idx_families_gotra`, `idx_families_nukh`, `idx_families_kul`, and location index `idx_families_location`.

### 2.2 Dual-Entity Directory: People & Families Separation

#### Decision
The directory at `/discover` will feature two primary domain tabs:
1. **People Directory**: Search and filter individual census persons (`public.persons`) using `first_name`, `last_name`, `maiden_name`, `gotra`, `nukh`, `kul`, `birth_place`, `status`, `verification_status`.
2. **Families Directory**: Search and filter social family units (`public.families`) using `family_name`, `description`, `city`, `state`, `country`, `gotra`, `nukh`, `kul`, `status`, `verification_status`.

#### Domain Invariant Preservation
- `PERSON != USER`: Directory displays human census profiles. User account details (`auth.users`) and sensitive credentials are never queried.
- `FAMILY != HOUSEHOLD`: Family discovery finds lineage units, not physical residential addresses.
- `FAMILY MEMBERSHIP != GENEALOGY`: Person directory links to personal profiles and trees; family directory links to family rosters.

### 2.3 Search Privacy & Information Leakage Prevention

#### Decision
1. **Two-Gate Protection**:
   - **Gate 1**: Directory search queries are restricted to authenticated community members (`authenticated` role). Unauthenticated visitors receive a sign-in prompt.
   - **Gate 2**: PostgreSQL RLS policies on `public.persons` and `public.families` automatically exclude records where `profile_privacy` is `PRIVATE` or `FAMILY`.
2. **Field-Level Privacy in Search Results**:
   - Search result cards must **never** expose sensitive contact fields (`phone`, `email_contact`, `phone_secondary`) or internal database identifiers (`user_id`, `created_by`, timestamps).
   - Only publicly shareable census attributes are rendered: full name, location (`birth_place` for persons; `city`/`state` for families), Gotra, Nukh, Kul, birth year (or deceased year), and verification badge.
3. **Anti-Scraping & Enumeration Protection**:
   - All directory search endpoints enforce a hard page limit (`MAX_PAGE_SIZE = 50`).
   - Deterministic sorting (`ORDER BY last_name ASC, first_name ASC, id ASC` for persons; `ORDER BY family_name ASC, id ASC` for families) prevents result shifting.

### 2.4 Pagination Architecture & Scalability (~9,000 Concurrent Users)

#### Decision
- **Canonical Pagination Strategy**:
  - Use deterministic ordered pagination with `pageSize <= 50`, fetching `pageSize + 1` rows to derive `hasNextPage` without requiring `COUNT(*)` on every query.
  - Standardized contract: `{ data: T[], page: number, pageSize: number, hasNextPage: boolean, hasPreviousPage: boolean }`.
- **Query Optimization**:
  - Full-table `COUNT(*)` under high concurrency (~9,000 active users) causes avoidable table scans and lock contention. Fetch N+1 provides instant response times while perfectly serving mobile and web directory pagination.
- **Client Caching**:
  - TanStack Query v5 will manage search caching with a 5-minute `staleTime` and input debouncing (350ms) to prevent query storms while users type search terms.

---

## 3. Legacy Feature Mapping & Scope Partitioning

| Legacy Feature | Legacy Screens | Scope Allocation | Rationale |
|---|---|---|---|
| **Free-Text Search** | Screen 03 | **Phase 6** | Core directory search requirement |
| **Surname / Name Filters** | Screen 16 | **Phase 6** | Built on existing trigram & FTS indexes |
| **Location Filters (State/City)** | Screen 17 | **Phase 6 (Families Tab)** | Built on `families.city, state, country` (`idx_families_location`) |
| **Birth Place Filter** | Screen 17 | **Phase 6 (People Tab)** | Built on `persons.birth_place` |
| **Lineage Filters (Gotra/Nukh/Kul)** | Screen 18 | **Phase 6** | Built on existing B-tree indexes |
| **Life Status Filter (Living/Deceased)** | Screen 19 | **Phase 6** | Built on `person_status` enum |
| **Verification Filter** | Screen 20 | **Phase 6** | Filter by `verification_status = 'VERIFIED'` |
| **Mukhi Leadership Directory** | Screens 32–35 | **Phase 10** | Committee governance; no `mukhi` column on `persons`/`families` |
| **Census Seat Claiming** | Screens 04, 21–24 | **Phase 8** | Belongs to Claim/Join/Invitation phase |
| **Data Quality Score** | Screens 06, 36–38 | **Phase 9** | Belongs to Verification/Quality phase |
| **Panchang & Community Calendar** | Screens 25–31 | **Phase 10** | Belongs to Community Features phase |
| **Panchayat Committees & Circulars** | Screens 39, 43–48 | **Phase 10** | Belongs to Community Features phase |
| **Excel Batch Data Migration** | Excel Sheet | **Phase 14** | Belongs to Import & Data Migration phase |

---

## 4. Subtask Phasing Plan (Implementation Sequence)

1. **Subtask 1**: Discovery Service Layer, Query Architecture, Zod Filter Schemas & Unit Tests
2. **Subtask 2**: People Directory UI & Multi-Criteria Filtering (`/discover` People Tab)
3. **Subtask 3**: Family Directory UI & Lineage/Location Filtering (`/discover` Families Tab)
4. **Subtask 4**: Discovery Integration, Mobile Optimization, Lineage/Location Polish & Phase 6 Final Verification

---

## 5. Architectural Invariants

1. `PERSON != USER` strictly maintained.
2. `FAMILY != HOUSEHOLD` strictly maintained.
3. RLS is the single authoritative source for search privacy.
4. Contact fields and internal IDs are strictly excluded from search payloads.
5. All queries are client-gated to authenticated community members.
