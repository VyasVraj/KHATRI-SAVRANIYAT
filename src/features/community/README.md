# Community Feature Domain

> **Phase 10 — Community Features (Subtask 1: Groups, Subtask 2: Announcements & Subtask 3: Events & RSVP)**

---

## 1. Overview

The **Community** domain provides civic, regional, and committee coordination mechanisms that exist *beyond* individual family lineages:

1. **Community Groups & Associations (Subtask 1)**:
   - **Village Associations (Watan / Native place groups)**: Organizing members by ancestral origin.
   - **Committees**: Panchayats, executive bodies, organizing committees.
   - **Cultural Groups**: Literary circles, festival organizing groups.
   - **Youth Wings**: Youth sports, education, and career development bodies.
   - **Other Interest Groups**: General community interest groups.

2. **Community Notice Board & Announcements (Subtask 2)**:
   - **General Notices**: Official community notices and circulars.
   - **Urgent Alerts**: Time-sensitive announcements, health alerts, emergency notices.
   - **Events**: Gatherings, panchayat meetings, tournaments, community exhibitions.
   - **Obituaries / Bereavement**: Besnu, prayer meetings, condolence notices.
   - **Celebrations**: Community honors, felicitation, festival greetings.

3. **Community Events & RSVP (Subtask 3)**:
   - **Calendar & Gatherings**: Village festivals, general body meetings, sporting events, educational workshops, and seminars.
   - **Attendance Declaration**: 3-way attendance status (`GOING`, `MAYBE`, `NOT_GOING`) with guest count allocation (0–5 additional guests).
   - **Authoritative Capacity Management**: Concurrency-safe, row-locked seat reservations with immediate capacity rejection if limit is exceeded.
   - **Lifecycle & Cancellation**: Support for scheduling, concluding, rescheduling, cancelling (with mandatory reason), or archiving events.

4. **Community Dashboard & Final Hardening (Subtask 4)**:
   - **Unified Community Hub (`CommunityPage.tsx`)**: Integrates Groups, Notice Board, and Events into a cohesive, responsive experience.
   - **Real-Time Community Pulse Metric Cards**: Quick-glance counters for total groups, verified groups, notices, pinned notices, and upcoming scheduled events.
   - **Accessible WAI-ARIA Navigation**: Standard tablist with Arrow key (`ArrowLeft`, `ArrowRight`, `Home`, `End`) keyboard navigation and badge pills.
   - **URL Synchronization & Deep-Linking**: Query parameter synchronization (`?tab=groups|announcements|events`) with browser navigation support.
   - **Dialog Accessibility Hardening**: Comprehensive `Escape` key listeners, backdrop dismissal, and `role="dialog"` attributes across all 8 community modal dialogs.
   - **Strict Zero-Leakage Guarantee**: Backend RLS and authoritative RPCs remain sole source of truth; zero `service_role` usage, zero sensitive `localStorage` tokens, zero console logging.

---

## 2. Core Architectural Invariants

### 1. `PERSON != USER`
- Group memberships, announcement authors, event creators, and event RSVPs link to interactive user accounts (`public.profiles.id` / `auth.users.id`), **never** census `public.persons` records.
- Joining a group, posting a notice, or RSVPing to an event represents personal interactive participation.
- No census Person records are created, altered, or linked by community operations.

### 2. `FAMILY != GROUP`
- Families (`public.families`) represent genealogical lineages.
- Groups (`public.groups`), announcements (`public.announcements`), and events (`public.events`) represent civic or cultural associations.
- The domains remain strictly separate tables with independent lifecycles.

### 3. Authoritative RPC Mutation Model
- Direct client `INSERT`, `UPDATE`, and `DELETE` on `public.groups`, `public.group_members`, `public.announcements`, `public.events`, and `public.event_rsvps` are strictly blocked via explicit RLS deny policies and revoked table privileges.
- All mutations route strictly through `SECURITY DEFINER` RPCs with `SET search_path = public` and audit logging.

### 4. Announcements & Events Visibility & Destinations
- **Global Notices / Events** (`group_id IS NULL`): Discoverable by all authenticated members; creation/modification reserved for global community moderators (`is_community_moderator()`).
- **Group Notices / Events** (`group_id IS NOT NULL`): Visible to members permitted to view the underlying group; creation/modification reserved for group `ADMIN`, `MODERATOR`, or global moderator.

