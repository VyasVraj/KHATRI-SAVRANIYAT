# Claims Domain (`src/features/claims`)

## Purpose
The **Claims** feature domain implements the application-level workflow for claiming census `Person` records by authenticated `User` accounts in Community Roots, as well as the administrative moderator review queue for verifying and deciding on submitted claims. It operationalizes the core architectural invariant:

$$\text{PERSON} \neq \text{USER}$$

- A **Person** (`public.persons`) represents an individual in the community census (living, historical, or ancestral).
- A **User** (`auth.users` / `public.profiles`) represents an authenticated application account.
- Claiming is the controlled, auditable process by which an unclaimed census record is linked to a user account (`persons.user_id = profiles.id`).

---

## Architectural Principles & Security Invariants

1. **`PERSON != USER` Boundary**:
   - Census records exist independently of user registrations.
   - Claiming bridges a person to a user account, but claimants cannot self-link records.
   - Ordinary client callers and claimant UI MUST NEVER directly update `persons.user_id` or invoke `approve_person_claim` / `reject_person_claim`.
2. **One-to-One Identity Invariant**:
   - A user account can be linked to at most **one** person record.
   - A person record can be linked to at most **one** user account.
   - Enforced by database indexes and atomic checks during approval.
3. **Claim Lifecycle State Machine**:
   - `PENDING`: Claim submitted by claimant with optional evidence notes (max 1000 chars); awaiting community moderator review.
   - `APPROVED`: Claim approved by moderator via `approve_person_claim` RPC; atomically links `persons.user_id` and writes audit log.
   - `REJECTED`: Claim rejected via `reject_person_claim` RPC with mandatory rationale provided by reviewer.
   - `CANCELLED`: Withdrawn by claimant prior to review. Terminal states are immutable.
4. **Moderator Authorization & Family Head Exclusion**:
   - Only users with `ADMIN_ROLES` (`SUPER_ADMIN`, `ADMIN`, `COMMUNITY_MODERATOR`) verified via `is_community_moderator()` in SQL and `hasAdminRole()` on frontend may review, approve, or reject claims.
   - **Family Head has NO moderator authority**: Family Heads manage family memberships and relationships within their designated family unit, but census identity claiming is a community-wide governance responsibility reserved exclusively for community moderators.
5. **Target Eligibility Invariants**:
   - Only living, active, non-deleted, unclaimed census records can be claimed (`user_id IS NULL`, `status = 'ACTIVE'`, `date_of_death IS NULL`, `deleted_at IS NULL`).
6. **Zero Exposure of Sensitive Data**:
   - If a person record is claimed by another user, the owner's user ID or profile data is never leaked to other viewers.
   - Moderator identities (`reviewed_by`) are not displayed to claimants.
   - Invitation token hashes are never exposed or queried.

---

## Component & Service Architecture

### Types & Schemas
- **`types.ts`**:
  - `ClaimStatus`, `PersonClaim`, `ClaimForReview`, `SubmitClaimInput`, `CancelClaimInput`, `ApproveClaimInput`, `RejectClaimInput`.
- **`schemas/claims.schemas.ts`**:
  - `submitClaimSchema`: Validates `personId` UUID and evidence notes up to 1000 characters.
  - `cancelClaimSchema`: Validates `claimId` UUID.
  - `approveClaimSchema`: Validates `claimId` UUID.
  - `rejectClaimSchema`: Validates `claimId` UUID and mandatory trimmed reason between 1 and 1000 characters.

### Service Layer (`services/claims.service.ts`)
- **Claimant Operations**:
  - `submitPersonClaim(input, callerUserId?)`: Inserts `PENDING` claim for claimant; sanitizes database errors.
  - `getMyClaimForPerson(personId, callerUserId?)`: Retrieves claimant's active/latest claim for target person.
  - `getMyClaims(callerUserId?)`: Retrieves all claims submitted by the current user.
  - `cancelPersonClaim(input, callerUserId?)`: Updates `PENDING` claim to `CANCELLED`.
- **Moderator Operations (Phase 8 Subtask 3)**:
  - `listPendingClaimsForReview(callerUserId?)`: Queries `person_claims` in `PENDING` status joined with target census fields and claimant profile summary.
  - `getClaimForReview(claimId, callerUserId?)`: Fetches single claim details for detailed moderator inspection.
  - `approveClaim(input, callerUserId?)`: Calls secure database RPC `approve_person_claim(p_claim_id)`. Atomically assigns `persons.user_id`, transitions claim to `APPROVED`, writes immutable audit log, and sanitizes stale-claim concurrency errors.
  - `rejectClaim(input, callerUserId?)`: Calls secure database RPC `reject_person_claim(p_claim_id, p_reason)`. Validates mandatory reason, transitions claim to `REJECTED`, writes immutable audit log, and sanitizes stale-claim concurrency errors.

