# ADR: Canonical Database vs Legacy Android Compatibility & Phase 5 Relationship Architecture

- **Status:** Accepted & Locked (Pre-Implementation Baseline for Phase 5)
- **Date:** 2026-10-04
- **Target Systems:** Community Roots Platform (`community-family-platform`, Supabase / PostgreSQL)
- **Context Area:** Core Data Architecture, Interpersonal Relationships (Phase 5), Legacy Android (KhatriSetu) & Excel Compatibility

---

## 1. Context

### 1.1 Background & Client Inputs
As the Community Roots platform prepares to enter **Phase 5 (Family Tree / Interpersonal Relationships)**, client-provided artifacts from the existing production Android application and data registry were supplied for architectural audit and compatibility analysis:

1. **`khatrisetu-families-2026-10-01.xlsx`**:
   - Production registry containing community families and members across Gujarat, Maharashtra, Rajasthan, and other regions.
   - Contains two primary sheets:
     - `Families` (4 family units in sample: `KS-MUC4SVE0`, `KS-MUHZ1KML`, `KS-MUI02L0J`, `KS-MUI1E0P8`).
     - `Members` (24 individual records linked to family units).
2. **`khatrisetu app screenshots.pdf`** (49 pages):
   - Exhaustive photographic capture of the KhatriSetu Android application interface and user journeys.
   - Covers: Multilingual onboarding (EN/HI/GU), Census creation wizard, Community directory, Multi-criteria search filters, Family seat claiming, Sindhi Panchang/Calendar, Community birthdays, Mukhi leadership directory (118 leaders), Panchayat committees (Sarvaniyat & Jan Ganna Committees), Committee circulars, Member profile lifecycle, and Notifications center.

### 1.2 The Architectural Risk: Schema Conflation vs Normalized Integrity
A critical architectural fork exists when integrating legacy community systems:
- **Anti-Pattern (Premature Schema Pollution):** Altering the canonical relational database schema (`persons`, `families`, `family_members`, etc.) to replicate legacy flat tables, spreadsheet columns, and denormalized UI states 1:1. This leads to redundant columns, duplicate data, lack of referential integrity, unconstrained text pointers, and high technical debt.
- **Canonical Architecture (Protected Source of Truth):** Preserving the platform's third-normal-form (3NF) relational design, strict database constraints, least-privilege RLS policies, and immutable domain separation (`PERSON != USER`, `FAMILY != HOUSEHOLD`), while providing clean external reference adapters and import staging for legacy systems.

---

## 2. Legacy Artifact Analysis & Domain Verifications

### 2.1 Detailed Analysis of `khatrisetu-families-2026-10-01.xlsx`

#### `Families` Sheet
| Column Name | Legacy Sample Values | Canonical System Equivalent | Architectural Treatment |
|---|---|---|---|
| `Family Code` | `KS-MUC4SVE0`, `KS-MUHZ1KML` | `external_references` | Store in `external_references` (`source_system: 'khatrisetu_android'`). NOT a replacement for UUID primary keys. |
| `Head of Family` | `Prakash Mulchand Keria` | `family_members.is_head` | Derived relationally via active `family_members` row where `is_head = true`. |
| `Head Account` | `Claimed`, `Not claimed` | `persons.user_id IS NOT NULL` | Proves `PERSON != USER`. Claim status is an auth relationship, not a family attribute. |
| `Census Status` | `completed`, `draft` | `families.family_status` / verification | Maps to lifecycle status (`family_status` enum). |
| `Members` | `7`, `6`, `4`, `7` | `COUNT(family_members)` | **DERIVED FIELD.** Never stored as a source-of-truth column. Computed dynamically. |
| `Surname` | `Keria`, `Pamnani`, `Liya` | `families.family_name` / `persons.last_name` | Relational string column. |
| `Nukh` | `Keria`, `Karotela`, `Varde` | `persons.nukh` / `families.metadata` | Community lineage identifier. |
| `Gotra` | `Sudarshan`, `Shandilay` | `persons.gotra` / `families.metadata` | Vedic lineage identifier. |
| `Mool Shakha` | `Palanpur`, `Anand` | `persons.native_place` / metadata | Ancestral branch identifier. |
| `Family Type` | `Nuclear`, `Joint`, `Extended` | `families.family_type` | Structural classification. |
| `Mukhi` | `Govindbhai Jethalal Janiyani` | `community_leadership` (Phase 10) | Community elder assigned to family region. |
| `Country`, `State`, `City`, `Area`, `Pincode`, `Address` | India, Gujarat, Palanpur, 385001 | `families` / location entity | Physical contact & regional address. |
| `Native Place` | `Palanpur`, `Bantva` | `persons.native_place` | Origin ancestral town. |
| `Registered On` | `2026-09-24 18:22:20` | `families.created_at` | Audit timestamp. |

