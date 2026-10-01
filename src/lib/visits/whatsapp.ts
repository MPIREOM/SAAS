import {
  sendMaintenanceMessage,
  type MaintenanceTemplate,
  type SendResult,
  type TenantRecipient,
} from "@/lib/maintenance/whatsapp";
import { createVisitsAdminClient } from "./service";
import { formatSlotRange, formatVisitDates, formatVisitDay } from "./slots";

// WhatsApp messages for building-wide visits: the booking invite with the
// shared link, the confirmation with the tenant's private manage link, and
// the day-before reminder. Same template-then-text approach as maintenance;
// these bodies are what the WhatsApp setup page submits to Meta
// (lib/whatsapp/template-definitions.ts).

type Lang = "en" | "ar";

// {{1}} tenant name, {{2}} visit title, {{3}} property, {{4}} dates,
// {{5}} unit, {{6}} preparation instructions, {{7}} booking link
export const VISIT_INVITE_TEMPLATES: Record<Lang, MaintenanceTemplate> = {
  en: {
    name: "visit_booking_invite_en",
    language: "en",
    body: [
      "Dear {{1}},",
      "",
      "We will be carrying out {{2}} at {{3}} on {{4}}, and need to enter your apartment (unit {{5}}).",
      "",
      "Before we arrive: {{6}}",
      "",
      "Please choose a time that suits you here:",
      "{{7}}",
      "",
      "Thank you,",
      "MPIRE Property Management",
    ].join("\n"),
    example: ["Ahmed Al Balushi", "Pest control", "Bousher Ameen Mosque", "Sat 4 Oct", "12", "Please empty your kitchen cupboards so they can be sprayed.", "https://example.com/en/visit-booking/abc123"],
  },
  ar: {
    name: "visit_booking_invite_ar",
    language: "ar",
    body: [
      "عزيزنا {{1}}،",
      "",
      "سنقوم بأعمال {{2}} في {{3}} بتاريخ {{4}}، ونحتاج إلى دخول شقتكم (الوحدة {{5}}).",
      "",
      "قبل وصولنا: {{6}}",
      "",
      "يرجى اختيار الوقت المناسب لكم من هنا:",
      "{{7}}",
      "",
      "شكراً لكم،",
      "MPIRE لإدارة العقارات",
    ].join("\n"),
    example: ["أحمد البلوشي", "مكافحة الحشرات", "بوشر مسجد الأمين", "السبت 4 أكتوبر", "12", "يرجى إفراغ خزائن المطبخ ليتم رشها.", "https://example.com/ar/visit-booking/abc123"],
  },
};

// {{1}} tenant name, {{2}} visit title, {{3}} unit, {{4}} property,
// {{5}} slot, {{6}} preparation instructions, {{7}} manage link
export const VISIT_CONFIRMED_TEMPLATES: Record<Lang, MaintenanceTemplate> = {
  en: {
    name: "visit_booking_confirmed_en",
    language: "en",
    body: [
      "Dear {{1}},",
      "",
      "Your {{2}} visit for unit {{3}}, {{4}} is booked for {{5}}.",
      "",
      "Before we arrive: {{6}}",
      "",
      "To change or cancel your time, use this link:",
      "{{7}}",
      "",
      "Thank you,",
      "MPIRE Property Management",
    ].join("\n"),
    example: ["Ahmed Al Balushi", "Pest control", "12", "Bousher Ameen Mosque", "Sat 4 Oct, 10:20–10:30", "Please empty your kitchen cupboards so they can be sprayed.", "https://example.com/en/my-visit/xyz789"],
  },
  ar: {
    name: "visit_booking_confirmed_ar",
    language: "ar",
    body: [
      "عزيزنا {{1}}،",
      "",
      "تم حجز موعد {{2}} للوحدة {{3}}، {{4}} في {{5}}.",
      "",
      "قبل وصولنا: {{6}}",
      "",
      "لتغيير الموعد أو إلغائه، استخدم هذا الرابط:",
      "{{7}}",
      "",
      "شكراً لكم،",
      "MPIRE لإدارة العقارات",
    ].join("\n"),
    example: ["أحمد البلوشي", "مكافحة الحشرات", "12", "بوشر مسجد الأمين", "السبت 4 أكتوبر، 10:20–10:30", "يرجى إفراغ خزائن المطبخ ليتم رشها.", "https://example.com/ar/my-visit/xyz789"],
  },
};

