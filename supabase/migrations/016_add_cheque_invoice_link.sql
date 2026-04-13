-- Link cheques to invoices so the daily briefing can skip cheques
-- whose invoice was already settled by another method (e.g. bank transfer).

ALTER TABLE cheques
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cheques_invoice_id ON cheques (invoice_id);

-- Backfill: link each unlinked cheque to its invoice when tenant + cheque_date
-- falls inside exactly one invoice's period. Ambiguous matches are left null
-- and resolved going forward by the mark-paid flow.
WITH candidates AS (
  SELECT c.id AS cheque_id, i.id AS invoice_id
  FROM cheques c
  JOIN invoices i
    ON c.tenant_id = i.tenant_id
   AND i.period_start IS NOT NULL
   AND i.period_end   IS NOT NULL
   AND c.cheque_date BETWEEN i.period_start AND i.period_end
  WHERE c.invoice_id IS NULL
),
counts AS (
  SELECT cheque_id, COUNT(*) AS n FROM candidates GROUP BY cheque_id
)
UPDATE cheques c
SET invoice_id = cand.invoice_id
FROM candidates cand
JOIN counts ct ON ct.cheque_id = cand.cheque_id
WHERE c.id = cand.cheque_id AND ct.n = 1;

-- One-time cleanup: any pending cheque whose linked invoice is already
-- resolved should be cancelled so it stops appearing on the daily briefing.
UPDATE cheques c
SET status = 'cancelled', updated_at = now()
FROM invoices i
WHERE c.status = 'pending'
  AND c.invoice_id = i.id
  AND i.status IN ('paid', 'cancelled');
