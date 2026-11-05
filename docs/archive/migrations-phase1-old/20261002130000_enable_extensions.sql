-- =============================================================================
-- Migration: 20261002130000_enable_extensions.sql
-- Purpose:   Enable PostgreSQL extensions required by the application
-- Phase:     1 — Architecture & Database Foundation
-- =============================================================================
-- ROLLBACK: DROP EXTENSION IF EXISTS pg_trgm, pgcrypto, "uuid-ossp";
-- NOTE: Extensions are idempotent (IF NOT EXISTS). Safe to re-run.
-- =============================================================================

-- UUID generation functions (gen_random_uuid() is built-in in PG 13+,
-- but uuid-ossp provides uuid_generate_v4() as an alias used by some tools)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Cryptographic functions (used for secure token generation in future phases)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Trigram similarity matching for fuzzy name search
-- Enables index types: GIN with gin_trgm_ops, used for LIKE/ILIKE and similarity()
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Full-text search dictionary (included by default, but explicit for clarity)
-- Used for to_tsvector() and to_tsquery() in name/description search
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
