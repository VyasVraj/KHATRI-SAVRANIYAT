# Invitations Feature Domain (Phase 8 — Subtask 4B)

## Overview

The **Invitations** feature domain enables authorized family creators and community moderators to issue secure, link-based invitations to individuals, inviting them to join a specific family roster within the Community Roots census.

## Core Architectural Invariants

1. **`PERSON != USER` Boundary**:
   - An invitation targets an existing census `Person` record and adds them to `family_members`.
   - Accepting an invitation **never** modifies `persons.user_id`.
   - An invitation does **not** claim the Person record.
   - The claim and moderator review workflow (`public.approve_person_claim`) remains the only authorized path to link an authenticated user account to a census Person record.

2. **`INVITATION != CLAIM` Boundary**:
   - Invitations are family-scoped membership mechanisms, not identity claims.
   - Acceptance does not alter rows in `public.person_claims`.

3. **`FAMILY MEMBERSHIP != PERSON OWNERSHIP`**:
   - Adding a person to `family_members` grants roster presence only; it does not grant ownership over the Person census record.

4. **Active Head Uniqueness Preserved**:
   - Invitation acceptance strictly sets `is_head = FALSE`.
   - Family head assignment cannot be achieved through an invitation.

5. **Token Security & Least Privilege**:
   - Plaintext tokens are **never** stored in the database.
   - The browser generates a 256-bit cryptographically secure token using `crypto.getRandomValues`.
   - The client computes a SHA-256 hash using `crypto.subtle.digest` and sends only the 64-character lowercase hex `token_hash` to the database.
   - Plaintext tokens exist in memory solely to construct the shareable redemption URL (`/invite/:token`).
   - Plaintext tokens and hashes are **never** persisted in `localStorage` or `sessionStorage` and are **never** logged to the console or analytics.

6. **Mobile Verification Boundary**:
   - Mobile SMS / OTP verification infrastructure is not currently configured.
   - Invitations operate honestly via link-based redemption and do not pretend SMS or phone OTP verification exists.

## Canonical RPC Integration

All invitation operations route exclusively through the deployed, verified PostgreSQL RPC functions:

- `public.create_family_invitation(p_family_id, p_person_id, p_invited_email, p_role, p_token_hash, p_expires_at)`:
  - Authorized for family creator or community moderator.
  - Revoked from `anon` and `service_role`.
  - Enforces partial unique index `idx_invitations_one_pending_per_person`.

- `public.get_invitation_by_token(p_token_hash)`:
  - Callable by `anon` and `authenticated`.
  - Exposes safe public preview fields (`family_name`, `person_name`, `invited_email`, `role`, `status`, `expires_at`, `is_expired`).
  - Never leaks `token_hash` or sensitive census data.

- `public.accept_invitation(p_token_hash)`:
  - Requires authenticated session.
  - Concurrency protected via `SELECT ... FOR UPDATE`.
  - Atomically adds person to `family_members` (`is_head = FALSE`), transitions status to `ACCEPTED`, sets `accepted_by = auth.uid()`, and records immutable audit log.

## Directory Structure

```
src/features/invitations/
├── components/
│   ├── CreateInvitationModal.tsx     # Family creator dialog to generate invite links
│   └── MobileVerificationNotice.tsx  # Transparent notice on link-based vs SMS verification
├── hooks/
│   └── useInvitations.ts             # React Query preview and mutation hooks
├── pages/
│   └── InvitationRedemptionPage.tsx  # Public preview & authenticated redemption page
├── schemas/
│   └── invitation.schemas.ts         # Zod schemas for validation
├── services/
│   └── invitations.service.ts        # Typed Supabase RPC integration layer
├── utils/
│   └── token.ts                      # Web Crypto CSPRNG token generator and SHA-256 hasher
├── types.ts                          # Domain TypeScript types
├── index.ts                          # Public feature export
└── README.md                         # Architecture documentation
```