### 5. Concurrency-Safe RSVP Capacity Enforcement
- Attendance capacity is strictly enforced inside `set_event_rsvp(UUID, event_rsvp_status, INT, TEXT)`.
- When an attendee RSVPs `GOING`:
  - It row-locks the target event record via `SELECT ... FOR UPDATE`.
  - Seat consumption is calculated as `1 + guest_count`.
  - If `capacity` is defined and `current_going_seats + new_seats > capacity`, an authoritative exception `EVENT_CAPACITY_EXCEEDED` is thrown.
- Transitioning to `NOT_GOING` retains the RSVP record with status `NOT_GOING` and zero consumed seats, freeing capacity for other members.

---

## 3. Database Schema

### `public.groups`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key (UUID v4) |
| `name` | TEXT | Group name (1–150 chars) |
| `slug` | TEXT | URL-friendly unique identifier (3–100 chars, `^[a-z0-9-]+$`) |
| `description` | TEXT | Optional description (max 2000 chars) |
| `group_type` | `group_type` | Enum: `VILLAGE_ASSOCIATION`, `COMMITTEE`, `CULTURAL`, `YOUTH`, `OTHER` |
| `location` | TEXT | Optional location/region (max 200 chars) |
| `is_verified` | BOOLEAN | Moderator-verified status (default FALSE) |
| `is_private` | BOOLEAN | Private/invitation-only group indicator (default FALSE) |
| `created_by` | UUID | FK to `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `deleted_at` | TIMESTAMPTZ | Soft-deletion timestamp |

### `public.group_members`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `group_id` | UUID | FK to `groups(id)` ON DELETE CASCADE |
| `user_id` | UUID | FK to `auth.users(id)` ON DELETE CASCADE |
| `role` | `group_role` | Enum: `ADMIN`, `MODERATOR`, `MEMBER` |
| `joined_at` | TIMESTAMPTZ | Timestamp joined |

### `public.announcements`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key (UUID v4) |
| `title` | TEXT | Notice headline (1–200 chars) |
| `content` | TEXT | Notice content (1–10000 chars) |
| `announcement_type` | `announcement_type` | Enum: `GENERAL`, `URGENT`, `EVENT`, `BEREAVEMENT`, `CELEBRATION` |
| `status` | `announcement_status` | Enum: `DRAFT`, `PUBLISHED`, `ARCHIVED` |
| `group_id` | UUID | Nullable FK to `groups(id)`; NULL = Community-wide |
| `author_id` | UUID | FK to `auth.users(id)` |
| `is_pinned` | BOOLEAN | Pinned to top of board (default FALSE) |
| `published_at` | TIMESTAMPTZ | Publication timestamp |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `deleted_at` | TIMESTAMPTZ | Soft-deletion timestamp |

### `public.events`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key (UUID v4) |
| `title` | TEXT | Event title (1–200 chars) |
| `description` | TEXT | Detailed description (max 10000 chars) |
| `event_type` | `event_type` | Enum: `GENERAL`, `FESTIVAL`, `MEETING`, `SPORTS`, `YOUTH`, `CULTURAL`, `WORKSHOP`, `OTHER` |
| `status` | `event_status` | Enum: `DRAFT`, `PUBLISHED`, `CANCELLED`, `COMPLETED`, `ARCHIVED` |
| `start_time` | TIMESTAMPTZ | Mandatory start timestamp |
| `end_time` | TIMESTAMPTZ | Optional end timestamp (`CHECK (end_time IS NULL OR end_time > start_time)`) |
| `location` | TEXT | Venue location or virtual platform name (max 300 chars) |
| `location_url` | TEXT | Map or meeting link (max 1000 chars) |
| `group_id` | UUID | Nullable FK to `groups(id)`; NULL = Community-wide |
| `creator_id` | UUID | FK to `auth.users(id)` |
| `is_pinned` | BOOLEAN | Pinned to calendar top (default FALSE) |
| `capacity` | INT | Optional attendee limit (`CHECK (capacity IS NULL OR capacity > 0)`) |
| `published_at` | TIMESTAMPTZ | Publication timestamp |
| `cancelled_at` | TIMESTAMPTZ | Cancellation timestamp |
| `cancellation_reason` | TEXT | Reason for cancellation (max 1000 chars) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `deleted_at` | TIMESTAMPTZ | Soft-deletion timestamp |

### `public.event_rsvps`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key (UUID v4) |
| `event_id` | UUID | FK to `events(id)` ON DELETE CASCADE |
| `user_id` | UUID | FK to `auth.users(id)` ON DELETE CASCADE |
| `status` | `event_rsvp_status` | Enum: `GOING`, `MAYBE`, `NOT_GOING` |
| `guest_count` | INT | Bounded additional guests (`CHECK (guest_count >= 0 AND guest_count <= 5)`) |
| `notes` | TEXT | Optional attendee notes (max 300 chars) |
| `created_at` | TIMESTAMPTZ | RSVP timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

---

## 4. Security & RLS Model

- **Table Privileges:**
  - `REVOKE ALL ON public.groups, public.group_members, public.announcements, public.events, public.event_rsvps FROM PUBLIC, anon;`
  - `GRANT SELECT ON public.groups, public.group_members, public.announcements, public.events, public.event_rsvps TO authenticated;`
- **RPC Privileges:**
  - `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon;`
  - `GRANT EXECUTE ON FUNCTION ... TO authenticated;`
- **Event RPCs (`SECURITY DEFINER`, `search_path = public`):**
  - `create_community_event`: Validates scope, permissions, date constraints, and logs audit record.
  - `update_community_event`: Enforces organizer permissions and date constraints with audit logging.
  - `cancel_community_event`: Transitions status to `CANCELLED`, records cancellation timestamp and reason with audit logging.
  - `archive_community_event`: Transitions status to `ARCHIVED` with audit logging.
  - `delete_community_event`: Soft-deletes event (`deleted_at = NOW()`) with audit logging.
  - `set_event_rsvp`: Concurrency-safe attendance registration with `SELECT ... FOR UPDATE` capacity enforcement and audit logging.
  - `cancel_event_rsvp`: Removes RSVP record or transitions to `NOT_GOING` with audit logging.

---

## 5. Android Parity & Mobile UX (ANDROID-8)

### Mobile-First Layout & Touch Targets
- **Accessible Touch Target Guarantee**: All interactive controls — including Community Pulse metric cards, WAI-ARIA tab selectors, RSVP toggle buttons (`GOING`, `MAYBE`, `NOT_GOING`), additional guest dropdowns, filter pills, option menus, and modal close triggers — enforce `min-h-[44px]` (and `min-w-[44px]` on icon-only buttons).
- **Responsive Stacking**: Dashboard metrics smoothly reorient from single column on mobile screens to 3-column grids on tablets and desktop viewports. Filter bars and RSVP option panels adjust gracefully on small mobile form factors.

### Trilingual Localization
- All user-facing strings across Community Hub, Notice Board, Events, and Groups are fully integrated with `useLanguage()` and central translation dictionaries (`src/features/i18n/`):
  - English (`en`)
  - Hindi (`hi`)
  - Gujarati (`gu`)
- Covers dashboard titles, pulse counters, empty states, RSVP status tags, verified badges, and creation action buttons.

### Event RSVP & Concurrency Safety
- 3-way attendance status (`GOING`, `MAYBE`, `NOT_GOING`) with additional family/friend guest count selector (0–5).
- Real-time capacity awareness with progress bars and "Open capacity" indicators for non-limited community gatherings.
- Concurrency-safe database reservations (`SELECT ... FOR UPDATE` inside `set_event_rsvp` RPC) prevent overbooking.

### Group Discovery & Membership
- Clear visual badges for verified village associations and private committee locks.
- One-tap Join and Leave controls with loading feedback and error handling.
- Private groups require approved invitation/review before membership is activated.

### Security, Role & Privacy Integrity
- **`PERSON != USER`**: All community participation links exclusively to interactive user profiles (`public.profiles.id`), safeguarding census personal records.
- **`FAMILY != GROUP`**: Civic and cultural bodies remain decoupled from genealogical lineages.
- **ANDROID-2 Privacy Lock**: Community features do not expose or permit modifications to private census and profile privacy settings. Global notice and event creation remain strictly gated to community moderators and administrators.

---

## 6. Community Birthdays & Celebrations (ANDROID-9)

The **Birthdays** sub-feature (Android Reference Screens 05, 25–27) brings community celebration milestones to the platform while strictly maintaining the 5-level privacy model and privacy shields:

### Core Architectural Invariants
- **`PERSON != USER` Domain Boundary**:
  - Birthdays belong to census persons (`public.persons.date_of_birth`), representing human community members.
  - Interactive actions (sending wishes, filtering, viewing) are conducted by authenticated users (`public.profiles.id`).
- **5-Level Privacy Enforcement**:
  - `dob_privacy = 'PRIVATE'`: Strictly omitted from the community birthday feed unless the viewer is the record owner/creator or a community moderator (`is_community_moderator()`).
  - `dob_privacy = 'COMMUNITY'`: Visible exclusively to authenticated community members; omitted for anonymous visitors.
  - `dob_privacy = 'PUBLIC'`: Visible across all sessions.
- **Privacy Shield Guarantee**:
  - The member's full date of birth, birth year, and calculated age are **NEVER** exposed in public payloads, API interfaces, or rendered DOM elements.
  - Display format strictly follows the privacy convention: `"{First Name} {Last Name} — {Day} {Month}"` (e.g. `"Rahul Khatri — 12 Nov"`).
- **Living Status Exclusion**:
  - Deceased members (`status = 'DECEASED'` or `date_of_death IS NOT NULL` or `is_living === false`) are strictly omitted from birthday feeds.
- **Deterministic Upcoming Calculation**:
  - Deterministic countdown without timezone jitter: `daysUntil = 0` indicates today, `1` indicates tomorrow.
  - Automatic year rollover: birthdays that occurred earlier in the current calendar year roll over to the next calendar year.
  - Leap-day handling: February 29th birthdays gracefully resolve to March 1st in non-leap years without mathematical exceptions or `NaN`.
- **Interactive Celebration UX**:
  - Mobile touch targets $\ge 44\text{px}$ on all interactive controls (filter chips, "Send Wish" buttons, profile links).
  - One-tap "Send Wish" button with instant celebratory visual feedback ("Wish Sent!").
  - Trilingual localization across English, Hindi, and Gujarati (`useLanguage()`).
  - Integrated into the unified Community Hub dashboard (`CommunityPage.tsx`) via Community Pulse metric cards and WAI-ARIA tab navigation (`?tab=birthdays`).

---

## 7. Sindhi Panchang & Lunar Calendar (ANDROID-10)

The **Sindhi Panchang & Lunar Calendar** feature (Android Reference Screens 28–31) brings traditional Sindhi lunar calendar navigation, Chand (new moon) sightings, Ekadashi, Poonam, Amavasya, and community cultural observances to the platform:

### Core Architectural Invariants & Data Integrity
- **Cultural & Religious Data Correctness**:
  - The repository deliberately avoids fabricating religious lunar dates or unverified astronomical ghatis/degrees/minutes.
  - Observances are categorized into:
    - **Canonical Verified Observances**: Cheti Chand (Chet Sud Beej / Sindhi New Year & Jhulelal Jayanti), Thadri (Badho Vad Satam), Lal Loi, Diwali (Diyari), Ekadashi fasts, Chand sightings, Poonam, and Amavasya.
    - **Calculated Lunar Approximations**: Traditional Sindhi months (Chet to Phagun) and tithis calculated from lunar phase cycles.
    - **Pending Astronomical End-Times**: When exact local coordinates/ghatis are unverified, records return `data_status: 'ASTRONOMICAL_PENDING'` and the UI renders a transparent cultural notice.
- **Data Provenance Transparency**:
  - Clear user-facing disclaimer on day detail views: *"Verified community observances and traditional Sindhi tithis. Exact astronomical end-timings vary by geographic coordinates."*
- **Cross-Domain Integration**:
  - Seamlessly links to Community Events (`useEvents()`), cross-referencing and rendering any community gatherings, sammelans, or celebrations scheduled on the selected calendar date.
- **Zero Database Migration**:
  - Client-side deterministic calendar mathematics, standard 7-column month matrices, and canonical observance registries eliminate unneeded database overhead while guaranteeing high availability.

### Android Parity & Mobile UX
- **Mobile Touch Target Guarantee**:
  - Every interactive element — month/day navigation chevrons, day grid cells, filter chips, and today jump button — strictly enforces $\ge 44\text{px}$ touch targets.
- **7-Column Calendar Grid**:
  - Full 35-to-42 cell month matrix with leading/trailing padding days, visual markers for Chand (🌙), Ekadashi (🪔), Poonam (🌕), Amavasya (🌑), and Community Festivals (✨).
  - Selected date highlights with accessible focus rings and `aria-label` descriptions.
- **Filter Chips**:
  - One-tap category filtering across `ALL`, `CHAND` (New Moon), `EKADASHI` (Vrat/Fast), `POONAM` (Full Moon), `AMAVASYA` (No Moon), and `FESTIVALS`.
- **Trilingual Localization**:
  - Complete trilingual support across English, Hindi, and Gujarati (`useLanguage()`) for month names, pakshas, tithis, observance titles, filter labels, and status badges.
- **Seamless Hub Integration**:
  - Integrated into the unified Community Hub (`CommunityPage.tsx`) with a dedicated 5th tab button (`id="tab-panchang"`), 5th Community Pulse metric card, WAI-ARIA tablist arrow-key navigation, and deep-linkable URL route (`/community?tab=panchang` and direct route `/panchang`).

---

## 8. Mukhi Leadership Directory (ANDROID-11)

The **Mukhi Leadership Directory** feature (Android Reference Screens 33–36) provides a dedicated, mobile-first directory of community elders and regional Mukhi leadership:

### Core Architectural Invariants & Role Model
- **Role Model Mapping (`COMMUNITY_MODERATOR` = Mukhi-Equivalent)**:
  - In strict adherence to the project role model, production roles remain: `SUPER_ADMIN`, `ADMIN`, `COMMUNITY_MODERATOR`, `COMMITTEE_MEMBER`, `FAMILY_HEAD`, `MEMBER`, `GUEST`.
  - There is deliberately **NO** separate `MUKHI` database role enum.
  - The existing `COMMUNITY_MODERATOR` role acts as the authoritative Mukhi-equivalent.
- **`PERSON != USER` Strictly Preserved**:
  - Community Mukhi records represent human community leaders and elders.
  - Linked authentication user accounts (`user_id`) exist only when claimed.
  - Directory records support both claimed persons and community leadership records without fabricating synthetic user credentials.
- **5-Level Privacy Model & Shield**:
  - Respects `profile_privacy` ('COMMUNITY', 'PUBLIC') and `contact_privacy`.
  - When `contact_privacy = 'PRIVATE'`, phone numbers and email addresses are strictly concealed from directory payloads and UI presentation, displaying an accessible privacy shield.
  - Phone numbers are rendered only when permitted (e.g. for moderators or record owners).
- **ANDROID-2 Privacy Lock Preserved**:
  - Gated privacy modifications remain strictly restricted to `SUPER_ADMIN`, `ADMIN`, and `COMMUNITY_MODERATOR` (Mukhi-equivalent).
- **Zero Database Migration**:
  - Powered by canonical regional leadership registries and existing PostgREST endpoints, requiring zero database migrations.

### Search, Filters & Mobile UX
- **Mobile Touch Target Guarantee**:
  - All interactive controls — search input, clear buttons, State/City/Nukh select dropdowns, reset buttons, and Profile navigation links — strictly enforce $\ge 44\text{px}$ touch targets.
- **Multi-Criteria Filtering**:
  - Keyword search across leader name, city, gotra, nukh, and designation.
  - Geographic filters for State (e.g., Gujarat, Rajasthan, Maharashtra, Madhya Pradesh) and City (e.g., Palanpur, Bhuj, Jodhpur, Mumbai).
  - Lineage filter for ancestral Nukh (e.g., Janiyani, Keria, Chothani).
  - One-tap filter reset action with instant state clearing.
- **Deterministic Ordered Pagination**:
  - Alphabetical ordering (`name ASC, id ASC`) with Fetch N+1 pagination contract.
- **Trilingual Localization**:
  - Full localization across English, Hindi, and Gujarati (`useLanguage()`).
- **Unified Community Hub Integration**:
  - 6th tab button (`id="tab-mukhi"`), 6th Community Pulse metric card, WAI-ARIA tablist arrow-key navigation, and deep-linkable URL route (`/community?tab=mukhi` and direct route `/mukhi`).

---

## 9. Committees, Panchayat & Circulars (ANDROID-13)

The **Committees, Panchayat Leadership & Circulars** suite (Android Reference Screens 44–49) completes community governance, executive rosters, and official administrative notices:

### Core Architectural Invariants & Parity Requirements
- **Committee Directory & Member Roster (Screens 44–45)**:
  - Structured directory of standing and ad-hoc community committees (Jan Ganna, Panchayat Executive, Sarvaniyat Dispute Resolution, Youth Wing, Mahila Mandal, Education Trust, Medical Relief).
  - Displays committee objectives, total member count, verified badge, and active status.
  - Detail modal / roster view presents each member's designation (President, Secretary, Treasurer, Member), contact phone (privacy masked when `contact_privacy = 'PRIVATE'`), email, tenure, and appointment date.
- **Panchayat Leadership Directory & Zonal Mukhis (Screen 46)**:
  - Canonical leadership roster categorized by governance tiers: `EXECUTIVE_COUNCIL`, `ZONAL_MUKHI`, and `ADVISORY_COUNCIL`.
  - Geographic zone mapping (e.g. Gujarat North, Kutch Region, Marwar/Rajasthan, Mumbai/Maharashtra) connecting regional leadership with local community members.
  - Clear tenure years and designation badges (Sarpanch, Up-Sarpanch, Zonal Mukhi, Senior Advisor).
- **Circulars / Community Notices & Official Document Reader (Screens 47–48)**:
  - Chronological repository of verified community circulars and administrative notices.
  - Prominent pinned badges for critical alerts, categorization (Administrative, Electoral, Cultural, Financial, Urgent), and unique official reference numbers (e.g. `CIR-2026-001`).
  - Read-only Document Viewer modal displaying official circular contents, issuing authority, signatories, and actionable download/share buttons.
- **Screen 49 Role-Based Action ("Issue Official Notice / Circular")**:
  - Gated button rendered exclusively for authorized community leaders (`COMMUNITY_MODERATOR`, `COMMITTEE_MEMBER`, `ADMIN`, `SUPER_ADMIN`).
  - Read-only shield displayed for standard members (`MEMBER`, `GUEST`, `FAMILY_HEAD`), preserving institutional authority.
- **5-Level Privacy & Security Model**:
  - Respects member phone and email privacy (`contact_privacy = 'PRIVATE'`).
  - Masks phone numbers (`+91 ••••• •••••`) for regular members when private; unmasked only for verified leadership or authorized viewers.
  - `PERSON != USER` invariant preserved: leadership roles can link to claimed profile records while maintaining census integrity for historical elders.
  - Zero database migrations required: reuses `public.groups`, `public.group_members`, `public.announcements`, and canonical registries.

### Mobile-First UX & Accessibility
- **Touch Target Compliance**: All filter chips, search inputs, modal close triggers, phone call/email links, and circular cards enforce $\ge 44\text{px}$ touch targets.
- **WAI-ARIA Tab Navigation**: CommunityPage tabs expanded to 9 total tabs (`groups`, `announcements`, `events`, `birthdays`, `panchang`, `mukhi`, `circulars`, `committees`, `panchayat`) with complete keyboard navigation (Arrow keys, `Home`, `End`).
- **Trilingual Localization**: Full trilingual coverage across English (`en`), Hindi (`hi`), and Gujarati (`gu`) for all titles, status badges, roles, categories, and detail modal strings.
- **Deep-linking & Routing**: Supported via `/community?tab=circulars`, `/community?tab=committees`, `/community?tab=panchayat`, and route aliases `/circulars`, `/committees`, `/panchayat`.

