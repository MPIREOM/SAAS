-- 037_fix_lease_sync_trigger_permissions.sql
--
-- Migration 035 revoked EXECUTE on sync_unit_status_from_leases(uuid) and
-- trg_leases_sync_unit_status() from anon/authenticated/public so they could
-- not be called directly by clients.
--
-- But trg_leases_sync_unit_status() is a TRIGGER function and was NOT marked
-- SECURITY DEFINER, so it runs as the invoking user (e.g. `authenticated`).
-- Internally it PERFORMs sync_unit_status_from_leases(). After the revoke,
-- any client write to `leases` (lease renewal, move-out, new lease) fires the
-- trigger, which then fails with:
--
--   permission denied for function sync_unit_status_from_leases
--
-- This is what blocked the "Renew Lease" flow.
--
-- Fix: make the trigger function SECURITY DEFINER so it executes — and calls
-- the inner function — as its owner (postgres). This preserves the hardening
-- intent of 035 (neither function is callable directly by clients) while
-- letting the internal trigger chain run. sync_unit_status_from_leases() is
-- already SECURITY DEFINER, so the units UPDATE inside it is unchanged.

ALTER FUNCTION public.trg_leases_sync_unit_status() SECURITY DEFINER;

-- Defensive: a SECURITY DEFINER function must never rely on a
-- caller-controlled search_path. (035 already pinned this; re-assert it so
-- this migration is self-contained.)
ALTER FUNCTION public.trg_leases_sync_unit_status() SET search_path = pg_catalog, public;
