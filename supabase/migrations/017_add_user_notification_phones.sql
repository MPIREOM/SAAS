-- Add additional WhatsApp notification numbers to users table.
-- The user's primary `whatsapp_phone` is the number they message the agent
-- from. `notification_phones` is a list of extra numbers (e.g. the owner's)
-- that should receive a copy of every reply the AI agent sends back.

ALTER TABLE users
  ADD COLUMN notification_phones TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
