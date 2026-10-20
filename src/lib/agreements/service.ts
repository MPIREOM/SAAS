import { randomBytes } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TenantRecipient } from "@/lib/maintenance/whatsapp";
import { buildReminderEmailHtml, sendEmail } from "@/lib/email/client";
import { renderAgreementPdf, type AgreementPdfData } from "./pdf";
import { DEFAULT_GATE_KEYS, GARBAGE_VIOLATION_FEE, LOST_KEY_FEE } from "./terms";
import { alertIfGateKeysLow } from "@/lib/gate-keys/stock";
import {
  agreementLink,
  sendAgreementWhatsApp,
  sendViolationNotice,
  tenantLang,
  type AgreementMessageKind,
} from "./whatsapp";

// Server-side logic for the building-rules agreement and violation fees.
// Callers pass the Supabase client: the service role for the public signing
// page, the cron and the WhatsApp agent; the user's RLS client for staff
// routes (so staff only reach their own properties).

/** Service-role client for the public signing page and the cron (bypasses RLS). */
export function createAgreementsAdminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Reminders go out this long after the previous message, at most MAX_REMINDERS times. */
export const REMINDER_INTERVAL_HOURS = [24, 48];
export const MAX_REMINDERS = REMINDER_INTERVAL_HOURS.length;

export interface AgreementRow {
  id: string;
  tenant_id: string;
  unit_id: string;
  lease_id: string | null;
  reference: string;
  token: string;
  status: "pending" | "signed" | "cancelled";
  gate_keys: number;
  garbage_fee: number | string;
  key_fee: number | string;
  public_origin: string | null;
  sent_at: string | null;
  last_sent_at: string | null;
  reminder_count: number;
  last_send_error: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_ip: string | null;
  document_id: string | null;
  file_url: string | null;
  created_at: string;
}

export const AGREEMENT_COLUMNS =
  "id, tenant_id, unit_id, lease_id, reference, token, status, gate_keys, garbage_fee, key_fee, public_origin, sent_at, last_sent_at, reminder_count, last_send_error, signed_at, signer_name, signer_ip, document_id, file_url, created_at";

type AgreementTenant = TenantRecipient & { id: string; email: string | null; national_id: string | null };

export interface AgreementContext {
  agreement: AgreementRow;
  tenant: AgreementTenant;
  unitNumber: string;
  propertyId: string;
  propertyName: string;
  leaseStart: string | null;
  securityDeposit: number | null;
  electricityMeter: string | null;
  waterMeter: string | null;
}

const CONTEXT_SELECT = `${AGREEMENT_COLUMNS}, tenants(id, full_name, phone, email, national_id, language_preference, notifications_enabled), units(unit_number, property_id, electricity_meter_no, water_meter_no, properties(name)), leases(start_date, security_deposit)`;

interface ContextRow extends AgreementRow {
  tenants: AgreementTenant | null;
  units: {
    unit_number: string;
    property_id: string;
    electricity_meter_no: string | null;
    water_meter_no: string | null;
    properties: { name: string } | null;
  } | null;
  leases: { start_date: string; security_deposit: number | string | null } | null;
}

function toContext(row: ContextRow): AgreementContext | null {
  if (!row.tenants || !row.units) return null;
  const { tenants, units, leases, ...agreement } = row;
  return {
    agreement,
    tenant: tenants,
    unitNumber: units.unit_number,
    propertyId: units.property_id,
    propertyName: units.properties?.name ?? "",
    leaseStart: leases?.start_date ?? null,
    securityDeposit: leases?.security_deposit != null && Number(leases.security_deposit) > 0 ? Number(leases.security_deposit) : null,
    electricityMeter: units.electricity_meter_no?.trim() || null,
    waterMeter: units.water_meter_no?.trim() || null,
  };
}

export async function loadAgreementContext(
  db: SupabaseClient,
  by: { id: string } | { token: string }
): Promise<AgreementContext | null> {
  const query = db.from("tenant_agreements").select(CONTEXT_SELECT);
  const { data } = await ("id" in by ? query.eq("id", by.id) : query.eq("token", by.token)).maybeSingle();
  return data ? toContext(data as unknown as ContextRow) : null;
}

