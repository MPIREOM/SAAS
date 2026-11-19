// Schedule of the technician's job reminders (migration 057, cron
// maintenance-reminders). Kept apart from the senders so the job page, the
// staff API and the cron agree on when the next reminder is due.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days between reminders: not started yet, and started but not finished. */
export const REMINDER_INTERVAL_DAYS = { open: 2, in_progress: 3 } as const;

export type ReminderStage = keyof typeof REMINDER_INTERVAL_DAYS;

/** The admins are told a job is stuck when this many reminders went unanswered in one stage. */
export const STUCK_AFTER_REMINDERS = 3;

/** When the next reminder is due for a job that entered `stage`, or was reminded, at `from`. */
export function nextReminderAt(stage: ReminderStage, from: Date = new Date()): string {
  return new Date(from.getTime() + REMINDER_INTERVAL_DAYS[stage] * DAY_MS).toISOString();
}

/**
 * Fields that restart the reminder schedule when a job changes stage. Other
 * statuses (resolved, closed) get no reminders, so nothing is scheduled.
 */
export function reminderReset(status: string, from: Date = new Date()) {
  const stage = status === "open" || status === "in_progress" ? status : null;
  return {
    technician_next_reminder_at: stage ? nextReminderAt(stage, from) : null,
    technician_reminder_count: 0,
  };
}

export interface ReminderCandidate {
  status: string;
  created_at: string;
  technician_started_at: string | null;
  technician_done_at: string | null;
  technician_next_reminder_at: string | null;
}

/** The stage a job is reminded in, or null when it needs no reminder. */
export function reminderStage(job: ReminderCandidate): ReminderStage | null {
  if (job.status === "open") return "open";
  if (job.status === "in_progress" && !job.technician_done_at) return "in_progress";
  return null;
}

/**
 * When a job's next reminder is due. Jobs never scheduled (created before
 * the schedule existed, or by a path that doesn't set it) count from when
 * they were created or started.
 */
export function reminderDueAt(job: ReminderCandidate, stage: ReminderStage): Date {
  if (job.technician_next_reminder_at) return new Date(job.technician_next_reminder_at);
  const since = stage === "in_progress" ? (job.technician_started_at ?? job.created_at) : job.created_at;
  return new Date(nextReminderAt(stage, new Date(since)));
}

/**
 * The cron runs once a morning, so "due" means due some time today (Muscat,
 * UTC+4): a reminder sent at 08:30 is due again on the morning two days
 * later, not a day late because that run started a few seconds earlier.
 */
export function isReminderDue(dueAt: Date, now: Date = new Date()): boolean {
  const muscat = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const endOfMuscatDay = Date.UTC(muscat.getUTCFullYear(), muscat.getUTCMonth(), muscat.getUTCDate() + 1) - 4 * 60 * 60 * 1000;
  return dueAt.getTime() < endOfMuscatDay;
}
