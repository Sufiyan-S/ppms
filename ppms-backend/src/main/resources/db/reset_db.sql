-- =============================================================================
-- PPMS — Fresh DB Reset Script
-- Run this ONCE to wipe everything and let Flyway rebuild from V1 baseline.
--
-- Usage (from psql):
--   \i reset_db.sql
-- Or via terminal:
--   psql -U <user> -d <dbname> -f reset_db.sql
--
-- WARNING: This destroys ALL data. Only run on development/local environments.
-- =============================================================================

-- Drop and recreate the public schema (wipes all tables, enums, indexes)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;

-- Flyway will now run V1 → V6 fresh on next application startup.
