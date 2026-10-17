-- 052_unit_utility_meters.sql
--
-- Electricity and water meter numbers belong to the apartment (the meters
-- stay with it), so they live on the unit and are reused for every tenant.
-- They are printed on the tenant's building-rules agreement (051).

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS electricity_meter_no TEXT,
  ADD COLUMN IF NOT EXISTS water_meter_no TEXT;
