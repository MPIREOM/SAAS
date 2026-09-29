-- 045_invoice_period_unique_ignore_voided.sql
--
-- Let a new invoice be issued for a month whose previous invoice was
-- cancelled or written off.
--
-- invoices_lease_period_unique enforced one invoice per (lease_id,
-- period_start) regardless of status, so after cancelling an invoice the
-- admin could not create a corrected one for the same month. It now only
-- counts invoices that are still live (pending / overdue / partial / paid).
--
-- The daily invoice cron (src/app/api/cron/invoices/route.ts) used to rely on
-- this index to avoid re-creating cancelled months; it now checks for any
-- existing invoice on the lease + period itself, so a cancelled or
-- written-off month is still left alone by the automation.
--
-- The index keeps its name so the app's friendly "invoice already exists"
-- error detection keeps working.

DROP INDEX IF EXISTS invoices_lease_period_unique;

CREATE UNIQUE INDEX invoices_lease_period_unique
  ON invoices (lease_id, period_start)
  WHERE status NOT IN ('cancelled', 'written_off');