#### `Members` Sheet
| Column Name | Legacy Sample Values | Canonical System Equivalent | Architectural Treatment |
|---|---|---|---|
| `Family Code` | `KS-MUC4SVE0` | `family_members.family_id` | Foreign key resolved via `external_references`. |
| `Name` | `Prakash Mulchand Keria` | `persons.first_name`, `middle_name`, `last_name` | Normalized person identity. |
| `Relationship` | `Head`, `Spouse`, `Son`, `Daughter`, `Father` | `family_members.role` & `relationships.relationship_type` | **Dual Meaning Disambiguation** (see Section 2.2). |
| `Linked To` | `Prakash Mulchand Keria`, `Rohan Prakash Keria` | `relationships` edge | **Pairwise String Pointer** (see Section 2.3). |
| `Gender` | `Male`, `Female` | `persons.gender` | Canonical `gender` enum (`MALE`, `FEMALE`, etc.). |
| `Date of Birth` | `1957-08-15`, `1987-04-12` | `persons.date_of_birth` | Canonical `DATE` column. |
| `Age` | `69`, `39`, `3` | `EXTRACT(YEAR FROM age(dob))` | **DERIVED FIELD.** Never stored. Real-time dynamic calculation. |
| `Under 18` | `No`, `Yes` | `age < 18` | **DERIVED FIELD.** Never stored. Computed from date of birth. |
| `Marital Status` | `Married`, `Single` | `persons.marital_status` / metadata | Civil status attribute. |
| `Blood Group` | `B+`, `O+`, `A+` | `persons.blood_group` | Medical demographic data. |
| `Life Status` | `alive`, `deceased` | `persons.person_status` | Canonical `person_status` enum (`LIVING`, `DECEASED`). |
| `Mobile`, `Email` | `+91 94282 51508`, `...` | `person_contacts` / `persons` | Contact fields subject to field-level privacy. |
| `Account` | `Claimed`, `Not claimed` | `persons.user_id` | Direct confirmation that 83% of community members have no auth account. |
| `Same Household` | `Yes`, `No` | `household_membership` / address | **Definitive proof that `FAMILY != HOUSEHOLD`** (see Section 2.4). |
| `Current City`, `State`, `Address`, `Pincode` | Pune, Maharashtra | `persons` address override | Physical residence when residing away from family seat. |
| `Birth Order` | `1`, `2` | `persons.birth_order` / metadata | Positional sibling order. |
| `Census Status` | `completed` | `persons.verification_status` | Data quality / completeness marker. |
| `Added On` | `2026-09-24 18:22:20` | `persons.created_at` | Audit timestamp. |

### 2.2 Disambiguation: Family Membership Role vs Interpersonal Relationship
The legacy Excel sheet conflates two distinct concepts into one column (`Relationship`):
1. **Family Membership Role:** How an individual participates in a social family census unit (e.g., `Head`, `Member`, `Spouse`, `Child`). This is already implemented in Phase 4 via `family_members.role`.
2. **Interpersonal Genealogical Relationship:** The biological or legal bond connecting two specific human beings (e.g., `A is parent of B`, `A is married to B`). This is the explicit scope of **Phase 5**.

### 2.3 Deconstruction of Legacy Pairwise String Pointers
In the legacy spreadsheet, genealogical links are represented as:
```text
Member: "Kavita Rohan Keria"
Relationship: "Spouse"
Linked To: "Rohan Prakash Keria"
```
```text
Member: "Rohan Prakash Keria"
Relationship: "Son"
Linked To: "Prakash Mulchand Keria"
```
**Defects of the Legacy Representation:**
- Relies on fragile human-name strings; duplicate names break linkage.
- Unidirectional and asymmetric without explicit edge semantics.
- Grandchildren are linked to fathers, but grandparental connections are implied rather than navigable.
- Deceased ancestors (e.g. `Mulchand Hemraj Keria`, age 100, deceased, `Relationship: Father`, `Linked To: Prakash Mulchand Keria`) invert the directionality (Father linked to Son rather than Son linked to Father).

**Canonical Transformation (Phase 5):**
All pairwise string pointers must be resolved into relational foreign-key edges in a normalized `relationships` table connecting `person_a_id (UUID)` and `person_b_id (UUID)`.

