-- Owner ledger: track per-owner running balance from rent collected,
-- expenses, commissions, the monthly business-manager fee, and
-- settlements paid out to / received from the owner.
--
-- Companion code: src/lib/owners/balance.ts (computation),
-- src/lib/whatsapp/agent.ts (get_owner_balance / record_owner_settlement
-- tools), src/app/api/cron/admin-summary/route.ts (daily summary line).
--
-- Convention used everywhere in the system:
--   balance > 0  →  company OWES the owner (we're holding their money)
--   balance < 0  →  owner OWES the company (we covered more than we collected)

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE commission_type AS ENUM (
  'percentage',                -- per-property %, e.g. 9% of rent collected
  'included_in_business_fee',  -- covered by the flat monthly business fee
  'none'                       -- no commission charged on this property
);

CREATE TYPE settlement_direction AS ENUM (
  'company_to_owner',  -- we paid the owner — decreases balance
  'owner_to_company'   -- owner paid us — increases balance
);

-- ============================================
-- OWNERS
-- ============================================

CREATE TABLE owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  whatsapp_phone TEXT,
  email TEXT,
  language_preference language_preference NOT NULL DEFAULT 'en',
  -- Opening balance lets us seed a starting position without importing
  -- every historical transaction. Signed (positive = company owes owner).
  opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  opening_balance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_owners_active ON owners(is_active) WHERE is_active = true;

-- ============================================
-- PROPERTIES — link to owner + commission config
-- ============================================

ALTER TABLE properties
  ADD COLUMN owner_id UUID REFERENCES owners(id) ON DELETE SET NULL,
  ADD COLUMN commission_type commission_type NOT NULL DEFAULT 'none',
  ADD COLUMN commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 0
    CHECK (commission_rate >= 0 AND commission_rate <= 100);

CREATE INDEX idx_properties_owner ON properties(owner_id);

-- ============================================
-- EXPENSES — make owner-level expenses possible
-- ============================================
-- The original expenses table required property_id, but in practice the
-- operator records expenses at the owner level (across the portfolio)
-- rather than allocating to a specific building. Drop NOT NULL on
-- property_id, add an owner_id, and require at least one of the two
-- via a CHECK constraint so we never end up with orphaned expenses.

ALTER TABLE expenses
  ALTER COLUMN property_id DROP NOT NULL,
  ADD COLUMN owner_id UUID REFERENCES owners(id) ON DELETE SET NULL,
  ADD CONSTRAINT expenses_owner_or_property CHECK (
    property_id IS NOT NULL OR owner_id IS NOT NULL
  );

CREATE INDEX idx_expenses_owner ON expenses(owner_id);

-- Existing RLS on expenses uses has_property_access(property_id) which
-- short-circuits to TRUE for super_admin and otherwise checks the
-- assignment table. With property_id now nullable we need to also allow
-- access when the row is owner-level. Replace the SELECT/INSERT/UPDATE
-- policies so they accept either dimension.

DROP POLICY IF EXISTS "expenses_select" ON expenses;
CREATE POLICY "expenses_select" ON expenses FOR SELECT USING (
  (property_id IS NOT NULL AND has_property_access(property_id))
  OR (owner_id IS NOT NULL AND auth.uid() IS NOT NULL)
);

DROP POLICY IF EXISTS "expenses_insert" ON expenses;
CREATE POLICY "expenses_insert" ON expenses FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND (
    (property_id IS NOT NULL AND has_property_access(property_id))
    OR owner_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "expenses_update" ON expenses;
CREATE POLICY "expenses_update" ON expenses FOR UPDATE USING (
  (property_id IS NOT NULL AND has_property_access(property_id))
  OR (owner_id IS NOT NULL AND auth.uid() IS NOT NULL)
);

-- ============================================
-- BUSINESS-MANAGER FEE — flat monthly charge per owner
-- ============================================

-- One row per owner per month. The amount defaults to 1500 OMR but can be
-- adjusted per period if the arrangement changes. The cron that builds the
-- daily summary will lazily auto-create the current month's row the first
-- time the balance is computed for an owner that has at least one
-- property with commission_type = 'included_in_business_fee'.
CREATE TABLE owner_business_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  -- YYYY-MM-01 anchor; one fee row per calendar month.
  period_month DATE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 1500 CHECK (amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (owner_id, period_month)
);

CREATE INDEX idx_owner_business_fees_owner ON owner_business_fees(owner_id);
CREATE INDEX idx_owner_business_fees_period ON owner_business_fees(period_month);

-- ============================================
-- SETTLEMENTS — payouts between company and owner
-- ============================================

CREATE TABLE owner_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  direction settlement_direction NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  method payment_method NOT NULL DEFAULT 'cash',
  settled_at DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_number TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_owner_settlements_owner ON owner_settlements(owner_id);
CREATE INDEX idx_owner_settlements_date ON owner_settlements(settled_at);

-- ============================================
-- EXPENSE ATTACHMENTS — receipt photos from WhatsApp
-- ============================================

-- Multiple receipts can hang off a single expense (the existing
-- expenses.receipt_url column stays as the primary/legacy slot).
CREATE TABLE expense_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_attachments_expense ON expense_attachments(expense_id);

-- ============================================
-- STORAGE BUCKET — expense-receipts
-- ============================================

-- The web UI at src/app/[locale]/(dashboard)/expenses/new/page.tsx already
-- writes to this bucket; create it here so the bucket exists before either
-- the UI or the WhatsApp webhook tries to use it. Private bucket — receipts
-- are accessed via signed URLs from the dashboard.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  false,
  20971520, -- 20MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Signed-URL reads work for both authenticated dashboard users and the
-- service role used by the WhatsApp webhook; we still need a SELECT policy
-- for authenticated dashboard fetches.
DROP POLICY IF EXISTS "expense_receipts_read" ON storage.objects;
CREATE POLICY "expense_receipts_read" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'expense-receipts');

DROP POLICY IF EXISTS "expense_receipts_upload" ON storage.objects;
CREATE POLICY "expense_receipts_upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts');

DROP POLICY IF EXISTS "expense_receipts_delete" ON storage.objects;
CREATE POLICY "expense_receipts_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'expense-receipts');

-- ============================================
-- PENDING RECEIPT ATTACHMENTS
-- ============================================
--
-- Holds receipt photos uploaded via the WhatsApp webhook before the user
-- has told the agent what expense they belong to. The agent receives the
-- token in the user's message (e.g. "PENDING_RECEIPT_TOKEN: abc123") and
-- passes it to add_expense, at which point the file is moved to a
-- permanent path under the new expense id and a row in
-- expense_attachments is created. Stale rows older than 24h are pruned by
-- the daily admin-summary cron.

CREATE TABLE pending_receipt_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  user_phone TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  whatsapp_media_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_receipts_phone ON pending_receipt_attachments(user_phone);
CREATE INDEX idx_pending_receipts_created ON pending_receipt_attachments(created_at);

ALTER TABLE pending_receipt_attachments ENABLE ROW LEVEL SECURITY;

-- Service role only — the WhatsApp webhook and agent both use service role
-- credentials, so we don't need an authenticated-user policy. Locking down
-- to no-access for anon/authenticated keeps the rows hidden from anything
-- coming through the dashboard.
CREATE POLICY "pending_receipts_service_only" ON pending_receipt_attachments
  FOR ALL USING (false) WITH CHECK (false);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_business_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_attachments ENABLE ROW LEVEL SECURITY;

-- Owners: any active staff can see/manage; only super_admin can delete.
-- The owner table holds settlement counterparties, not auth principals,
-- so no per-owner row scoping is needed yet.
CREATE POLICY "owners_select" ON owners FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "owners_insert" ON owners FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "owners_update" ON owners FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "owners_delete" ON owners FOR DELETE USING (is_super_admin());

CREATE POLICY "owner_business_fees_select" ON owner_business_fees FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "owner_business_fees_insert" ON owner_business_fees FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "owner_business_fees_update" ON owner_business_fees FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "owner_business_fees_delete" ON owner_business_fees FOR DELETE USING (is_super_admin());

CREATE POLICY "owner_settlements_select" ON owner_settlements FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "owner_settlements_insert" ON owner_settlements FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "owner_settlements_update" ON owner_settlements FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "owner_settlements_delete" ON owner_settlements FOR DELETE USING (is_super_admin());

-- Expense attachments: piggyback on expenses RLS via property access.
CREATE POLICY "expense_attachments_select" ON expense_attachments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = expense_attachments.expense_id
      AND has_property_access(e.property_id)
  )
);
CREATE POLICY "expense_attachments_insert" ON expense_attachments FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = expense_attachments.expense_id
      AND has_property_access(e.property_id)
  )
);
CREATE POLICY "expense_attachments_delete" ON expense_attachments FOR DELETE USING (
  is_super_admin()
);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER owners_updated_at BEFORE UPDATE ON owners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
