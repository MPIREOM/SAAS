-- ============================================
-- Allow property managers to create and manage their own properties
-- ============================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "properties_insert" ON properties;
DROP POLICY IF EXISTS "properties_update" ON properties;

-- Property managers can insert properties (created_by must be their own ID)
-- Super admins can insert any property
CREATE POLICY "properties_insert" ON properties FOR INSERT WITH CHECK (
  is_super_admin() OR (auth.uid() IS NOT NULL AND created_by = auth.uid())
);

-- Property managers can update properties they created or are assigned to
-- Super admins can update any property
CREATE POLICY "properties_update" ON properties FOR UPDATE USING (
  is_super_admin() OR has_property_access(id)
);

-- Auto-assign property creator to user_property_assignments
-- so they can manage units within their own properties
CREATE OR REPLACE FUNCTION auto_assign_property_creator()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_property_assignments (user_id, property_id, assigned_by)
  VALUES (NEW.created_by, NEW.id, NEW.created_by)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER auto_assign_property_creator_trigger
  AFTER INSERT ON properties
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_property_creator();
