import { sendWhatsAppTemplate, sendWhatsAppTextMessage } from "@/lib/whatsapp/client";
import { sanitiseTemplateParam } from "@/lib/notifications/admin-notify";

// WhatsApp messages for the maintenance workflow: the admin alert on a new
// request, the job card for the technician, and status updates for the
// tenant. Business-initiated messages only deliver outside Meta's 24h
// customer-service window as approved templates, so each message is sent as
// a template first and falls back to free-form text (which works inside the
// window, e.g. before the template is approved). The bodies below are also
// what the WhatsApp setup page submits to Meta (template-definitions.ts), so
// sender and template can't drift apart.

export interface MaintenanceTemplate {
  name: string;
  language: "en" | "ar";
  body: string;
  example: string[];
}

// {{1}} request ref, {{2}} property, {{3}} unit, {{4}} tenant, {{5}} category,
// {{6}} urgency, {{7}} description, {{8}} dashboard link
export const ADMIN_ALERT_TEMPLATE: MaintenanceTemplate = {
  name: "maintenance_admin_alert",
  language: "en",
  body: [
    "New maintenance request #{{1}}",
    "",
    "📍 Property: {{2}}",
    "🏠 Unit: {{3}}",
    "👤 Tenant: {{4}}",
    "🔧 Category: {{5}}",
    "⚡ Urgency: {{6}}",
    "📝 Issue: {{7}}",
    "",
    "🔗 {{8}}",
    "",
    "MPIRE Property Management",
  ].join("\n"),
  example: [
    "3f9a1c2d",
    "Bousher Ameen Mosque",
    "12",
    "Ahmed Al Balushi (+96891234567)",
    "Plumbing",
    "HIGH",
    "Kitchen sink is leaking under the cabinet",
    "https://example.com/en/maintenance/3f9a1c2d",
  ],
};

// {{1}} request ref, {{2}} property, {{3}} unit, {{4}} category, {{5}} urgency,
// {{6}} description, {{7}} tenant contact
export const TECHNICIAN_JOB_TEMPLATE: MaintenanceTemplate = {
  name: "maintenance_technician_job",
  language: "en",
  body: [
    "New maintenance job #{{1}}",
    "",
    "📍 Property: {{2}}",
    "🏠 Unit: {{3}}",
    "🔧 Category: {{4}}",
    "⚡ Urgency: {{5}}",
    "📝 Issue: {{6}}",
    "👤 Tenant: {{7}}",
    "",
    "Please contact the tenant to arrange a visit.",
  ].join("\n"),
  example: [
    "3f9a1c2d",
    "Bousher Ameen Mosque",
    "12",
    "Plumbing",
    "HIGH",
    "Kitchen sink is leaking under the cabinet",
    "Ahmed Al Balushi (+96891234567)",
  ],
};

// {{1}} tenant name, {{2}} request ref, {{3}} unit, {{4}} property, {{5}} status message
export const TENANT_UPDATE_TEMPLATES: Record<"en" | "ar", MaintenanceTemplate> = {
  en: {
    name: "maintenance_tenant_update_en",
    language: "en",
    body: [
      "Dear {{1}},",
      "",
      "Update on your maintenance request #{{2}} for unit {{3}}, {{4}}:",
      "",
      "{{5}}",
      "",
      "Thank you,",
      "MPIRE Property Management",
    ].join("\n"),
    example: [
      "Ahmed Al Balushi",
      "3f9a1c2d",
      "12",
      "Bousher Ameen Mosque",
      "We have received your request and our team will contact you soon.",
    ],
  },
  ar: {
    name: "maintenance_tenant_update_ar",
    language: "ar",
    body: [
      "عزيزنا {{1}}،",
      "",
      "تحديث بشأن طلب الصيانة رقم {{2}} للوحدة {{3}}، {{4}}:",
      "",
      "{{5}}",
      "",
      "شكراً لكم،",
      "MPIRE لإدارة العقارات",
    ].join("\n"),
    example: [
      "أحمد البلوشي",
      "3f9a1c2d",
      "12",
      "بوشر مسجد الأمين",
      "لقد استلمنا طلبك وسيتواصل معك فريقنا قريباً.",
    ],
  },
};

export const MAINTENANCE_TEMPLATES: MaintenanceTemplate[] = [
  ADMIN_ALERT_TEMPLATE,
  TECHNICIAN_JOB_TEMPLATE,
  TENANT_UPDATE_TEMPLATES.en,
  TENANT_UPDATE_TEMPLATES.ar,
];

/** Statuses the tenant is told about, and what they're told. */
export type TenantNotifiableStatus = "open" | "in_progress" | "resolved";

