-- 033_clear_cheques_on_invoice_paid.sql
--
-- When an invoice is fully paid, the post-dated cheque covering that
-- period should show as "cleared", not linger as a pending ("upcoming")
-- cheque.
--
-- Until now only the web "Mark as Paid" button retired cheques (and it
-- marked them "cancelled"). Invoices paid through the WhatsApp agent —
-- agent.ts mark_invoice_paid — never touched the cheques table at all,
-- so their cheques stayed pending forever. This trigger makes the DB the
-- single source of truth: any path that flips an invoice to "paid" now
-- clears the matching cheque, regardless of payment method.
--
-- A cheque matches an invoice when it belongs to the same tenant and is
-- either already linked via invoice_id, or unlinked with a cheque_date
-- inside the invoice's period. Matched cheques are also linked back to
-- the invoice. This supersedes migration 016's "cancel on resolve"
-- cleanup — settled cheques are now "cleared" rather than "cancelled".

CREATE OR REPLACE FUNCTION trg_invoices_clear_cheques()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE cheques c
  SET status = 'cleared',
      invoice_id = NEW.id,
      updated_at = now()
  WHERE c.tenant_id = NEW.tenant_id
    AND c.status = 'pending'
    AND (
      c.invoice_id = NEW.id
      OR (
        c.invoice_id IS NULL
        AND NEW.period_start IS NOT NULL
        AND NEW.period_end IS NOT NULL
        AND c.cheque_date BETWEEN NEW.period_start AND NEW.period_end
      )
    );
  RETURN NEW;
END;
$$;

-- Advance payments insert future invoices already flagged "paid", so the
-- INSERT case must fire too — not just status transitions on UPDATE.
DROP TRIGGER IF EXISTS invoices_clear_cheques_insert ON invoices;
CREATE TRIGGER invoices_clear_cheques_insert
  AFTER INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION trg_invoices_clear_cheques();

-- UPDATE only fires on the transition INTO "paid", so unrelated edits
-- (notes, due date) on an already-paid invoice don't re-run the sweep.
DROP TRIGGER IF EXISTS invoices_clear_cheques_update ON invoices;
CREATE TRIGGER invoices_clear_cheques_update
  AFTER UPDATE ON invoices
  FOR EACH ROW
  WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION trg_invoices_clear_cheques();

-- One-time backfill: clear every pending cheque that already sits under a
-- paid invoice (e.g. invoices settled via the WhatsApp agent before this
-- trigger existed). Cancelled/bounced cheques are intentionally left as-is.
UPDATE cheques c
SET status = 'cleared',
    invoice_id = i.id,
    updated_at = now()
FROM invoices i
WHERE c.status = 'pending'
  AND i.status = 'paid'
  AND c.tenant_id = i.tenant_id
  AND (
    c.invoice_id = i.id
    OR (
      c.invoice_id IS NULL
      AND i.period_start IS NOT NULL
      AND i.period_end IS NOT NULL
      AND c.cheque_date BETWEEN i.period_start AND i.period_end
    )
  );
