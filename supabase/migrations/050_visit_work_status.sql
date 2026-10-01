-- 050_visit_work_status.sql
--
-- The contractor confirms, on the read-only schedule page (048), what
-- happened at each booked unit: done, or couldn't enter (with a reason),
-- plus an optional note. Staff see it on the visit page. Marking a unit
-- done WhatsApps the tenant once (work_done_notified_at guards against a
-- second message if the contractor undoes and re-marks it).
--
-- visit_message_logs (047) gains the 'done' message kind for that
-- notification.

ALTER TABLE visit_bookings
  ADD COLUMN IF NOT EXISTS work_status TEXT
    CHECK (work_status IS NULL OR work_status IN ('done', 'not_entered')),
  ADD COLUMN IF NOT EXISTS work_reason TEXT
    CHECK (work_reason IS NULL OR work_reason IN ('not_home', 'refused', 'other')),
  ADD COLUMN IF NOT EXISTS work_note TEXT,
  ADD COLUMN IF NOT EXISTS work_marked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_done_notified_at TIMESTAMPTZ;

ALTER TABLE visit_message_logs DROP CONSTRAINT IF EXISTS visit_message_logs_kind_check;
ALTER TABLE visit_message_logs ADD CONSTRAINT visit_message_logs_kind_check
  CHECK (kind IN ('invite', 'confirmation', 'reminder', 'done'));