// {{1}} tenant name, {{2}} unit, {{3}} property, {{4}} visit title,
// {{5}} slot, {{6}} preparation instructions, {{7}} manage link
export const VISIT_REMINDER_TEMPLATES: Record<Lang, MaintenanceTemplate> = {
  en: {
    name: "visit_booking_reminder_en",
    language: "en",
    body: [
      "Dear {{1}},",
      "",
      "A reminder that our team will enter unit {{2}}, {{3}} for {{4}} on {{5}}.",
      "",
      "Before we arrive: {{6}}",
      "",
      "If you need to change or cancel, please use this link:",
      "{{7}}",
      "",
      "Thank you,",
      "MPIRE Property Management",
    ].join("\n"),
    example: ["Ahmed Al Balushi", "12", "Bousher Ameen Mosque", "Pest control", "Sat 4 Oct, 10:20–10:30", "Please empty your kitchen cupboards so they can be sprayed.", "https://example.com/en/my-visit/xyz789"],
  },
  ar: {
    name: "visit_booking_reminder_ar",
    language: "ar",
    body: [
      "عزيزنا {{1}}،",
      "",
      "نذكركم بأن فريقنا سيدخل الوحدة {{2}}، {{3}} لأعمال {{4}} في {{5}}.",
      "",
      "قبل وصولنا: {{6}}",
      "",
      "إذا احتجتم إلى تغيير الموعد أو إلغائه، يرجى استخدام هذا الرابط:",
      "{{7}}",
      "",
      "شكراً لكم،",
      "MPIRE لإدارة العقارات",
    ].join("\n"),
    example: ["أحمد البلوشي", "12", "بوشر مسجد الأمين", "مكافحة الحشرات", "السبت 4 أكتوبر، 10:20–10:30", "يرجى إفراغ خزائن المطبخ ليتم رشها.", "https://example.com/ar/my-visit/xyz789"],
  },
};

// {{1}} tenant name, {{2}} visit title, {{3}} unit, {{4}} property, {{5}} date
export const VISIT_DONE_TEMPLATES: Record<Lang, MaintenanceTemplate> = {
  en: {
    name: "visit_booking_done_en",
    language: "en",
    body: [
      "Dear {{1}},",
      "",
      "The {{2}} visit for your apartment (unit {{3}}, {{4}}) was completed on {{5}}.",
      "",
      "If you notice any problem, please contact the building management.",
      "",
      "Thank you,",
      "MPIRE Property Management",
    ].join("\n"),
    example: ["Ahmed Al Balushi", "Pest control", "12", "Bousher Ameen Mosque", "Saturday 3 October"],
  },
  ar: {
    name: "visit_booking_done_ar",
    language: "ar",
    body: [
      "عزيزنا {{1}}،",
      "",
      "تم الانتهاء من زيارة {{2}} لشقتكم (الوحدة {{3}}، {{4}}) بتاريخ {{5}}.",
      "",
      "إذا لاحظتم أي مشكلة، يرجى التواصل مع إدارة المبنى.",
      "",
      "شكراً لكم،",
      "MPIRE لإدارة العقارات",
    ].join("\n"),
    example: ["أحمد البلوشي", "مكافحة الحشرات", "12", "بوشر مسجد الأمين", "السبت، 3 أكتوبر"],
  },
};

export const VISIT_TEMPLATES: MaintenanceTemplate[] = [
  VISIT_INVITE_TEMPLATES.en,
  VISIT_INVITE_TEMPLATES.ar,
  VISIT_CONFIRMED_TEMPLATES.en,
  VISIT_CONFIRMED_TEMPLATES.ar,
  VISIT_REMINDER_TEMPLATES.en,
  VISIT_REMINDER_TEMPLATES.ar,
  VISIT_DONE_TEMPLATES.en,
  VISIT_DONE_TEMPLATES.ar,
];

export function tenantLang(tenant: Pick<TenantRecipient, "language_preference">): Lang {
  return tenant.language_preference === "ar" ? "ar" : "en";
}

export function bookingLink(origin: string, lang: Lang, campaignToken: string): string {
  return `${origin.replace(/\/+$/, "")}/${lang}/visit-booking/${campaignToken}`;
}

export function manageLink(origin: string, lang: Lang, manageToken: string): string {
  return `${origin.replace(/\/+$/, "")}/${lang}/my-visit/${manageToken}`;
}

export interface VisitMessageContext {
  title: string;
  /** The visit's instructions for tenants (e.g. empty the kitchen cupboards). */
  notes: string | null;
  propertyName: string;
  unitNumber: string;
  origin: string;
  start_date: string;
  end_date: string;
  slot_minutes: number;
}

const NO_PREPARATION: Record<Lang, string> = {
  en: "No special preparation needed.",
  ar: "لا يلزم أي تحضير خاص.",
};

function preparation(ctx: VisitMessageContext, lang: Lang): string {
  return ctx.notes?.trim() || NO_PREPARATION[lang];
}

