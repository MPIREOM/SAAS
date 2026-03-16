import { sendEmail } from "@/lib/email/client";
import { CURRENCY } from "@/lib/currency";

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

interface AdminNotifyOptions {
  subject: string;
  emailHtml: string;
  whatsappText: string;
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

async function sendWhatsAppText(to: string, text: string): Promise<{ success: boolean; error?: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return { success: false, error: "WhatsApp not configured" };

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
    if (!res.ok) return { success: false, error: `WhatsApp API ${res.status}` };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown" };
  }
}

export async function notifyAdmins(
  recipients: Recipient[],
  options: AdminNotifyOptions
): Promise<{ emailsSent: number; whatsappSent: number; errors: number }> {
  let emailsSent = 0;
  let whatsappSent = 0;
  let errors = 0;

  for (const r of recipients) {
    if (r.notify_email && r.email) {
      const result = await sendEmail({
        to: r.email,
        subject: options.subject,
        html: options.emailHtml,
      });
      if (result.success) emailsSent++;
      else errors++;
    }

    if (r.notify_whatsapp && r.phone) {
      const result = await sendWhatsAppText(formatPhone(r.phone), options.whatsappText);
      if (result.success) whatsappSent++;
      else errors++;
    }
  }

  return { emailsSent, whatsappSent, errors };
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
