# docs/PRODUCT_REQUIREMENTS.md

# Product Requirements Document

**Product:** Community Roots
**Version:** 0.1.0
**Status:** Phase 0 — Engineering Foundation

---

## Product Mission

Community Roots is a production-ready platform for community family census, family identity, family trees, family branches, households, community directory, finding existing families and person records, controlled community connections, community discovery, family history, events, birthdays, committees, announcements, community services, resources, verification workflows, correction workflows, and admin-maintained community data.

**Primary purpose:** Community Connection + Family Identity + Family History + Verified Community Data

**This is NOT a matrimonial or matchmaking platform.**

---

## Core User Stories

### Census & Registration
- As a community member, I can register my family with all members and household information
- As a family head, I can manage my family's members and relationships
- As a member, I can add, update, and correct my personal information

### Discovery
- As a community member, I can search for families by name, location, gotra, nukh, and mukhi
- As a searcher, I can find my family's existing record and request to join or claim it
- Search results respect privacy settings — contact information is not exposed by default

### Family Tree
- As a family member, I can view my family tree spanning multiple generations
- Trees support parent/child, spouse, and sibling relationships
- Trees load progressively — not all nodes at once

### Connections
- As a member, I can send and manage connection requests
- Connections give controlled access to additional information
- All connection states are auditable

### Verification
- Admins and community moderators can verify family records
- Verification states: DRAFT → SUBMITTED → UNDER_REVIEW → VERIFIED → REJECTED → ARCHIVED
- Changes to verified records require appropriate workflow

### Administration
- Admins can manage roles, moderate content, verify records, review reports
- All administrative actions are audited
- Role model: SUPER_ADMIN → ADMIN → COMMUNITY_MODERATOR → COMMITTEE_MEMBER → FAMILY_HEAD → MEMBER → GUEST

---

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| Concurrent users (normal) | ~9,000 |
| Architecture scalability | 25,000–50,000+ without rewrite |
| Availability | High availability via Supabase managed |
| Security | See SECURITY.md |
| Privacy | See SECURITY.md — privacy levels |
| Accessibility | WCAG 2.1 AA target |
| Browser support | Modern browsers (Chrome, Firefox, Safari, Edge) |
| Mobile | Mobile-first responsive design |
| Initial language | English |

---

## Privacy Levels

| Level | Visibility |
|---|---|
| PRIVATE | Only the person themselves |
| FAMILY | Family members only |
| CONNECTIONS | Accepted connections only |
| COMMUNITY | All verified community members |
| PUBLIC | Everyone including unauthenticated visitors |

Sensitive information (phone, email, address) defaults to PRIVATE.

---

## Out of Scope (Explicit Exclusions)

- Matrimonial / matchmaking features
- External social network integrations
- Payments or financial transactions (Phase 0–16)
- Mobile native apps (web-first, PWA possible later)
- Real-time chat (possible future phase)
