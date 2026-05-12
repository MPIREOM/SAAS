-- Migration 006 restricted DELETE on `expenses` to super_admin only. When
-- migration 024 added owner-level expenses (property_id nullable) it
-- widened SELECT/INSERT/UPDATE for any authenticated user with access to
-- either the property or the owner row, but never revisited DELETE.
--
-- The dashboard delete button at
-- src/app/[locale]/(dashboard)/expenses/[id]/edit/page.tsx silently fails
-- under this policy for non-super-admin users: PostgREST returns success
-- but zero rows are affected, so the expense reappears on refresh.
--
-- Mirror the UPDATE policy: anyone with property access OR any authenticated
-- user for an owner-scoped expense can delete it. expense_attachments are
-- cleaned up via ON DELETE CASCADE.
DROP POLICY IF EXISTS "expenses_delete" ON expenses;
CREATE POLICY "expenses_delete" ON expenses FOR DELETE
  USING (
    (property_id IS NOT NULL AND has_property_access(property_id))
    OR (owner_id IS NOT NULL AND (SELECT auth.uid()) IS NOT NULL)
  );
