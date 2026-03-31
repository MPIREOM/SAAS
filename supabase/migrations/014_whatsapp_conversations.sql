-- Conversation history for WhatsApp AI agent
-- Stores recent messages so the agent can recall context across messages

CREATE TABLE whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_conversations_phone_time
  ON whatsapp_conversations(user_phone, created_at DESC);

-- Auto-cleanup old messages (keep last 7 days)
-- Can be run periodically or via Supabase cron
CREATE INDEX idx_whatsapp_conversations_created
  ON whatsapp_conversations(created_at);

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON whatsapp_conversations
  FOR ALL USING (true) WITH CHECK (true);
