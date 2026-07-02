import { sendEmail } from "@/lib/email/client";

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

interface AdminNotifyOptions {
  subject: string;
  emailHtml: string;
  whatsappText: string;
  /** If provided, sends via Meta template instead of free-form text */
  whatsappTemplate?: {
    name: string;
    languageCode: string;
    parameters: string[];
  };
}

interface Recipient {
  name: string;
  email: string | null;
  phone: string | null;
  notify_email: boolean;
  notify_whatsapp: boolean;
}

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.startsWith("+") ? cleaned : "+" + cleaned;
}

// Meta's body-parameter validation rejects:
//   - newline / tab / carriage-return characters
//   - more than 4 consecutive spaces
//   - empty or whitespace-only values
//   - values longer than 1024 chars (per param)
// Any of these returns error 132012 ("Parameter format does not match the
// format in the created template") with no per-param hint, which is what
// silently broke today's daily summary. Run every template parameter
// through this so the sender can never produce a value Meta will reject.
export function sanitiseTemplateParam(raw: string): string {
  const collapsed = (raw ?? "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/ {5,}/g, "    ")
    .trim();
  const safe = collapsed.length > 0 ? collapsed : "—";
  return safe.length > 1024 ? safe.slice(0, 1021) + "…" : safe;
}

async function sendWhatsAppText(to: string, text: string): Promise<{ success: boolean; error?: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    console.error("[admin-notify] WhatsApp text skipped: credentials not configured");
    return { success: false, error: "WhatsApp not configured" };
  }

  try {
    const res = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\+/g, ""),
        type: "text",
        text: { body: text },
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("[admin-notify] WhatsApp text failed", {
        to,
        status: res.status,
        metaError: data?.error,
      });
      return { success: false, error: data?.error?.message || `WhatsApp API ${res.status}` };
    }
    return { success: true };
  } catch (err) {
    console.error("[admin-notify] WhatsApp text threw", { to, err });
    return { success: false, error: err instanceof Error ? err.message : "Unknown" };
  }
}

async function sendWhatsAppTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  parameters: string[]
): Promise<{ success: boolean; error?: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    console.error("[admin-notify] WhatsApp template skipped: credentials not configured", { templateName });
    return { success: false, error: "WhatsApp not configured" };
  }

  try {
    const res = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\+/g, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [
            {
              type: "body",
              parameters: parameters.map((p) => ({ type: "text", text: p })),
            },
          ],
        },
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("[admin-notify] WhatsApp template failed", {
        to,
        templateName,
        languageCode,
        paramCount: parameters.length,
        status: res.status,
        metaError: data?.error,
      });
      return { success: false, error: data.error?.message || `WhatsApp API ${res.status}` };
    }
    return { success: true };
  } catch (err) {
    console.error("[admin-notify] WhatsApp template threw", { to, templateName, err });
    return { success: false, error: err instanceof Error ? err.message : "Unknown" };
  }
}

// Send a template message that includes a document (PDF) header — used by
// the weekly owner report cron. Meta's template document header takes a
// public link and an optional filename; the body parameters work the same
// way as a text-only template.
export async function sendWhatsAppDocumentTemplate(args: {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParameters: string[];
  documentLink: string;
  filename: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, templateName, languageCode, bodyParameters, documentLink, filename } = args;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    console.error("[admin-notify] WhatsApp document template skipped: credentials not configured", { templateName });
    return { success: false, error: "WhatsApp not configured" };
  }

  try {
    const res = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\+/g, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [
            {
              type: "header",
              parameters: [
                {
                  type: "document",
                  document: { link: documentLink, filename },
                },
              ],
            },
            {
              type: "body",
              parameters: bodyParameters.map((p) => ({ type: "text", text: p })),
            },
          ],
        },
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("[admin-notify] WhatsApp document template failed", {
        to,
        templateName,
        languageCode,
        bodyParamCount: bodyParameters.length,
        status: res.status,
        metaError: data?.error,
      });
      return { success: false, error: data.error?.message || `WhatsApp API ${res.status}` };
    }
    return { success: true };
  } catch (err) {
    console.error("[admin-notify] WhatsApp document template threw", { to, templateName, err });
    return { success: false, error: err instanceof Error ? err.message : "Unknown" };
  }
}

export type NotifyAdminsResult = {
  emailsSent: number;
  whatsappSent: number;
  errors: number;
  // Per-failure error details. Persisted into cron_run_logs.summary so we can
  // diagnose Meta rejections (parameter count, format, etc.) from SQL — Vercel
  // function logs only surface the first stdout line per request.
  failures: Array<{
    channel: "email" | "whatsapp";
    recipient: string;
    error: string;
  }>;
};

export async function notifyAdmins(
  recipients: Recipient[],
  options: AdminNotifyOptions
): Promise<NotifyAdminsResult> {
  let emailsSent = 0;
  let whatsappSent = 0;
  let errors = 0;
  const failures: NotifyAdminsResult["failures"] = [];

  for (const r of recipients) {
    if (r.notify_email && r.email) {
      const result = await sendEmail({
        to: r.email,
        subject: options.subject,
        html: options.emailHtml,
      });
      if (result.success) emailsSent++;
      else {
        errors++;
        failures.push({
          channel: "email",
          recipient: r.email,
          error: result.error || "unknown",
        });
      }
    }

    if (r.notify_whatsapp && r.phone) {
      const phone = formatPhone(r.phone);
      const result = options.whatsappTemplate
        ? await sendWhatsAppTemplateMessage(
            phone,
            options.whatsappTemplate.name,
            options.whatsappTemplate.languageCode,
            options.whatsappTemplate.parameters
          )
        : await sendWhatsAppText(phone, options.whatsappText);
      if (result.success) whatsappSent++;
      else {
        errors++;
        failures.push({
          channel: "whatsapp",
          recipient: phone,
          error: result.error || "unknown",
        });
      }
    }
  }

  return { emailsSent, whatsappSent, errors, failures };
}

export function buildAdminEmailHtml(params: {
  title: string;
  sections: Array<{ heading: string; items: string[] }>;
  footer?: string;
}): string {
  const sectionHtml = params.sections.map(s => `
    <h2 style="color:#C9A84C;font-size:16px;font-weight:700;margin:24px 0 12px;border-bottom:1px solid #2A293A;padding-bottom:8px;">
      ${s.heading}
    </h2>
    ${s.items.length > 0
      ? `<ul style="padding-left:16px;margin:0;">${s.items.map(i => `<li style="color:#F0EDE6;font-size:14px;line-height:1.8;margin-bottom:4px;">${i}</li>`).join("")}</ul>`
      : `<p style="color:#8A8697;font-size:13px;font-style:italic;">None</p>`
    }
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0B0A0F;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background-color:#13121A;border:1px solid #2A293A;border-radius:12px;padding:32px;">
      <div style="margin-bottom:24px;">
        <span style="color:#C9A84C;font-size:22px;font-weight:800;letter-spacing:-0.5px;">MPIRE</span>
        <span style="color:#8A8697;font-size:13px;margin-left:8px;">Property Management</span>
      </div>
      <h1 style="color:#F0EDE6;font-size:18px;font-weight:700;margin:0 0 8px;">${params.title}</h1>
      <p style="color:#8A8697;font-size:12px;margin:0 0 16px;">${new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      ${sectionHtml}
      ${params.footer ? `<p style="color:#8A8697;font-size:11px;margin-top:24px;text-align:center;">${params.footer}</p>` : ""}
    </div>
  </div>
</body>
</html>`;
}
