-- Remove passport number from tenants table
ALTER TABLE tenants DROP COLUMN IF EXISTS passport_number;