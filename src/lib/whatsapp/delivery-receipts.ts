import type { SupabaseClient } from "@supabase/supabase-js";

// WhatsApp delivery receipts for reminders.
//
// Meta reports each outbound message's progress (sent → delivered → read, or
// failed) through the `statuses` array of the messages webhook. Matching
// those receipts back to reminder_logs.provider_message_id gives the closest
// signal WhatsApp offers that a tenant blocked the number or is unreachable:
// a message that stays at "sent" for days, or fails outright. WhatsApp never
// says who blocked or reported a number; this is the best available proxy.

export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

/** Receipts only ever move a row forward; a late "sent" must not undo "delivered". */
const RANK: Record<DeliveryStatus, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

export function isDeliveryStatus(s: unknown): s is DeliveryStatus {
  return s === "sent" || s === "delivered" || s === "read" || s === "failed";
}

export interface WhatsAppStatusReceipt {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{
    code?: number;
    title?: string;
    message?: string;
    error_data?: { details?: string };
  }>;
}

function receiptTime(r: WhatsAppStatusReceipt): string {
  const ts = Number(r.timestamp);
  return Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString();
}

function receiptError(r: WhatsAppStatusReceipt): string {
  const e = r.errors?.[0];
  const text =
    [e?.title, e?.message, e?.error_data?.details]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(" — ") || "Delivery failed";
  return e?.code ? `(#${e.code}) ${text}` : text;
}

/**
 * Apply a batch of status receipts to reminder_logs. Receipts for messages
 * we did not log (agent replies, hotel messages relayed from SAMA-CRM) are
 * ignored. Never throws — the webhook must always ACK.
 */
export async function applyDeliveryReceipts(
  supabase: SupabaseClient,
  receipts: WhatsAppStatusReceipt[]
): Promise<{ matched: number; updated: number }> {
  const valid = receipts.filter((r) => typeof r.id === "string" && r.id && isDeliveryStatus(r.status));
  if (valid.length === 0) return { matched: 0, updated: 0 };

  const ids = Array.from(new Set(valid.map((r) => r.id as string)));
  const { data: rows, error } = await supabase
    .from("reminder_logs")
    .select("id, provider_message_id, delivery_status")
    .in("provider_message_id", ids);
  if (error) {
    console.error("[WhatsApp Webhook] receipt lookup failed:", error.message);
    return { matched: 0, updated: 0 };
  }
  const byMessage = new Map<string, { id: string; delivery_status: DeliveryStatus | null }>();
  for (const row of (rows ?? []) as Array<{ id: string; provider_message_id: string; delivery_status: DeliveryStatus | null }>) {
    byMessage.set(row.provider_message_id, { id: row.id, delivery_status: row.delivery_status });
  }

  let updated = 0;
  for (const r of valid) {
    const row = byMessage.get(r.id as string);
    if (!row) continue;
    const next = r.status as DeliveryStatus;
    const current = row.delivery_status;
    if (current && RANK[current] >= RANK[next]) continue;

    const patch: Record<string, unknown> = { delivery_status: next };
    if (next === "delivered") patch.delivered_at = receiptTime(r);
    if (next === "read") {
      patch.read_at = receiptTime(r);
      // A read receipt implies delivery even if that receipt was never seen.
      patch.delivered_at = patch.delivered_at ?? receiptTime(r);
    }
    if (next === "failed") patch.delivery_error = receiptError(r);

    const { error: updErr } = await supabase.from("reminder_logs").update(patch).eq("id", row.id);
    if (updErr) {
      console.error("[WhatsApp Webhook] receipt update failed:", updErr.message);
      continue;
    }
    row.delivery_status = next;
    updated++;
  }
  return { matched: byMessage.size, updated };
}

/** How long a message may sit at "sent" before it counts as undelivered. */
export const UNDELIVERED_AFTER_HOURS = 48;

export interface UndeliveredTenant {
  tenantId: string;
  tenantName: string;
  phone: string | null;
  /** Consecutive undelivered/failed WhatsApp reminders, newest first. */
  attempts: number;
  lastSentAt: string;
  lastStatus: DeliveryStatus;
  lastError: string | null;
}

/**
 * Tenants whose most recent WhatsApp reminder never reached them: failed,
 * or still "sent" after UNDELIVERED_AFTER_HOURS. Looks back `days` days.
 * Rows without a provider_message_id predate receipt tracking and are
 * ignored. A tenant whose latest reminder was delivered is not listed even
 * if an earlier one was not.
 */
export async function findUndeliveredTenants(
  supabase: SupabaseClient,
  opts: { days?: number; tenantIds?: string[] | null; now?: Date } = {}
): Promise<UndeliveredTenant[]> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - (opts.days ?? 30) * 24 * 60 * 60 * 1000).toISOString();
  const cutoff = new Date(now.getTime() - UNDELIVERED_AFTER_HOURS * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("reminder_logs")
    .select("tenant_id, sent_at, delivery_status, delivery_error, tenants:tenant_id(full_name, phone)")
    .eq("channel", "whatsapp")
    .eq("status", "sent")
    .not("provider_message_id", "is", null)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false });
  if (opts.tenantIds) {
    query = query.in("tenant_id", opts.tenantIds.length > 0 ? opts.tenantIds : ["__no_access__"]);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[reminders] undelivered query failed:", error.message);
    return [];
  }

  type Row = {
    tenant_id: string;
    sent_at: string | null;
    delivery_status: DeliveryStatus | null;
    delivery_error: string | null;
    tenants: { full_name?: string | null; phone?: string | null } | { full_name?: string | null; phone?: string | null }[] | null;
  };
  const isUndelivered = (r: Row) =>
    r.delivery_status === "failed" ||
    (r.delivery_status === "sent" && !!r.sent_at && r.sent_at < cutoff);

  const result = new Map<string, UndeliveredTenant>();
  const settled = new Set<string>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (settled.has(r.tenant_id)) continue;
    // Newest row decides; a recent message still within the grace window
    // neither confirms nor clears the tenant, so skip it and look further back.
    if (r.delivery_status === "sent" && r.sent_at && r.sent_at >= cutoff) continue;
    if (!isUndelivered(r)) {
      // A delivered/read row ends the streak. Rows are newest first, so an
      // entry already present means the newest decisive attempt was
      // undelivered and stays listed; the older success just stops counting.
      settled.add(r.tenant_id);
      continue;
    }
    const existing = result.get(r.tenant_id);
    if (existing) {
      existing.attempts++;
      continue;
    }
    const t = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
    result.set(r.tenant_id, {
      tenantId: r.tenant_id,
      tenantName: t?.full_name || "—",
      phone: t?.phone ?? null,
      attempts: 1,
      lastSentAt: r.sent_at as string,
      lastStatus: r.delivery_status as DeliveryStatus,
      lastError: r.delivery_error ?? null,
    });
  }
  return Array.from(result.values()).sort((a, b) => b.attempts - a.attempts || (a.lastSentAt < b.lastSentAt ? 1 : -1));
}
