-- Migration: Track cron invocations so we can audit missed runs
--
-- The admin daily briefing (and other crons) had zero visibility when
-- Vercel's dispatcher missed a fire window — the next morning the user
-- simply didn't receive their summary and there was no trail to inspect.
-- This table records each cron run with enough context to (a) confirm the
-- function was invoked, and (b) let the morning reminders cron detect a
-- missed admin-summary and trigger it as a fallback.

CREATE TABLE cron_run_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('success', 'skipped', 'error')),
  summary JSONB,
  error_message TEXT
);

CREATE INDEX idx_cron_run_logs_name_time ON cron_run_logs (cron_name, ran_at DESC);
