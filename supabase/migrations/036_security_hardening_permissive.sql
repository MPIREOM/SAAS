-- ============================================================================
-- Migration 036: tighten the remaining permissive RLS policies.
-- ============================================================================

-- whatsapp_conversations / whatsapp_processed_messages hold conversation PII
-- and are written/read ONLY via the service-role key (webhook + agent), which
-- bypasses RLS. The `service_role_all` USING(true) policies were exposing them
-- to anon/authenticated — drop them so only the service role can reach the
-- data (RLS stays enabled => deny by default for anon/authenticated).
DROP POLICY IF EXISTS service_role_all ON whatsapp_conversations;
DROP POLICY IF EXISTS service_role_all ON whatsapp_processed_messages;

-- audit_log: was INSERT WITH CHECK (true) for authenticated, letting a user
-- forge entries attributed to anyone. Constrain to their own user_id (cron /
-- agent write via the service role and bypass this).
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_log;
DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_super_admin());

-- maintenance_requests: public submissions are created with the service-role
-- key, so the anon INSERT(true) policy is unnecessary and let the anon key
-- create arbitrary requests bypassing the token check. Remove it.
DROP POLICY IF EXISTS "Anon can insert maintenance requests" ON maintenance_requests;

-- reminder_logs: INSERT WITH CHECK (true) applied to all roles (incl. anon).
-- Cron/trigger sends use the service role (bypass); the manual send runs as an
-- authenticated user. Require an authenticated session instead of always-true.
DROP POLICY IF EXISTS reminder_logs_insert ON reminder_logs;
CREATE POLICY reminder_logs_insert ON reminder_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
