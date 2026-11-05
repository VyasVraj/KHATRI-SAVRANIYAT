# Verification Feature Domain (`src/features/verification`)

> **Phase 9 — Record Verification & Data Quality (Complete)**

## Overview

The Verification feature domain provides community verification, deterministic data quality scoring, and safe, non-destructive duplicate detection for census records (Person and Family entities).

Verification confirms that genealogical, biographical, and family lineage data has been attested and reviewed by authorized community moderators (`COMMUNITY_MODERATOR`, `ADMIN`, `SUPER_ADMIN`).

---

## Architectural & Security Invariants

1. **PERSON != USER**:
   - Verification validates census data accuracy.
   - It does NOT claim, link, or alter `persons.user_id`.
   - Identity claims remain strictly managed under `src/features/claims/`.

2. **CLAIM != VERIFICATION**:
   - Claiming links a user account to a census person.
   - Verification attests to community accuracy.
   - These are orthogonal, independent lifecycles.

3. **VERIFICATION != RECORD OWNERSHIP**:
   - Verifying a record does not transfer ownership or change `created_by`.

4. **DATA QUALITY != VERIFICATION**:
   - Data Quality measures record completeness, internal consistency, and genealogical utility (0–100 score).
   - Verification confirms official attestation by community moderators.
   - A verified record may still have missing fields; an unverified record may be 100% complete.

5. **DETECT != MERGE (CRITICAL NON-DESTRUCTIVE GUARANTEE)**:
   - Duplicate detection identifies and flags potential duplicate records.
   - Under NO circumstances does the system automatically merge, overwrite, delete, reassign ownership, or transfer claims.
   - Flags are non-destructive and reviewed manually by authorized moderators.

6. **DATABASE / RPC AUTHORITY**:
   - The application layer NEVER mutates `verification_status` directly or updates `verification_requests` / `duplicate_flags` tables directly.
   - All submissions route strictly through `submit_verification_request(...)`.
   - All approvals route strictly through `approve_verification_request(...)`.
   - All rejections route strictly through `reject_verification_request(...)`.
   - All cancel operations route strictly through `cancel_verification_request(...)`.
   - Duplicate flagging and resolution route strictly through `flag_duplicate_record(...)` and `resolve_duplicate_flag(...)`.
   - Database functions are defined with `SECURITY DEFINER` and hardened `search_path = public`.

7. **SCOPE IS STRICTLY PERSON AND FAMILY**:
   - Entity type is constrained to `'PERSON' | 'FAMILY'`.

8. **CANONICAL ORDERING ON DUPLICATE FLAGS**:
   - Table `public.duplicate_flags` enforces `CHECK (record_a_id < record_b_id)` and unique pair index `idx_duplicate_flags_canonical_pair` to guarantee no duplicate flag collision across ID permutations.

---

## Module Structure

```
src/features/verification/
├── types.ts                               # Domain types (VerificationStatus, review types, filters)
├── types/
│   ├── quality.types.ts                   # Data quality scoring types & breakdown structures
│   └── duplicate.types.ts                 # Duplicate detection, flags, confidence, & review types
├── schemas/
│   └── verification.schemas.ts            # Zod validation schemas (submission, approve, reject)
├── services/
│   ├── verification.service.ts            # Submission & cancellation RPC integration & error sanitization
│   ├── verification.review.service.ts     # Moderator review queue & approve/reject RPCs
│   ├── dataQuality.service.ts             # Deterministic, explainable Person & Family scoring engine
│   └── duplicateDetection.service.ts      # Conservative matching algorithm & duplicate flag RPCs
├── hooks/
│   ├── useVerification.ts                 # React Query submission & cancellation hooks
│   ├── useVerificationReview.ts           # React Query review queue, detail & mutation hooks
│   └── useDuplicateDetection.ts           # React Query duplicate flag listing, mutation & candidate hooks
├── components/
│   ├── VerificationBadge.tsx              # Status badge component
│   ├── VerificationSubmitModal.tsx        # Request submission dialog
│   ├── PersonVerificationSection.tsx      # Person detail verification section + Data Quality
│   ├── FamilyVerificationSection.tsx      # Family detail verification section + Data Quality
│   ├── VerificationReviewRejectModal.tsx  # Mandatory rejection reason modal
│   ├── VerificationReviewDetailModal.tsx  # Target inspection modal dialog
│   ├── DataQualityIndicator.tsx           # Score badge, progress bar, category breakdowns, disclaimer
│   ├── DuplicateReviewModal.tsx           # Side-by-side comparison & non-destructive resolution modal
│   └── DuplicateFlagsQueueSection.tsx     # Moderator duplicate flags review queue tab
├── pages/
│   └── VerificationReviewQueuePage.tsx    # Moderator review queue page (/admin/verifications)
├── index.ts                               # Public API barrel
└── README.md                              # Feature documentation
```

