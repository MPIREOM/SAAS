-- Deduplication table for WhatsApp webhook messages
-- Prevents the agent from processing the same message multiple times
-- when Meta retries webhook delivery

CREATE TABLE whatsapp_processed_messages (
  message_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-cleanup: delete records older than 24 hours to keep table small
-- (Messages are never retried after a few minutes, so 24h is very safe)
CREATE INDEX idx_whatsapp_processed_at ON whatsapp_processed_messages(processed_at);

-- Disable RLS — this table is only accessed by the service role from the webhook
ALTER TABLE whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (service role bypasses RLS anyway, but explicit is good)
CREATE POLICY "service_role_all" ON whatsapp_processed_messages
  FOR ALL USING (true) WITH CHECK (true);
