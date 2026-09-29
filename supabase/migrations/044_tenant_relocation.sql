-- 044_tenant_relocation.sql
--
-- One-step "relocate tenant" (move a tenant from one unit to another).
--
-- Before this, relocating meant creating a second lease on the new unit,
-- then running the move-out flow on the old one and cancelling / re-issuing
-- every open invoice by hand. relocate_tenant() does it atomically:
--
--   1. closes the old lease (vacate_reason = 'unit_transfer',
--      deposit_status = 'transferred')
--   2. opens a fresh lease on the new unit, linked back to the old one via
--      leases.relocated_from_lease_id, carrying the security deposit
--   3. carries every open invoice (pending / overdue / partial) over to the
--      new lease + unit unchanged, together with the payments already
--      recorded against them. Cheques follow automatically because they
--      link to invoices, not leases.
--
-- Unit statuses are reconciled by the leases_sync_unit_status triggers (022).
-- The owner ledger skips the early-termination commission catch-up for
-- leases closed with vacate_reason = 'unit_transfer' (see src/lib/owners/balance.ts).

ALTER TYPE deposit_status ADD VALUE IF NOT EXISTS 'transferred';

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS relocated_from_lease_id UUID REFERENCES leases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leases_relocated_from ON leases (relocated_from_lease_id);

-- SECURITY INVOKER: every statement runs under the caller's RLS policies. The
-- explicit access checks below additionally stop a user from moving a tenant
-- into a property they are not assigned to (leases_insert only requires a
-- logged-in user).
CREATE OR REPLACE FUNCTION relocate_tenant(
  p_old_lease_id UUID,
  p_new_unit_id UUID,
  p_move_date DATE,
  p_start_date DATE,
  p_end_date DATE,
  p_monthly_rent NUMERIC,
  p_security_deposit NUMERIC,
  p_payment_due_day INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old leases%ROWTYPE;
  v_old_unit_number TEXT;
  v_new_unit units%ROWTYPE;
  v_new_lease_id UUID;
  v_invoice_ids UUID[];
  v_moved_amount NUMERIC;
  v_note TEXT;
BEGIN
  SELECT * INTO v_old FROM leases WHERE id = p_old_lease_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found';
  END IF;
  IF NOT v_old.is_active THEN
    RAISE EXCEPTION 'This lease is no longer active';
  END IF;
  IF NOT has_tenant_access(v_old.tenant_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this tenant';
  END IF;

  SELECT * INTO v_new_unit FROM units WHERE id = p_new_unit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;
  IF NOT has_property_access(v_new_unit.property_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this unit';
  END IF;
  IF v_new_unit.id = v_old.unit_id THEN
    RAISE EXCEPTION 'The new unit must be different from the current unit';
  END IF;
  IF v_new_unit.status <> 'vacant'
     OR EXISTS (SELECT 1 FROM leases WHERE unit_id = p_new_unit_id AND is_active) THEN
    RAISE EXCEPTION 'The new unit is not vacant';
  END IF;

  IF p_move_date IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Move date, start date and end date are required';
  END IF;
  IF p_end_date <= p_start_date THEN
    RAISE EXCEPTION 'End date must be after start date';
  END IF;
  IF p_monthly_rent IS NULL OR p_monthly_rent <= 0 THEN
    RAISE EXCEPTION 'Rent must be greater than zero';
  END IF;
  IF p_security_deposit IS NOT NULL AND p_security_deposit < 0 THEN
    RAISE EXCEPTION 'Security deposit cannot be negative';
  END IF;
  IF p_payment_due_day IS NULL OR p_payment_due_day NOT BETWEEN 1 AND 28 THEN
    RAISE EXCEPTION 'Payment due day must be between 1 and 28';
  END IF;

  SELECT unit_number INTO v_old_unit_number FROM units WHERE id = v_old.unit_id;

  -- 1. Close the old lease. vacate_reason = 'unit_transfer' keeps it out of the
  --    early-termination commission catch-up in the owner ledger.
  UPDATE leases
  SET is_active = false,
      vacate_date = p_move_date,
      vacate_reason = 'unit_transfer',
      vacate_notes = COALESCE(NULLIF(p_notes, ''), vacate_notes),
      deposit_status = 'transferred',
      updated_at = now()
  WHERE id = v_old.id;

  -- 2. Fresh lease on the new unit.
  INSERT INTO leases (
    tenant_id, unit_id, start_date, end_date, monthly_rent, security_deposit,
    payment_due_day, is_active, notes, relocated_from_lease_id, created_by
  ) VALUES (
    v_old.tenant_id, p_new_unit_id, p_start_date, p_end_date, p_monthly_rent,
    p_security_deposit, p_payment_due_day, true, NULLIF(p_notes, ''), v_old.id,
    auth.uid()
  )
  RETURNING id INTO v_new_lease_id;

  -- 3. Carry the open invoices (and the payments recorded against them) over.
  SELECT COALESCE(array_agg(id), '{}'),
         COALESCE(SUM(amount - COALESCE(paid_amount, 0)), 0)
  INTO v_invoice_ids, v_moved_amount
  FROM invoices
  WHERE lease_id = v_old.id
    AND status IN ('pending', 'overdue', 'partial');

  IF array_length(v_invoice_ids, 1) > 0 THEN
    v_note := format('Carried over from unit %s on relocation (%s)', v_old_unit_number, p_move_date);

    UPDATE invoices
    SET lease_id = v_new_lease_id,
        unit_id = p_new_unit_id,
        notes = CASE WHEN notes IS NULL OR notes = '' THEN v_note ELSE notes || E'\n' || v_note END,
        updated_at = now()
    WHERE id = ANY (v_invoice_ids);

    UPDATE payments
    SET lease_id = v_new_lease_id
    WHERE invoice_id = ANY (v_invoice_ids);
  END IF;

  RETURN jsonb_build_object(
    'new_lease_id', v_new_lease_id,
    'moved_invoice_count', COALESCE(array_length(v_invoice_ids, 1), 0),
    'moved_amount', v_moved_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION relocate_tenant(UUID, UUID, DATE, DATE, DATE, NUMERIC, NUMERIC, INTEGER, TEXT) TO authenticated;
