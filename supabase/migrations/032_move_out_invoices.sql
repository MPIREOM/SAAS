-- Move-out fees + itemized invoices
--
-- Adds support for issuing an invoice when a tenant moves out, covering
-- cleaning, painting/maintenance, early-termination, and free-form custom
-- fees. Move-out invoices live in the existing `invoices` table (so they
-- show up in the regular invoice list) but carry an `invoice_type` of
-- `move_out` and a set of `invoice_items` rows for the line items.

-- ── invoice_type enum + columns ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE invoice_type AS ENUM ('rent', 'move_out');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_type invoice_type NOT NULL DEFAULT 'rent';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_invoice_number
  ON invoices(invoice_number)
  WHERE invoice_number IS NOT NULL;

-- The existing (lease_id, due_date) unique index would block a move-out
-- invoice whose due date collides with an existing rent invoice. Scope it
-- to rent invoices only.
DROP INDEX IF EXISTS idx_invoices_lease_due_date;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_lease_due_date_rent
  ON invoices(lease_id, due_date)
  WHERE invoice_type = 'rent';

CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(invoice_type);

-- ── Per-property move-out fee defaults + invoice code ──────────────────────
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS cleaning_fee_default NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS painting_fee_default NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_termination_rate NUMERIC NOT NULL DEFAULT 0.12;

-- ── Invoice line items ─────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE invoice_item_kind AS ENUM (
    'cleaning',
    'painting',
    'early_termination',
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  kind invoice_item_kind NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage invoice_items" ON invoice_items;
CREATE POLICY "Authenticated users can manage invoice_items"
  ON invoice_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── Per-property invoice number sequence ───────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_number_counters (
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  invoice_kind TEXT NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (property_id, year, invoice_kind)
);

ALTER TABLE invoice_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage invoice_number_counters" ON invoice_number_counters;
CREATE POLICY "Authenticated users can manage invoice_number_counters"
  ON invoice_number_counters FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Atomically reserves and returns the next move-out invoice number for a
-- property. Format: {CODE}-MO-{YYYY}-{NNNN}. CODE falls back to a slug of
-- the property name when properties.code is not set.
CREATE OR REPLACE FUNCTION next_move_out_invoice_number(p_property_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM now() AT TIME ZONE 'UTC')::INTEGER;
  v_code TEXT;
  v_name TEXT;
  v_seq  INTEGER;
BEGIN
  SELECT NULLIF(TRIM(code), ''), name
    INTO v_code, v_name
  FROM properties
  WHERE id = p_property_id;

  IF v_code IS NULL THEN
    v_code := UPPER(REGEXP_REPLACE(COALESCE(SUBSTRING(v_name FOR 6), 'PROP'), '[^A-Za-z0-9]', '', 'g'));
    IF v_code IS NULL OR v_code = '' THEN
      v_code := 'PROP';
    END IF;
  END IF;

  INSERT INTO invoice_number_counters (property_id, year, invoice_kind, next_value)
    VALUES (p_property_id, v_year, 'move_out', 2)
    ON CONFLICT (property_id, year, invoice_kind)
    DO UPDATE SET next_value = invoice_number_counters.next_value + 1
    RETURNING next_value - 1 INTO v_seq;

  RETURN v_code || '-MO-' || v_year::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION next_move_out_invoice_number(UUID) TO authenticated;
