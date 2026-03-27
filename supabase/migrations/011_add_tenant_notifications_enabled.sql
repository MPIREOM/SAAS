-- Add notifications_enabled column to tenants table
-- Defaults to true so existing tenants continue receiving reminders
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN tenants.notifications_enabled IS 'When false, no WhatsApp or email reminders are sent to this tenant';
