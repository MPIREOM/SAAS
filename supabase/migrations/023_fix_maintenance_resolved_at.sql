-- 023_fix_maintenance_resolved_at.sql
--
-- The maintenance resolution flow (Mark Resolved button on the request
-- detail page) writes to `maintenance_requests.resolved_at`, which was
-- originally added in migration 007. Production is reporting
--   "Could not find the 'resolved_at' column of 'maintenance_requests'
--    in the schema cache"
-- from PostgREST when that UPDATE runs, meaning either migration 007
-- was never applied on the live database or PostgREST's schema cache
-- is stale.
--
-- This migration is idempotent: ADD COLUMN IF NOT EXISTS ensures it
-- can run against databases where 007 did apply without erroring, and
-- NOTIFY pgrst forces PostgREST to reload its schema cache so the
-- column becomes visible to the REST API immediately.

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
