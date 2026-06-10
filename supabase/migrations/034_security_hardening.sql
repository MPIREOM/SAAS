-- ============================================================================
-- Migration 034: Security hardening
--
-- Closes the broken-object-level-authorization holes from the security audit.
-- NOTE: the live database had already been hot-fixed (out of band) to scope
-- tenants / payments / cheques / documents / leases-SELECT through
-- has_tenant_access(). This migration is written to be idempotent and to also
-- run cleanly on a fresh database built from 001–033:
--   * (re)defines has_tenant_access()  [param name `tid` to match the live fn]
--   * finishes the remaining write/read holes (leases UPDATE, maintenance
--     UPDATE, reminder_logs SELECT, tenants created_by escape hatch)
--   * removes the permissive `USING (true)` + anon-read policies on the token
--     tables and replaces them with property-scoped ones      (F2 / F4)
--   * scopes the `documents` storage bucket                   (F3)
-- ============================================================================

CREATE OR REPLACE FUNCTION has_tenant_access(tid UUID)
RETURNS BOOLEAN AS $$
  SELECT is_super_admin() OR EXISTS (
    SELECT 1 FROM leases l JOIN units u ON u.id = l.unit_id
    WHERE l.tenant_id = tid AND has_property_access(u.property_id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── F1: tenants — created_by escape hatch so a creator sees a tenant that has
--    no lease yet ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenants_select" ON tenants;
DROP POLICY IF EXISTS "tenants_update" ON tenants;
CREATE POLICY "tenants_select" ON tenants FOR SELECT USING (
  is_super_admin() OR created_by = auth.uid() OR has_tenant_access(id)
);
CREATE POLICY "tenants_update" ON tenants FOR UPDATE USING (
  is_super_admin() OR created_by = auth.uid() OR has_tenant_access(id)
);

-- ── F1: leases UPDATE (was auth-only) ───────────────────────────────────────
DROP POLICY IF EXISTS "leases_update" ON leases;
CREATE POLICY "leases_update" ON leases FOR UPDATE USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = leases.unit_id AND has_property_access(u.property_id)
  )
);

-- ── F1: maintenance_requests UPDATE (was auth-only) ─────────────────────────
DROP POLICY IF EXISTS "maintenance_update" ON maintenance_requests;
CREATE POLICY "maintenance_update" ON maintenance_requests FOR UPDATE USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = maintenance_requests.unit_id AND has_property_access(u.property_id)
  )
);

-- ── F1: reminder_logs SELECT (was auth-only) ────────────────────────────────
DROP POLICY IF EXISTS "reminder_logs_select" ON reminder_logs;
CREATE POLICY "reminder_logs_select" ON reminder_logs FOR SELECT USING (
  is_super_admin() OR has_tenant_access(tenant_id)
);

-- ── F2: tenant_portal_tokens — define if missing, drop permissive/anon-read,
--    scope to tenant access ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_portal_tokens_token ON tenant_portal_tokens(token);
CREATE INDEX IF NOT EXISTS idx_tenant_portal_tokens_tenant ON tenant_portal_tokens(tenant_id);
ALTER TABLE tenant_portal_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage portal tokens" ON tenant_portal_tokens;
DROP POLICY IF EXISTS "Anon can read active portal tokens" ON tenant_portal_tokens;
DROP POLICY IF EXISTS "tenant_portal_tokens_all" ON tenant_portal_tokens;
CREATE POLICY "tenant_portal_tokens_all" ON tenant_portal_tokens FOR ALL
  USING (is_super_admin() OR has_tenant_access(tenant_id))
  WITH CHECK (is_super_admin() OR has_tenant_access(tenant_id));

-- ── F4: maintenance_tokens — drop permissive/anon-read, scope to property ───
DROP POLICY IF EXISTS "Authenticated users can manage tokens" ON maintenance_tokens;
DROP POLICY IF EXISTS "Anon can read active tokens by token value" ON maintenance_tokens;
DROP POLICY IF EXISTS "maintenance_tokens_select" ON maintenance_tokens;
DROP POLICY IF EXISTS "maintenance_tokens_insert" ON maintenance_tokens;
DROP POLICY IF EXISTS "maintenance_tokens_update" ON maintenance_tokens;
DROP POLICY IF EXISTS "maintenance_tokens_delete" ON maintenance_tokens;
CREATE POLICY "maintenance_tokens_select" ON maintenance_tokens FOR SELECT USING (
  is_super_admin()
  OR (property_id IS NOT NULL AND has_property_access(property_id))
  OR (unit_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM units u WHERE u.id = maintenance_tokens.unit_id AND has_property_access(u.property_id)))
);
CREATE POLICY "maintenance_tokens_insert" ON maintenance_tokens FOR INSERT WITH CHECK (
  is_super_admin() OR (property_id IS NOT NULL AND has_property_access(property_id))
);
CREATE POLICY "maintenance_tokens_update" ON maintenance_tokens FOR UPDATE USING (
  is_super_admin()
  OR (property_id IS NOT NULL AND has_property_access(property_id))
  OR (unit_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM units u WHERE u.id = maintenance_tokens.unit_id AND has_property_access(u.property_id)))
);
CREATE POLICY "maintenance_tokens_delete" ON maintenance_tokens FOR DELETE USING (
  is_super_admin()
  OR (property_id IS NOT NULL AND has_property_access(property_id))
  OR (unit_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM units u WHERE u.id = maintenance_tokens.unit_id AND has_property_access(u.property_id)))
);

-- ── F3: documents storage bucket — gate reads on accessible documents ───────
CREATE OR REPLACE FUNCTION can_read_document_object(object_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT is_super_admin() OR EXISTS (
    SELECT 1 FROM documents d
    WHERE d.file_url = object_name
      AND (
        d.uploaded_by = auth.uid()
        OR (d.entity_type = 'tenant'   AND has_tenant_access(d.entity_id))
        OR (d.entity_type = 'property' AND has_property_access(d.entity_id))
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "documents_read" ON storage.objects;
CREATE POLICY "documents_read" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (owner = auth.uid() OR can_read_document_object(name))
  );
