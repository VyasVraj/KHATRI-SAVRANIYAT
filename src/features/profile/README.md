# Profile, Completeness, Account, Security & Settings (ANDROID-12)

## Overview

The Profile feature domain (`src/features/profile/`) delivers the complete Android reference implementation for **Screens 37–43** of the KhatriSetu Android application. It manages authenticated user account identity, profile display settings, census record completeness & guidance, security settings, app preferences, and community privacy governance.

---

## Android Reference Screen Mapping

| Screen | View / Component | Purpose & Parity |
|---|---|---|
| **Screen 37** | `ProfileOverviewSection` | Authenticated profile card, avatar photo upload, display name edit form, and census record linkage (`PERSON != USER`). |
| **Screen 38** | `ProfileCompletenessSection` | Deterministic data quality score (0–100%), tier progress bar, missing fields breakdown, and direct actionable edit links (`DATA QUALITY != VERIFICATION`). |
| **Screen 39** | `AppSettingsSection` | Multi-language switcher (`en`, `hi`, `gu`), guided 7-step app tour replay, and notification preferences routing. |
| **Screen 40** | `AccountDetailsSection` | Account identity (`auth.users`), email verification badge, role, member-since timestamp, and session state. |
| **Screen 41** | `SecuritySettingsSection` | Password management with Zod complexity validation, Supabase `updateUser` integration, and security hygiene advice. |
| **Screen 42** | `AccountDeletionModal` | Privacy policy compliant account deletion request workflow preserving shared genealogical records intact (`PERSON != USER`). |
| **Screen 43** | `PrivacySettingsSection` | 5-level community privacy model presentation with strict **ANDROID-2 privacy authorization lock**. |

---

## Core Architectural Invariants

### 1. `PERSON != USER` Boundary
- **User** (`auth.users` / `public.profiles`): Authentication identity used to log in.
- **Person** (`public.persons`): Real-world genealogical member in the community census.
- Deleting an account or signing out terminates user credentials but **must never** delete or destroy community census or family tree records.

### 2. Production Role Model
- Roles: `SUPER_ADMIN`, `ADMIN`, `COMMUNITY_MODERATOR`, `COMMITTEE_MEMBER`, `FAMILY_HEAD`, `MEMBER`, `GUEST`.
- **No `MUKHI` enum**: `COMMUNITY_MODERATOR` serves as the authoritative Mukhi-equivalent.

### 3. ANDROID-2 Privacy Authorization Lock
- **Normal Users** (`MEMBER`, `FAMILY_HEAD`, `COMMITTEE_MEMBER`, `GUEST`):
  - Receive **ZERO** editable privacy controls.
  - View an informative notice explaining that privacy levels are governed by Mukhi / Community Moderators to protect family lineage.
- **Authorized Roles** (`SUPER_ADMIN`, `ADMIN`, `COMMUNITY_MODERATOR` via `canManagePrivacy(role)`):
  - Retain authority to adjust privacy levels (`profile_privacy`, `contact_privacy`, `dob_privacy`).

---

## Mobile UX & Accessibility

- **Touch Targets**: All tabs, buttons, dropdowns, and form inputs enforce a minimum touch target of $\ge 44\text{px}$.
- **WAI-ARIA Navigation**: Segmented tablist with `role="tablist"`, `role="tab"`, and arrow-key cycling across all 6 tabs (`Home`, `End`, `ArrowRight`, `ArrowLeft`).
- **Trilingual Localization**: Complete coverage across English (`en`), Hindi (`hi`), and Gujarati (`gu`).
