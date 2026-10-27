-- 055_municipality_contracts.sql
--
-- Rent contracts registered with the municipality (e.g. Muscat
-- Municipality in Bousher). Each one carries the municipality's reference
-- number, the registered period and the PDF the municipality issues.
--
-- A unit's current tenant is flagged on the property's unit grid when no
-- contract on file for that tenant + unit covers today (none recorded, or
-- the latest one has ended). Contracts are keyed on tenant + unit rather
-- than the lease so a renewal that creates a new lease row doesn't lose
-- the contract already registered for the period.
--
-- The PDF is stored in the documents bucket and attached to the UNIT
-- (documents entity_type 'unit'), like signed building-rules agreements.

-- New enum values can't be used in the transaction that adds them.
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'municipality_contract';

CREATE TABLE IF NOT EXISTS municipality_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  lease_id UUID REFERENCES leases(id) ON DELETE SET NULL,
  -- Municipality reference / agreement number, e.g. 36854/2026.
  contract_number TEXT NOT NULL CHECK (length(trim(contract_number)) > 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  file_url TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_municipality_contracts_tenant_unit
  ON municipality_contracts (tenant_id, unit_id, end_date DESC);
CREATE INDEX IF NOT EXISTS idx_municipality_contracts_unit
  ON municipality_contracts (unit_id, end_date DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE municipality_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "municipality_contracts_select" ON municipality_contracts;
DROP POLICY IF EXISTS "municipality_contracts_insert" ON municipality_contracts;
DROP POLICY IF EXISTS "municipality_contracts_delete" ON municipality_contracts;

CREATE POLICY "municipality_contracts_select" ON municipality_contracts FOR SELECT USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = municipality_contracts.unit_id AND has_property_access(u.property_id)
  )
);
CREATE POLICY "municipality_contracts_insert" ON municipality_contracts FOR INSERT WITH CHECK (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = municipality_contracts.unit_id AND has_property_access(u.property_id)
  )
);
CREATE POLICY "municipality_contracts_delete" ON municipality_contracts FOR DELETE USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = municipality_contracts.unit_id AND has_property_access(u.property_id)
  )
);
