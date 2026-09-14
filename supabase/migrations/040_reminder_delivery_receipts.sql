-- Track WhatsApp delivery receipts per reminder.
--
-- reminder_logs previously recorded only that Meta's API accepted a message
-- ("sent"). WhatsApp then reports sent → delivered → read (or failed) through
-- the status webhook; storing those per message gives the closest signal
-- WhatsApp offers that a tenant has blocked the number or is unreachable: a
-- message that stays at "sent" for days, or fails outright.

ALTER TABLE reminder_logs
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT
    CHECK (delivery_status IS NULL OR delivery_status IN ('sent', 'delivered', 'read', 'failed')),
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_error TEXT;

COMMENT ON COLUMN reminder_logs.provider_message_id IS 'Meta message id (wamid) returned when the WhatsApp message was accepted.';
COMMENT ON COLUMN reminder_logs.delivery_status IS 'Latest WhatsApp receipt: sent (accepted, not yet delivered), delivered, read, failed.';

CREATE INDEX IF NOT EXISTS idx_reminder_logs_provider_message_id
  ON reminder_logs (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