function checkRecipient(tenant: TenantRecipient): SendResult | null {
  if (!tenant.phone) return { success: false, error: "tenant has no phone" };
  if (tenant.notifications_enabled === false) {
    return { success: false, error: "tenant notifications disabled" };
  }
  return null;
}

/** True when a send was not attempted (no phone / notifications off). */
export function isSkipped(result: SendResult): boolean {
  return result.error === "tenant has no phone" || result.error === "tenant notifications disabled";
}

/** Which visit, unit, tenant and booking a message is about, for visit_message_logs. */
export interface VisitLogRef {
  campaignId: string;
  unitId: string | null;
  tenantId: string | null;
  bookingId?: string | null;
}

type MessageKind = "invite" | "confirmation" | "reminder" | "done";

/**
 * Send (or skip) one visit message and record the outcome in
 * visit_message_logs so staff can see it on the visit page; delivery
 * receipts later fill in delivered / read / failed. Never throws.
 */
async function deliver(
  kind: MessageKind,
  tenant: TenantRecipient,
  template: MaintenanceTemplate,
  params: string[],
  log: VisitLogRef
): Promise<SendResult> {
  let result: SendResult;
  try {
    result = checkRecipient(tenant) ?? (await sendMaintenanceMessage(tenant.phone!, template, params));
  } catch (err) {
    result = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const { error } = await createVisitsAdminClient()
      .from("visit_message_logs")
      .insert({
        campaign_id: log.campaignId,
        unit_id: log.unitId,
        tenant_id: log.tenantId,
        booking_id: log.bookingId ?? null,
        kind,
        phone: tenant.phone,
        send_status: result.success ? "sent" : isSkipped(result) ? "skipped" : "failed",
        via: result.via ?? null,
        error: result.success ? null : result.error ?? null,
        template_error: result.templateError ?? null,
        provider_message_id: result.messageId ?? null,
        delivery_status: result.success && result.messageId ? "sent" : null,
      });
    if (error) console.error("[visits] message log insert failed", error.message);
  } catch (err) {
    console.error("[visits] message log insert failed", err);
  }
  return result;
}

export async function sendVisitInvite(
  tenant: TenantRecipient,
  ctx: VisitMessageContext & { campaignToken: string; log: VisitLogRef }
): Promise<SendResult> {
  const lang = tenantLang(tenant);
  return deliver(
    "invite",
    tenant,
    VISIT_INVITE_TEMPLATES[lang],
    [
      tenant.full_name,
      ctx.title,
      ctx.propertyName,
      formatVisitDates(ctx, lang, "long"),
      ctx.unitNumber,
      preparation(ctx, lang),
      bookingLink(ctx.origin, lang, ctx.campaignToken),
    ],
    ctx.log
  );
}

export async function sendVisitConfirmation(
  tenant: TenantRecipient,
  ctx: VisitMessageContext & { slotStart: string; manageToken: string; log: VisitLogRef }
): Promise<SendResult> {
  const lang = tenantLang(tenant);
  return deliver(
    "confirmation",
    tenant,
    VISIT_CONFIRMED_TEMPLATES[lang],
    [
      tenant.full_name,
      ctx.title,
      ctx.unitNumber,
      ctx.propertyName,
      formatSlotRange(ctx.slotStart, ctx.slot_minutes, lang, "long"),
      preparation(ctx, lang),
      manageLink(ctx.origin, lang, ctx.manageToken),
    ],
    ctx.log
  );
}

export async function sendVisitReminder(
  tenant: TenantRecipient,
  ctx: VisitMessageContext & { slotStart: string; manageToken: string; log: VisitLogRef }
): Promise<SendResult> {
  const lang = tenantLang(tenant);
  return deliver(
    "reminder",
    tenant,
    VISIT_REMINDER_TEMPLATES[lang],
    [
      tenant.full_name,
      ctx.unitNumber,
      ctx.propertyName,
      ctx.title,
      formatSlotRange(ctx.slotStart, ctx.slot_minutes, lang, "long"),
      preparation(ctx, lang),
      manageLink(ctx.origin, lang, ctx.manageToken),
    ],
    ctx.log
  );
}

/** Tell the tenant their unit's visit was completed (contractor marked it done). */
export async function sendVisitDone(
  tenant: TenantRecipient,
  ctx: Pick<VisitMessageContext, "title" | "propertyName" | "unitNumber"> & {
    doneAt: string;
    log: VisitLogRef;
  }
): Promise<SendResult> {
  const lang = tenantLang(tenant);
  return deliver(
    "done",
    tenant,
    VISIT_DONE_TEMPLATES[lang],
    [tenant.full_name, ctx.title, ctx.unitNumber, ctx.propertyName, formatVisitDay(ctx.doneAt, lang, "long")],
    ctx.log
  );
}