### 2.4 Definitive Architectural Proofs from Client Artifacts
1. **`FAMILY != HOUSEHOLD`:**
   - In Family `KS-MUC4SVE0` (Head: Prakash Mulchand Keria, Palanpur, Gujarat):
     - Son Rohan Prakash Keria and daughter-in-law Kavita Rohan Keria have `Same Household: No`.
     - Their `Current City` is **Pune, Maharashtra**, while the Family seat is **Palanpur, Gujarat**.
     - **Architectural Conclusion:** A Family is a lineage and social unit. A Household is a physical co-residence. Modeling household address directly onto family records without override violates physical reality.
2. **`PERSON != USER`:**
   - In the sample data of 24 individuals, only 4 have `Account: Claimed`. 20 individuals have `Account: Not claimed`.
   - In `khatrisetu app screenshots.pdf` (screen 42), the application explicitly declares:
     > *"You can request deletion of your KhatriSetu login and private contact data. Shared census and family-tree records may remain so household records stay intact..."*
   - **Architectural Conclusion:** A Person in the community census exists independently of whether they ever create an authentication account. Deleting a user account terminates login access but must NEVER destroy community census or genealogical records.

---

## 3. Decision

We establish the following architectural principles, boundaries, and schema specifications:

### 3.1 Principle of the Protected Canonical Source of Truth
1. The Supabase PostgreSQL database is the **sole canonical source of truth** for Community Roots.
2. The canonical schema is strictly normalized and will NOT be modified to mirror legacy flat columns or denormalized UI fields.
3. Legacy Android and Excel schemas represent **external intake formats**, which must be translated via staging adapters in **Phase 14 (Import / Data Migration)**.
4. Legacy identifiers (such as `Family Code: KS-MUC4SVE0`): Defined as a future compatibility domain (`external_references`); implementation is deferred to Phase 14. No such table currently exists.

### 3.2 Canonical Interpersonal Relationship Model (Phase 5 Specification)

#### Supported Core Relationship Types (MVP Model)
The Phase 5 relationship model supports three foundational primitives:
1. `PARENT`: Directional biological or adoptive parent-child link (`person_a_id` = Parent, `person_b_id` = Child).
2. `SPOUSE`: Symmetric legal or marital partnership.
3. `SIBLING`: Symmetric sibling relationship asserted directly.

**Lifecycle, Status & Deferral Rules:**
- A separate `relationship_status` enum is **not** introduced for Phase 5.
- Where verification is needed, the platform's existing `verification_status` architecture will be utilized.
- Soft deletion is handled via `deleted_at TIMESTAMPTZ`.
- Marriage/divorce/dissolution/dispute workflows are deferred.

#### Sibling Model Specification
- **Explicit sibling relationships are canonical relationships when asserted directly.**
- Do not require known parents for an explicit sibling relationship.
- Shared-parent sibling relationships may be derived later by the query or presentation layer.
- Do not persist duplicate derived sibling rows.

#### Directionality and Canonical Invariant Rules
To avoid duplication, opposing cycles, and graph synchronization anomalies:
- **`PARENT` is strictly directional:**
  - `person_a_id` = **Parent**
  - `person_b_id` = **Child**
  - The inverse relationship (`child_of`) is **derived dynamically** in application queries and views. Storing reciprocal rows `(P, C)` and `(C, P)` in the database is strictly prohibited.
- **`SPOUSE` is strictly symmetric and canonicalized:**
  - A marital edge connects two persons with undirected semantics.
  - To guarantee that only one row can ever exist for a couple, the database enforces a lexical order constraint:
    `CHECK (person_a_id < person_b_id)`
  - Dual opposing rows `(A, B, SPOUSE)` and `(B, A, SPOUSE)` are blocked at the database constraint layer.
- **`SIBLING` Canonical Ordering:**
  - An explicit sibling edge connects two persons with undirected semantics and lexical order constraint:
    `CHECK (person_a_id < person_b_id)`

#### Canonical `relationships` Table Schema Specification
```sql
CREATE TYPE public.relationship_type AS ENUM (
  'PARENT',
  'SPOUSE',
  'SIBLING'
);

CREATE TABLE public.relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_a_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,
  person_b_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,
  relationship_type public.relationship_type NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  -- Invariant 1: No self-referential relationships
  CONSTRAINT relationships_no_self_reference CHECK (person_a_id <> person_b_id),

  -- Invariant 2: Symmetric relationship canonical ordering (SPOUSE, SIBLING)
  CONSTRAINT relationships_symmetric_ordering CHECK (
    relationship_type = 'PARENT' OR (person_a_id < person_b_id)
  ),

  -- Invariant 3: Uniqueness per pair and relationship type
  CONSTRAINT relationships_unique_pair UNIQUE (person_a_id, person_b_id, relationship_type)
);
```