export function pdfDataFor(ctx: AgreementContext): AgreementPdfData {
  return {
    reference: ctx.agreement.reference,
    tenantName: ctx.tenant.full_name,
    nationalId: ctx.tenant.national_id,
    propertyName: ctx.propertyName,
    unitNumber: ctx.unitNumber,
    leaseStart: ctx.leaseStart,
    securityDeposit: ctx.securityDeposit,
    electricityMeter: ctx.electricityMeter,
    waterMeter: ctx.waterMeter,
    gateKeys: ctx.agreement.gate_keys,
    garbageFee: Number(ctx.agreement.garbage_fee),
    keyFee: Number(ctx.agreement.key_fee),
  };
}

/**
 * Origin for links sent without a request to take it from (the WhatsApp
 * agent): the webhook base URL (this deployment), else the origin stored on
 * the latest agreement, else the production URL. NEXT_PUBLIC_APP_URL is a
 * last resort because in this project it points at the marketing site.
 */
export async function resolveAppOrigin(db: SupabaseClient): Promise<string | null> {
  const clean = (v: string | undefined) => v?.trim().replace(/\/+$/, "") || null;
  const webhookBase = clean(process.env.WHATSAPP_WEBHOOK_BASE_URL);
  if (webhookBase) return webhookBase;
  const { data } = await db
    .from("tenant_agreements")
    .select("public_origin")
    .not("public_origin", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.public_origin) return data.public_origin as string;
  const production = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (production) return production.startsWith("http") ? production : `https://${production}`;
  return clean(process.env.NEXT_PUBLIC_APP_URL);
}

// ── Creating ──────────────────────────────────────────────────────────────

export type EnsureResult =
  | { ok: true; agreementId: string; created: boolean; status: AgreementRow["status"] }
  | { ok: false; error: string };

/**
 * The live agreement for a lease's tenant + unit, creating it when there is
 * none. Renewals keep the existing agreement; a relocation to another unit
 * gets a new one.
 */
