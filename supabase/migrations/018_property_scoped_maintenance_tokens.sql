-- Migration: Switch maintenance_tokens to property-scoped links
--
-- The old flow generated one token per (tenant, unit) pair. The new flow
-- generates a single reusable link per property — the tenant enters their
-- unit number on the submission form. Legacy tokens are revoked in place so
-- the URL space is cleaned up; new property-scoped tokens take over.

-- 1. Add property_id (nullable at first so the alter can run on existing rows)
ALTER TABLE maintenance_tokens
  ADD COLUMN property_id UUID REFERENCES properties(id) ON DELETE CASCADE;

-- 2. Allow tenant_id and unit_id to be NULL for property-scoped tokens
ALTER TABLE maintenance_tokens ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE maintenance_tokens ALTER COLUMN unit_id DROP NOT NULL;

-- 3. Enforce that exactly one of (property_id) or (tenant_id + unit_id) is set
ALTER TABLE maintenance_tokens
  ADD CONSTRAINT maintenance_tokens_scope_check CHECK (
    (property_id IS NOT NULL AND tenant_id IS NULL AND unit_id IS NULL)
    OR
    (property_id IS NULL AND tenant_id IS NOT NULL AND unit_id IS NOT NULL)
  );

-- 4. Revoke all existing legacy tokens — staff will regenerate property links
UPDATE maintenance_tokens SET is_active = false WHERE is_active = true;

-- 5. Index for fast property lookup when regenerating/reusing a link
CREATE INDEX idx_maintenance_tokens_property ON maintenance_tokens(property_id)
  WHERE property_id IS NOT NULL;

-- 6. Partial unique index so each property has at most one active token —
-- the generate endpoint becomes idempotent: regenerating returns the
-- existing active token instead of creating duplicates.
CREATE UNIQUE INDEX idx_maintenance_tokens_property_active_unique
  ON maintenance_tokens(property_id)
  WHERE property_id IS NOT NULL AND is_active = true;
