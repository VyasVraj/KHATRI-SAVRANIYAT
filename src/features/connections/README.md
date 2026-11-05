# Connections Domain (`src/features/connections`)

## Purpose
The **Connections** feature domain enables interpersonal social connections, invitation workflows, and relationship verification between authenticated user accounts. In Phase 7, it serves as the foundation for the community social graph and connection-level record privacy.

---

## Architectural Principles & Domain Invariants

1. **`USER ↔ USER` Connection Model**:
   - Connections operate strictly between platform user identities (`public.profiles.id`), not census entities (`public.persons`).
   - A person census record without an associated user account (`user_id IS NULL`) cannot directly send or receive connection requests.
2. **`PERSON != USER`**:
   - Connections reflect social networking between registered users.
   - Census records remain independent until claimed via the Phase 8 Claiming workflow.
3. **`CONNECTION != GENEALOGICAL RELATIONSHIP`**:
   - Biological and marital lineages (`PARENT`, `SPOUSE`, `SIBLING` between `persons`) are stored in `public.relationships`.
   - Social connections between living users are stored in `public.connections`.
4. **One Row Per Canonical Pair**:
   - An unordered pair of users $(A, B)$ is stored in exactly **one** canonical row.
   - Database-level unique constraint on `(LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))` guarantees no opposing duplicate rows $(A, B)$ and $(B, A)$ can exist.
5. **No Reciprocal Row Duplication**:
   - When User A invites User B, only a single row $(A \to B)$ is created.
   - Symmetrical querying inspects both `requester_id` and `addressee_id`.

---

## Connection Lifecycle State Machine

```
              ┌───────────────┐
              │    PENDING    │ (Created by Requester)
              └───────┬───────┘
                      │
         ┌────────────┼────────────┐
         │ (Accept)   │ (Reject)   │ (Block)
         ▼            ▼            ▼
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │   ACCEPTED   │ │   REJECTED   │ │   BLOCKED    │
  └──────────────┘ └──────────────┘ └──────────────┘
```

- **`PENDING`**: Request sent; awaiting decision from the addressee.
- **`ACCEPTED`**: Mutual connection established; unlocks connection-aware data.
- **`REJECTED`**: Declined by addressee.
- **`BLOCKED`**: Initiated by either party; blocks requests and hides connection visibility.

---

## Two-Gate Access Control & Security Model

1. **Gate 1 (SQL Discretionary Privileges)**:
   - `authenticated` role is granted `SELECT, INSERT, UPDATE, DELETE`.
   - `anon` and `PUBLIC` are granted zero privileges (`REVOKE ALL`, error `42501`).
2. **Gate 2 (PostgreSQL Row Level Security)**:
   - **SELECT**: Only participants (`auth.uid() = requester_id OR auth.uid() = addressee_id`) or administrators (`is_community_moderator()`) can view connection records.
   - **INSERT**: Authenticated users can only insert records where `requester_id = auth.uid()`, initial status is `PENDING`, and `requester_id <> addressee_id`.
   - **UPDATE**: Only the addressee can accept or reject a pending request; either participant can transition a record to `BLOCKED`.
   - **DELETE**: Participants can remove/unfriend an `ACCEPTED` connection, cancel a `PENDING` request, or clean up a `REJECTED` connection. Participants CANNOT delete a `BLOCKED` connection (anti-bypass protection ensuring persistent block state). `BLOCKED` rows can ONLY be removed by authorized community moderators or administrators (`is_community_moderator()`).
3. **Update & Lifecycle Guard Triggers**:
   - `handle_connection_update_guard()` prevents mutating core identity fields (`id`, `requester_id`, `addressee_id`, `created_at`).
   - `handle_connection_status_transition_guard()` authoritatively enforces valid state transitions (`PENDING -> ACCEPTED/REJECTED/BLOCKED`, `ACCEPTED/REJECTED -> BLOCKED`), blocking all invalid mutations.
4. **Caller-Authorized Privacy Helper**:
   - `public.are_users_connected(user_a, user_b)` enforces caller authorization (caller must be participant or moderator), preventing third-party oracle probing while enabling connection-aware record privacy.

---

## Service Layer API (`src/features/connections/services/connections.service.ts`)

- `sendConnectionRequest({ addressee_id }, callerUserId)`: Validates UUID, ensures target exists and is active, and inserts `PENDING` connection.
- `acceptConnectionRequest(connectionId, callerUserId)`: Verifies caller is `addressee_id` and transitions status to `ACCEPTED`.
- `rejectConnectionRequest(connectionId, callerUserId)`: Verifies caller is `addressee_id` and transitions status to `REJECTED`.
- `removeConnection(connectionId, callerUserId)`: Removes connection row if caller is either participant and status is not `BLOCKED`. Rejects deletion of `BLOCKED` connections.
- `blockUser(targetUserId, callerUserId)`: Sets existing pair to `BLOCKED` or inserts a new `BLOCKED` row.
- `listConnections(callerUserId, filter)`: Lists connections relative to current user with safe profile projections.
- `getConnectionWithUser(callerUserId, targetUserId)`: Fetches the single canonical connection row (if any) between caller and target user.
- `getMutualConnectionsCount(userAId, userBId)`: Calculates mutual connection count without exposing the full private graph.

