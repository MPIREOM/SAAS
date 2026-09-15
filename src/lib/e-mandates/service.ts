import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { format, startOfMonth } from "date-fns";
import { getProvider, defaultProviderName } from "./provider";
import type { CollectionStatus, MandateProviderName, MandateStatus, ProviderEvent } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// E-mandate service. Every function takes a service-role Supabase client
// because the callers (tenant portal, cron, bank webhook) have no user
// session. Dashboard routes must authorise through RLS *before* calling in.
// ────────────────────────────────────────────────────────────────────────────

export type Admin = SupabaseClient;

export function createAdminClient(): Admin {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const OTP_TTL_MS = 15 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
/** Consecutive failed pulls before we stop trying and flag the mandate. */
const SUSPEND_AFTER_FAILURES = 3;

export interface MandateRow {
  id: string;
  lease_id: string;
  tenant_id: string;
  provider: MandateProviderName;
  status: MandateStatus;
  amount: string | number;
  currency: string;
  collection_day: number;
  start_date: string;
  end_date: string | null;
  debtor_name: string | null;
  debtor_bank_code: string | null;
  debtor_account_masked: string | null;
  provider_mandate_id: string | null;
  provider_reference: string | null;
  provider_status: string | null;
  otp_token: string | null;
  otp_expires_at: string | null;
  otp_attempts: number;
  activated_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionRow {
  id: string;
  mandate_id: string;
  invoice_id: string | null;
  payment_id: string | null;
  amount: string | number;
  currency: string;
  scheduled_date: string;
  status: CollectionStatus;
  provider_collection_id: string | null;
  provider_status: string | null;
  failure_reason: string | null;
  attempts: number;
  submitted_at: string | null;
  settled_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

/** Muscat is UTC+4 with no DST. */
export function omanNow(): Date {
  return new Date(Date.now() + 4 * 60 * 60 * 1000);
}

export function maskAccount(account: string): string {
  const clean = account.replace(/\s+/g, "");
  if (clean.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`;
}

function toNumber(v: string | number | null | undefined): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ── Create ──────────────────────────────────────────────────────────────────

export interface CreateMandateArgs {
  leaseId: string;
  amount?: number | null;
  collectionDay?: number | null;
  debtorName?: string | null;
  debtorAccount: string;
  debtorBankCode?: string | null;
  endDate?: string | null;
  createdBy: string | null;
}

export async function createMandate(admin: Admin, args: CreateMandateArgs): Promise<ServiceResult<MandateRow>> {
  const { data: lease, error: leaseErr } = await admin
    .from("leases")
    .select("id, tenant_id, monthly_rent, payment_due_day, is_active, end_date, units(unit_number, properties(name)), tenants(full_name, phone, national_id)")
    .eq("id", args.leaseId)
    .single();
  if (leaseErr || !lease) return { ok: false, error: "Lease not found", status: 404 };
  if (!lease.is_active) return { ok: false, error: "Lease is not active", status: 400 };

  const tenant = lease.tenants as unknown as { full_name: string; phone: string; national_id: string | null } | null;
  const unit = lease.units as unknown as { unit_number: string; properties: { name: string } | null } | null;
  if (!tenant) return { ok: false, error: "Lease has no tenant", status: 400 };

  const amount = round3(args.amount && args.amount > 0 ? args.amount : toNumber(lease.monthly_rent));
  if (amount <= 0) return { ok: false, error: "Amount must be greater than zero", status: 400 };

  const collectionDay = Math.min(28, Math.max(1, args.collectionDay ?? Number(lease.payment_due_day) ?? 1));
  const account = args.debtorAccount.replace(/\s+/g, "");
  if (account.length < 6) return { ok: false, error: "Account number is too short", status: 400 };

  // Refuse a second live mandate for the same lease before hitting the bank.
  const { data: existing } = await admin
    .from("e_mandates")
    .select("id")
    .eq("lease_id", args.leaseId)
    .in("status", ["pending_otp", "active", "suspended"])
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: false, error: "This lease already has a live mandate", status: 409 };

  const providerName = defaultProviderName();
  const provider = getProvider(providerName);
  if (!provider.isConfigured()) {
    return { ok: false, error: `Provider ${providerName} is not configured`, status: 503 };
  }

  const id = crypto.randomUUID();
  const startDate = format(omanNow(), "yyyy-MM-dd");
  const endDate = args.endDate || (lease.end_date as string | null) || null;
  const description = `Rent — ${unit?.properties?.name ?? "Property"} unit ${unit?.unit_number ?? ""}`.trim();

  const created = await provider.createMandate({
    reference: id,
    amount,
    currency: "OMR",
    collectionDay,
    startDate,
    endDate,
    debtor: {
      name: args.debtorName?.trim() || tenant.full_name,
      phone: tenant.phone,
      accountNumber: account,
      bankCode: args.debtorBankCode ?? null,
      nationalId: tenant.national_id ?? null,
    },
    description,
  });

  if (!created.ok) {
    // Keep a failed row so the attempt is visible in the dashboard.
    await admin.from("e_mandates").insert({
      id,
      lease_id: args.leaseId,
      tenant_id: lease.tenant_id,
      provider: providerName,
      status: "failed",
      amount,
      collection_day: collectionDay,
      start_date: startDate,
      end_date: endDate,
      debtor_name: args.debtorName?.trim() || tenant.full_name,
      debtor_bank_code: args.debtorBankCode ?? null,
      debtor_account_masked: maskAccount(account),
      last_error: created.error,
      created_by: args.createdBy,
    });
    return { ok: false, error: created.error, status: 502 };
  }

  const otpToken = crypto.randomBytes(32).toString("base64url");
  const otpTtl = (created.data.otpTtlSeconds ?? OTP_TTL_MS / 1000) * 1000;
  const status: MandateStatus = created.data.otpRequired ? "pending_otp" : "active";

  const { data: row, error: insErr } = await admin
    .from("e_mandates")
    .insert({
      id,
      lease_id: args.leaseId,
      tenant_id: lease.tenant_id,
      provider: providerName,
      status,
      amount,
      collection_day: collectionDay,
      start_date: startDate,
      end_date: endDate,
      debtor_name: args.debtorName?.trim() || tenant.full_name,
      debtor_bank_code: args.debtorBankCode ?? null,
      debtor_account_masked: maskAccount(account),
      provider_mandate_id: created.data.providerMandateId,
      provider_reference: created.data.providerReference ?? null,
      provider_status: created.data.providerStatus ?? null,
      otp_token: created.data.otpRequired ? otpToken : null,
      otp_expires_at: created.data.otpRequired ? new Date(Date.now() + otpTtl).toISOString() : null,
      activated_at: status === "active" ? new Date().toISOString() : null,
      created_by: args.createdBy,
    })
    .select("*")
    .single();
  if (insErr || !row) return { ok: false, error: insErr?.message ?? "Could not save mandate", status: 500 };
  return { ok: true, data: row as MandateRow };
}

// ── Tenant OTP flow (portal) ────────────────────────────────────────────────

export interface PortalMandateView {
  id: string;
  status: MandateStatus;
  amount: number;
  currency: string;
  collectionDay: number;
  debtorAccountMasked: string | null;
  tenantName: string;
  propertyName: string | null;
  unitNumber: string | null;
  otpExpiresAt: string | null;
  attemptsLeft: number;
}

async function loadByToken(admin: Admin, token: string): Promise<MandateRow | null> {
  if (!token || token.length < 16) return null;
  const { data } = await admin.from("e_mandates").select("*").eq("otp_token", token).maybeSingle();
  return (data as MandateRow | null) ?? null;
}

export async function getMandateForPortal(admin: Admin, token: string): Promise<ServiceResult<PortalMandateView>> {
  const m = await loadByToken(admin, token);
  if (!m) return { ok: false, error: "Invalid or expired link", status: 404 };
  const { data: lease } = await admin
    .from("leases")
    .select("units(unit_number, properties(name)), tenants(full_name)")
    .eq("id", m.lease_id)
    .single();
  const unit = lease?.units as unknown as { unit_number: string; properties: { name: string } | null } | null;
  const tenant = lease?.tenants as unknown as { full_name: string } | null;
  return {
    ok: true,
    data: {
      id: m.id,
      status: m.status,
      amount: toNumber(m.amount),
      currency: m.currency,
      collectionDay: m.collection_day,
      debtorAccountMasked: m.debtor_account_masked,
      tenantName: tenant?.full_name ?? "",
      propertyName: unit?.properties?.name ?? null,
      unitNumber: unit?.unit_number ?? null,
      otpExpiresAt: m.otp_expires_at,
      attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - m.otp_attempts),
    },
  };
}

export async function confirmMandateOtp(admin: Admin, token: string, otp: string): Promise<ServiceResult<{ status: MandateStatus }>> {
  const m = await loadByToken(admin, token);
  if (!m) return { ok: false, error: "Invalid or expired link", status: 404 };
  if (m.status === "active") return { ok: true, data: { status: "active" } };
  if (m.status !== "pending_otp") return { ok: false, error: "This mandate can no longer be confirmed", status: 410 };
  if (m.otp_expires_at && new Date(m.otp_expires_at) < new Date()) {
    return { ok: false, error: "The code has expired. Ask for a new one.", status: 410 };
  }
  if (m.otp_attempts >= OTP_MAX_ATTEMPTS) {
    await admin.from("e_mandates").update({ status: "failed", last_error: "OTP attempts exhausted" }).eq("id", m.id);
    return { ok: false, error: "Too many attempts. Contact your property manager.", status: 423 };
  }
  const clean = otp.replace(/\s+/g, "");
  if (!/^\d{4,8}$/.test(clean)) return { ok: false, error: "Enter the code you received by SMS", status: 400 };

  const provider = getProvider(m.provider);
  const res = await provider.confirmMandate(m.provider_mandate_id ?? "", clean);
  if (!res.ok) {
    const attempts = m.otp_attempts + 1;
    const exhausted = attempts >= OTP_MAX_ATTEMPTS || res.retryable === false;
    await admin
      .from("e_mandates")
      .update({
        otp_attempts: attempts,
        last_error: res.error,
        ...(exhausted ? { status: "failed" } : {}),
      })
      .eq("id", m.id);
    return { ok: false, error: res.error, status: exhausted ? 423 : 400 };
  }

  const nowIso = new Date().toISOString();
  const status = res.data.status;
  await admin
    .from("e_mandates")
    .update({
      status,
      provider_status: res.data.providerStatus ?? null,
      otp_attempts: m.otp_attempts + 1,
      last_error: null,
      ...(status === "active" ? { activated_at: nowIso, otp_token: null, otp_expires_at: null } : {}),
    })
    .eq("id", m.id);
  return { ok: true, data: { status } };
}

export async function resendMandateOtp(admin: Admin, mandateId: string): Promise<ServiceResult<{ otpToken: string }>> {
  const { data } = await admin.from("e_mandates").select("*").eq("id", mandateId).maybeSingle();
  const m = data as MandateRow | null;
  if (!m) return { ok: false, error: "Mandate not found", status: 404 };
  if (m.status !== "pending_otp") return { ok: false, error: "Mandate is not waiting for an OTP", status: 400 };
  const res = await getProvider(m.provider).resendOtp(m.provider_mandate_id ?? "");
  if (!res.ok) return { ok: false, error: res.error, status: 502 };
  const ttl = (res.data.otpTtlSeconds ?? OTP_TTL_MS / 1000) * 1000;
  const otpToken = m.otp_token ?? crypto.randomBytes(32).toString("base64url");
  await admin
    .from("e_mandates")
    .update({ otp_token: otpToken, otp_expires_at: new Date(Date.now() + ttl).toISOString(), otp_attempts: 0, last_error: null })
    .eq("id", m.id);
  return { ok: true, data: { otpToken } };
}

// ── Cancel ──────────────────────────────────────────────────────────────────

export async function cancelMandate(admin: Admin, mandateId: string, reason: string): Promise<ServiceResult<MandateRow>> {
  const { data } = await admin.from("e_mandates").select("*").eq("id", mandateId).maybeSingle();
  const m = data as MandateRow | null;
  if (!m) return { ok: false, error: "Mandate not found", status: 404 };
  if (["cancelled", "failed", "expired"].includes(m.status)) return { ok: true, data: m };

  if (m.provider_mandate_id) {
    const res = await getProvider(m.provider).cancelMandate(m.provider_mandate_id, reason);
    if (!res.ok) return { ok: false, error: res.error, status: 502 };
  }
  const { data: updated } = await admin
    .from("e_mandates")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason, otp_token: null })
    .eq("id", m.id)
    .select("*")
    .single();
  // Withdraw anything not yet sent to the bank.
  await admin
    .from("e_mandate_collections")
    .update({ status: "cancelled" })
    .eq("mandate_id", m.id)
    .eq("status", "scheduled");
  return { ok: true, data: updated as MandateRow };
}

// ── Collections ─────────────────────────────────────────────────────────────

interface InvoiceRow {
  id: string;
  lease_id: string;
  tenant_id: string;
  unit_id: string;
  amount: string | number;
  paid_amount: string | number | null;
  status: string;
  period_start: string | null;
  due_date: string;
}

/** Oldest unpaid rent invoice for the lease, current month first if present. */
async function findInvoiceToCollect(admin: Admin, leaseId: string): Promise<InvoiceRow | null> {
  const { data } = await admin
    .from("invoices")
    .select("id, lease_id, tenant_id, unit_id, amount, paid_amount, status, period_start, due_date")
    .eq("lease_id", leaseId)
    .eq("invoice_type", "rent")
    .in("status", ["pending", "overdue", "partial"])
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as InvoiceRow | null) ?? null;
}

export type CollectOutcome =
  | { outcome: "settled" | "submitted" | "failed"; collectionId: string }
  | { outcome: "skipped"; reason: string };

/**
 * Pull one instalment for a mandate. Picks the oldest unpaid rent invoice,
 * caps the amount at what is still owed, sends the debit and records it.
 */
export async function collectForMandate(admin: Admin, m: MandateRow, scheduledDate: string): Promise<CollectOutcome> {
  if (m.status !== "active") return { outcome: "skipped", reason: `mandate_${m.status}` };
  if (m.end_date && m.end_date < scheduledDate) {
    await admin.from("e_mandates").update({ status: "expired" }).eq("id", m.id);
    return { outcome: "skipped", reason: "mandate_expired" };
  }

  // One pull per mandate per scheduled day.
  const { data: dup } = await admin
    .from("e_mandate_collections")
    .select("id")
    .eq("mandate_id", m.id)
    .eq("scheduled_date", scheduledDate)
    .in("status", ["scheduled", "submitted", "settled"])
    .limit(1)
    .maybeSingle();
  if (dup) return { outcome: "skipped", reason: "already_collected_today" };

  const invoice = await findInvoiceToCollect(admin, m.lease_id);
  if (!invoice) return { outcome: "skipped", reason: "no_unpaid_invoice" };

  const remaining = round3(toNumber(invoice.amount) - toNumber(invoice.paid_amount));
  const amount = round3(Math.min(remaining, toNumber(m.amount)));
  if (amount <= 0) return { outcome: "skipped", reason: "nothing_owed" };

  const { data: col, error: colErr } = await admin
    .from("e_mandate_collections")
    .insert({
      mandate_id: m.id,
      invoice_id: invoice.id,
      amount,
      currency: m.currency,
      scheduled_date: scheduledDate,
      status: "scheduled",
      attempts: 1,
    })
    .select("*")
    .single();
  if (colErr || !col) {
    // Unique index on invoice_id trips when a live pull already exists.
    return { outcome: "skipped", reason: colErr?.code === "23505" ? "invoice_already_in_collection" : (colErr?.message ?? "insert_failed") };
  }
  const collection = col as CollectionRow;

  const res = await getProvider(m.provider).collect({
    providerMandateId: m.provider_mandate_id ?? "",
    reference: collection.id,
    amount,
    currency: m.currency,
    scheduledDate,
    description: `Rent ${invoice.period_start ? format(new Date(invoice.period_start), "MMM yyyy") : ""}`.trim(),
  });

  if (!res.ok) {
    await markCollectionFailed(admin, m, collection, res.error, null);
    return { outcome: "failed", collectionId: collection.id };
  }

  const nowIso = new Date().toISOString();
  if (res.data.status === "failed") {
    await markCollectionFailed(admin, m, { ...collection, provider_collection_id: res.data.providerCollectionId }, res.data.failureReason ?? "Rejected by bank", res.data.providerStatus ?? null);
    return { outcome: "failed", collectionId: collection.id };
  }

  await admin
    .from("e_mandate_collections")
    .update({
      status: "submitted",
      provider_collection_id: res.data.providerCollectionId,
      provider_status: res.data.providerStatus ?? null,
      submitted_at: nowIso,
    })
    .eq("id", collection.id);

  if (res.data.status === "settled") {
    await settleCollection(admin, { ...collection, provider_collection_id: res.data.providerCollectionId, status: "submitted" }, nowIso);
    return { outcome: "settled", collectionId: collection.id };
  }
  return { outcome: "submitted", collectionId: collection.id };
}

async function markCollectionFailed(admin: Admin, m: MandateRow, c: CollectionRow, reason: string, providerStatus: string | null) {
  await admin
    .from("e_mandate_collections")
    .update({
      status: "failed",
      failure_reason: reason,
      provider_status: providerStatus,
      provider_collection_id: c.provider_collection_id,
    })
    .eq("id", c.id);

  const failures = Number(m.metadata?.consecutive_failures ?? 0) + 1;
  const suspend = failures >= SUSPEND_AFTER_FAILURES;
  await admin
    .from("e_mandates")
    .update({
      last_error: reason,
      metadata: { ...(m.metadata ?? {}), consecutive_failures: failures },
      ...(suspend ? { status: "suspended" } : {}),
    })
    .eq("id", m.id);
}

/** Money arrived: create the payment row and mark the invoice paid/partial. */
export async function settleCollection(admin: Admin, c: CollectionRow, settledAtIso: string): Promise<void> {
  if (c.status === "settled") return;
  const { data: m } = await admin.from("e_mandates").select("*").eq("id", c.mandate_id).single();
  const mandate = m as MandateRow;
  const paymentDate = settledAtIso.slice(0, 10);
  const amount = toNumber(c.amount);

  const { data: payment } = await admin
    .from("payments")
    .insert({
      lease_id: mandate.lease_id,
      tenant_id: mandate.tenant_id,
      invoice_id: c.invoice_id,
      amount,
      payment_date: paymentDate,
      method: "direct_debit",
      reference_number: c.provider_collection_id,
      notes: "Collected by bank e-mandate",
      created_by: mandate.created_by,
    })
    .select("id")
    .single();

  if (c.invoice_id) {
    const { data: inv } = await admin
      .from("invoices")
      .select("amount, paid_amount")
      .eq("id", c.invoice_id)
      .single();
    if (inv) {
      const newPaid = round3(toNumber(inv.paid_amount) + amount);
      const fullyPaid = newPaid >= toNumber(inv.amount) - 0.0005;
      await admin
        .from("invoices")
        .update({
          status: fullyPaid ? "paid" : "partial",
          paid_amount: newPaid,
          paid_date: fullyPaid ? paymentDate : null,
          updated_at: settledAtIso,
        })
        .eq("id", c.invoice_id);
    }
  }

  await admin
    .from("e_mandate_collections")
    .update({ status: "settled", settled_at: settledAtIso, payment_id: payment?.id ?? null })
    .eq("id", c.id);

  await admin
    .from("e_mandates")
    .update({ last_error: null, metadata: { ...(mandate.metadata ?? {}), consecutive_failures: 0, last_settled_at: settledAtIso } })
    .eq("id", mandate.id);
}

/** Bank reversed a settled debit: remove the payment and reopen the invoice. */
async function returnCollection(admin: Admin, c: CollectionRow, reason: string | null): Promise<void> {
  if (c.status !== "settled") {
    await admin.from("e_mandate_collections").update({ status: "returned", failure_reason: reason }).eq("id", c.id);
    return;
  }
  const amount = toNumber(c.amount);
  if (c.payment_id) await admin.from("payments").delete().eq("id", c.payment_id);
  if (c.invoice_id) {
    const { data: inv } = await admin.from("invoices").select("amount, paid_amount, due_date").eq("id", c.invoice_id).single();
    if (inv) {
      const newPaid = Math.max(0, round3(toNumber(inv.paid_amount) - amount));
      const today = format(omanNow(), "yyyy-MM-dd");
      const status = newPaid > 0 ? "partial" : (inv.due_date as string) < today ? "overdue" : "pending";
      await admin
        .from("invoices")
        .update({ status, paid_amount: newPaid, paid_date: null, updated_at: new Date().toISOString() })
        .eq("id", c.invoice_id);
    }
  }
  await admin
    .from("e_mandate_collections")
    .update({ status: "returned", failure_reason: reason, payment_id: null })
    .eq("id", c.id);
  await admin.from("e_mandates").update({ last_error: reason ?? "Collection returned by bank" }).eq("id", c.mandate_id);
}

export interface RunSummary {
  date: string;
  due: number;
  settled: number;
  submitted: number;
  failed: number;
  skipped: Record<string, number>;
  polled: number;
}

/** Daily cron body: pull every active mandate whose collection day is today. */
export async function runDueCollections(admin: Admin, now: Date = omanNow()): Promise<RunSummary> {
  const today = format(now, "yyyy-MM-dd");
  // collection_day is capped at 1-28, so every month has exactly one match.
  const day = now.getDate();

  const summary: RunSummary = { date: today, due: 0, settled: 0, submitted: 0, failed: 0, skipped: {}, polled: 0 };

  const { data: mandates } = await admin
    .from("e_mandates")
    .select("*")
    .eq("status", "active")
    .eq("collection_day", day)
    .lte("start_date", today);

  for (const row of (mandates ?? []) as MandateRow[]) {
    summary.due += 1;
    const r = await collectForMandate(admin, row, today);
    if (r.outcome === "skipped") summary.skipped[r.reason] = (summary.skipped[r.reason] ?? 0) + 1;
    else summary[r.outcome] += 1;
  }

  // Poll anything the bank is still processing, in case webhooks never came.
  const { data: pending } = await admin
    .from("e_mandate_collections")
    .select("*")
    .eq("status", "submitted")
    .not("provider_collection_id", "is", null)
    .limit(200);
  for (const c of (pending ?? []) as CollectionRow[]) {
    const { data: m } = await admin.from("e_mandates").select("provider").eq("id", c.mandate_id).single();
    if (!m) continue;
    const res = await getProvider(m.provider as MandateProviderName).getCollectionStatus(c.provider_collection_id!);
    if (!res.ok) continue;
    summary.polled += 1;
    await applyCollectionStatus(admin, c, res.data.status, res.data.failureReason ?? null, res.data.settledAt ?? null, res.data.providerStatus ?? null);
  }

  // Expire OTP links nobody used.
  await admin
    .from("e_mandates")
    .update({ status: "expired", last_error: "OTP link expired" })
    .eq("status", "pending_otp")
    .lt("otp_expires_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  return summary;
}

async function applyCollectionStatus(
  admin: Admin,
  c: CollectionRow,
  status: "submitted" | "settled" | "failed" | "returned",
  reason: string | null,
  settledAt: string | null,
  providerStatus: string | null,
) {
  if (providerStatus && providerStatus !== c.provider_status) {
    await admin.from("e_mandate_collections").update({ provider_status: providerStatus }).eq("id", c.id);
  }
  if (status === "settled" && c.status !== "settled") {
    await settleCollection(admin, c, settledAt ?? new Date().toISOString());
  } else if (status === "failed" && c.status === "submitted") {
    const { data: m } = await admin.from("e_mandates").select("*").eq("id", c.mandate_id).single();
    await markCollectionFailed(admin, m as MandateRow, c, reason ?? "Rejected by bank", providerStatus);
  } else if (status === "returned" && c.status !== "returned") {
    await returnCollection(admin, c, reason);
  }
}

// ── Webhook events ──────────────────────────────────────────────────────────

export async function applyProviderEvents(admin: Admin, providerName: MandateProviderName, events: ProviderEvent[]): Promise<{ applied: number; duplicates: number; unmatched: number }> {
  let applied = 0, duplicates = 0, unmatched = 0;
  for (const ev of events) {
    const eventId = ev.providerEventId ?? crypto.createHash("sha256").update(JSON.stringify(ev)).digest("hex");
    const { error: dupErr } = await admin.from("e_mandate_events").insert({
      provider: providerName,
      provider_event_id: eventId,
      event_type: `${ev.kind}.${ev.status}`,
      payload: ev,
    });
    if (dupErr?.code === "23505") { duplicates += 1; continue; }

    try {
      if (ev.kind === "collection") {
        const { data } = await admin.from("e_mandate_collections").select("*").eq("provider_collection_id", ev.providerCollectionId).maybeSingle();
        if (!data) { unmatched += 1; continue; }
        const c = data as CollectionRow;
        await applyCollectionStatus(admin, c, ev.status, ev.reason ?? null, ev.settledAt ?? null, ev.providerStatus ?? null);
        await admin.from("e_mandate_events").update({ processed: true, collection_id: c.id, mandate_id: c.mandate_id }).eq("provider", providerName).eq("provider_event_id", eventId);
      } else {
        const { data } = await admin.from("e_mandates").select("*").eq("provider_mandate_id", ev.providerMandateId).maybeSingle();
        if (!data) { unmatched += 1; continue; }
        const m = data as MandateRow;
        const patch: Record<string, unknown> = { provider_status: ev.providerStatus ?? null };
        if (ev.status === "active" && m.status === "pending_otp") {
          Object.assign(patch, { status: "active", activated_at: new Date().toISOString(), otp_token: null, otp_expires_at: null });
        } else if (ev.status !== "active" && !["cancelled"].includes(m.status)) {
          Object.assign(patch, { status: ev.status, last_error: ev.reason ?? null, ...(ev.status === "cancelled" ? { cancelled_at: new Date().toISOString(), cancel_reason: ev.reason ?? "Cancelled by bank" } : {}) });
        }
        await admin.from("e_mandates").update(patch).eq("id", m.id);
        await admin.from("e_mandate_events").update({ processed: true, mandate_id: m.id }).eq("provider", providerName).eq("provider_event_id", eventId);
      }
      applied += 1;
    } catch (err) {
      await admin.from("e_mandate_events").update({ error_message: err instanceof Error ? err.message : String(err) }).eq("provider", providerName).eq("provider_event_id", eventId);
    }
  }
  return { applied, duplicates, unmatched };
}

// ── Read helpers for the dashboard ──────────────────────────────────────────

export async function listMandatesForTenant(client: SupabaseClient, tenantId: string): Promise<{ mandates: MandateRow[]; collections: CollectionRow[] }> {
  const { data: mandates } = await client
    .from("e_mandates")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  const ids = (mandates ?? []).map((m) => m.id as string);
  const { data: collections } = ids.length
    ? await client.from("e_mandate_collections").select("*").in("mandate_id", ids).order("scheduled_date", { ascending: false }).limit(60)
    : { data: [] };
  return { mandates: (mandates ?? []) as MandateRow[], collections: (collections ?? []) as CollectionRow[] };
}

export function currentPeriodStart(now: Date = omanNow()): string {
  return format(startOfMonth(now), "yyyy-MM-dd");
}
