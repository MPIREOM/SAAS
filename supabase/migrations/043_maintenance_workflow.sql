-- 043_maintenance_workflow.sql
--
-- Link auto-created maintenance expenses back to their request so the
-- "Mark Resolved" flow is idempotent: resolving twice (double-click, retry,
-- reopen + resolve again) updates the one expense instead of inserting a
-- duplicate. The partial unique index enforces one expense per request.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS maintenance_request_id UUID
    REFERENCES maintenance_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_maintenance_request
  ON expenses(maintenance_request_id)
  WHERE maintenance_request_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
