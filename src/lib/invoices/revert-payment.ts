import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared logic for undoing a recorded payment on an invoice.
 *
 * Used by the web "Return to unpaid" / "Cancel invoice" dialogs (browser
 * client, subject to RLS) and by the WhatsApp agent (service-role client).
 * Both paths must behave identically, so keep every mutation in here.
 *
 * What "undo" means:
 *   - the selected payment rows are deleted (the owner ledger is derived
 *     from payments on read, so leaving them would keep the money on the
 *     books against nothing);
 *   - cheques this invoice retired when it was marked paid go back to
 *     "pending" when the invoice returns to unpaid (they are left as-is
 *     when the invoice is cancelled — nothing is due any more);
 *   - the invoice itself goes back to pending/overdue with paid_amount 0,
 *     or straight to cancelled.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

export interface InvoiceForRevert {
  id: string;
  lease_id: string;
  tenant_id: string;
  status: string;
  amount: string | number;
  paid_amount: string | number | null;
  paid_date: string | null;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
}

export interface InvoicePaymentCandidate {
  id: string;
  amount: number;
  method: string | null;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  /** true when payments.invoice_id points at this invoice (exact match). */
  linked: boolean;
}

export const INVOICE_REVERT_SELECT =
  "id, lease_id, tenant_id, status, amount, paid_amount, paid_date, due_date, period_start, period_end, notes";

export function isRevertableStatus(status: string): boolean {
  return status === "paid" || status === "partial";
}

function shiftDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Find the payments that settled this invoice.
 *
 * Exact matches (payments.invoice_id = invoice.id) win. When there are none
 * — payments recorded before the FK existed — fall back to unlinked payments
 * on the same lease whose payment_date sits inside the invoice period (or
 * within 45 days before the paid date). Those are flagged `linked: false`
 * so callers can ask the user to confirm before deleting.
 */
export async function findInvoicePayments(
  supabase: AnySupabase,
  invoice: InvoiceForRevert,
): Promise<InvoicePaymentCandidate[]> {
  const select =
    "id, amount, method, payment_date, reference_number, notes, invoice_id";

  const { data: linked } = await supabase
    .from("payments")
    .select(select)
    .eq("invoice_id", invoice.id)
    .order("payment_date", { ascending: false });

  if (linked && linked.length > 0) {
    return linked.map((p: Record<string, unknown>) => toCandidate(p, true));
  }

  if (Number(invoice.paid_amount || 0) <= 0) return [];

  const upper =
    invoice.status === "paid" && invoice.paid_date
      ? invoice.paid_date
      : new Date().toISOString().slice(0, 10);
  const lower =
    invoice.period_start ||
    (invoice.paid_date ? shiftDays(invoice.paid_date, -45) : null);

  let query = supabase
    .from("payments")
    .select(select)
    .eq("lease_id", invoice.lease_id)
    .is("invoice_id", null)
    .lte("payment_date", upper)
    .order("payment_date", { ascending: false });
  if (lower) query = query.gte("payment_date", lower);

  const { data: inferred } = await query;
  return (inferred || []).map((p: Record<string, unknown>) =>
    toCandidate(p, false),
  );
}

function toCandidate(
  p: Record<string, unknown>,
  linked: boolean,
): InvoicePaymentCandidate {
  return {
    id: p.id as string,
    amount: Number(p.amount || 0),
    method: (p.method as string | null) ?? null,
    payment_date: p.payment_date as string,
    reference_number: (p.reference_number as string | null) ?? null,
    notes: (p.notes as string | null) ?? null,
    linked,
  };
}

export interface RevertInvoiceOptions {
  invoice: InvoiceForRevert;
  /** Payment rows to delete. Pass [] to keep every payment record. */
  paymentIds: string[];
  /** "unpaid" → back to pending/overdue. "cancelled" → void the invoice. */
  target: "unpaid" | "cancelled";
  /** Free-text reason appended to the invoice notes. */
  reason?: string;
  /** ISO date used to decide pending vs overdue. Defaults to today (UTC). */
  today?: string;
}

export interface RevertInvoiceResult {
  ok: boolean;
  error?: string;
  new_status: string;
  deleted_payment_ids: string[];
  reopened_cheque_count: number;
}

export function unpaidStatusFor(dueDate: string, today: string): "pending" | "overdue" {
  return dueDate && dueDate < today ? "overdue" : "pending";
}

export async function revertInvoicePayment(
  supabase: AnySupabase,
  opts: RevertInvoiceOptions,
): Promise<RevertInvoiceResult> {
  const { invoice, target } = opts;
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const newStatus =
    target === "cancelled"
      ? "cancelled"
      : unpaidStatusFor(invoice.due_date, today);

  const result: RevertInvoiceResult = {
    ok: false,
    new_status: newStatus,
    deleted_payment_ids: [],
    reopened_cheque_count: 0,
  };

  // 1. Delete the selected payments. Scoped to the invoice's lease so a
  //    stray id from another tenant can never be removed by accident.
  const paymentIds = Array.from(new Set(opts.paymentIds.filter(Boolean)));
  if (paymentIds.length > 0) {
    const { data: deleted, error } = await supabase
      .from("payments")
      .delete()
      .in("id", paymentIds)
      .eq("lease_id", invoice.lease_id)
      .select("id");
    if (error) return { ...result, error: error.message };
    result.deleted_payment_ids = (deleted || []).map(
      (p: Record<string, unknown>) => p.id as string,
    );
    if (result.deleted_payment_ids.length !== paymentIds.length) {
      return {
        ...result,
        error:
          "Some payments could not be deleted (not found, or you do not have permission).",
      };
    }
  }

  // 2. Re-open the cheques this invoice retired. Only when going back to
  //    unpaid — a cancelled invoice has nothing left to collect.
  if (target === "unpaid") {
    const { data: reopened } = await supabase
      .from("cheques")
      .update({ status: "pending", payment_id: null, updated_at: nowIso })
      .eq("invoice_id", invoice.id)
      .in("status", ["cleared", "cancelled"])
      .select("id");
    result.reopened_cheque_count = reopened?.length ?? 0;
  }

  // 3. Reset the invoice.
  const reasonNote =
    target === "cancelled"
      ? opts.reason
        ? `Cancelled: ${opts.reason}`
        : "Cancelled after payment was reverted"
      : opts.reason
        ? `Payment reverted: ${opts.reason}`
        : "Payment reverted";

  const { error: invError } = await supabase
    .from("invoices")
    .update({
      status: newStatus,
      paid_amount: 0,
      paid_date: null,
      notes: reasonNote,
      updated_at: nowIso,
    })
    .eq("id", invoice.id);
  if (invError) return { ...result, error: invError.message };

  return { ...result, ok: true };
}