#### Cascade & Deletion Architecture
- `ON DELETE RESTRICT` is enforced on foreign keys linking to `public.persons`. A person record cannot be physically deleted if active relationship edges reference it.
- **Soft Deletion:** In accordance with platform security and genealogical preservation rules, relationships use `deleted_at TIMESTAMPTZ`. Soft-deleted edges are filtered out by active RLS policies.
- Marriage/divorce/dissolution/dispute workflows are deferred.

### 3.3 Dual-Endpoint Privacy Visibility Model
A relationship edge inherently bridges two separate human identities. If Person A is visible to a user but Person B is `PRIVATE`, exposing the relationship row would leak the existence, identity, and family connection of Person B.

**The Dual-Endpoint Authorization Rule:**
> **Relationship visibility must enforce the same effective authorization semantics as direct person visibility for BOTH endpoints. Existence of a matching persons.id is not sufficient.**

An authenticated user can query an active relationship edge if and only if that user has permission to read **BOTH** `person_a` and `person_b` under the `persons` RLS policies.

```sql
-- Conceptual RLS Policy for relationships SELECT
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
*(Note: Because subqueries in RLS policies execute in the caller's security context, the inner SELECTs on `public.persons` automatically enforce `persons` RLS policies. If the caller cannot see `person_b`, the subquery returns empty, hiding the edge).*

#### Mandatory RLS Test Scenarios (Eventual Phase 5 RLS Specification)
The eventual Phase 5 RLS test suite must test the following eight authorization scenarios (positive and negative):
1. **public / public**: Both endpoints have `PUBLIC` visibility -> edge visible to all callers (including anon if public persons are enabled).
2. **community / community**: Both endpoints have `COMMUNITY` visibility -> edge visible to authenticated community members; denied to unauthenticated.
3. **private endpoint**: At least one endpoint is `PRIVATE` (unrelated caller) -> edge strictly denied.
4. **mixed visibility**: One endpoint is `PUBLIC`, other endpoint is `PRIVATE` (unrelated caller) -> edge strictly denied.
5. **deleted endpoint**: One or both endpoint persons are soft-deleted (`deleted_at IS NOT NULL`) -> edge strictly excluded.
6. **owner-visible endpoint**: Private endpoint where the caller is the linked owner user of that private person -> edge permitted if other endpoint is also visible to caller.
7. **moderator-visible endpoint**: Private endpoint where caller is moderator/admin (`is_community_moderator() = TRUE`) -> edge permitted under administrative access.
8. **unauthenticated access**: Anon caller attempts to select relationships -> edge strictly denied (or restricted to purely public/public edges according to least privilege).

### 3.4 Tree Rendering Engine Architecture (Phase 5 UI)
1. **Presentation Boundary:** React Flow (`@xyflow/react` or `reactflow`) is solely a presentation canvas. It handles zooming, panning, drag-and-drop viewing, minimap, and edge routing.
2. **Layout Engine:** A dedicated genealogical DAG layout algorithm computes `(x, y)` coordinate positions for multi-generational trees based on parent-child tiers and spouse pairings.
3. **Privacy Masking in Tree View:**
   - If a family member's privacy level prohibits a viewer from seeing their details, but structural topology requires their position (e.g., an unshared parent linking two visible siblings):
   - The frontend renders an anonymized placeholder node: `[Private Person]`.
   - Zero sensitive metadata (name, DOB, photo, contact) is transmitted or rendered.

### 3.5 External Identity Mapping Architecture (`external_references`)
Defined as a future compatibility domain; implementation is deferred to Phase 14. Note: No such table currently exists in the database schema.

Planned Phase 14 schema specification:
```sql
CREATE TABLE public.external_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system VARCHAR(50) NOT NULL,       -- e.g. 'khatrisetu_android', 'khatrisetu_excel_20261001'
  source_record_id VARCHAR(100) NOT NULL,   -- e.g. 'KS-MUC4SVE0', legacy member ID
  canonical_entity_type VARCHAR(50) NOT NULL, -- 'family', 'person'
  canonical_entity_id UUID NOT NULL,
  import_batch_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT external_references_unique_source UNIQUE (source_system, source_record_id)
);

CREATE INDEX idx_external_references_lookup 
  ON public.external_references(source_system, canonical_entity_type, canonical_entity_id);
