import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsAppTemplate, buildRentReminderComponents } from "@/lib/whatsapp/client";

function formatPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 8) return `+968${digits}`;
  if (digits.startsWith("968")) return `+${digits}`;
  return `+${digits}`;
}

// Manual WhatsApp send endpoint - for on-demand reminders
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    tenantId,
    templateName,
    languageCode,
    parameters,
  } = body;

  if (!tenantId || !templateName) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Fetch tenant
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, full_name, phone, language_preference")
    .eq("id", tenantId)
    .single();

  if (!tenant || !tenant.phone) {
    return NextResponse.json(
      { error: "Tenant not found or no phone number" },
      { status: 404 }
    );
  }

  const result = await sendWhatsAppTemplate({
    to: formatPhone(tenant.phone),
    templateName,
    languageCode: languageCode || tenant.language_preference || "en",
    components: parameters
      ? [
          {
            type: "body",
            parameters: parameters.map((p: string) => ({
              type: "text" as const,
              text: p,
            })),
          },
        ]
      : undefined,
  });

  // Log the reminder
  await supabase.from("reminder_logs").insert({
    tenant_id: tenantId,
    reminder_type: body.reminderType || "rent_upcoming",
    channel: "whatsapp",
    template_name: templateName,
    message_content: `Manual WhatsApp to ${tenant.full_name}`,
    status: result.success ? "sent" : "failed",
    sent_at: new Date().toISOString(),
    error_message: result.error || null,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    messageId: result.messageId,
  });
}
