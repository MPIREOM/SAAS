import {
  sendMaintenanceMessage,
  type MaintenanceTemplate,
  type SendResult,
  type TenantRecipient,
} from "@/lib/maintenance/whatsapp";
import { formatSlotRange, formatVisitDates } from "./slots";

// WhatsApp messages for building-wide visits: the booking invite with the
// shared link, the confirmation with the tenant's private manage link, and
// the day-before reminder. Same template-then-text approach as maintenance;
// these bodies are what the WhatsApp setup page submits to Meta
// (lib/whatsapp/template-definitions.ts).

type Lang = "en" | "ar";

// {{1}} tenant name, {{2}} visit title, {{3}} property, {{4}} dates,
// {{5}} unit, {{6}} booking link
export const VISIT_INVITE_TEMPLATES: Record<Lang, MaintenanceTemplate> = {
  en: {
    name: "visit_booking_invite_en",
    language: "en",
    body: [
      "Dear {{1}},",
      "",
      "We will be carrying out {{2}} at {{3}} on {{4}}, and need to enter your apartment (unit {{5}}).",
      "",
      "Please choose a time that suits you here:",
      "{{6}}",
      "",
      "Thank you,",
      "MPIRE Property Management",
    ].join("\n"),
    example: ["Ahmed Al Balushi", "Pest control", "Bousher Ameen Mosque", "Sat 4 Oct", "12", "https://example.com/en/visit-booking/abc123"],
  },
  ar: {
    name: "visit_booking_invite_ar",
    language: "ar",
    body: [
      "عزيزنا {{1}}،",
      "",
      "سنقوم بأعمال {{2}} في {{3}} بتاريخ {{4}}، ونحتاج إلى دخول شقتكم (الوحدة {{5}}).",
      "",
      "يرجى اختيار الوقت المناسب لكم من هنا:",
      "{{6}}",
      "",
      "شكراً لكم،",
      "MPIRE لإدارة العقارات",
    ].join("\n"),
    example: ["أحمد البلوشي", "مكافحة الحشرات", "بوشر مسجد الأمين", "السبت 4 أكتوبر", "12", "https://example.com/ar/visit-booking/abc123"],
  },
};

// {{1}} tenant name, {{2}} visit title, {{3}} unit, {{4}} property,
// {{5}} slot, {{6}} manage link
export const VISIT_CONFIRMED_TEMPLATES: Record<Lang, MaintenanceTemplate> = {
  en: {
    name: "visit_booking_confirmed_en",
    language: "en",
    body: [
      "Dear {{1}},",
      "",
      "Your {{2}} visit for unit {{3}}, {{4}} is booked for {{5}}.",
      "",
      "To change or cancel your time, use this link:",
      "{{6}}",
      "",
      "Thank you,",
      "MPIRE Property Management",
    ].join("\n"),
    example: ["Ahmed Al Balushi", "Pest control", "12", "Bousher Ameen Mosque", "Sat 4 Oct, 10:20–10:30", "https://example.com/en/my-visit/xyz789"],
  },
  ar: {
    name: "visit_booking_confirmed_ar",
    language: "ar",
    body: [
      "عزيزنا {{1}}،",
      "",
      "تم حجز موعد {{2}} للوحدة {{3}}، {{4}} في {{5}}.",
      "",
      "لتغيير الموعد أو إلغائه، استخدم هذا الرابط:",
      "{{6}}",
      "",
      "شكراً لكم،",
      "MPIRE لإدارة العقارات",
    ].join("\n"),
    example: ["أحمد البلوشي", "مكافحة الحشرات", "12", "بوشر مسجد الأمين", "السبت 4 أكتوبر، 10:20–10:30", "https://example.com/ar/my-visit/xyz789"],
  },
};

