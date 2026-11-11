import { sendWhatsAppTemplate, sendWhatsAppTextMessage } from "@/lib/whatsapp/client";
import { sanitiseTemplateParam } from "@/lib/notifications/admin-notify";
import { translateToBengali } from "./translate";

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
  language: "en" | "ar" | "bn";
  /** Set when the template has a media header, sent as a public link. */
  header?: "image";
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

// The watchman's job card: Bengali first, then the same details in English.
// {{1}} request ref, {{2}} property, {{3}} unit, {{4}} category (bn),
// {{5}} urgency (bn), {{6}} description (bn), {{7}} tenant contact,
// {{8}} category (en), {{9}} urgency (en), {{10}} description as written,
// {{11}} link to the job's photos and video (or "none")
const WATCHMAN_JOB_BODY = [
  "নতুন মেরামতের কাজ #{{1}}",
  "",
  "📍 ভবন: {{2}}",
  "🏠 ইউনিট: {{3}}",
  "🔧 কাজের ধরন: {{4}}",
  "⚡ জরুরি মাত্রা: {{5}}",
  "📝 সমস্যা: {{6}}",
  "👤 ভাড়াটিয়া: {{7}}",
  "",
  "অনুগ্রহ করে ভাড়াটিয়ার সাথে যোগাযোগ করে আসার সময় ঠিক করুন।",
  "",
  "English:",
  "🔧 Category: {{8}}",
  "⚡ Urgency: {{9}}",
  "📝 Issue: {{10}}",
  "",
  "📷 ছবি ও ভিডিও / Photos and video: {{11}}",
  "",
  "Please contact the tenant to arrange a visit.",
].join("\n");

const WATCHMAN_JOB_EXAMPLE = [
  "3f9a1c2d",
  "Bousher Ameen Mosque",
  "12",
  "প্লাম্বিং (পানির লাইন)",
  "বেশি জরুরি",
  "রান্নাঘরের সিঙ্কের নিচে ক্যাবিনেটের ভেতরে পানি পড়ছে",
  "Ahmed Al Balushi (+96891234567)",
  "Plumbing",
  "HIGH",
  "Kitchen sink is leaking under the cabinet",
  "https://example.com/en/maintenance-photos/3f9a1c2d-0000-4000-8000-000000000000",
];

/** Text-only card: jobs with no photo WhatsApp can show in the message. */
export const WATCHMAN_JOB_TEMPLATE: MaintenanceTemplate = {
  name: "maintenance_watchman_job_bn",
  language: "bn",
  body: WATCHMAN_JOB_BODY,
  example: WATCHMAN_JOB_EXAMPLE,
};

