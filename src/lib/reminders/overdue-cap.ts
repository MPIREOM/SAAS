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

// PostgREST caps a response at 1000 rows and a request URL at a few KB, so
// id lists are sent in chunks and each chunk is read page by page.
const ID_CHUNK = 150;
const PAGE_SIZE = 1000;

/**
 * Only messages that plausibly reached the tenant count as a notice. A
 * WhatsApp send is logged as "sent" the moment Meta accepts it; if Meta
 * later reports it failed (e.g. #131042, the business account's billing
 * isn't set up), the receipt only flips delivery_status. Counting those
 * would lock tenants out of the retry once the underlying problem is fixed.
 */
const REACHED_TENANT = "delivery_status.is.null,delivery_status.neq.failed";

export type SentRow = { tenant_id: string; sent_at: string | null };

/** Fold logged sends into the notice count for one episode. */
export function summariseHistory(rows: SentRow[], episodeStart: string): OverdueSendHistory {
  const days = new Set<string>();
  let newest: string | null = null;
  for (const r of rows) {
    if (!r.sent_at) continue;
    const day = String(r.sent_at).slice(0, 10);
    if (day < episodeStart) continue;
    days.add(day);
    if (!newest || r.sent_at > newest) newest = r.sent_at;
  }
  return { noticesSent: days.size, lastSentAt: newest ? new Date(newest) : null };
}

/** Stand-in history when the log can't be read: blocks every send. */
export const FAIL_CLOSED_HISTORY: OverdueSendHistory = {
  noticesSent: Number.MAX_SAFE_INTEGER,
  lastSentAt: null,
};

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
  const rows = await loadOverdueSendRows(supabase, [tenantId], episodeStart);
  if (!rows) return FAIL_CLOSED_HISTORY;
  return summariseHistory(rows.get(tenantId) ?? [], episodeStart);
}

/**
 * Overdue notices logged for many tenants since `since`, grouped by tenant,
 * in a handful of queries instead of one per tenant. Summarise each with
 * summariseHistory and that tenant's own episode start. Returns null when
 * the log can't be read, so callers fail closed.
 */
export async function loadOverdueSendRows(
  supabase: SupabaseClient,
  tenantIds: string[],
  since: string
): Promise<Map<string, SentRow[]> | null> {
  const byTenant = new Map<string, SentRow[]>();
  for (let i = 0; i < tenantIds.length; i += ID_CHUNK) {
    const chunk = tenantIds.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("reminder_logs")
        .select("tenant_id, sent_at")
        .in("tenant_id", chunk)
        .eq("reminder_type", "rent_overdue")
        .eq("status", "sent")
        .or(REACHED_TENANT)
        .gte("sent_at", since)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        // Fail closed: if we cannot read the history we must not assume it
        // is empty, or a transient DB error would re-send to everyone at once.
        console.error("[reminders] overdue history query failed:", error.message);
        return null;
      }

      const rows = (data ?? []) as SentRow[];
      for (const r of rows) {
        const list = byTenant.get(r.tenant_id) ?? [];
        list.push(r);
        byTenant.set(r.tenant_id, list);
      }
      if (rows.length < PAGE_SIZE) break;
    }
  }
  return byTenant;
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
