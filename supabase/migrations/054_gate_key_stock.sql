-- 054_gate_key_stock.sql
--
-- Stock of spare gate keys kept for each building. Tenants get their 2
-- move-in keys from a separate allowance, so only keys sold afterwards
-- (the 7 OMR 'lost / extra gate key' violation, 051) come out of this stock.
--
-- properties.gate_key_stock is NULL until a super admin enters the first
-- count; until then sales are not tracked. Every change is written to
-- gate_key_movements with the balance after it:
--   restock    - keys bought (super admin)
--   count      - stock corrected to a physical count (super admin)
--   sale       - keys sold to a tenant; written by the trigger on
--                tenant_violations, so dashboard and WhatsApp agent sales
--                are both counted
--
-- When stock falls to gate_key_low_threshold (20) or below, the app sends
-- the admins one WhatsApp alert (lib/gate-keys/stock.ts) and stamps
-- gate_key_low_alerted_at. A restock or count above the threshold clears
-- it so the next drop alerts again. The dashboard shows a warning for as
-- long as the stock stays low.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS gate_key_stock INTEGER,
  ADD COLUMN IF NOT EXISTS gate_key_low_threshold INTEGER NOT NULL DEFAULT 20 CHECK (gate_key_low_threshold >= 0),
  ADD COLUMN IF NOT EXISTS gate_key_low_alerted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS gate_key_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('restock', 'count', 'sale')),
  -- Signed change: +10 for a restock of 10, -2 for a sale of 2.
  quantity INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  violation_id UUID REFERENCES tenant_violations(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gate_key_movements_property
  ON gate_key_movements (property_id, created_at DESC);

ALTER TABLE gate_key_movements ENABLE ROW LEVEL SECURITY;

-- Read-only for staff with access to the property; all writes go through
-- the functions below.
DROP POLICY IF EXISTS "gate_key_movements_select" ON gate_key_movements;
CREATE POLICY "gate_key_movements_select" ON gate_key_movements FOR SELECT USING (
  is_super_admin() OR has_property_access(property_id)
);

-- ── Guard the stock columns ───────────────────────────────────────────────
-- Staff with property access may update properties directly (003), so
-- without this a manager could rewrite the stock from the browser. Direct
-- updates run as 'authenticated'; the SECURITY DEFINER functions below run
-- as their owner and the app's service-role client as 'service_role', so
-- only direct edits by non-super-admins are refused.
CREATE OR REPLACE FUNCTION guard_gate_key_stock_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.gate_key_stock IS DISTINCT FROM OLD.gate_key_stock
          OR NEW.gate_key_low_threshold IS DISTINCT FROM OLD.gate_key_low_threshold
          OR NEW.gate_key_low_alerted_at IS DISTINCT FROM OLD.gate_key_low_alerted_at)
     AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can change gate key stock' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_gate_key_stock_columns ON properties;
CREATE TRIGGER trg_guard_gate_key_stock_columns
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION guard_gate_key_stock_columns();

-- ── Sales: take keys out of stock when a lost / extra key is billed ───────
CREATE OR REPLACE FUNCTION take_gate_keys_for_violation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_property_id UUID;
  v_balance INTEGER;
BEGIN
  IF NEW.kind <> 'lost_key' THEN
    RETURN NEW;
  END IF;

  SELECT property_id INTO v_property_id FROM units WHERE id = NEW.unit_id;

  UPDATE properties
    SET gate_key_stock = gate_key_stock - NEW.quantity,
        updated_at = now()
    WHERE id = v_property_id
      AND gate_key_stock IS NOT NULL
    RETURNING gate_key_stock INTO v_balance;

  -- Stock not tracked yet for this property.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO gate_key_movements (property_id, kind, quantity, balance_after, violation_id, created_by)
    VALUES (v_property_id, 'sale', -NEW.quantity, v_balance, NEW.id, NEW.created_by);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION take_gate_keys_for_violation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_take_gate_keys_for_violation ON tenant_violations;
CREATE TRIGGER trg_take_gate_keys_for_violation
  AFTER INSERT ON tenant_violations
  FOR EACH ROW EXECUTE FUNCTION take_gate_keys_for_violation();

-- ── Restock / count (super admins only) ───────────────────────────────────
-- p_kind 'restock' adds p_quantity keys; 'count' sets the stock to
-- p_quantity. Returns the new stock.
CREATE OR REPLACE FUNCTION adjust_gate_key_stock(
  p_property_id UUID,
  p_kind TEXT,
  p_quantity INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old INTEGER;
  v_new INTEGER;
  v_threshold INTEGER;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can change gate key stock' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('restock', 'count') THEN
    RAISE EXCEPTION 'kind must be restock or count' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 0 OR p_quantity > 10000 OR (p_kind = 'restock' AND p_quantity = 0) THEN
    RAISE EXCEPTION 'quantity out of range' USING ERRCODE = '22023';
  END IF;

  SELECT gate_key_stock, gate_key_low_threshold INTO v_old, v_threshold
    FROM properties WHERE id = p_property_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found' USING ERRCODE = 'P0002';
  END IF;

  v_new := CASE WHEN p_kind = 'restock' THEN COALESCE(v_old, 0) + p_quantity ELSE p_quantity END;

  UPDATE properties
    SET gate_key_stock = v_new,
        gate_key_low_alerted_at = CASE WHEN v_new > v_threshold THEN NULL ELSE gate_key_low_alerted_at END,
        updated_at = now()
    WHERE id = p_property_id;

  INSERT INTO gate_key_movements (property_id, kind, quantity, balance_after, notes, created_by)
    VALUES (p_property_id, p_kind, v_new - COALESCE(v_old, 0), v_new, NULLIF(TRIM(p_notes), ''), auth.uid());

  RETURN v_new;
END;
$$;

REVOKE EXECUTE ON FUNCTION adjust_gate_key_stock(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION adjust_gate_key_stock(UUID, TEXT, INTEGER, TEXT) TO authenticated, service_role;
