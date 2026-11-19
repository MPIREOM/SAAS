-- 057_maintenance_technician_reminders.sql
--
-- Reminders for the technician's unfinished maintenance jobs (cron
-- maintenance-reminders): every 2 days while a job is still open, every 3
-- days once it is in progress, until it is marked finished on the job page
-- (056) or staff resolve it.
--
-- technician_next_reminder_at is when the next reminder is due. NULL means
-- "not scheduled yet": the cron then counts from when the job was created
-- (open) or started (in progress), which is also how jobs that predate this
-- migration are picked up. technician_reminder_count counts the reminders
-- sent in the job's current stage; the admins are alerted on the third.

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS technician_next_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS technician_reminder_count INTEGER NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
