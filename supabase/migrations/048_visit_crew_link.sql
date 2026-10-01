-- 048_visit_crew_link.sql
--
-- A read-only "contractor link" per visit (046): the pest-control company
-- (or whoever does the visit) opens /<locale>/visit-schedule/<crew_token>
-- without logging in and sees the booked times with unit, tenant name and
-- phone, plus the units that haven't booked. Staff create it from the visit
-- page and can revoke it (crew_token back to NULL) or replace it.
--
-- The page reads through the service role, so no RLS change is needed;
-- crew_token is covered by the existing visit_campaigns policies.

ALTER TABLE visit_campaigns ADD COLUMN IF NOT EXISTS crew_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_campaigns_crew_token
  ON visit_campaigns (crew_token) WHERE crew_token IS NOT NULL;
