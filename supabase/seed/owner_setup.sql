-- ─────────────────────────────────────────────────────────────────────
-- Owner setup — Option A (opening balance only, clean slate forward)
-- ─────────────────────────────────────────────────────────────────────
--
-- Run this AFTER migration 024_owner_ledger.sql has been applied.
-- Replace the placeholders marked with <<< … >>> before running.
-- Safe to re-run: every statement is guarded so it won't double-insert.
--
-- Source for the opening balance: the latest "Pending Amount to MPIRE"
-- snapshot in `public/weekly expenses report DATA.xlsx` shows the owner
-- owing the company 3,922.60 OMR as of 2026-05-01. With our sign
-- convention (positive = company owes owner, negative = owner owes
-- company), that becomes -3922.60.
--
-- If the snapshot has changed since this file was written, edit the
-- amount and date below.

-- ── 1. Create the owner ─────────────────────────────────────────────
INSERT INTO owners (
  name,
  whatsapp_phone,
  email,
  language_preference,
  opening_balance,
  opening_balance_date,
  notes,
  is_active
)
VALUES (
  '<<< OWNER FULL NAME >>>',         -- e.g. 'Ahmed Al-Balushi'
  NULL,                              -- e.g. '96891234567' (digits only, no +). Leave NULL if owner doesn't get WhatsApp.
  NULL,                              -- email, optional
  'en',                              -- 'en' or 'ar'
  -3922.60,                          -- opening balance: negative = owner owes company
  '2026-05-01',                      -- opening balance date
  'Imported from weekly expenses report DATA.xlsx (latest Pending Amount to MPIRE snapshot, 2026-05-01)',
  true
)
ON CONFLICT DO NOTHING;

-- ── 2. Sanity-check ─────────────────────────────────────────────────
SELECT id, name, opening_balance, opening_balance_date FROM owners;

-- ── 3. Link existing properties to this owner ──────────────────────
-- Uncomment and run AFTER you've reviewed the list. By default this
-- assigns ALL properties to the single active owner. If you have
-- multiple owners, list properties explicitly by name instead.

-- UPDATE properties
-- SET owner_id = (SELECT id FROM owners WHERE is_active = true LIMIT 1)
-- WHERE owner_id IS NULL;

-- ── 4. Configure commission per property ───────────────────────────
-- For each property, set ONE of:
--   - commission_type = 'percentage'              + commission_rate = 9
--     (9% of every rent payment; applies to cash, transfer, AND cheque)
--   - commission_type = 'included_in_business_fee'
--     (no per-property commission; the flat 1,500 OMR/month covers it)
--   - commission_type = 'none'
--     (this property pays no commission at all)
--
-- Example shape — fill in real names and the right type per property:

-- UPDATE properties SET commission_type = 'percentage', commission_rate = 9
--   WHERE name ILIKE 'Bareeq%';
-- UPDATE properties SET commission_type = 'included_in_business_fee', commission_rate = 0
--   WHERE name IN ('Property A', 'Property B', 'Property C');
-- UPDATE properties SET commission_type = 'none', commission_rate = 0
--   WHERE name = 'Family-owned Building';

-- ── 5. Verify ──────────────────────────────────────────────────────
-- SELECT name, commission_type, commission_rate FROM properties ORDER BY name;