/** Same card with the job's first photo shown above the text. */
export const WATCHMAN_JOB_PHOTO_TEMPLATE: MaintenanceTemplate = {
  name: "maintenance_watchman_job_bn_photo",
  language: "bn",
  header: "image",
  body: WATCHMAN_JOB_BODY,
  example: WATCHMAN_JOB_EXAMPLE,
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
  WATCHMAN_JOB_TEMPLATE,
  WATCHMAN_JOB_PHOTO_TEMPLATE,
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

const CATEGORY_LABELS_BN: Record<string, string> = {
  plumbing: "প্লাম্বিং (পানির লাইন)",
  electrical: "বৈদ্যুতিক কাজ",
  ac: "এসি",
  structural: "ভবনের কাঠামো",
  painting: "রং করা",
  cleaning: "পরিষ্কার করা",
  pest: "পোকামাকড় দমন",
  other: "অন্যান্য",
};

const URGENCY_LABELS_BN: Record<string, string> = {
  low: "কম জরুরি",
  medium: "মাঝারি",
  high: "বেশি জরুরি",
  emergency: "খুব জরুরি — এখনই",
};

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

export type SendResult = {
  success: boolean;
  via?: "template" | "text";
  messageId?: string;
  error?: string;
  /** Why the template was rejected when the text fallback was used. */
  templateError?: string;
};

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
  if (templateResult.success) return { success: true, via: "template", messageId: templateResult.messageId };

  // Template missing / not yet approved: free-form text still reaches anyone
  // who has messaged the business number in the last 24h.
  const textResult = await sendWhatsAppTextMessage(to, render(template, params));
  if (textResult.success) {
    return { success: true, via: "text", messageId: textResult.messageId, templateError: templateResult.error };
  }

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

function technicianJobParams(ctx: MaintenanceMessageContext): string[] {
  return [
    requestRef(ctx.requestId),
    ctx.propertyName,
    ctx.unitNumber,
    categoryLabel(ctx.category),
    ctx.urgency.toUpperCase(),
    trimDescription(ctx.description),
    tenantContact(ctx),
  ];
}

// The Bengali card carries the description twice (translated and as written)
// and has to stay inside WhatsApp's 1024-character body, so each copy gets a
// tighter cap than the single-language card.
const BN_DESCRIPTION_LIMIT = 240;

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** A photo or video attached to the request (maintenance_attachments). */
export interface JobAttachment {
  url: string;
  type: "photo" | "video";
  size: number | null;
}

export interface JobMedia {
  attachments: JobAttachment[];
  /** Public page listing every attachment; null when there is nothing to show. */
  galleryUrl: string | null;
}

// WhatsApp only shows JPEG and PNG up to 5 MB in a template's image header.
// Anything else (HEIC from an iPhone, WebP, video) is reached through the link.
const HEADER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function headerImage(media: JobMedia | undefined): string | null {
  const photo = media?.attachments.find(
    (a) =>
      a.type === "photo" &&
      /\.(jpe?g|png)$/i.test(a.url.split("?")[0]) &&
      (a.size == null || a.size <= HEADER_IMAGE_MAX_BYTES)
  );
  return photo?.url ?? null;
}

async function watchmanJobParams(ctx: MaintenanceMessageContext, media: JobMedia | undefined): Promise<string[]> {
  const category = ctx.category ?? "";
  const translated = await translateToBengali(clip(ctx.description, 400));
  const tenant = ctx.tenantName ? tenantContact(ctx) : "ভাড়াটিয়া নেই (খালি ইউনিট)";
  return [
    requestRef(ctx.requestId),
    ctx.propertyName,
    ctx.unitNumber,
    CATEGORY_LABELS_BN[category] ?? (category || CATEGORY_LABELS_BN.other),
    URGENCY_LABELS_BN[ctx.urgency.toLowerCase()] ?? ctx.urgency.toUpperCase(),
    // No translation available: point at the original text further down.
    translated ? clip(translated, BN_DESCRIPTION_LIMIT) : "নিচে ইংরেজিতে দেখুন",
    tenant,
    categoryLabel(ctx.category),
    ctx.urgency.toUpperCase(),
    clip(ctx.description, BN_DESCRIPTION_LIMIT),
    media?.galleryUrl ?? "নেই / None",
  ];
}

/**
 * Job card for the assigned technician. The watchman gets it in Bengali with
 * the English underneath, the first photo above the text when there is one
 * WhatsApp can show, and a link to all the photos and the video. Everyone
 * else gets the English card.
 *
 * Each step falls back to the next, so a job is never lost to a template
 * Meta hasn't approved yet: photo card, text card, free-form text (delivers
 * inside the 24h window), then the English card.
 */
export async function sendTechnicianJob(
  phone: string,
  ctx: MaintenanceMessageContext,
  media?: JobMedia
): Promise<SendResult> {
  if (isWatchman(phone)) {
    const to = formatWhatsAppPhone(phone);
    const params = (await watchmanJobParams(ctx, media)).map(sanitiseTemplateParam);
    const body = { type: "body" as const, parameters: params.map((text) => ({ type: "text" as const, text })) };
    const errors: string[] = [];

    const image = headerImage(media);
    if (image) {
      const withPhoto = await sendWhatsAppTemplate({
        to,
        templateName: WATCHMAN_JOB_PHOTO_TEMPLATE.name,
        languageCode: WATCHMAN_JOB_PHOTO_TEMPLATE.language,
        components: [{ type: "header", parameters: [{ type: "image", image: { link: image } }] }, body],
      });
      if (withPhoto.success) return { success: true, via: "template", messageId: withPhoto.messageId };
      errors.push(`photo card: ${withPhoto.error}`);
    }

    const textCard = await sendWhatsAppTemplate({
      to,
      templateName: WATCHMAN_JOB_TEMPLATE.name,
      languageCode: WATCHMAN_JOB_TEMPLATE.language,
      components: [body],
    });
    if (textCard.success) {
      return {
        success: true,
        via: "template",
        messageId: textCard.messageId,
        ...(errors.length > 0 && { templateError: errors.join("; ") }),
      };
    }
    errors.push(`text card: ${textCard.error}`);

    const text = await sendWhatsAppTextMessage(to, render(WATCHMAN_JOB_TEMPLATE, params));
    if (text.success) {
      return { success: true, via: "text", messageId: text.messageId, templateError: errors.join("; ") };
    }
    console.warn("[maintenance-whatsapp] Bengali job card not delivered, sending English", {
      errors,
      textError: text.error,
    });
  }
  return sendMaintenanceMessage(phone, TECHNICIAN_JOB_TEMPLATE, technicianJobParams(ctx));
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
 * The building watchman, who receives every new maintenance job unless the
 * environment names someone else.
 */
const WATCHMAN = { name: "Watchman", phone: "96894246200" };

/** Whether a number is the watchman's, however it was typed (+968, spaces, bare 8 digits). */
function isWatchman(phone: string): boolean {
  return formatWhatsAppPhone(phone) === WATCHMAN.phone;
}

/**
 * The fixed maintenance technician: MAINTENANCE_TECHNICIAN_PHONE (and
 * optional MAINTENANCE_TECHNICIAN_NAME) when set, otherwise the watchman.
 * New requests are auto-assigned to this technician when no one else is
 * assigned, and get the job card on WhatsApp.
 */
export function defaultTechnician(): { name: string; phone: string } {
  const phone = process.env.MAINTENANCE_TECHNICIAN_PHONE?.trim();
  if (!phone) return WATCHMAN;
  const name = process.env.MAINTENANCE_TECHNICIAN_NAME?.trim() || "Maintenance Technician";
  return { name, phone };
}
