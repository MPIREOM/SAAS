-- Auto-invoice settings (single-row config table)
CREATE TABLE IF NOT EXISTS invoice_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auto_generate_enabled BOOLEAN NOT NULL DEFAULT true,
  days_before_due INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Insert default row
INSERT INTO invoice_settings (auto_generate_enabled, days_before_due)
VALUES (true, 0);

-- RLS
ALTER TABLE invoice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read invoice_settings"
  ON invoice_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update invoice_settings"
  ON invoice_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
