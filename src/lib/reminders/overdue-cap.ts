import type { SupabaseClient } from "@supabase/supabase-js";
import { differenceInCalendarDays } from "date-fns";

// Guard rails for overdue-rent reminders.
//
// Chasing the same tenant every day, indefinitely, is exactly the pattern
// that gets a WhatsApp business number reported and banned — which is what
// took the MPIRE number offline in September 2026. Both the daily cron and
// the manual "Send reminders" button run every overdue send through this
// module so a tenant is contacted at most `max_repeats` times per newly
// overdue invoice, never more often than every MIN_OVERDUE_REPEAT_DAYS days.

/** Hard floor on how often one tenant may be chased, whatever the setting says. */
export const MIN_OVERDUE_REPEAT_DAYS = 3;
/** Notices per overdue episode when `reminder_settings.max_repeats` is unset. */
export const DEFAULT_OVERDUE_MAX_REPEATS = 3;
/** Upper bound accepted from the settings UI. */
export const MAX_OVERDUE_MAX_REPEATS = 20;

export interface OverdueCapSetting {
  repeat_interval_days: number | null;
  max_repeats?: number | null;
}

/** Configured repeat interval, clamped to the floor. */
export function effectiveOverdueInterval(setting: OverdueCapSetting): number {
  const configured = setting.repeat_interval_days ?? MIN_OVERDUE_REPEAT_DAYS;
  return Math.max(configured, MIN_OVERDUE_REPEAT_DAYS);
}

/** Configured cap, defaulting when unset. */
export function effectiveOverdueMaxRepeats(setting: OverdueCapSetting): number {
  const configured = setting.max_repeats;
  if (configured == null || configured < 1) return DEFAULT_OVERDUE_MAX_REPEATS;
  return Math.min(configured, MAX_OVERDUE_MAX_REPEATS);
}

export interface OverdueSendHistory {
  /** Distinct days on which an overdue notice went out during this episode. */
  noticesSent: number;
  lastSentAt: Date | null;
}

/**
 * How many overdue notices this tenant has already received since
 * `episodeStart` (ISO date, YYYY-MM-DD). Pass the due date of the tenant's
 * most recent overdue invoice: each invoice that goes overdue opens a new
 * episode and earns at most `max_repeats` notices, after which the tenant
 * is left alone until the next invoice falls overdue.
 *
 * WhatsApp and email sends are logged as separate rows at the same moment,
 * so notices are counted per calendar day rather than per row.
 */
export async function loadOverdueSendHistory(
  supabase: SupabaseClient,
  tenantId: string,
  episodeStart: string
): Promise<OverdueSendHistory> {
  const { data, error } = await supabase
    .from("reminder_logs")
    .select("sent_at")
    .eq("tenant_id", tenantId)
    .eq("reminder_type", "rent_overdue")
    .eq("status", "sent")
    .gte("sent_at", episodeStart)
    .order("sent_at", { ascending: false });

  if (error) {
    // Fail closed: if we cannot read the history we must not assume it is
    // empty, or a transient DB error would re-send to everyone at once.
    console.error("[reminders] overdue history query failed:", error.message);
    return { noticesSent: Number.MAX_SAFE_INTEGER, lastSentAt: null };
  }

  const rows = (data ?? []) as Array<{ sent_at: string | null }>;
  const days = new Set<string>();
  for (const r of rows) {
    if (r.sent_at) days.add(String(r.sent_at).slice(0, 10));
  }
  const newest = rows.find((r) => r.sent_at)?.sent_at ?? null;
  return { noticesSent: days.size, lastSentAt: newest ? new Date(newest) : null };
}

export type OverdueSendDecision =
  | { send: true }
  | { send: false; reason: "cap_reached" | "too_soon" };

export function decideOverdueSend(
  setting: OverdueCapSetting,
  history: OverdueSendHistory,
  now: Date
): OverdueSendDecision {
  if (history.noticesSent >= effectiveOverdueMaxRepeats(setting)) {
    return { send: false, reason: "cap_reached" };
  }
  if (
    history.lastSentAt &&
    differenceInCalendarDays(now, history.lastSentAt) < effectiveOverdueInterval(setting)
  ) {
    return { send: false, reason: "too_soon" };
  }
  return { send: true };
}
