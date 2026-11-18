-- 056_maintenance_technician_progress.sql
--
-- The watchman (or whoever a job is assigned to) reports progress from a
-- public job page linked on the WhatsApp job card: "start work" moves the
-- request to in_progress, "work finished" flags it as done. A done job stays
-- in_progress until staff confirm it in the dashboard (Mark Resolved), which
-- is when the tenant is told.
--
-- technician_token is the secret in that page's URL. It is separate from the
-- request id because the id is known to the tenant who submitted the request.

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS technician_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS technician_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS technician_done_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_requests_technician_token
  ON maintenance_requests(technician_token);

NOTIFY pgrst, 'reload schema';
