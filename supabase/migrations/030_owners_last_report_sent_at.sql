-- Migration: track last weekly-report send per owner
--
-- The owner-reports cron rolls each owner's opening_balance forward to the
-- current balance after every successful WhatsApp send, so each subsequent
-- report shows just one week of activity instead of an ever-growing
-- cumulative breakdown. We need a flag to know whether an owner has
-- already received their first report — the very first send only records
-- the timestamp; rollover starts on the second send so the initial report
-- still anchors on the manually-reconciled opening_balance.

ALTER TABLE owners
  ADD COLUMN last_report_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN owners.last_report_sent_at IS
  'Timestamp of the last successful weekly owner report send. NULL until the very first report; subsequent sends use this flag to gate the opening_balance rollover.';
