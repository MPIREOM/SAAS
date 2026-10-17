import {
  sendMaintenanceMessage,
  type MaintenanceTemplate,
  type SendResult,
  type TenantRecipient,
} from "@/lib/maintenance/whatsapp";

// WhatsApp messages for the building-rules agreement: the signing link,
// the reminder, the signed-copy confirmation, and the notice sent when a
// violation fee is charged. Same template-then-text
// approach as maintenance and visits.
//
// NOT YET SUBMITTED TO META: these bodies are pending review, so they are
// deliberately not listed in template-definitions.ts yet. Until they are
// approved every send falls back to free-form text, which only reaches
// tenants who messaged the business number in the last 24 hours (the email
// copy still goes out).

type Lang = "en" | "ar";

// {{1}} tenant name, {{2}} unit, {{3}} property, {{4}} signing link
export const AGREEMENT_REQUEST_TEMPLATES: Record<Lang, MaintenanceTemplate> = {
  en: {
    name: "tenant_agreement_request_en",
    language: "en",
    body: [
      "Dear {{1}},",
      "",
      "Welcome to unit {{2}}, {{3}}. Please read and sign the building rules agreement (garbage chute, gate keys and alterations to the apartment). It takes about a minute:",
      "{{4}}",
      "",
      "Thank you,",
      "MPIRE Property Management",
    ].join("\n"),
    example: ["Ahmed Al Balushi", "12", "Bousher Ameen Mosque", "https://example.com/en/tenant-agreement/abc123"],
  },
  ar: {
    name: "tenant_agreement_request_ar",
    language: "ar",
    body: [
      "عزيزنا {{1}}،",
      "",
      "أهلاً بكم في الوحدة {{2}}، {{3}}. يرجى قراءة اتفاقية قواعد المبنى (مجرى القمامة ومفاتيح البوابة والتعديلات على الشقة) والتوقيع عليها، ولن يستغرق ذلك أكثر من دقيقة:",
      "{{4}}",
      "",
      "شكراً لكم،",
      "MPIRE لإدارة العقارات",
    ].join("\n"),
    example: ["أحمد البلوشي", "12", "بوشر مسجد الأمين", "https://example.com/ar/tenant-agreement/abc123"],
  },
};

// {{1}} tenant name, {{2}} unit, {{3}} property, {{4}} signing link
export const AGREEMENT_REMINDER_TEMPLATES: Record<Lang, MaintenanceTemplate> = {
  en: {
    name: "tenant_agreement_reminder_en",
    language: "en",
    body: [
      "Dear {{1}},",
      "",
      "A reminder that the building rules agreement for unit {{2}}, {{3}} is still waiting for your signature. Please sign it here:",
      "{{4}}",
      "",
      "Thank you,",
      "MPIRE Property Management",
    ].join("\n"),
    example: ["Ahmed Al Balushi", "12", "Bousher Ameen Mosque", "https://example.com/en/tenant-agreement/abc123"],
  },
  ar: {
    name: "tenant_agreement_reminder_ar",
    language: "ar",
    body: [
      "عزيزنا {{1}}،",
      "",
      "نذكّركم بأن اتفاقية قواعد المبنى للوحدة {{2}}، {{3}} لا تزال بانتظار توقيعكم. يرجى التوقيع من هنا:",
      "{{4}}",
      "",
      "شكراً لكم،",
      "MPIRE لإدارة العقارات",
    ].join("\n"),
    example: ["أحمد البلوشي", "12", "بوشر مسجد الأمين", "https://example.com/ar/tenant-agreement/abc123"],
  },
};

// {{1}} tenant name, {{2}} unit, {{3}} property, {{4}} link to the signed copy
export const AGREEMENT_SIGNED_TEMPLATES: Record<Lang, MaintenanceTemplate> = {
  en: {
    name: "tenant_agreement_signed_en",
    language: "en",
    body: [
      "Dear {{1}},",
      "",
      "Thank you for signing the building rules agreement for unit {{2}}, {{3}}. You can download your signed copy here:",
      "{{4}}",
      "",
      "Thank you,",
      "MPIRE Property Management",
    ].join("\n"),
    example: ["Ahmed Al Balushi", "12", "Bousher Ameen Mosque", "https://example.com/en/tenant-agreement/abc123"],
  },
  ar: {
    name: "tenant_agreement_signed_ar",
    language: "ar",
    body: [
      "عزيزنا {{1}}،",
      "",
      "شكراً لتوقيعكم على اتفاقية قواعد المبنى للوحدة {{2}}، {{3}}. يمكنكم تحميل نسختكم الموقّعة من هنا:",
      "{{4}}",
      "",
      "شكراً لكم،",
      "MPIRE لإدارة العقارات",
    ].join("\n"),
    example: ["أحمد البلوشي", "12", "بوشر مسجد الأمين", "https://example.com/ar/tenant-agreement/abc123"],
  },
};