export async function ensureAgreementForLease(
  db: SupabaseClient,
  leaseId: string,
  opts: { origin: string | null; createdBy?: string | null }
): Promise<EnsureResult> {
  const { data: lease } = await db
    .from("leases")
    .select("id, tenant_id, unit_id, is_active, gate_keys_issued")
    .eq("id", leaseId)
    .maybeSingle();
  if (!lease) return { ok: false, error: "lease_not_found" };
  if (!lease.is_active) return { ok: false, error: "lease_not_active" };

  const existing = await findLiveAgreement(db, lease.tenant_id, lease.unit_id);
  if (existing) return { ok: true, agreementId: existing.id, created: false, status: existing.status };

  const { data: reference, error: refError } = await db.rpc("next_tenant_agreement_reference");
  if (refError || !reference) return { ok: false, error: refError?.message || "reference_failed" };

  const { data: inserted, error } = await db
    .from("tenant_agreements")
    .insert({
      tenant_id: lease.tenant_id,
      unit_id: lease.unit_id,
      lease_id: lease.id,
      reference,
      token: randomBytes(24).toString("base64url"),
      gate_keys: lease.gate_keys_issued ?? DEFAULT_GATE_KEYS,
      garbage_fee: GARBAGE_VIOLATION_FEE,
      key_fee: LOST_KEY_FEE,
      public_origin: opts.origin,
      created_by: opts.createdBy ?? null,
    })
    .select("id, status")
    .single();
  if (error) {
    // Two requests raced to create it: use the one that won.
    if (error.code === "23505") {
      const winner = await findLiveAgreement(db, lease.tenant_id, lease.unit_id);
      if (winner) return { ok: true, agreementId: winner.id, created: false, status: winner.status };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, agreementId: inserted.id, created: true, status: inserted.status };
}

async function findLiveAgreement(db: SupabaseClient, tenantId: string, unitId: string) {
  const { data } = await db
    .from("tenant_agreements")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("unit_id", unitId)
    .neq("status", "cancelled")
    .maybeSingle();
  return data as { id: string; status: AgreementRow["status"] } | null;
}

// ── Sending ───────────────────────────────────────────────────────────────

export interface SendOutcome {
  whatsapp: { success: boolean; via?: "template" | "text"; error?: string };
  email: { success: boolean; error?: string } | null;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const EMAIL_COPY: Record<AgreementMessageKind, Record<"en" | "ar", { subject: string; body: string }>> = {
  request: {
    en: {
      subject: "Please sign your building rules agreement",
      body: "Welcome to unit {unit}, {property}. Please read and sign the building rules agreement (garbage chute, gate keys and alterations to the apartment). It takes about a minute.",
    },
    ar: {
      subject: "يرجى توقيع اتفاقية قواعد المبنى",
      body: "أهلاً بكم في الوحدة {unit}، {property}. يرجى قراءة اتفاقية قواعد المبنى (مجرى القمامة ومفاتيح البوابة والتعديلات على الشقة) والتوقيع عليها، ولن يستغرق ذلك أكثر من دقيقة.",
    },
  },
  reminder: {
    en: {
      subject: "Reminder: your building rules agreement is waiting for your signature",
      body: "The building rules agreement for unit {unit}, {property} is still waiting for your signature.",
    },
    ar: {
      subject: "تذكير: اتفاقية قواعد المبنى بانتظار توقيعكم",
      body: "لا تزال اتفاقية قواعد المبنى للوحدة {unit}، {property} بانتظار توقيعكم.",
    },
  },
  signed: {
    en: {
      subject: "Your signed building rules agreement",
      body: "Thank you for signing the building rules agreement for unit {unit}, {property}. Your signed copy is attached.",
    },
    ar: {
      subject: "نسختكم الموقّعة من اتفاقية قواعد المبنى",
      body: "شكراً لتوقيعكم على اتفاقية قواعد المبنى للوحدة {unit}، {property}. نسختكم الموقّعة مرفقة بهذه الرسالة.",
    },
  },
};

const EMAIL_BUTTON: Record<AgreementMessageKind, Record<"en" | "ar", string>> = {
  request: { en: "Read and sign", ar: "القراءة والتوقيع" },
  reminder: { en: "Read and sign", ar: "القراءة والتوقيع" },
  signed: { en: "View signed copy", ar: "عرض النسخة الموقّعة" },
};

async function sendAgreementEmail(
  kind: AgreementMessageKind,
  ctx: AgreementContext,
  link: string,
  attachment?: { filename: string; content: Buffer }
): Promise<SendOutcome["email"]> {
  const to = ctx.tenant.email?.trim();
  if (!to || ctx.tenant.notifications_enabled === false) return null;
  const lang = tenantLang(ctx.tenant);
  const copy = EMAIL_COPY[kind][lang];
  const greeting = lang === "ar" ? `عزيزنا ${ctx.tenant.full_name}،` : `Dear ${ctx.tenant.full_name},`;
  const body = copy.body.replace("{unit}", ctx.unitNumber).replace("{property}", ctx.propertyName);
  const html = buildReminderEmailHtml({
    tenantName: ctx.tenant.full_name,
    isRtl: lang === "ar",
    bodyContent: `${escapeHtml(greeting)}<br><br>${escapeHtml(body)}<br><br><a href="${escapeHtml(link)}" style="display:inline-block;background:#C9A84C;color:#0B0A0F;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;">${EMAIL_BUTTON[kind][lang]}</a>`,
  });
  try {
    return await sendEmail({ to, subject: copy.subject, html, attachments: attachment ? [attachment] : undefined });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function deliver(
  kind: AgreementMessageKind,
  ctx: AgreementContext,
  origin: string,
  attachment?: { filename: string; content: Buffer }
): Promise<SendOutcome> {
  const lang = tenantLang(ctx.tenant);
  const link = agreementLink(origin, lang, ctx.agreement.token);
  const [whatsapp, email] = await Promise.all([
    sendAgreementWhatsApp(kind, ctx.tenant, {
      unitNumber: ctx.unitNumber,
      propertyName: ctx.propertyName,
      origin,
      token: ctx.agreement.token,
    }),
    sendAgreementEmail(kind, ctx, link, attachment),
  ]);
  return { whatsapp, email };
}

function sendError(outcome: SendOutcome): string | null {
  if (outcome.whatsapp.success || outcome.email?.success) return null;
  return [outcome.whatsapp.error, outcome.email?.error].filter(Boolean).join("; ") || "not sent";
}

/**
 * WhatsApp + email the signing link (or a reminder). Records when it went
 * out, or why it didn't, on the agreement.
 */
export async function sendAgreementLink(
  db: SupabaseClient,
  agreementId: string,
  kind: "request" | "reminder",
  fallbackOrigin: string
): Promise<{ ok: true; outcome: SendOutcome } | { ok: false; error: string }> {
  const ctx = await loadAgreementContext(db, { id: agreementId });
  if (!ctx) return { ok: false, error: "not_found" };
  if (ctx.agreement.status !== "pending") return { ok: false, error: `agreement_${ctx.agreement.status}` };

  const origin = ctx.agreement.public_origin || fallbackOrigin;
  const outcome = await deliver(kind, ctx, origin);
  const error = sendError(outcome);
  const now = new Date().toISOString();
  await db
    .from("tenant_agreements")
    .update({
      ...(error
        ? {}
        : {
            sent_at: ctx.agreement.sent_at ?? now,
            last_sent_at: now,
            reminder_count: kind === "reminder" ? ctx.agreement.reminder_count + 1 : ctx.agreement.reminder_count,
          }),
      // Keep the origin a cron-sent link should use.
      public_origin: origin,
      last_send_error: error,
      updated_at: now,
    })
    .eq("id", agreementId);
  return { ok: true, outcome };
}

/** Create the agreement for a lease if needed and send it unless it already went out. */
export async function createAndSendForLease(
  db: SupabaseClient,
  leaseId: string,
  opts: { origin: string; createdBy?: string | null; resend?: boolean }
): Promise<
  | { ok: true; agreementId: string; created: boolean; sent: boolean; status: AgreementRow["status"]; outcome?: SendOutcome }
  | { ok: false; error: string }
> {
  const ensured = await ensureAgreementForLease(db, leaseId, { origin: opts.origin, createdBy: opts.createdBy });
  if (!ensured.ok) return ensured;
  const base = { ok: true as const, agreementId: ensured.agreementId, created: ensured.created, status: ensured.status };
  if (ensured.status !== "pending") return { ...base, sent: false };

  if (!ensured.created && !opts.resend) {
    const { data } = await db.from("tenant_agreements").select("sent_at").eq("id", ensured.agreementId).maybeSingle();
    if (data?.sent_at) return { ...base, sent: false };
  }
  const sent = await sendAgreementLink(db, ensured.agreementId, "request", opts.origin);
  if (!sent.ok) return { ok: false, error: sent.error };
  return { ...base, sent: !sendError(sent.outcome), outcome: sent.outcome };
}

// ── Signing ───────────────────────────────────────────────────────────────

const SIGNATURE_PREFIX = "data:image/png;base64,";
const MAX_SIGNATURE_BYTES = 400_000;

export type SignResult =
  | { ok: true; signedAt: string }
  | { ok: false; error: "not_found" | "already_signed" | "cancelled" | "invalid_signature" | "failed"; detail?: string };

/**
 * Sign: render the one-page PDF with the signature, store it in the
 * documents bucket, attach it to the unit, mark the agreement signed and
 * send the tenant their copy.
 */
export async function signAgreement(
  db: SupabaseClient,
  token: string,
  input: { signerName: string; signatureImage: string; ip: string | null; userAgent: string | null; fallbackOrigin: string }
): Promise<SignResult> {
  const ctx = await loadAgreementContext(db, { token });
  if (!ctx) return { ok: false, error: "not_found" };
  if (ctx.agreement.status === "signed") return { ok: false, error: "already_signed" };
  if (ctx.agreement.status === "cancelled") return { ok: false, error: "cancelled" };

  if (!input.signatureImage.startsWith(SIGNATURE_PREFIX)) return { ok: false, error: "invalid_signature" };
  const signatureBytes = Buffer.from(input.signatureImage.slice(SIGNATURE_PREFIX.length), "base64");
  if (signatureBytes.length < 100 || signatureBytes.length > MAX_SIGNATURE_BYTES) {
    return { ok: false, error: "invalid_signature" };
  }

  const signedAt = new Date().toISOString();
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderAgreementPdf({
      ...pdfDataFor(ctx),
      signed: { signerName: input.signerName, signatureImage: input.signatureImage, signedAt, ip: input.ip },
    });
  } catch (err) {
    console.error("[agreements] PDF render failed", { id: ctx.agreement.id, err });
    return { ok: false, error: "failed", detail: "pdf" };
  }

  const fileName = `Building rules agreement - ${ctx.propertyName} ${ctx.unitNumber} - ${ctx.agreement.reference}.pdf`;
  const path = `agreements/${ctx.agreement.unit_id}/${ctx.agreement.reference}-${Date.now()}.pdf`;
  const { error: uploadError } = await db.storage
    .from("documents")
    .upload(path, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("[agreements] upload failed", { id: ctx.agreement.id, error: uploadError.message });
    return { ok: false, error: "failed", detail: "upload" };
  }

  const { data: doc, error: docError } = await db
    .from("documents")
    .insert({
      entity_type: "unit",
      entity_id: ctx.agreement.unit_id,
      document_type: "tenant_agreement",
      file_url: path,
      file_name: fileName,
    })
    .select("id")
    .single();
  if (docError || !doc) {
    await db.storage.from("documents").remove([path]);
    console.error("[agreements] document insert failed", { id: ctx.agreement.id, error: docError?.message });
    return { ok: false, error: "failed", detail: "document" };
  }

  // Only the first of two simultaneous submissions wins.
  const { data: updated } = await db
    .from("tenant_agreements")
    .update({
      status: "signed",
      signed_at: signedAt,
      signer_name: input.signerName,
      signer_ip: input.ip,
      signer_user_agent: input.userAgent?.slice(0, 500) ?? null,
      signature_image: input.signatureImage,
      document_id: doc.id,
      file_url: path,
      updated_at: signedAt,
    })
    .eq("id", ctx.agreement.id)
    .eq("status", "pending")
    .select("id");
  if (!updated || updated.length === 0) {
    await db.from("documents").delete().eq("id", doc.id);
    await db.storage.from("documents").remove([path]);
    return { ok: false, error: "already_signed" };
  }

  await db.from("audit_log").insert({
    user_id: null,
    action: "update",
    entity_type: "tenant_agreement",
    entity_id: ctx.agreement.id,
    metadata: { event: "signed", reference: ctx.agreement.reference, tenant_id: ctx.tenant.id, unit_id: ctx.agreement.unit_id },
  });

  try {
    await deliver("signed", ctx, ctx.agreement.public_origin || input.fallbackOrigin, {
      filename: `${ctx.agreement.reference}.pdf`,
      content: pdfBuffer,
    });
  } catch (err) {
    console.error("[agreements] signed copy not sent", { id: ctx.agreement.id, err });
  }
  return { ok: true, signedAt };
}

/** The signed PDF, for the tenant's download link. */
export async function downloadSignedPdf(db: SupabaseClient, token: string): Promise<{ file: Blob; name: string } | null> {
  const { data } = await db
    .from("tenant_agreements")
    .select("status, file_url, reference")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.status !== "signed" || !data.file_url) return null;
  const { data: file } = await db.storage.from("documents").download(data.file_url);
  return file ? { file, name: `${data.reference}.pdf` } : null;
}

// ── Violations ────────────────────────────────────────────────────────────

/** alteration = holes / changes made without approval, billed at the repair cost. */
export type ViolationKind = "garbage" | "lost_key" | "alteration";

export interface RecordViolationInput {
  /** Either the unit (its active lease is used) or the lease. */
  unitId?: string;
  leaseId?: string;
  kind: ViolationKind;
  quantity?: number;
  /** Repair cost in OMR; required for (and only used by) alteration. */
  amount?: number;
  occurredOn?: string;
  notes?: string | null;
  userId: string | null;
  source: "dashboard" | "whatsapp_agent";
}

export type RecordViolationResult =
  | {
      ok: true;
      violationId: string;
      invoiceId: string;
      invoiceNumber: string;
      amount: number;
      dueDate: string;
      tenantName: string;
      unitNumber: string;
      propertyName: string;
      agreementSigned: boolean;
      /** Whether the tenant was told by WhatsApp or email. */
      tenantNotified: boolean;
      /** Spare gate keys left for the building after a key sale (null if not tracked). */
      gateKeysLeft: number | null;
    }
  | { ok: false; error: string };

function muscatToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Muscat" });
}

/** The next rent due date on or after today for a lease's due day. */
export function nextDueDate(paymentDueDay: number, today = muscatToday()): string {
  const [y, m, d] = today.split("-").map(Number);
  const day = Math.min(Math.max(paymentDueDay || 1, 1), 28);
  const month = d <= day ? m : m + 1;
  const date = new Date(Date.UTC(y, month - 1, day));
  return date.toISOString().slice(0, 10);
}

const VIOLATION_DESCRIPTIONS: Record<ViolationKind, (qty: number, date: string) => string> = {
  garbage: (_qty, date) => `Garbage left outside the chute (${date})`,
  lost_key: (qty) => `Lost / extra gate key × ${qty}`,
  alteration: (_qty, date) => `Unapproved hole / alteration – repair cost (${date})`,
};

const ITEM_KINDS: Record<ViolationKind, string> = {
  garbage: "garbage_violation",
  lost_key: "lost_key",
  alteration: "alteration",
};

/**
 * Record a violation and bill it on its own invoice (invoice_type
 * 'violation'), due with the tenant's next rent.
 */
export async function recordViolation(db: SupabaseClient, input: RecordViolationInput): Promise<RecordViolationResult> {
  const quantity = input.kind === "lost_key" ? Math.floor(input.quantity ?? 1) : 1;
  if (!(quantity >= 1 && quantity <= 50)) return { ok: false, error: "quantity must be between 1 and 50" };
  const occurredOn = input.occurredOn || muscatToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return { ok: false, error: "occurred_on must be YYYY-MM-DD" };
  if (input.kind === "alteration" && !(Number(input.amount) > 0 && Number(input.amount) <= 10000)) {
    return { ok: false, error: "amount (the repair cost in OMR) is required for an alteration" };
  }

  let leaseQuery = db
    .from("leases")
    .select("id, tenant_id, unit_id, payment_due_day, tenants(id, full_name, phone, email, language_preference, notifications_enabled), units(unit_number, property_id, properties(name))")
    .eq("is_active", true);
  if (input.leaseId) leaseQuery = leaseQuery.eq("id", input.leaseId);
  else if (input.unitId) leaseQuery = leaseQuery.eq("unit_id", input.unitId);
  else return { ok: false, error: "unit_id or lease_id is required" };
  const { data: leaseRow } = await leaseQuery.maybeSingle();
  if (!leaseRow) return { ok: false, error: "No active lease found for this unit — is it occupied?" };
  const lease = leaseRow as unknown as {
    id: string;
    tenant_id: string;
    unit_id: string;
    payment_due_day: number;
    tenants: (TenantRecipient & { id: string; email: string | null }) | null;
    units: { unit_number: string; property_id: string; properties: { name: string } | null } | null;
  };
  if (!lease.units) return { ok: false, error: "Unit not found" };

  const { data: agreement } = await db
    .from("tenant_agreements")
    .select("id, status, garbage_fee, key_fee")
    .eq("tenant_id", lease.tenant_id)
    .eq("unit_id", lease.unit_id)
    .neq("status", "cancelled")
    .maybeSingle();

  // Fees as written in the tenant's agreement, else the current defaults;
  // alterations are charged at the repair cost.
  const unitAmount =
    input.kind === "alteration"
      ? Number(Number(input.amount).toFixed(3))
      : input.kind === "garbage"
        ? Number(agreement?.garbage_fee ?? GARBAGE_VIOLATION_FEE)
        : Number(agreement?.key_fee ?? LOST_KEY_FEE);
  const amount = Number((unitAmount * quantity).toFixed(3));
  const dueDate = nextDueDate(lease.payment_due_day);

  const { data: invoiceNumber, error: numberError } = await db.rpc("next_violation_invoice_number", {
    p_property_id: lease.units.property_id,
  });
  if (numberError || !invoiceNumber) return { ok: false, error: `Failed to allocate invoice number: ${numberError?.message}` };

  const description = VIOLATION_DESCRIPTIONS[input.kind](quantity, occurredOn);
  const notes = input.notes?.trim() || null;
  const { data: invoice, error: invoiceError } = await db
    .from("invoices")
    .insert({
      lease_id: lease.id,
      tenant_id: lease.tenant_id,
      unit_id: lease.unit_id,
      invoice_type: "violation",
      invoice_number: invoiceNumber,
      amount,
      due_date: dueDate,
      issued_date: muscatToday(),
      status: "pending",
      paid_amount: 0,
      notes: notes ? `${description}. ${notes}` : description,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (invoiceError || !invoice) return { ok: false, error: `Failed to create invoice: ${invoiceError?.message}` };

  const { error: itemError } = await db.from("invoice_items").insert({
    invoice_id: invoice.id,
    kind: ITEM_KINDS[input.kind],
    description,
    amount,
    sort_order: 0,
  });
  if (itemError) {
    await db.from("invoices").delete().eq("id", invoice.id);
    return { ok: false, error: `Failed to add invoice line: ${itemError.message}` };
  }

  const { data: violation, error: violationError } = await db
    .from("tenant_violations")
    .insert({
      tenant_id: lease.tenant_id,
      unit_id: lease.unit_id,
      lease_id: lease.id,
      agreement_id: agreement?.id ?? null,
      kind: input.kind,
      quantity,
      unit_amount: unitAmount,
      amount,
      occurred_on: occurredOn,
      notes,
      invoice_id: invoice.id,
      source: input.source,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (violationError || !violation) {
    await db.from("invoices").delete().eq("id", invoice.id);
    return { ok: false, error: `Failed to record violation: ${violationError?.message}` };
  }

  await db.from("audit_log").insert({
    user_id: input.userId,
    action: "create",
    entity_type: "tenant_violation",
    entity_id: violation.id,
    metadata: { kind: input.kind, quantity, amount, invoice_id: invoice.id, source: input.source },
  });

  // The sale was taken out of the building's key stock by a trigger (054).
  const gateKeysLeft = input.kind === "lost_key" ? await alertIfGateKeysLow(lease.units.property_id) : null;

  const tenantNotified = lease.tenants
    ? await notifyViolation(lease.tenants, {
        kind: input.kind,
        quantity,
        occurredOn,
        amount,
        dueDate,
        unitNumber: lease.units.unit_number,
        propertyName: lease.units.properties?.name ?? "",
      })
    : false;

  return {
    ok: true,
    violationId: violation.id,
    invoiceId: invoice.id,
    invoiceNumber: invoiceNumber as string,
    amount,
    dueDate,
    tenantName: lease.tenants?.full_name ?? "",
    unitNumber: lease.units.unit_number,
    propertyName: lease.units.properties?.name ?? "",
    agreementSigned: agreement?.status === "signed",
    tenantNotified,
    gateKeysLeft,
  };
}

function formatNoticeDate(iso: string, lang: "en" | "ar"): string {
  return new Date(`${iso}T00:00:00+04:00`).toLocaleDateString(lang === "ar" ? "ar-OM-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Muscat",
  });
}

const NOTICE_DESCRIPTIONS: Record<ViolationKind, Record<"en" | "ar", (qty: number, date: string) => string>> = {
  garbage: {
    en: (_q, date) => `Garbage left outside the garbage chute on ${date}`,
    ar: (_q, date) => `ترك القمامة خارج مجرى القمامة بتاريخ ${date}`,
  },
  lost_key: {
    en: (q) => (q === 1 ? "1 lost / extra gate key" : `${q} lost / extra gate keys`),
    ar: (q) => `مفاتيح بوابة مفقودة / إضافية (العدد: ${q})`,
  },
  alteration: {
    en: (_q, date) => `Hole / alteration in the apartment without approval (${date}), charged at the repair cost`,
    ar: (_q, date) => `ثقب / تعديل في الشقة دون موافقة (${date})، بتكلفة الإصلاح`,
  },
};

const NOTICE_EMAIL: Record<"en" | "ar", { subject: string; greeting: (name: string) => string; body: string; fee: string }> = {
  en: {
    subject: "Building rules violation recorded",
    greeting: (name) => `Dear ${name},`,
    body: "A building rules violation has been recorded for unit {unit}, {property}:",
    fee: "A fee of {amount} OMR has been added to your account, due on {due} with your next rent. If you have any questions, please reply to this email.",
  },
  ar: {
    subject: "تسجيل مخالفة لقواعد المبنى",
    greeting: (name) => `عزيزنا ${name}،`,
    body: "تم تسجيل مخالفة لقواعد المبنى للوحدة {unit}، {property}:",
    fee: "تمت إضافة رسوم قدرها {amount} ريال عماني إلى حسابكم، وتُستحق بتاريخ {due} مع الإيجار القادم. لأي استفسار، يرجى الرد على هذا البريد.",
  },
};

/** WhatsApp + email the tenant about a violation fee. Never throws. */
async function notifyViolation(
  tenant: TenantRecipient & { email: string | null },
  v: {
    kind: ViolationKind;
    quantity: number;
    occurredOn: string;
    amount: number;
    dueDate: string;
    unitNumber: string;
    propertyName: string;
  }
): Promise<boolean> {
  if (tenant.notifications_enabled === false) return false;
  const lang = tenantLang(tenant);
  const description = NOTICE_DESCRIPTIONS[v.kind][lang](v.quantity, formatNoticeDate(v.occurredOn, lang));
  const amount = v.amount.toFixed(3);
  const due = formatNoticeDate(v.dueDate, lang);

  const whatsapp = sendViolationNotice(tenant, {
    unitNumber: v.unitNumber,
    propertyName: v.propertyName,
    description,
    amount,
    dueDate: due,
  });
  const to = tenant.email?.trim();
  const copy = NOTICE_EMAIL[lang];
  const email = to
    ? sendEmail({
        to,
        subject: copy.subject,
        html: buildReminderEmailHtml({
          tenantName: tenant.full_name,
          isRtl: lang === "ar",
          bodyContent: [
            escapeHtml(copy.greeting(tenant.full_name)),
            escapeHtml(copy.body.replace("{unit}", v.unitNumber).replace("{property}", v.propertyName)),
            `<strong>${escapeHtml(description)}</strong>`,
            escapeHtml(copy.fee.replace("{amount}", amount).replace("{due}", due)),
          ].join("<br><br>"),
        }),
      }).catch((err) => ({ success: false, error: err instanceof Error ? err.message : String(err) }))
    : Promise.resolve(null);

  const [w, e] = await Promise.all([whatsapp, email]);
  if (!w.success) console.error("[violations] WhatsApp notice not sent", { error: w.error });
  if (e && !e.success) console.error("[violations] email notice not sent", { error: e.error });
  return w.success || !!e?.success;
}
