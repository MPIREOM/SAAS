-- 022_sync_unit_status_from_leases.sql
--
-- Keep units.status in sync with the active-lease count on the unit.
--
-- The app has multiple code paths that write to leases.is_active
-- (move-out flow, lease renewal, manual Supabase dashboard edits) and
-- each one does non-transactional multi-step updates to both tables.
-- If any step fails or the browser closes mid-way, the unit can end up
-- stuck in "occupied" with no active lease — as happened to unit 22
-- at Bousher Ameen Mosque before this migration.
--
-- This trigger makes the DB the single source of truth: whenever a
-- lease row's is_active or unit_id changes, the relevant unit's status
-- is recomputed from the live count of active leases. "maintenance"
-- status is preserved because it's orthogonal to occupancy.

CREATE OR REPLACE FUNCTION sync_unit_status_from_leases(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count int;
  current_status unit_status;
BEGIN
  IF p_unit_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status INTO current_status FROM units WHERE id = p_unit_id;

  -- "maintenance" is an intentional admin override; never clobber it.
  IF current_status = 'maintenance' THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO active_count
  FROM leases
  WHERE unit_id = p_unit_id AND is_active = true;

  IF active_count > 0 AND current_status IS DISTINCT FROM 'occupied' THEN
    UPDATE units SET status = 'occupied', updated_at = now() WHERE id = p_unit_id;
  ELSIF active_count = 0 AND current_status IS DISTINCT FROM 'vacant' THEN
    UPDATE units SET status = 'vacant', updated_at = now() WHERE id = p_unit_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION trg_leases_sync_unit_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM sync_unit_status_from_leases(OLD.unit_id);
    RETURN OLD;
  END IF;

  -- If the lease moved to a different unit, reconcile the OLD unit too
  -- (it may now have no active leases).
  IF TG_OP = 'UPDATE' AND OLD.unit_id IS DISTINCT FROM NEW.unit_id THEN
    PERFORM sync_unit_status_from_leases(OLD.unit_id);
  END IF;

  PERFORM sync_unit_status_from_leases(NEW.unit_id);
  RETURN NEW;
END;
$$;

-- INSERT and DELETE always fire; UPDATE only when the relevant columns
-- changed, to avoid redundant writes on unrelated edits (e.g. notes).
DROP TRIGGER IF EXISTS leases_sync_unit_status_insert ON leases;
CREATE TRIGGER leases_sync_unit_status_insert
  AFTER INSERT ON leases
  FOR EACH ROW EXECUTE FUNCTION trg_leases_sync_unit_status();

DROP TRIGGER IF EXISTS leases_sync_unit_status_update ON leases;
CREATE TRIGGER leases_sync_unit_status_update
  AFTER UPDATE ON leases
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active
     OR OLD.unit_id IS DISTINCT FROM NEW.unit_id)
  EXECUTE FUNCTION trg_leases_sync_unit_status();

DROP TRIGGER IF EXISTS leases_sync_unit_status_delete ON leases;
CREATE TRIGGER leases_sync_unit_status_delete
  AFTER DELETE ON leases
  FOR EACH ROW EXECUTE FUNCTION trg_leases_sync_unit_status();

-- Backfill: reconcile every existing unit against its current lease
-- state. Uses the same sync function so there's one rule everywhere.
-- Fixes unit 22 of Bousher Ameen Mosque and any other drift from
-- before the trigger existed. No-op for units that are already correct.
DO $$
DECLARE
  u record;
BEGIN
  FOR u IN SELECT id FROM units LOOP
    PERFORM sync_unit_status_from_leases(u.id);
  END LOOP;
END $$;