const TENANT_STATUS_MESSAGES: Record<TenantNotifiableStatus, Record<"en" | "ar", string>> = {
  open: {
    en: "We have received your request and our team will contact you soon.",
    ar: "لقد استلمنا طلبك وسيتواصل معك فريقنا قريباً.",
  },
  in_progress: {
    en: "A technician has been assigned and work on your request is in progress.",
    ar: "تم تعيين فني والعمل جارٍ على طلبك.",
  },
  resolved: {
    en: "The work has been completed. If the issue is not fixed, please let us know.",
    ar: "تم إنجاز العمل. إذا لم تُحل المشكلة، يرجى إبلاغنا.",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  ac: "Air Conditioning",
  structural: "Structural",
  painting: "Painting",
  cleaning: "Cleaning",
  pest: "Pest Control",
  other: "Other",
};

export function categoryLabel(category: string | null | undefined): string {
  return CATEGORY_LABELS[category ?? ""] ?? (category || "Other");
}

/** Short human reference for a request: the first 8 chars of its UUID. */
export function requestRef(id: string): string {
  return id.slice(0, 8);
}

/** International format for the Cloud API; bare 8-digit numbers are Omani. */
export function formatWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 8) return `968${digits}`;
  return digits;
}

function render(template: MaintenanceTemplate, params: string[]): string {
  return template.body.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => params[Number(n) - 1] ?? "");
}

export type SendResult = { success: boolean; via?: "template" | "text"; error?: string };

/** Send as an approved template, falling back to free-form text. Also used by lib/visits. */
export async function sendMaintenanceMessage(
  phone: string,
  template: MaintenanceTemplate,
  rawParams: string[]
): Promise<SendResult> {
  const to = formatWhatsAppPhone(phone);
  if (!to) return { success: false, error: "no phone number" };
  const params = rawParams.map(sanitiseTemplateParam);

  const templateResult = await sendWhatsAppTemplate({
    to,
    templateName: template.name,
    languageCode: template.language,
    components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
  });
  if (templateResult.success) return { success: true, via: "template" };

  // Template missing / not yet approved: free-form text still reaches anyone
  // who has messaged the business number in the last 24h.
  const textResult = await sendWhatsAppTextMessage(to, render(template, params));
  if (textResult.success) return { success: true, via: "text" };

  console.error("[maintenance-whatsapp] send failed", {
    to,
    template: template.name,
    templateError: templateResult.error,
    textError: textResult.error,
  });
  return { success: false, error: templateResult.error || textResult.error };
}

export interface MaintenanceMessageContext {
  requestId: string;
  propertyName: string;
  unitNumber: string;
  category: string | null;
  urgency: string;
  description: string;
  tenantName: string | null;
  tenantPhone: string | null;
}

function tenantContact(ctx: MaintenanceMessageContext): string {
  if (!ctx.tenantName) return "No tenant (vacant unit)";
  return ctx.tenantPhone ? `${ctx.tenantName} (${ctx.tenantPhone})` : ctx.tenantName;
}

function trimDescription(description: string): string {
  return description.length > 400 ? `${description.slice(0, 400)}…` : description;
}

export function adminAlertParams(ctx: MaintenanceMessageContext, dashboardLink: string): string[] {
  return [
    requestRef(ctx.requestId),
    ctx.propertyName,
    ctx.unitNumber,
    tenantContact(ctx),
    categoryLabel(ctx.category),
    ctx.urgency.toUpperCase(),
    trimDescription(ctx.description),
    dashboardLink,
  ];
}

export async function sendTechnicianJob(
  phone: string,
  ctx: MaintenanceMessageContext
): Promise<SendResult> {
  return sendMaintenanceMessage(phone, TECHNICIAN_JOB_TEMPLATE, [
    requestRef(ctx.requestId),
    ctx.propertyName,
    ctx.unitNumber,
    categoryLabel(ctx.category),
    ctx.urgency.toUpperCase(),
    trimDescription(ctx.description),
    tenantContact(ctx),
  ]);
}

export interface TenantRecipient {
  full_name: string;
  phone: string | null;
  language_preference: string | null;
  notifications_enabled: boolean | null;
}

export async function sendTenantStatusUpdate(
  tenant: TenantRecipient,
  status: TenantNotifiableStatus,
  ctx: Pick<MaintenanceMessageContext, "requestId" | "propertyName" | "unitNumber">
): Promise<SendResult> {
  if (!tenant.phone) return { success: false, error: "tenant has no phone" };
  if (tenant.notifications_enabled === false) {
    return { success: false, error: "tenant notifications disabled" };
  }
  const lang = tenant.language_preference === "ar" ? "ar" : "en";
  return sendMaintenanceMessage(tenant.phone, TENANT_UPDATE_TEMPLATES[lang], [
    tenant.full_name,
    requestRef(ctx.requestId),
    ctx.unitNumber,
    ctx.propertyName,
    TENANT_STATUS_MESSAGES[status][lang],
  ]);
}

/**
 * The fixed maintenance technician, configured via environment:
 * MAINTENANCE_TECHNICIAN_PHONE (required to enable) and
 * MAINTENANCE_TECHNICIAN_NAME (optional). New requests are auto-assigned to
 * this technician when no one else is assigned.
 */
export function defaultTechnician(): { name: string; phone: string } | null {
  const phone = process.env.MAINTENANCE_TECHNICIAN_PHONE?.trim();
  if (!phone) return null;
  const name = process.env.MAINTENANCE_TECHNICIAN_NAME?.trim() || "Maintenance Technician";
  return { name, phone };
}
