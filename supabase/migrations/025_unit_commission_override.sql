-- Allow per-unit commission overrides for buildings where the
-- property-level setting doesn't apply uniformly. Example: Bareeq Alshatti
-- has two units — one is covered by the business manager fee, the other
-- pays the standard 9% commission. Without per-unit overrides we'd have to
-- pick one or the other for the whole property.
--
-- When commission_type IS NULL on a unit, the balance calculation
-- (src/lib/owners/balance.ts) falls back to the property-level setting.

ALTER TABLE units
  ADD COLUMN commission_type commission_type,
  ADD COLUMN commission_rate NUMERIC(5, 2)
    CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100));