---

---

## UI Architecture & Components (`src/features/connections/components`)

1. **`ConnectionCard`**:
   - Renders a single connection or request relative to the authenticated caller.
   - Enforces privacy-safe projection: Displays only `display_name` and `avatar_url`.
   - Strictly excludes internal IDs, emails, phone numbers, auth metadata, and timestamps.
   - Dynamic action sets:
     - `ACCEPTED`: Remove, Block
     - `PENDING` (received): Accept, Ignore, Block
     - `PENDING` (sent): Cancel Request
     - `BLOCKED`: Blocked notice (no accept button)

2. **`ConnectionsList`**:
   - Renders accepted connections in a responsive grid.
   - Handles Loading (skeleton cards), Error (alert with retry), Empty, and Populated states.

3. **`RequestsList`**:
   - Groups pending requests into **Received Requests** and **Sent Requests**.
   - Handles independent loading, error, empty, and populated states.

4. **`SendConnectionModal`**:
   - Accessible modal dialog for sending requests by user account UUID.
   - Input validated with Zod schema (`sendConnectionRequestSchema`).
   - Prevents self-connection (`addressee_id === callerUserId`).
   - Loading indicator and conflict error handling.

5. **`RemoveConnectionDialog` & `BlockUserDialog`**:
   - Accessible confirmation modals preventing accidental destructive actions.
   - Transparently communicates relationship status changes.

6. **`PersonConnectionSection`**:
   - Cross-domain integration component embedded on `PersonDetailPage` for linked census records (`person.user_id IS NOT NULL`).
   - Renders caller-relative connection status (`Not connected`, `Pending sent`, `Pending received`, `Connected`, `Blocked`), mutual connection count badge, and contextual actions (`Connect`, `Accept`, `Decline`, `Disconnect`).
   - Preserves `PERSON != USER` boundary: unconditionally returns `null` if `person.user_id` is missing.

---

## State Management & Hooks (`src/features/connections/hooks`)

- **`useConnections(filter)`**: Fetches connections for authenticated caller with status filtering (`ACCEPTED`, `BLOCKED`).
- **`usePendingRequests()`**: Concurrently fetches received and sent pending requests.
- **`useConnectionWithUser(targetUserId)`**: Fetches real-time pairwise connection status between authenticated user and a target user.
- **`useConnectionMutations()`**: Encapsulates `sendRequest`, `acceptRequest`, `rejectRequest`, `remove`, and `block` mutations. Automatically invalidates `['connections']` cache hierarchy on success.
- **`useMutualConnections(targetUserId)`**: Computes mutual connection count on demand.

---

## Routing & Page Integration

- Route: `/connections`
- Guard: Protected by `ProtectedRoute` (redirects unauthenticated users to `/auth/sign-in`).
- Page: `ConnectionsPage.tsx` with accessible tabbed navigation (`Connected`, `Requests`, `Blocked`).
- Header integration: Linked in `AppHeader` user dropdown and mobile auth menu.

---

## Connection-Aware Privacy Integration (Phase 7 Subtask 3)

The USER ↔ USER social connection graph is integrated into the census PERSON privacy model via `public.persons.profile_privacy`:

1. **`PERSON != USER` Linkage**:
   - Only `persons.user_id` bridges a census individual to an authenticated account.
   - If `persons.user_id IS NULL`, connection-based access is NEVER granted (unclaimed/unlinked records have no user to connect with).
2. **Policy `persons_select_connections`**:
   - Authenticated users can view a person with `profile_privacy = 'CONNECTIONS'` if and only if they share an active, `ACCEPTED` connection with `persons.user_id` via `public.are_users_connected(auth.uid(), persons.user_id)`.
   - `PENDING`, `REJECTED`, or `BLOCKED` states do NOT grant visibility.
   - Soft-deleted (`deleted_at IS NOT NULL`) and archived (`status = 'ARCHIVED'`) records remain inaccessible.
3. **Privilege Hardening**:
   - `public.are_users_connected(UUID, UUID)` execution revoked from `PUBLIC` and `anon`; granted exclusively to `authenticated`.

---

## Phasing & Subtask Boundaries

- **Subtask 1 (Complete)**: Database migration, constraints, RLS, triggers, table privileges, service layer, Zod schemas, and unit/security tests.
- **Subtask 2 (Complete)**: UI components (`ConnectionCard`, `ConnectionsList`, `RequestsList`, dialogs), TanStack Query hooks, `/connections` management page, and unit test suites.
- **Subtask 3 (Complete)**: Connection-aware privacy policy (`persons_select_connections`), `are_users_connected` execution hardening, cross-domain Person/Discovery integration, and security test suite (`rls-connections-privacy.test.ts`).
- **Subtask 4 (Complete)**: Person detail connection status integration (`PersonConnectionSection`), `useConnectionWithUser` hook, mobile/responsive verification, edge-case hardening, regression test suite (972 tests), and Phase 7 formal closure.