### React Hooks (`hooks/usePersonClaim.ts`)
- `usePersonClaim(personId)`: Queries claimant's status for target person.
- `useMyClaims()`: Queries all claims submitted by the current user.
- `useClaimMutations()`: React Query mutations for submitting and cancelling claims with targeted cache invalidation.
- `usePendingClaimsReview()`: React Query hook enabled only for users with `ADMIN_ROLES` to query pending claims.
- `useClaimForReview(claimId)`: React Query hook for inspecting single claim.
- `useReviewClaimMutations()`: Mutations for `approve` and `reject` with cache invalidation across `claims-review-queue`, `person-claim`, `person`, and `persons`.

### UI Components & Pages
- **Claimant UI**:
  - `PersonClaimSection.tsx`: Context-aware claim banner/CTA on `PersonDetailPage` handling all 8 UX states.
  - `ClaimPersonModal.tsx`: Accessible submission dialog with evidence notes and character counter.
  - `CancelClaimDialog.tsx`: Confirmation dialog for withdrawing a pending claim.
- **Moderator Review Queue UI (Phase 8 Subtask 3)**:
  - `ClaimReviewQueuePage.tsx`: Review queue page at `/admin/claims` featuring pending count badges, filter/search by person or claimant, status feedback banners, and quick approve/reject actions.
  - `ClaimReviewDetailModal.tsx`: Comprehensive inspection dialog displaying target person census details (name, DOB, place, gotra, nukh, verification status), claimant account info, submitted evidence notes, and approve/reject controls.
  - `ClaimReviewRejectModal.tsx`: Rejection dialog requiring mandatory explanation (1–1000 characters) with real-time character count.
  - `ModeratorRoute.tsx`: Route guard enforcing `ADMIN_ROLES` with accessible Access Denied fallback.
  - `AppHeader.tsx`: Navigation header showing "Claim Reviews" badge dropdown and mobile link only for authorized moderators.

---

## Validation & Test Coverage

- `tests/unit/claims.schemas.test.ts`: Zod schema validation tests for submit, cancel, approve, and reject.
- `tests/unit/claims.service.test.ts`: Service tests for claimant operations.
- `tests/unit/claims.review.service.test.ts`: Service tests for moderator review, RPC invocations, and concurrency error sanitization (18 tests).
- `tests/unit/usePersonClaim.test.ts`: Hooks tests for claimant workflows.
- `tests/unit/claims.review.hooks.test.ts`: Hooks tests for moderator queue and review mutations (12 tests).
- `tests/unit/PersonClaimSection.test.tsx`: Component tests covering all UX states on PersonDetail.
- `tests/unit/ClaimReviewModals.test.tsx`: Component tests for Detail and Reject review modals (6 tests).
- `tests/unit/ClaimReviewQueuePage.test.tsx`: Component tests for Queue page states, search, and actions (4 tests).
- `tests/unit/ModeratorRoute.test.tsx`: Route guard unit tests for admin roles, member rejection, and unauthenticated redirects (6 tests).
- `tests/security/rls-claims.test.ts`: Complete database RLS test suite (51 tests) covering positive and negative access control.
- `tests/unit/claims-verification-android-parity.test.tsx`: Comprehensive ANDROID-7 parity suite (15 tests) verifying mobile touch targets, states, modals, and trilingual localization.

---

## ANDROID-7 Mobile Parity & Trilingual Localization
Under ANDROID-7, the census seat claiming flows have been upgraded to match the 49-page Android reference PDF specifications (Screen 04 & Screens 21-24):
- **Mobile Touch Targets**: All interactive elements (Claim record, Withdraw claim, Cancel, Submit, Inspect & Review, Reject, Approve) enforce minimum 44px touch targets (`min-h-[44px] min-w-[44px]`).
- **Trilingual Localization**: Fully localized in English (`en`), Hindi (`hi`), and Gujarati (`gu`) via `useLanguage()` and central dictionary keys (`claims.*`).
- **Responsive Drawer/Modal Ergonomics**: Mobile-first layout adaptations for all dialogs and bottom sheets, with proper ARIA attributes (`aria-modal`, `aria-labelledby`, `role="dialog"`) and keyboard Escape dismissal.
- **Privacy Enforcement**: Complete preservation of `PERSON != USER` and ANDROID-2 privacy authorization lock (`SUPER_ADMIN`, `ADMIN`, `COMMUNITY_MODERATOR`).

