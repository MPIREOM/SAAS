-- Cap overdue-rent reminders per tenant.
--
-- Until now an overdue tenant was chased every `repeat_interval_days` for as
-- long as any invoice stayed unpaid — for months, in practice. Repeated
-- unsolicited notices are the usual trigger for WhatsApp recipients to report
-- a business number, and the MPIRE number was banned in September 2026.
--
-- max_repeats: notices per newly overdue invoice (NULL = default 3 in code).
-- The code also enforces a floor of 3 days on repeat_interval_days.

ALTER TABLE reminder_settings
  ADD COLUMN IF NOT EXISTS max_repeats INTEGER
    CHECK (max_repeats IS NULL OR (max_repeats >= 1 AND max_repeats <= 20));

COMMENT ON COLUMN reminder_settings.max_repeats IS
  'Overdue reminders: maximum notices per newly overdue invoice. NULL = default (3).';

-- Slow the live schedule down: at most 3 notices, one per week.
UPDATE reminder_settings
SET
  repeat_interval_days = GREATEST(COALESCE(repeat_interval_days, 7), 7),
  max_repeats = COALESCE(max_repeats, 3),
  updated_at = now()
WHERE reminder_type = 'rent_overdue';