---

## Service API

### Submission & Lifecycle Service (`verification.service.ts`)
- `submitVerificationRequest({ entityType, entityId, supportingNotes })`:
  Calls `public.submit_verification_request` RPC, sanitizing database exceptions into user-safe messages.
- `cancelVerificationRequest(requestId)`:
  Calls `public.cancel_verification_request` RPC to revert a pending verification request.

### Review Service (`verification.review.service.ts`)
- `listVerificationRequestsForReview(filters?, callerUserId?)`:
  Fetches verification requests with target Person / Family and Requester profile details. Enforces server-side RLS.
- `getVerificationRequestForReview(requestId, callerUserId?)`:
  Fetches a single request with enriched target entity and requester information.
- `approveVerificationRequest({ requestId }, callerUserId?)`:
  Invokes `public.approve_verification_request(p_request_id UUID)` RPC.
- `rejectVerificationRequest({ requestId, reason }, callerUserId?)`:
  Invokes `public.reject_verification_request(p_request_id UUID, p_rejection_reason TEXT)` RPC.

### Data Quality Scoring Service (`dataQuality.service.ts`)
- `calculatePersonDataQuality(person)`:
  Deterministic 100-point scoring across Core Identity (35), Vital Information (25), Cultural Lineage (25), and Contact/Supplementary (15). Emits tier, missing fields, recommendations, and consistency warnings.
- `calculateFamilyDataQuality(family)`:
  Deterministic 100-point scoring across Identity & Description (35), Cultural Lineage (35), and Geographic Location (30).

### Duplicate Detection Service (`duplicateDetection.service.ts`)
- `findPersonDuplicateCandidates(target, pool)`:
  Conservative match analysis producing scored candidates with `STRONG`, `POSSIBLE`, or `WEAK` confidence, listing explainable match signals and differing signals. Excludes target record, deleted records, and archived records.
- `findFamilyDuplicateCandidates(target, pool)`:
  Matches family name, cultural lineage, and geographic location.
- `flagDuplicateRecord({ entityType, recordAId, recordBId, confidence, matchReasons })`:
  Invokes `public.flag_duplicate_record` RPC with canonical pair ordering.
- `resolveDuplicateFlag({ flagId, resolution, resolutionNotes })`:
  Invokes `public.resolve_duplicate_flag` RPC (`CONFIRMED_DUPLICATE` or `NOT_DUPLICATE`).
- `listDuplicateFlags(filter?)`:
  Fetches duplicate flags enriched with Record A and Record B data for side-by-side moderator comparison.

---

## ANDROID-7 Mobile Parity & Trilingual Localization
Under ANDROID-7, the verification and duplicate review flows were upgraded for full Android reference PDF alignment:
- **`PersonDuplicateWarningBanner.tsx`**: Proactively alerts community moderators and admins (`ADMIN_ROLES`) to duplicate candidates on person profiles, complete with match confidence and explainable match signals. Hidden for regular members.
- **Mobile Touch Targets**: All action buttons, filter selectors, tabs, and close icons enforce $\ge 44\text{px}$ touch targets (`min-h-[44px] min-w-[44px]`).
- **Trilingual Localization**: Integrated with `useLanguage()` across English (`en`), Hindi (`hi`), and Gujarati (`gu`) using `verification.*` and `duplicate.*` dictionaries.
- **Strict `DETECT != MERGE`**: Duplicate detection flags and resolutions are strictly non-destructive. No automated record merging or deletion is ever performed.

