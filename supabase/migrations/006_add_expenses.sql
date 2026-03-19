-- MPIRE Property Management System - Expenses Table
-- Tracks property expenses for financial reporting

-- ============================================
-- ENUM
-- ============================================

CREATE TYPE expense_category AS ENUM (
  'maintenance',
  'insurance',
  'utilities',
  'cleaning',
  'legal',
  'taxes',
  'management_fees',
  'other'
);

-- ============================================
-- EXPENSES TABLE
-- ============================================

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  category expense_category NOT NULL DEFAULT 'other',
  description TEXT,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL,
  vendor TEXT,
  receipt_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_expenses_property ON expenses(property_id);
CREATE INDEX idx_expenses_unit ON expenses(unit_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Select: access via property assignment (reuses has_property_access helper)
CREATE POLICY "expenses_select" ON expenses FOR SELECT USING (
  has_property_access(property_id)
);

-- Insert: any authenticated user with property access
CREATE POLICY "expenses_insert" ON expenses FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND has_property_access(property_id)
);

-- Update: any authenticated user with property access
CREATE POLICY "expenses_update" ON expenses FOR UPDATE USING (
  has_property_access(property_id)
);

-- Delete: super_admin only
CREATE POLICY "expenses_delete" ON expenses FOR DELETE USING (
  is_super_admin()
);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
