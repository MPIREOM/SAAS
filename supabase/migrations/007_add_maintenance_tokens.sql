-- Migration: Add maintenance tokens table and additional columns

-- 1. Create maintenance_tokens table
CREATE TABLE maintenance_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_tokens_token ON maintenance_tokens(token);
CREATE INDEX idx_maintenance_tokens_tenant ON maintenance_tokens(tenant_id);

ALTER TABLE maintenance_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_tokens_select" ON maintenance_tokens FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "maintenance_tokens_insert" ON maintenance_tokens FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "maintenance_tokens_update" ON maintenance_tokens FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "maintenance_tokens_delete" ON maintenance_tokens FOR DELETE USING (auth.uid() IS NOT NULL);

-- 2. Add resolved_at column to maintenance_requests
ALTER TABLE maintenance_requests ADD COLUMN resolved_at TIMESTAMPTZ;

-- 3. Add file_type and file_size columns to maintenance_attachments
ALTER TABLE maintenance_attachments ADD COLUMN file_type TEXT;
ALTER TABLE maintenance_attachments ADD COLUMN file_size INTEGER;
