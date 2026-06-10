-- ============================================================================
-- Migration 035: Security advisor remediations — config tables, counters,
-- attachments, public buckets, and SECURITY DEFINER function hardening.
-- ============================================================================

-- ── reminder_settings: RLS was DISABLED (anon could read/write). Enable +
--    authenticated read, super_admin writes (global config). ────────────────
ALTER TABLE reminder_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reminder_settings_select ON reminder_settings;
DROP POLICY IF EXISTS reminder_settings_modify ON reminder_settings;
CREATE POLICY reminder_settings_select ON reminder_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY reminder_settings_modify ON reminder_settings FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ── cron_run_logs: RLS was DISABLED. Cron writes via service role (bypasses
--    RLS), so only a restricted read policy is needed. ───────────────────────
ALTER TABLE cron_run_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cron_run_logs_select ON cron_run_logs;
CREATE POLICY cron_run_logs_select ON cron_run_logs FOR SELECT USING (is_super_admin());

-- ── admin_notification_recipients: replace permissive ALL(true) ─────────────
DROP POLICY IF EXISTS "Authenticated users can manage notification recipients" ON admin_notification_recipients;
DROP POLICY IF EXISTS admin_notification_recipients_select ON admin_notification_recipients;
DROP POLICY IF EXISTS admin_notification_recipients_modify ON admin_notification_recipients;
CREATE POLICY admin_notification_recipients_select ON admin_notification_recipients FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY admin_notification_recipients_modify ON admin_notification_recipients FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ── invoice_settings: replace permissive UPDATE(true) with super_admin ──────
DROP POLICY IF EXISTS "Authenticated users can update invoice_settings" ON invoice_settings;
DROP POLICY IF EXISTS invoice_settings_update ON invoice_settings;
CREATE POLICY invoice_settings_update ON invoice_settings FOR UPDATE
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ── invoice_items: scope through the parent invoice's property ──────────────
DROP POLICY IF EXISTS "Authenticated users can manage invoice_items" ON invoice_items;
DROP POLICY IF EXISTS invoice_items_all ON invoice_items;
CREATE POLICY invoice_items_all ON invoice_items FOR ALL
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM invoices i JOIN units u ON u.id = i.unit_id
      WHERE i.id = invoice_items.invoice_id AND has_property_access(u.property_id)
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM invoices i JOIN units u ON u.id = i.unit_id
      WHERE i.id = invoice_items.invoice_id AND has_property_access(u.property_id)
    )
  );

-- ── invoice_number_counters: scope by property (writes also flow through the
--    SECURITY DEFINER RPC, which bypasses RLS) ──────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage invoice_number_counters" ON invoice_number_counters;
DROP POLICY IF EXISTS invoice_number_counters_all ON invoice_number_counters;
CREATE POLICY invoice_number_counters_all ON invoice_number_counters FOR ALL
  USING (is_super_admin() OR has_property_access(property_id))
  WITH CHECK (is_super_admin() OR has_property_access(property_id));

-- ── maintenance_attachments: drop permissive + anon, scope by property.
--    Public submissions insert via the service-role key (bypasses RLS). ──────
DROP POLICY IF EXISTS "Authenticated users can manage attachments" ON maintenance_attachments;
DROP POLICY IF EXISTS "Anon can insert attachments" ON maintenance_attachments;
DROP POLICY IF EXISTS maintenance_attachments_select ON maintenance_attachments;
DROP POLICY IF EXISTS maintenance_attachments_insert ON maintenance_attachments;
DROP POLICY IF EXISTS maintenance_attachments_all ON maintenance_attachments;
CREATE POLICY maintenance_attachments_all ON maintenance_attachments FOR ALL
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM maintenance_requests mr JOIN units u ON u.id = mr.unit_id
      WHERE mr.id = maintenance_attachments.request_id AND has_property_access(u.property_id)
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM maintenance_requests mr JOIN units u ON u.id = mr.unit_id
      WHERE mr.id = maintenance_attachments.request_id AND has_property_access(u.property_id)
    )
  );

-- ── Public buckets: drop broad SELECT (listing) policies. Object downloads
--    still work via the public-object endpoint (bucket.public = true). ───────
DROP POLICY IF EXISTS "Allow public reads from maintenance-media" ON storage.objects;
DROP POLICY IF EXISTS "maintenance_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "owner_reports_public_read" ON storage.objects;

-- ── Pin search_path on flagged functions (prevents SECURITY DEFINER
--    search_path hijacking). ────────────────────────────────────────────────
ALTER FUNCTION public.is_super_admin() SET search_path = pg_catalog, public;
ALTER FUNCTION public.has_property_access(uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.has_tenant_access(uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.can_read_document_object(text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.auto_assign_property_creator() SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = pg_catalog, public;
ALTER FUNCTION public.trg_leases_sync_unit_status() SET search_path = pg_catalog, public;
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public;
ALTER FUNCTION public.handle_new_auth_user() SET search_path = pg_catalog, public;
ALTER FUNCTION public.sync_unit_status_from_leases(uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.trg_invoices_clear_cheques() SET search_path = pg_catalog, public;
ALTER FUNCTION public.next_move_out_invoice_number(uuid) SET search_path = pg_catalog, public;

-- ── Revoke direct RPC EXECUTE on trigger/internal functions (triggers still
--    fire; they were never meant to be callable via /rest/v1/rpc). The
--    RLS-helper functions and the move-out numbering RPC intentionally keep
--    EXECUTE — policy evaluation / the app depend on them. ───────────────────
REVOKE EXECUTE ON FUNCTION public.auto_assign_property_creator() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_leases_sync_unit_status() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_unit_status_from_leases(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_invoices_clear_cheques() FROM anon, authenticated, public;
