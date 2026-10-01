-- 047_visit_message_logs.sql
--
-- One row per WhatsApp message the visit-booking feature (046) tries to
-- send: the booking-link invite, the booking confirmation and the
-- day-before reminder. Until now these were only console-logged on failure,
-- so staff couldn't tell whether tenants received anything.
--
-- send_status is what happened when we called the Cloud API:
--   sent    — Meta accepted it (provider_message_id holds the wamid)
--   failed  — Meta rejected both the template and the text fallback
--   skipped — not attempted (no phone, or tenant notifications off)
-- via says whether the approved template or the free-form text fallback was
-- used; template_error keeps why the template was rejected in that case
-- (typically "template not approved yet"). A text fallback outside Meta's
-- 24h window is accepted here but then fails delivery.
--
-- delivery_status / delivered_at / read_at / delivery_error mirror
-- reminder_logs (040) and are filled from the webhook's status receipts by
-- applyDeliveryReceipts (src/lib/whatsapp/delivery-receipts.ts).
--
-- Rows are written by the server with the service role; staff read them
-- through RLS scoped to the visit's property.

CREATE TABLE IF NOT EXISTS visit_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES visit_campaigns(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES visit_bookings(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('invite', 'confirmation', 'reminder')),
  phone TEXT,
  send_status TEXT NOT NULL CHECK (send_status IN ('sent', 'failed', 'skipped')),
  via TEXT CHECK (via IS NULL OR via IN ('template', 'text')),
  error TEXT,
  template_error TEXT,
  provider_message_id TEXT,
  delivery_status TEXT
    CHECK (delivery_status IS NULL OR delivery_status IN ('sent', 'delivered', 'read', 'failed')),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  delivery_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_message_logs_campaign
  ON visit_message_logs (campaign_id, unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visit_message_logs_provider_message_id
  ON visit_message_logs (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE visit_message_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visit_message_logs_select" ON visit_message_logs;
CREATE POLICY "visit_message_logs_select" ON visit_message_logs FOR SELECT USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM visit_campaigns c
    WHERE c.id = visit_message_logs.campaign_id AND has_property_access(c.property_id)
  )
);
