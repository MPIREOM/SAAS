-- Dashboard AI assistant chat history.
--
-- One row per conversation, plus the full ordered Claude message transcript
-- (text, tool_use and tool_result blocks stored verbatim as JSONB) so a
-- conversation can be resumed exactly where it left off. A conversation that
-- is waiting on the user to confirm a destructive action keeps the pending
-- tool calls in pending_action until they approve or decline.
--
-- The assistant is super_admin only: rows are readable/writable by their
-- owner, and only while that owner is a super admin.

CREATE TABLE IF NOT EXISTS assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  pending_action JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user_updated
  ON assistant_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation
  ON assistant_messages (conversation_id, id);

ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_conversations_owner ON assistant_conversations;
CREATE POLICY assistant_conversations_owner ON assistant_conversations
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND is_super_admin())
  WITH CHECK (user_id = auth.uid() AND is_super_admin());

DROP POLICY IF EXISTS assistant_messages_owner ON assistant_messages;
CREATE POLICY assistant_messages_owner ON assistant_messages
  FOR ALL TO authenticated
  USING (
    is_super_admin() AND EXISTS (
      SELECT 1 FROM assistant_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_super_admin() AND EXISTS (
      SELECT 1 FROM assistant_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );
