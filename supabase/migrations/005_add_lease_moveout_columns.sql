-- Add move-out metadata columns to leases table
ALTER TABLE leases ADD COLUMN IF NOT EXISTS vacate_date DATE;
ALTER TABLE leases ADD COLUMN IF NOT EXISTS vacate_reason TEXT;
ALTER TABLE leases ADD COLUMN IF NOT EXISTS vacate_notes TEXT;
ALTER TABLE leases ADD COLUMN IF NOT EXISTS final_inspection BOOLEAN DEFAULT false;
ALTER TABLE leases ADD COLUMN IF NOT EXISTS keys_returned BOOLEAN DEFAULT false;

-- Deposit status enum and column
DO $$ BEGIN
  CREATE TYPE deposit_status AS ENUM ('pending', 'refunded', 'deducted');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE leases ADD COLUMN IF NOT EXISTS deposit_status deposit_status DEFAULT 'pending';

-- Index for quick lookup of archived tenants with move-out data
CREATE INDEX IF NOT EXISTS idx_leases_vacate_date ON leases (vacate_date) WHERE vacate_date IS NOT NULL;
