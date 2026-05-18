-- Allow invoices without a billing period
--
-- Move-out invoices (invoice_type = 'move_out') cover one-off fees such as
-- cleaning, painting, and early-termination charges. They do not span a
-- rent period, so period_start / period_end have no meaningful value.
-- The columns were originally NOT NULL for rent invoices; relax that so
-- move-out invoices can be inserted without a period.

ALTER TABLE invoices ALTER COLUMN period_start DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN period_end DROP NOT NULL;
