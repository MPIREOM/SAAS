-- 051_tenant_agreements.sql
--
-- Building-rules agreement every tenant signs (garbage chute, gate keys,
-- no holes / alterations without approval), and the violation fees it
-- allows staff to charge.
--
-- When a lease is created the app creates a tenant_agreements row for the
-- tenant + unit and WhatsApps / emails the tenant a private signing link
-- (token). The tenant signs on their phone; the signed one-page PDF is
-- stored in the documents bucket and attached to the UNIT (documents
-- entity_type 'unit', new here) so it stays with the unit's records after
-- the tenant moves out. Unsigned agreements get up to two reminders from
-- the daily cron (api/cron/agreement-reminders).
--
-- tenant_violations records each breach (garbage left outside the chute,
-- lost / extra gate keys, unapproved holes or alterations - billed at the
-- repair cost staff enter). Each one is billed on its own invoice
-- (invoice_type 'violation') with a single invoice_items line.
--
-- The public signing page goes through the service role, so there are no
-- anon policies.

-- ── Enum values ───────────────────────────────────────────────────────────
-- New enum values can't be used in the transaction that adds them, so
-- nothing below compares against them except as ::text.
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'unit';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'tenant_agreement';
ALTER TYPE invoice_type ADD VALUE IF NOT EXISTS 'violation';
ALTER TYPE invoice_item_kind ADD VALUE IF NOT EXISTS 'garbage_violation';
ALTER TYPE invoice_item_kind ADD VALUE IF NOT EXISTS 'lost_key';
ALTER TYPE invoice_item_kind ADD VALUE IF NOT EXISTS 'alteration';

-- ── Gate keys handed over with the lease ──────────────────────────────────
ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS gate_keys_issued INTEGER NOT NULL DEFAULT 2 CHECK (gate_keys_issued >= 0);

-- ── Agreements ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  lease_id UUID REFERENCES leases(id) ON DELETE SET NULL,
  -- Human reference printed on the PDF, e.g. AGR-2026-0042.
  reference TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'cancelled')),
  gate_keys INTEGER NOT NULL DEFAULT 2 CHECK (gate_keys >= 0),
  -- Fees as agreed, so a later price change doesn't rewrite signed terms.
  garbage_fee NUMERIC(10, 3) NOT NULL DEFAULT 10,
  key_fee NUMERIC(10, 3) NOT NULL DEFAULT 7,
  -- Origin of the app when the agreement was created, for links sent by
  -- the cron (NEXT_PUBLIC_APP_URL is the marketing site in this project).
  public_origin TEXT,
  sent_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  last_send_error TEXT,
  signed_at TIMESTAMPTZ,
  signer_name TEXT,
  signer_ip TEXT,
  signer_user_agent TEXT,
  -- PNG data URL of the drawn signature (kept as evidence next to the PDF).
  signature_image TEXT,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  file_url TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live agreement per tenant per unit: renewing the lease keeps it,
-- relocating to another unit needs a new one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_agreements_live
  ON tenant_agreements (tenant_id, unit_id) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_tenant_agreements_unit ON tenant_agreements (unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_agreements_pending
  ON tenant_agreements (last_sent_at) WHERE status = 'pending';

CREATE SEQUENCE IF NOT EXISTS tenant_agreement_reference_seq;

CREATE OR REPLACE FUNCTION next_tenant_agreement_reference()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'AGR-' || EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Muscat')::INTEGER::TEXT
    || '-' || LPAD(nextval('tenant_agreement_reference_seq')::TEXT, 4, '0');
$$;

REVOKE EXECUTE ON FUNCTION next_tenant_agreement_reference() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION next_tenant_agreement_reference() TO authenticated, service_role;

-- ── Violations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  lease_id UUID REFERENCES leases(id) ON DELETE SET NULL,
  agreement_id UUID REFERENCES tenant_agreements(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('garbage', 'lost_key', 'alteration')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount NUMERIC(10, 3) NOT NULL CHECK (unit_amount >= 0),
  amount NUMERIC(10, 3) NOT NULL CHECK (amount >= 0),
  occurred_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Muscat')::date,
  notes TEXT,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('dashboard', 'whatsapp_agent')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_violations_unit ON tenant_violations (unit_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_violations_tenant ON tenant_violations (tenant_id, occurred_on DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE tenant_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_agreements_select" ON tenant_agreements;
DROP POLICY IF EXISTS "tenant_agreements_insert" ON tenant_agreements;
DROP POLICY IF EXISTS "tenant_agreements_update" ON tenant_agreements;

CREATE POLICY "tenant_agreements_select" ON tenant_agreements FOR SELECT USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = tenant_agreements.unit_id AND has_property_access(u.property_id)
  )
);
CREATE POLICY "tenant_agreements_insert" ON tenant_agreements FOR INSERT WITH CHECK (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = tenant_agreements.unit_id AND has_property_access(u.property_id)
  )
);
CREATE POLICY "tenant_agreements_update" ON tenant_agreements FOR UPDATE USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = tenant_agreements.unit_id AND has_property_access(u.property_id)
  )
);

DROP POLICY IF EXISTS "tenant_violations_select" ON tenant_violations;
DROP POLICY IF EXISTS "tenant_violations_insert" ON tenant_violations;

CREATE POLICY "tenant_violations_select" ON tenant_violations FOR SELECT USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = tenant_violations.unit_id AND has_property_access(u.property_id)
  )
);
CREATE POLICY "tenant_violations_insert" ON tenant_violations FOR INSERT WITH CHECK (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = tenant_violations.unit_id AND has_property_access(u.property_id)
  )
);

-- ── Documents attached to a unit ──────────────────────────────────────────
-- Same rule as 034 plus unit documents, readable by anyone with access to
-- the unit's property.
CREATE OR REPLACE FUNCTION can_read_document_object(object_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT is_super_admin() OR EXISTS (
    SELECT 1 FROM documents d
    WHERE d.file_url = object_name
      AND (
        d.uploaded_by = auth.uid()
        OR (d.entity_type::text = 'tenant'   AND has_tenant_access(d.entity_id))
        OR (d.entity_type::text = 'property' AND has_property_access(d.entity_id))
        OR (d.entity_type::text = 'unit' AND EXISTS (
              SELECT 1 FROM units u WHERE u.id = d.entity_id AND has_property_access(u.property_id)))
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Violation invoice numbers ─────────────────────────────────────────────
-- Same scheme as next_move_out_invoice_number (032): <CODE>-VIO-<year>-0001
-- per property per year.
CREATE OR REPLACE FUNCTION next_violation_invoice_number(p_property_id UUID)
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
    VALUES (p_property_id, v_year, 'violation', 2)
    ON CONFLICT (property_id, year, invoice_kind)
    DO UPDATE SET next_value = invoice_number_counters.next_value + 1
    RETURNING next_value - 1 INTO v_seq;

  RETURN v_code || '-VIO-' || v_year::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION next_violation_invoice_number(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION next_violation_invoice_number(UUID) TO authenticated, service_role;
