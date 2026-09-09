-- 038_invoice_payment_link_and_revert.sql
--
-- Support "undo" of a recorded payment: return a paid/partial invoice to
-- unpaid, or cancel a paid invoice outright (e.g. a payment was recorded
-- against the wrong invoice or tenant by mistake).
--
-- Two things were missing for that:
--
--   1. payments had no link to the invoice they settled. The web UI and the
--      WhatsApp agent both matched payments to invoices heuristically
--      (same lease + payment_date inside the invoice period). That is fine
--      for display but far too fuzzy for deleting rows. This adds a
--      nullable payments.invoice_id FK that every new payment now sets, and
--      backfills it where the match is unambiguous.
--
--   2. payments had no DELETE policy (migration 027 deliberately left it
--      out). Reverting a payment deletes the payment row — the owner ledger
--      is computed on read from payments, so a stale row would keep
--      inflating "company owes owner" after the invoice went back to unpaid.
--      Scope mirrors payments_update: super admin or tenant access.

-- ── 1. payments.invoice_id ──────────────────────────────────────────────────

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments (invoice_id);

-- Conservative backfill: link a payment to an invoice only when exactly one
-- invoice on the same lease was fully paid on that payment_date for that
-- exact amount, and no other payment already claims it.
WITH candidates AS (
  SELECT p.id AS payment_id, i.id AS invoice_id,
         COUNT(*) OVER (PARTITION BY p.id) AS invoices_per_payment,
         COUNT(*) OVER (PARTITION BY i.id) AS payments_per_invoice
  FROM payments p
  JOIN invoices i
    ON i.lease_id = p.lease_id
   AND i.status = 'paid'
   AND i.paid_date = p.payment_date
   AND i.paid_amount::numeric = p.amount::numeric
  WHERE p.invoice_id IS NULL
)
UPDATE payments p
SET invoice_id = c.invoice_id
FROM candidates c
WHERE p.id = c.payment_id
  AND c.invoices_per_payment = 1
  AND c.payments_per_invoice = 1;

-- ── 2. payments DELETE policy ───────────────────────────────────────────────

DROP POLICY IF EXISTS payments_delete ON payments;
CREATE POLICY payments_delete ON payments
  FOR DELETE
  USING (is_super_admin() OR has_tenant_access(tenant_id));
