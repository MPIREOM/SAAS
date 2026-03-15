import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(
  options: EmailOptions
): Promise<{ success: boolean; id?: string; error?: string }> {
  const from = process.env.RESEND_FROM_EMAIL || "noreply@mpire.om";

  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: `MPIRE Property Management <${from}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function buildReminderEmailHtml(params: {
  tenantName: string;
  bodyContent: string;
  isRtl: boolean;
}): string {
  const dir = params.isRtl ? "rtl" : "ltr";
  const align = params.isRtl ? "right" : "left";

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${params.isRtl ? "ar" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#0A0A0B;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background-color:#141416;border:1px solid #2A2A2E;border-radius:8px;padding:32px;">
      <div style="text-align:${align};margin-bottom:24px;">
        <span style="color:#2DD4A8;font-size:20px;font-weight:700;letter-spacing:-0.5px;">MPIRE</span>
      </div>
      <p style="color:#EDEDEF;font-size:15px;line-height:1.6;text-align:${align};margin:0 0 16px;">
        ${params.bodyContent}
      </p>
      <hr style="border:none;border-top:1px solid #2A2A2E;margin:24px 0;">
      <p style="color:#8B8B8D;font-size:12px;text-align:${align};margin:0;">
        MPIRE Property Management, Oman
      </p>
    </div>
  </div>
</body>
</html>`;
}