```

---

## 4. Feature Inventory of KhatriSetu Android App & Roadmap Parity

OCR-audited across all 49 supplied screenshots; feature inventory was reviewed against the extracted content. Below is the mapping confirming how every feature in the legacy application is accounted for across our 17-phase architecture:

| Legacy Android Feature | Screens Analyzed | Core Functionality | Roadmap Phase Assignment |
|---|---|---|---|
| **Multilingual Support** | Screen 00 | Switch language between English, Hindi, and Gujarati | Phase 15 (Hardening & Localization) |
| **Community Updates / Broadcasts** | Screens 01, 09 | Broadcast notices, announcements, admin notifications | Phase 10 (Community) & Phase 12 (Notifications) |
| **Family Census Registration Wizard** | Screens 02, 10–13 | 4-step wizard: Head info, Nukh, Gotra, Family Type | **Phase 4 (Completed)** via `FamilyCreationWizard` |
| **Directory Search & Deep Filtering** | Screens 03, 16–20 | Search by Surname, City, Nukh, Gotra, Mukhi, Verification | Phase 6 (Discovery) |
| **My Family & Census Seat Claiming** | Screens 04, 21–24 | Family code lookup, Head link, Invitation links, Claim seat | Phase 4 (Roster completed) / Phase 8 (Claims & Invites) |
| **Community Birthday Calendar** | Screens 05, 25–27 | Monthly calendar view of birthdays, birthday wishes | Phase 10 (Community Features) |
| **Sindhi Panchang & Calendar** | Screens 28–31 | Lunar tithis, Chand sighting, Ekadashi, Amavasya, Festivals | Phase 10 (Community Features) |
| **Mukhi Leadership Directory** | Screens 32–35 | 118 community leaders, state/city filters, phone directory | Phase 6 (Discovery) / Phase 10 (Community) |
| **Profile Management & Completeness** | Screens 06, 36–38, 40 | Personal details, profile completeness %, family links | Phase 2 (Profile completed) / Phase 9 (Data Quality) |
| **Committees & Panchayat Circulars** | Screens 39, 43–48 | Sarvaniyat & Jan Ganna Committee rosters, circulars | Phase 10 (Community Features) |
| **Account Security & Deletion** | Screens 41, 42 | Password, security, terms, GDPR/privacy account deletion | Phase 2 (Auth completed) / Phase 15 (Compliance) |
| **Notifications Center** | Screens 07–09 | Notification categories: All, Unread, Family, System | Phase 12 (Notifications) |

---

## 5. Strict Scope Lock for Phase 5

To prevent scope creep and maintain architectural discipline:
- **Phase 5 Status:**
  - **Phase 5 implementation has NOT started.**
  - **Phase 5 architecture is locked.**
  - **Phase 5 Subtask 1 is awaiting explicit authorization.**
- **Phase 5 Authorized Scope (When Subtask 1 is Authorized):**
  - `relationships` table and schema migration (`PARENT`, `SPOUSE`, `SIBLING`).
  - Relational indexes, constraints, and audit logging.
  - Dual-endpoint RLS policies.
  - `relationships.service.ts` and TanStack Query hooks.
  - Interpersonal relationship management UI (add parent, add child, add spouse, add sibling).
  - React Flow family tree visualization engine with layout algorithm.
  - Masked node presentation for private records.
- **Explicitly Excluded from Phase 5 (Deferred to Later Phases):**
  - Claim tokens and invitation links (Deferred to **Phase 8**).
  - Full-text search and directory filters for Mukhis/Nukhs (Deferred to **Phase 6**).
  - Panchang, Sindhi calendar, committees, circulars, and birthday tracker (Deferred to **Phase 10**).
  - Photo gallery and family document uploads (Deferred to **Phase 11**).
  - Excel file importer scripts and batch migration runners (Deferred to **Phase 14**).

---

## 6. Consequences & Architectural Guarantees

1. **No Regressions on Core Foundations:** Existing tables (`persons`, `families`, `family_members`, `profiles`, `audit_logs`) and their 33 verified RLS policies remain completely intact.
2. **Zero Schema Contamination:** Core tables remain clean, normalized, and standards-compliant without ad-hoc legacy columns.
3. **True Genealogical Graphs:** Families are not artificially restricted to single-household trees; complex multi-generational and cross-household relationships are natively supported.
4. **Data Privacy Assurance:** Dual-endpoint RLS ensures private individuals cannot be inferred through graph edge discovery.
5. **Phase-Gating Preserved:** Phase 5 implementation remains strictly unstarted until explicit human authorization is granted.
