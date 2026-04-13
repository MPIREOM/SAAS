-- Migration: Add missing maintenance categories
--
-- The frontend (category picker, translations) has long offered painting,
-- cleaning, and pest as options, but the maintenance_category enum was
-- never expanded beyond the original five. Submissions with the missing
-- values fail with "invalid input value for enum maintenance_category".
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block
-- on some clients. If your tool wraps migrations in a transaction, split
-- these into individual statements or run via psql without -1.

ALTER TYPE maintenance_category ADD VALUE IF NOT EXISTS 'painting';
ALTER TYPE maintenance_category ADD VALUE IF NOT EXISTS 'cleaning';
ALTER TYPE maintenance_category ADD VALUE IF NOT EXISTS 'pest';
