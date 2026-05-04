-- When the owner ledger is rolled out mid-cycle, the prior reconciled
-- opening_balance often already absorbs rent that was deposited earlier
-- in the current month. Without a way to express that, those payments get
-- counted twice — once via the opening balance, once again via the
-- payments walk in getOwnerBalance.
--
-- Add an optional `rent_excluded_until` cutoff that is independent of
-- opening_balance_date. When set, cash + bank_transfer payments on or
-- before this date are skipped from the balance (they're considered
-- already absorbed into the opening balance). Commission and expenses
-- still use opening_balance_date, so they continue to count for the
-- same period — which is what the bookkeeper wants when commission
-- hasn't been settled yet but bank deposits already have.

ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS rent_excluded_until DATE;

COMMENT ON COLUMN owners.rent_excluded_until IS
  'Inclusive cutoff for rent already absorbed into opening_balance. Cash and bank_transfer payments with payment_date <= this date are skipped from the running balance. NULL means "no exclusion" (the default).';
