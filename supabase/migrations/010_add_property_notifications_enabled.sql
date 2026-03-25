-- Add notifications_enabled column to properties table
-- Defaults to true so existing properties continue sending reminders
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true;

-- Add a comment for clarity
COMMENT ON COLUMN properties.notifications_enabled IS 'When false, no WhatsApp or email reminders are sent for tenants in this property';
