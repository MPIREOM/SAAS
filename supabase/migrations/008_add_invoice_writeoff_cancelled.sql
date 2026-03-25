-- Add "written_off" and "cancelled" to the invoice_status enum
-- These statuses handle invoices when tenants move out:
--   cancelled: Invoice voided (e.g., for periods after vacate date)
--   written_off: Debt deemed uncollectable, preserved for accounting

ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'written_off';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'cancelled';
