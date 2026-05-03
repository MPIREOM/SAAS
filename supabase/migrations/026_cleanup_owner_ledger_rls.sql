-- Cleanup pass for the owner-ledger RLS policies introduced in 024.
--
--   1. Drop the legacy "Authenticated users can manage expenses" policy.
--      It pre-dated the owner-scoping work and used USING (true) WITH
--      CHECK (true), which made the new policies in 024 a no-op (Postgres
--      OR's permissive policies together, so the (true) clause always won).
--      Today only super_admin uses the system so the practical impact was
--      nil, but the moment a property_manager is added they would have
--      seen every owner's expenses regardless of their property
--      assignments.
--
--   2. Wrap auth.uid() in (SELECT auth.uid()) inside every owner-ledger
--      RLS policy. Without the SELECT wrapper Postgres re-evaluates
--      auth.uid() once per scanned row; with it the planner caches the
--      value as an InitPlan. Same logic, faster at scale. Flagged by the
--      Supabase auth_rls_initplan advisor.
--
-- Functions like has_property_access() and is_super_admin() are
-- SECURITY DEFINER and self-contained, so they don't need wrapping here.

-- ── 1. Drop legacy permissive policy on expenses ──────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage expenses" ON expenses;

-- ── 2. owners ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "owners_select" ON owners;
CREATE POLICY "owners_select" ON owners FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "owners_insert" ON owners;
CREATE POLICY "owners_insert" ON owners FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "owners_update" ON owners;
CREATE POLICY "owners_update" ON owners FOR UPDATE
  USING ((SELECT auth.uid()) IS NOT NULL);

-- ── 3. owner_business_fees ────────────────────────────────────────────
DROP POLICY IF EXISTS "owner_business_fees_select" ON owner_business_fees;
CREATE POLICY "owner_business_fees_select" ON owner_business_fees FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "owner_business_fees_insert" ON owner_business_fees;
CREATE POLICY "owner_business_fees_insert" ON owner_business_fees FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "owner_business_fees_update" ON owner_business_fees;
CREATE POLICY "owner_business_fees_update" ON owner_business_fees FOR UPDATE
  USING ((SELECT auth.uid()) IS NOT NULL);

-- ── 4. owner_settlements ──────────────────────────────────────────────
DROP POLICY IF EXISTS "owner_settlements_select" ON owner_settlements;
CREATE POLICY "owner_settlements_select" ON owner_settlements FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "owner_settlements_insert" ON owner_settlements;
CREATE POLICY "owner_settlements_insert" ON owner_settlements FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "owner_settlements_update" ON owner_settlements;
CREATE POLICY "owner_settlements_update" ON owner_settlements FOR UPDATE
  USING ((SELECT auth.uid()) IS NOT NULL);

-- ── 5. expense_attachments ────────────────────────────────────────────
DROP POLICY IF EXISTS "expense_attachments_select" ON expense_attachments;
CREATE POLICY "expense_attachments_select" ON expense_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_attachments.expense_id
        AND ((e.property_id IS NOT NULL AND has_property_access(e.property_id))
             OR (e.owner_id IS NOT NULL AND (SELECT auth.uid()) IS NOT NULL))
    )
  );

DROP POLICY IF EXISTS "expense_attachments_insert" ON expense_attachments;
CREATE POLICY "expense_attachments_insert" ON expense_attachments FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL AND EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_attachments.expense_id
        AND ((e.property_id IS NOT NULL AND has_property_access(e.property_id))
             OR e.owner_id IS NOT NULL)
    )
  );

-- ── 6. expenses (replacements for the policies that lost the legacy peer)
DROP POLICY IF EXISTS "expenses_select" ON expenses;
CREATE POLICY "expenses_select" ON expenses FOR SELECT
  USING (
    (property_id IS NOT NULL AND has_property_access(property_id))
    OR (owner_id IS NOT NULL AND (SELECT auth.uid()) IS NOT NULL)
  );

DROP POLICY IF EXISTS "expenses_insert" ON expenses;
CREATE POLICY "expenses_insert" ON expenses FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL AND (
      (property_id IS NOT NULL AND has_property_access(property_id))
      OR owner_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "expenses_update" ON expenses;
CREATE POLICY "expenses_update" ON expenses FOR UPDATE
  USING (
    (property_id IS NOT NULL AND has_property_access(property_id))
    OR (owner_id IS NOT NULL AND (SELECT auth.uid()) IS NOT NULL)
  );
