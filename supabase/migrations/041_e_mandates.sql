-- ============================================================================
-- Migration 041: Bank e-mandates (direct debit) for tenant rent
--
-- A mandate is a tenant's standing authorisation, held at their bank, that
-- lets MPIRE pull a fixed rent amount on a fixed day each month. The bank
-- (Bank Muscat API Banking to start with) owns the mandate; we keep a mirror
-- of it here plus one collection row per pull attempt so payments can be
-- reconciled against invoices.
--
-- Provider-specific fields are deliberately generic (provider_mandate_id,
-- provider_collection_id, metadata JSONB) so the adapter can be swapped once
-- the bank's documentation arrives without another schema change.
-- ============================================================================

-- Direct debit is a new way rent gets paid; show it alongside cash/cheque.
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'direct_debit';

-- ── e_mandates ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS e_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'bank_muscat'
    CHECK (provider IN ('bank_muscat', 'mock')),
  status TEXT NOT NULL DEFAULT 'pending_otp'
    CHECK (status IN (
      'pending_otp',   -- created at the bank, waiting for the tenant's OTP
      'active',        -- tenant confirmed; collections may run
      'suspended',     -- paused by the bank or by us (e.g. repeated failures)
      'cancelled',     -- cancelled by us or the tenant
      'failed',        -- bank rejected creation or OTP attempts exhausted
      'expired'        -- OTP window or mandate end date passed
    )),
  amount NUMERIC(12, 3) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'OMR',
  -- Day of month the collection is pulled (1-28 keeps every month valid).
  collection_day INTEGER NOT NULL CHECK (collection_day BETWEEN 1 AND 28),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  -- Debtor (tenant) account details. Only the masked account number is kept;
  -- the full number goes to the bank at creation time and is never stored.
  debtor_name TEXT,
  debtor_bank_code TEXT,
  debtor_account_masked TEXT,
  -- Provider side
  provider_mandate_id TEXT,
  provider_reference TEXT,
  provider_status TEXT,
  -- Tenant OTP confirmation via the portal link
  otp_token TEXT UNIQUE,
  otp_expires_at TIMESTAMPTZ,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  activated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_e_mandates_tenant ON e_mandates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_e_mandates_lease ON e_mandates(lease_id);
CREATE INDEX IF NOT EXISTS idx_e_mandates_status_day
  ON e_mandates(status, collection_day);
CREATE INDEX IF NOT EXISTS idx_e_mandates_provider_id
  ON e_mandates(provider_mandate_id) WHERE provider_mandate_id IS NOT NULL;
-- One live mandate per lease at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_e_mandates_live_per_lease
  ON e_mandates(lease_id) WHERE status IN ('pending_otp', 'active', 'suspended');

COMMENT ON TABLE e_mandates IS 'Direct-debit mandates held at the tenant''s bank; mirrors the provider record.';
COMMENT ON COLUMN e_mandates.otp_token IS 'Random token in the tenant portal link where the tenant enters the bank OTP.';

-- ── e_mandate_collections ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS e_mandate_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id UUID NOT NULL REFERENCES e_mandates(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  amount NUMERIC(12, 3) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'OMR',
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN (
      'scheduled',  -- created, not yet sent to the bank
      'submitted',  -- bank accepted the request, awaiting settlement
      'settled',    -- money received; payment row created
      'failed',     -- bank rejected (insufficient funds, closed account, ...)
      'returned',   -- settled then reversed by the bank
      'cancelled'   -- withdrawn before submission
    )),
  provider_collection_id TEXT,
  provider_status TEXT,
  failure_reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_e_mandate_collections_mandate
  ON e_mandate_collections(mandate_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_e_mandate_collections_provider_id
  ON e_mandate_collections(provider_collection_id)
  WHERE provider_collection_id IS NOT NULL;
-- Never pull twice for the same invoice while a pull is live or settled.
CREATE UNIQUE INDEX IF NOT EXISTS uq_e_mandate_collections_live_invoice
  ON e_mandate_collections(invoice_id)
  WHERE invoice_id IS NOT NULL AND status IN ('scheduled', 'submitted', 'settled');

-- ── e_mandate_events ────────────────────────────────────────────────────────
-- Raw provider callbacks, kept for idempotency and debugging.
CREATE TABLE IF NOT EXISTS e_mandate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT,
  event_type TEXT NOT NULL,
  mandate_id UUID REFERENCES e_mandates(id) ON DELETE SET NULL,
  collection_id UUID REFERENCES e_mandate_collections(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_e_mandate_events_provider_event
  ON e_mandate_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

-- ── updated_at triggers (reuse the project's helper if present) ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_e_mandates_updated_at ON e_mandates';
    EXECUTE 'CREATE TRIGGER trg_e_mandates_updated_at BEFORE UPDATE ON e_mandates
             FOR EACH ROW EXECUTE FUNCTION update_updated_at()';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_e_mandate_collections_updated_at ON e_mandate_collections';
    EXECUTE 'CREATE TRIGGER trg_e_mandate_collections_updated_at BEFORE UPDATE ON e_mandate_collections
             FOR EACH ROW EXECUTE FUNCTION update_updated_at()';
  END IF;
END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Dashboard users see mandates for tenants they can access (same rule as
-- payments). The tenant portal, cron and webhook routes use the service role
-- and bypass RLS.
ALTER TABLE e_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE e_mandate_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE e_mandate_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "e_mandates_select" ON e_mandates;
CREATE POLICY "e_mandates_select" ON e_mandates FOR SELECT
  USING (is_super_admin() OR has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "e_mandates_insert" ON e_mandates;
CREATE POLICY "e_mandates_insert" ON e_mandates FOR INSERT
  WITH CHECK (is_super_admin() OR has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "e_mandates_update" ON e_mandates;
CREATE POLICY "e_mandates_update" ON e_mandates FOR UPDATE
  USING (is_super_admin() OR has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "e_mandate_collections_select" ON e_mandate_collections;
CREATE POLICY "e_mandate_collections_select" ON e_mandate_collections FOR SELECT
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM e_mandates m
      WHERE m.id = e_mandate_collections.mandate_id AND has_tenant_access(m.tenant_id)
    )
  );

-- Events hold raw bank payloads; super admins only.
DROP POLICY IF EXISTS "e_mandate_events_select" ON e_mandate_events;
CREATE POLICY "e_mandate_events_select" ON e_mandate_events FOR SELECT
  USING (is_super_admin());