// {{1}} tenant name, {{2}} unit, {{3}} property, {{4}} visit title,
// {{5}} slot, {{6}} manage link
export const VISIT_REMINDER_TEMPLATES: Record<Lang, MaintenanceTemplate> = {
  en: {
    name: "visit_booking_reminder_en",
    language: "en",
    body: [
      "Dear {{1}},",
      "",
      "A reminder that our team will enter unit {{2}}, {{3}} for {{4}} on {{5}}.",
      "",
      "If you need to change or cancel, please use this link:",
      "{{6}}",
      "",
      "Thank you,",
      "MPIRE Property Management",
    ].join("\n"),
    example: ["Ahmed Al Balushi", "12", "Bousher Ameen Mosque", "Pest control", "Sat 4 Oct, 10:20–10:30", "https://example.com/en/my-visit/xyz789"],
  },
  ar: {
    name: "visit_booking_reminder_ar",
    language: "ar",
    body: [
      "عزيزنا {{1}}،",
      "",
      "نذكركم بأن فريقنا سيدخل الوحدة {{2}}، {{3}} لأعمال {{4}} في {{5}}.",
      "",
      "إذا احتجتم إلى تغيير الموعد أو إلغائه، يرجى استخدام هذا الرابط:",
      "{{6}}",
      "",
      "شكراً لكم،",
      "MPIRE لإدارة العقارات",
    ].join("\n"),
    example: ["أحمد البلوشي", "12", "بوشر مسجد الأمين", "مكافحة الحشرات", "السبت 4 أكتوبر، 10:20–10:30", "https://example.com/ar/my-visit/xyz789"],
  },
};

export const VISIT_TEMPLATES: MaintenanceTemplate[] = [
  VISIT_INVITE_TEMPLATES.en,
  VISIT_INVITE_TEMPLATES.ar,
  VISIT_CONFIRMED_TEMPLATES.en,
  VISIT_CONFIRMED_TEMPLATES.ar,
  VISIT_REMINDER_TEMPLATES.en,
  VISIT_REMINDER_TEMPLATES.ar,
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
  propertyName: string;
  unitNumber: string;
  origin: string;
  start_date: string;
  end_date: string;
  slot_minutes: number;
}

function checkRecipient(tenant: TenantRecipient): SendResult | null {
  if (!tenant.phone) return { success: false, error: "tenant has no phone" };
  if (tenant.notifications_enabled === false) {
    return { success: false, error: "tenant notifications disabled" };
  }
  return null;
}

export async function sendVisitInvite(
  tenant: TenantRecipient,
  ctx: VisitMessageContext & { campaignToken: string }
): Promise<SendResult> {
  const blocked = checkRecipient(tenant);
  if (blocked) return blocked;
  const lang = tenantLang(tenant);
  return sendMaintenanceMessage(tenant.phone!, VISIT_INVITE_TEMPLATES[lang], [
    tenant.full_name,
    ctx.title,
    ctx.propertyName,
    formatVisitDates(ctx, lang),
    ctx.unitNumber,
    bookingLink(ctx.origin, lang, ctx.campaignToken),
  ]);
}

export async function sendVisitConfirmation(
  tenant: TenantRecipient,
  ctx: VisitMessageContext & { slotStart: string; manageToken: string }
): Promise<SendResult> {
  const blocked = checkRecipient(tenant);
  if (blocked) return blocked;
  const lang = tenantLang(tenant);
  return sendMaintenanceMessage(tenant.phone!, VISIT_CONFIRMED_TEMPLATES[lang], [
    tenant.full_name,
    ctx.title,
    ctx.unitNumber,
    ctx.propertyName,
    formatSlotRange(ctx.slotStart, ctx.slot_minutes, lang),
    manageLink(ctx.origin, lang, ctx.manageToken),
  ]);
}

export async function sendVisitReminder(
  tenant: TenantRecipient,
  ctx: VisitMessageContext & { slotStart: string; manageToken: string }
): Promise<SendResult> {
  const blocked = checkRecipient(tenant);
  if (blocked) return blocked;
  const lang = tenantLang(tenant);
  return sendMaintenanceMessage(tenant.phone!, VISIT_REMINDER_TEMPLATES[lang], [
    tenant.full_name,
    ctx.unitNumber,
    ctx.propertyName,
    ctx.title,
    formatSlotRange(ctx.slotStart, ctx.slot_minutes, lang),
    manageLink(ctx.origin, lang, ctx.manageToken),
  ]);
}
