-- ============================================================================
-- Migration 034: Security hardening
--
-- Closes the broken-object-level-authorization holes found in the security
-- audit. The previous policies on the sensitive tables were effectively
-- "any authenticated user", which let a property_manager assigned to one
-- building read and modify every tenant's PII, all payments, all cheques,
-- and every stored document across the whole organization (by calling
-- PostgREST directly with their JWT, bypassing the app-layer filters).
--
-- This migration moves enforcement into RLS, scoping each sensitive table
-- through property access. A `created_by`/`uploaded_by` escape hatch keeps
-- the create-then-view flows working before a lease exists.
--
-- Covered findings:
--   F1 — property-scoped RLS for tenants / payments / cheques / documents /
--        leases / maintenance_requests / reminder_logs
--   F2 — define + lock down tenant_portal_tokens (was created out-of-band
--        with no RLS)
--   F3 — scope the `documents` storage bucket to accessible documents
--   F4 — property-scope maintenance_tokens
-- ============================================================================

-- ── Helper: can the current user reach this tenant through an accessible
--    property (via any of the tenant's leases)? SECURITY DEFINER so it can
--    read leases/units regardless of the caller's own RLS. ──────────────────
CREATE OR REPLACE FUNCTION has_tenant_access(t_id UUID)
RETURNS BOOLEAN AS $$
  SELECT is_super_admin() OR EXISTS (
    SELECT 1
    FROM leases l
    JOIN units u ON u.id = l.unit_id
    WHERE l.tenant_id = t_id
      AND has_property_access(u.property_id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- F1 — TENANTS
-- ============================================================================
DROP POLICY IF EXISTS "tenants_select" ON tenants;
DROP POLICY IF EXISTS "tenants_update" ON tenants;
-- insert stays permissive: a tenant is created before any lease exists, so it
-- cannot be property-scoped at insert time. The app sets created_by, which the
-- select/update policies honour so the creator can still see their new tenant.

CREATE POLICY "tenants_select" ON tenants FOR SELECT USING (
  is_super_admin()
  OR created_by = auth.uid()
  OR has_tenant_access(id)
);
CREATE POLICY "tenants_update" ON tenants FOR UPDATE USING (
  is_super_admin()
  OR created_by = auth.uid()
  OR has_tenant_access(id)
);

-- ============================================================================
-- F1 — PAYMENTS
-- ============================================================================
DROP POLICY IF EXISTS "payments_select" ON payments;
DROP POLICY IF EXISTS "payments_insert" ON payments;
DROP POLICY IF EXISTS "payments_update" ON payments;   -- added in 027

CREATE POLICY "payments_select" ON payments FOR SELECT USING (
  is_super_admin() OR has_tenant_access(tenant_id)
);
CREATE POLICY "payments_insert" ON payments FOR INSERT WITH CHECK (
  is_super_admin() OR has_tenant_access(tenant_id)
);
CREATE POLICY "payments_update" ON payments FOR UPDATE USING (
  is_super_admin() OR has_tenant_access(tenant_id)
);

-- ============================================================================
-- F1 — CHEQUES
-- ============================================================================
DROP POLICY IF EXISTS "cheques_select" ON cheques;
DROP POLICY IF EXISTS "cheques_insert" ON cheques;
DROP POLICY IF EXISTS "cheques_update" ON cheques;

CREATE POLICY "cheques_select" ON cheques FOR SELECT USING (
  is_super_admin() OR has_tenant_access(tenant_id)
);
CREATE POLICY "cheques_insert" ON cheques FOR INSERT WITH CHECK (
  is_super_admin() OR has_tenant_access(tenant_id)
);
CREATE POLICY "cheques_update" ON cheques FOR UPDATE USING (
  is_super_admin() OR has_tenant_access(tenant_id)
);

-- ============================================================================
-- F1 / F3 — DOCUMENTS (row level)
-- documents.entity_type is 'tenant' | 'property'; entity_id points at that row.
-- ============================================================================
DROP POLICY IF EXISTS "documents_select" ON documents;

CREATE POLICY "documents_select" ON documents FOR SELECT USING (
  is_super_admin()
  OR uploaded_by = auth.uid()
  OR (entity_type = 'tenant'   AND has_tenant_access(entity_id))
  OR (entity_type = 'property' AND has_property_access(entity_id))
);
-- insert stays permissive (uploaded_by is set by the app and honoured above).

-- ============================================================================
-- F1 — LEASES (insert/update scoped through the unit's property)
-- select is already property-scoped in 001.
-- ============================================================================
DROP POLICY IF EXISTS "leases_insert" ON leases;
DROP POLICY IF EXISTS "leases_update" ON leases;

CREATE POLICY "leases_insert" ON leases FOR INSERT WITH CHECK (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = leases.unit_id AND has_property_access(u.property_id)
  )
);
CREATE POLICY "leases_update" ON leases FOR UPDATE USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = leases.unit_id AND has_property_access(u.property_id)
  )
);

-- ============================================================================
-- F1 — MAINTENANCE_REQUESTS (update scoped through the unit's property)
-- select is already property-scoped in 001; public submissions use the
-- service-role key and bypass RLS.
-- ============================================================================
DROP POLICY IF EXISTS "maintenance_update" ON maintenance_requests;
CREATE POLICY "maintenance_update" ON maintenance_requests FOR UPDATE USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM units u WHERE u.id = maintenance_requests.unit_id AND has_property_access(u.property_id)
  )
);

-- ============================================================================
-- F1 — REMINDER LOGS (select scoped by tenant; cron inserts via service role)
-- ============================================================================
DROP POLICY IF EXISTS "reminder_logs_select" ON reminder_logs;
CREATE POLICY "reminder_logs_select" ON reminder_logs FOR SELECT USING (
  is_super_admin() OR has_tenant_access(tenant_id)
);

-- ============================================================================
-- F2 — TENANT PORTAL TOKENS
-- The table was created out-of-band (no prior migration), so it likely had
-- RLS disabled — meaning any authenticated user could mint a 30-day portal
-- link for ANY tenant and read their full record via the service-role
-- validate endpoint. Define it here and lock it to tenant access.
-- ============================================================================
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

DROP POLICY IF EXISTS "tenant_portal_tokens_all" ON tenant_portal_tokens;
CREATE POLICY "tenant_portal_tokens_all" ON tenant_portal_tokens FOR ALL
  USING (is_super_admin() OR has_tenant_access(tenant_id))
  WITH CHECK (is_super_admin() OR has_tenant_access(tenant_id));

-- ============================================================================
-- F4 — MAINTENANCE TOKENS (property-scoped; legacy rows carry unit_id)
-- The public validate/submit endpoints use the service-role key and bypass
-- RLS — these policies govern staff (anon-key) access via the generate
-- endpoint and the settings UI.
-- ============================================================================
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
  is_super_admin()
  OR (property_id IS NOT NULL AND has_property_access(property_id))
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

-- ============================================================================
-- F3 — DOCUMENTS STORAGE BUCKET
-- Old policy: any authenticated user could read ANY object in the private
-- `documents` bucket. Tie reads to the (now property-scoped) documents table
-- so a user can only download objects for documents they're allowed to see.
-- An `owner` fallback keeps the original uploader able to read their own
-- objects (e.g. lease PDFs that have no `documents` row).
-- ============================================================================
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
