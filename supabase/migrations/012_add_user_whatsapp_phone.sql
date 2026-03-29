-- Add WhatsApp phone number to users table for WhatsApp agent authentication
-- Admin users register their WhatsApp number to interact with the AI agent

ALTER TABLE users ADD COLUMN whatsapp_phone TEXT UNIQUE;

-- Index for fast lookup during webhook processing
CREATE INDEX idx_users_whatsapp_phone ON users(whatsapp_phone) WHERE whatsapp_phone IS NOT NULL;
