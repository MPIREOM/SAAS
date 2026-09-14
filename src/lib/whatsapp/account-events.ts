import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { buildAdminEmailHtml, notifyAdmins } from "@/lib/notifications/admin-notify";

// WhatsApp Business Account webhooks that are about the account or the
// number itself rather than about a message: bans, restrictions, quality
// downgrades, Coexistence disconnects, review outcomes. The Meta app is
// subscribed to these fields so that a ban shows up in the logs (and in the
// admins' inbox) the moment it happens, instead of being discovered days
// later when the agent stops answering.
//
// Email only: if the number is banned, WhatsApp is the one channel that is
// guaranteed not to work.

export const WHATSAPP_ACCOUNT_EVENT_FIELDS = new Set([
  "account_update",
  "account_alerts",
  "phone_number_quality_update",
  "account_review_update",
]);

export function isAccountEventField(field: unknown): field is string {
  return typeof field === "string" && WHATSAPP_ACCOUNT_EVENT_FIELDS.has(field);
}

/** Flatten the interesting parts of an event value into "key: value" lines. */
export function summariseAccountEvent(
  field: string,
  value: Record<string, unknown>
): string[] {
  const lines: string[] = [`field: ${field}`];
  const flat = (prefix: string, obj: unknown, depth: number) => {
    if (depth > 2 || obj == null) return;
    if (typeof obj !== "object") {
      lines.push(`${prefix}: ${String(obj)}`);
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => flat(`${prefix}[${i}]`, item, depth + 1));
      return;
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flat(prefix ? `${prefix}.${k}` : k, v, depth + 1);
    }
  };
  flat("", value, 0);
  return lines;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Log the event at error level (so it stands out in Vercel logs) and email
 * every active admin recipient. Never throws: the webhook must always ACK.
 */
export async function handleWhatsAppAccountEvent(
  field: string,
  value: Record<string, unknown>,
  wabaId: string | undefined
): Promise<void> {
  const summary = summariseAccountEvent(field, value);
  console.error("[WhatsApp Webhook] Account event", {
    field,
    wabaId: wabaId ?? null,
    summary,
    raw: JSON.stringify(value).slice(0, 4000),
  });

  try {
    const supabase = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: recipients, error } = await supabase
      .from("admin_notification_recipients")
      .select("name, email, phone, notify_email, notify_whatsapp")
      .eq("is_active", true)
      .eq("notify_email", true);
    if (error) {
      console.error("[WhatsApp Webhook] recipients query failed:", error.message);
      return;
    }
    const emailRecipients = (recipients ?? [])
      .filter((r) => typeof r.email === "string" && r.email.length > 0)
      .map((r) => ({
        name: (r.name as string) || "Admin",
        email: r.email as string,
        phone: null,
        notify_email: true,
        notify_whatsapp: false,
      }));
    if (emailRecipients.length === 0) {
      console.warn("[WhatsApp Webhook] Account event not emailed: no active email recipients");
      return;
    }

    const eventName =
      typeof value.event === "string"
        ? value.event
        : typeof value.alert_type === "string"
          ? value.alert_type
          : field;
    const subject = `WhatsApp account alert: ${eventName}`;
    const result = await notifyAdmins(emailRecipients, {
      subject,
      whatsappText: "",
      emailHtml: buildAdminEmailHtml({
        title: "WhatsApp account alert",
        sections: [
          {
            heading: "What Meta reported",
            items: summary.map(escapeHtml),
          },
          {
            heading: "What to do",
            items: [
              "Open WhatsApp Manager → Account tools → Phone numbers and check the number's status.",
              "A ban or restriction usually has a review/appeal option there; the appeal window is limited.",
              "Until the number is healthy, outbound reminders and the WhatsApp agent will not reach anyone.",
            ],
          },
        ],
        footer: `WhatsApp Business Account ${wabaId ?? "unknown"} · automated alert from MPIRE`,
      }),
    });
    if (result.errors > 0) {
      console.error("[WhatsApp Webhook] Account event email failures", result.failures);
    }
  } catch (err) {
    console.error(
      "[WhatsApp Webhook] Account event notification failed:",
      err instanceof Error ? err.message : err
    );
  }
}
