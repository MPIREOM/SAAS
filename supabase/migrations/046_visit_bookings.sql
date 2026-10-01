-- 046_visit_bookings.sql
--
-- Building-wide visits (pest control, AC servicing, fire-alarm checks, ...)
-- where staff need to enter every apartment. Staff create a visit for a
-- property with a date range and daily time window; it is cut into
-- fixed-length slots (10 minutes by default), one apartment per slot.
--
-- Tenants book through one shared link per visit (visit_campaigns.token):
-- they pick their unit, prove it with the last 4 digits of the phone number
-- on the active lease, and pick a free slot. Each booking gets its own
-- manage_token, sent to the tenant on WhatsApp, to reschedule or cancel.
--
-- Public pages go through the service role, so there are no anon policies.
-- visit_verification_failures is service-role only (no policies at all): it
-- throttles guessing the 4 digits.

CREATE TABLE IF NOT EXISTS visit_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  day_start TIME NOT NULL,
  day_end TIME NOT NULL,
  slot_minutes INTEGER NOT NULL DEFAULT 10 CHECK (slot_minutes BETWEEN 5 AND 120),
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  -- Origin of the app when the visit was created, so links sent by the
  -- reminder cron point at the app rather than NEXT_PUBLIC_APP_URL (which is
  -- the marketing site in this project).
  public_origin TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (day_end > day_start)
);

CREATE INDEX IF NOT EXISTS idx_visit_campaigns_property ON visit_campaigns (property_id, start_date DESC);

CREATE TABLE IF NOT EXISTS visit_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES visit_campaigns(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  slot_start TIMESTAMPTZ NOT NULL,
  manage_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
  booked_by TEXT NOT NULL DEFAULT 'tenant' CHECK (booked_by IN ('tenant', 'staff')),
  reminder_sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One apartment per slot, and one live booking per apartment per visit.
-- These are what stop two tenants grabbing the same slot at the same time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_bookings_slot_unique
  ON visit_bookings (campaign_id, slot_start) WHERE status = 'booked';
CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_bookings_unit_unique
  ON visit_bookings (campaign_id, unit_id) WHERE status = 'booked';
CREATE INDEX IF NOT EXISTS idx_visit_bookings_reminder
  ON visit_bookings (slot_start) WHERE status = 'booked' AND reminder_sent_at IS NULL;

CREATE TABLE IF NOT EXISTS visit_verification_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES visit_campaigns(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_verification_failures_lookup
  ON visit_verification_failures (campaign_id, unit_id, created_at DESC);

ALTER TABLE visit_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_verification_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visit_campaigns_select" ON visit_campaigns;
DROP POLICY IF EXISTS "visit_campaigns_insert" ON visit_campaigns;
DROP POLICY IF EXISTS "visit_campaigns_update" ON visit_campaigns;
DROP POLICY IF EXISTS "visit_campaigns_delete" ON visit_campaigns;

CREATE POLICY "visit_campaigns_select" ON visit_campaigns FOR SELECT USING (
  is_super_admin() OR has_property_access(property_id)
);
CREATE POLICY "visit_campaigns_insert" ON visit_campaigns FOR INSERT WITH CHECK (
  is_super_admin() OR has_property_access(property_id)
);
CREATE POLICY "visit_campaigns_update" ON visit_campaigns FOR UPDATE USING (
  is_super_admin() OR has_property_access(property_id)
) WITH CHECK (
  is_super_admin() OR has_property_access(property_id)
);
CREATE POLICY "visit_campaigns_delete" ON visit_campaigns FOR DELETE USING (
  is_super_admin() OR has_property_access(property_id)
);

DROP POLICY IF EXISTS "visit_bookings_select" ON visit_bookings;
DROP POLICY IF EXISTS "visit_bookings_insert" ON visit_bookings;
DROP POLICY IF EXISTS "visit_bookings_update" ON visit_bookings;
DROP POLICY IF EXISTS "visit_bookings_delete" ON visit_bookings;

CREATE POLICY "visit_bookings_select" ON visit_bookings FOR SELECT USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM visit_campaigns c
    WHERE c.id = visit_bookings.campaign_id AND has_property_access(c.property_id)
  )
);
CREATE POLICY "visit_bookings_insert" ON visit_bookings FOR INSERT WITH CHECK (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM visit_campaigns c
    WHERE c.id = visit_bookings.campaign_id AND has_property_access(c.property_id)
  )
);
CREATE POLICY "visit_bookings_update" ON visit_bookings FOR UPDATE USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM visit_campaigns c
    WHERE c.id = visit_bookings.campaign_id AND has_property_access(c.property_id)
  )
);
CREATE POLICY "visit_bookings_delete" ON visit_bookings FOR DELETE USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM visit_campaigns c
    WHERE c.id = visit_bookings.campaign_id AND has_property_access(c.property_id)
  )
);
