-- =============================================================================
-- Migration: 20261002130001_create_enums.sql
-- Purpose:   Create all domain enum types used across the schema
-- Phase:     1 — Architecture & Database Foundation
-- =============================================================================
-- ROLLBACK: Drop enums in reverse dependency order (check tables first)
-- NOTE: Enum values can be added later (ALTER TYPE ... ADD VALUE) but
--       removing values requires a full migration. Choose carefully.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privacy levels — controls visibility of records across the platform
-- Enforced server-side in RLS policies; NEVER trust frontend filtering alone
-- -----------------------------------------------------------------------------
CREATE TYPE public.privacy_level AS ENUM (
  'PRIVATE',      -- Only the record owner / the person themselves
  'FAMILY',       -- Members of the person's families
  'CONNECTIONS',  -- Accepted connections only (Phase 7)
  'COMMUNITY',    -- All verified community members
  'PUBLIC'        -- Everyone including unauthenticated visitors
);

-- -----------------------------------------------------------------------------
-- User roles — RBAC foundation, enforced at DB level
-- Principle of least privilege: users default to MEMBER
-- Administrative checks use is_admin() SECURITY DEFINER function
-- -----------------------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM (
  'SUPER_ADMIN',          -- Full system access, can do anything
  'ADMIN',                -- Community administration
  'COMMUNITY_MODERATOR',  -- Content moderation and verification
  'COMMITTEE_MEMBER',     -- Committee-specific access
  'FAMILY_HEAD',          -- Manage their family's records
  'MEMBER',               -- Standard authenticated community member
  'GUEST'                 -- Limited access (e.g., invited but not verified)
);

-- -----------------------------------------------------------------------------
-- Person status — lifecycle of a person record
-- -----------------------------------------------------------------------------
CREATE TYPE public.person_status AS ENUM (
  'DRAFT',    -- Being entered, not yet fully complete
  'ACTIVE',   -- Normal active record
  'ARCHIVED', -- Removed from active views but preserved
  'DECEASED'  -- Person is deceased (still preserved for family history)
);

-- -----------------------------------------------------------------------------
-- Family status
-- -----------------------------------------------------------------------------
CREATE TYPE public.family_status AS ENUM (
  'DRAFT',    -- Being created via wizard
  'ACTIVE',   -- Fully created and active
  'ARCHIVED'  -- No longer active in directory
);

-- -----------------------------------------------------------------------------
-- Verification status — for both persons and families
-- Follows: UNVERIFIED → PENDING → VERIFIED (or REJECTED)
-- -----------------------------------------------------------------------------
CREATE TYPE public.verification_status AS ENUM (
  'UNVERIFIED', -- Default, not yet submitted for verification
  'PENDING',    -- Submitted, awaiting review
  'VERIFIED',   -- Verified by admin/community moderator
  'REJECTED'    -- Verification rejected (with reason in verification record)
);

-- -----------------------------------------------------------------------------
-- Gender — person demographic attribute
-- Not mandatory; always stored privately by default
-- -----------------------------------------------------------------------------
CREATE TYPE public.gender AS ENUM (
  'MALE',
  'FEMALE',
  'OTHER',
  'PREFER_NOT_TO_SAY'
);

-- -----------------------------------------------------------------------------
-- Family role — a person's role within a specific family
-- -----------------------------------------------------------------------------
CREATE TYPE public.family_role AS ENUM (
  'HEAD',         -- Family head / principal member
  'SPOUSE',       -- Spouse of the head or another member
  'CHILD',        -- Child of head/spouse
  'PARENT',       -- Parent of head (e.g., living with family)
  'SIBLING',      -- Sibling of head
  'GRANDPARENT',  -- Grandparent
  'GRANDCHILD',   -- Grandchild
  'EXTENDED'      -- Any other extended family member
);

-- -----------------------------------------------------------------------------
-- Audit action — what happened, recorded in audit_logs
-- Add new values here as new auditable operations are added
-- -----------------------------------------------------------------------------
CREATE TYPE public.audit_action AS ENUM (
  -- User / auth events
  'USER_REGISTERED',
  'USER_ROLE_CHANGED',
  'USER_DEACTIVATED',
  'USER_REACTIVATED',
  -- Profile events
  'PROFILE_UPDATED',
  -- Person events
  'PERSON_CREATED',
  'PERSON_UPDATED',
  'PERSON_DELETED',
  'PERSON_CLAIMED',
  'PERSON_CLAIM_APPROVED',
  'PERSON_CLAIM_REJECTED',
  'PERSON_VERIFIED',
  'PERSON_VERIFICATION_REJECTED',
  -- Family events
  'FAMILY_CREATED',
  'FAMILY_UPDATED',
  'FAMILY_DELETED',
  'FAMILY_MEMBER_ADDED',
  'FAMILY_MEMBER_REMOVED',
  'FAMILY_HEAD_CHANGED',
  -- Privacy events
  'PRIVACY_CHANGED',
  -- Admin events
  'ADMIN_ACTION'
);