// {{1}} tenant name, {{2}} unit, {{3}} property, {{4}} what happened,
// {{5}} fee in OMR, {{6}} due date
export const VIOLATION_NOTICE_TEMPLATES: Record<Lang, MaintenanceTemplate> = {
  en: {
    name: "tenant_violation_notice_en",
    language: "en",
    body: [
      "Dear {{1}},",
      "",
      "A building rules violation has been recorded for unit {{2}}, {{3}}:",
      "{{4}}",
      "",
      "A fee of {{5}} OMR has been added to your account, due on {{6}} with your next rent.",
      "",
      "If you have any questions, please reply to this message.",
      "MPIRE Property Management",
    ].join("\n"),
    example: ["Ahmed Al Balushi", "12", "Bousher Ameen Mosque", "Garbage left outside the garbage chute on 17 Oct 2026", "10.000", "1 Nov 2026"],
  },
  ar: {
    name: "tenant_violation_notice_ar",
    language: "ar",
    body: [
      "عزيزنا {{1}}،",
      "",
      "تم تسجيل مخالفة لقواعد المبنى للوحدة {{2}}، {{3}}:",
      "{{4}}",
      "",
      "تمت إضافة رسوم قدرها {{5}} ريال عماني إلى حسابكم، وتُستحق بتاريخ {{6}} مع الإيجار القادم.",
      "",
      "لأي استفسار، يرجى الرد على هذه الرسالة.",
      "MPIRE لإدارة العقارات",
    ].join("\n"),
    example: ["أحمد البلوشي", "12", "بوشر مسجد الأمين", "ترك القمامة خارج مجرى القمامة بتاريخ 17 Oct 2026", "10.000", "1 Nov 2026"],
  },
};

/** Tell the tenant a violation fee was charged. Never throws. */
export async function sendViolationNotice(
  tenant: TenantRecipient,
  ctx: { unitNumber: string; propertyName: string; description: string; amount: string; dueDate: string }
): Promise<SendResult> {
  if (!tenant.phone) return { success: false, error: "tenant has no phone" };
  if (tenant.notifications_enabled === false) return { success: false, error: "tenant notifications disabled" };
  try {
    return await sendMaintenanceMessage(tenant.phone, VIOLATION_NOTICE_TEMPLATES[tenantLang(tenant)], [
      tenant.full_name,
      ctx.unitNumber,
      ctx.propertyName,
      ctx.description,
      ctx.amount,
      ctx.dueDate,
    ]);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type AgreementMessageKind = "request" | "reminder" | "signed";

const TEMPLATES: Record<AgreementMessageKind, Record<Lang, MaintenanceTemplate>> = {
  request: AGREEMENT_REQUEST_TEMPLATES,
  reminder: AGREEMENT_REMINDER_TEMPLATES,
  signed: AGREEMENT_SIGNED_TEMPLATES,
};

export function tenantLang(tenant: Pick<TenantRecipient, "language_preference">): Lang {
  return tenant.language_preference === "ar" ? "ar" : "en";
}

export function agreementLink(origin: string, lang: Lang, token: string): string {
  return `${origin.replace(/\/+$/, "")}/${lang}/tenant-agreement/${token}`;
}

/** Send one agreement message. Never throws. */
export async function sendAgreementWhatsApp(
  kind: AgreementMessageKind,
  tenant: TenantRecipient,
  ctx: { unitNumber: string; propertyName: string; origin: string; token: string }
): Promise<SendResult> {
  if (!tenant.phone) return { success: false, error: "tenant has no phone" };
  if (tenant.notifications_enabled === false) return { success: false, error: "tenant notifications disabled" };
  const lang = tenantLang(tenant);
  try {
    return await sendMaintenanceMessage(tenant.phone, TEMPLATES[kind][lang], [
      tenant.full_name,
      ctx.unitNumber,
      ctx.propertyName,
      agreementLink(ctx.origin, lang, ctx.token),
    ]);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
