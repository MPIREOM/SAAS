-- The payments table had RLS policies for INSERT and SELECT but no UPDATE
-- policy. PostgREST treats a missing UPDATE policy as "deny everything" but
-- silently returns zero rows updated rather than raising an error, so the
-- /api/payments/[id]/method endpoint reported success even though the row
-- never changed — clicks to fix a miscategorised payment from the UI looked
-- like they worked but reverted on refresh.
--
-- Mirrors the existing payments_select policy (has_tenant_access) so anyone
-- who can see a payment can also correct its metadata.

CREATE POLICY payments_update ON payments
  FOR UPDATE
  USING (has_tenant_access(tenant_id))
  WITH CHECK (has_tenant_access(tenant_id));

-- DELETE is intentionally still locked down: deleting a payment is
-- destructive and out of scope for this fix. If it's ever needed, add a
-- separate policy then.
