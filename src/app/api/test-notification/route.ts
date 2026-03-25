import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsAppTemplate, buildRentReminderComponents } from "@/lib/whatsapp/client";
import { sendEmail, buildReminderEmailHtml } from "@/lib/email/client";

/**
 * POST /api/test-notification
 *
 * Send a test WhatsApp and/or email notification to verify your setup.
 *
 * Body:
 *   phone?: string   — your WhatsApp number (e.g. "+968XXXXXXXX")
 *   email?: string   — your email address
 *
 * At least one of phone or email is required.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { phone, email } = await request.json();

  if (!phone && !email) {
    return NextResponse.json(
      { error: "Provide at least one of: phone, email" },
      { status: 400 }
    );
  }

  const results: {
    whatsapp?: { success: boolean; messageId?: string; error?: string };
    email?: { success: boolean; id?: string; error?: string };
  } = {};

  // Test WhatsApp
  if (phone) {
    const formattedPhone = phone.replace(/[^\d+]/g, "").startsWith("+")
      ? phone.replace(/[^\d+]/g, "")
      : "+" + phone.replace(/[^\d+]/g, "");

    results.whatsapp = await sendWhatsAppTemplate({
      to: formattedPhone,
      templateName: "mpire_rent_upcoming_en",
      languageCode: "en",
      components: buildRentReminderComponents({
        tenantName: "Test Tenant",
        unitNumber: "101",
        propertyName: "Test Property",
        amount: "500",
        dueDate: "2026-04-01",
      }),
    });
  }

  // Test Email
  if (email) {
    results.email = await sendEmail({
      to: email,
      subject: "Test Notification - MPIRE",
      html: buildReminderEmailHtml({
        tenantName: "Test Tenant",
        bodyContent:
          "Dear Test Tenant,<br><br>This is a <strong>test notification</strong> from MPIRE Property Management.<br><br>If you received this, your email notifications are working correctly.<br><br>Unit: 101 — Property: Test Property — Amount: 500 OMR — Due: 2026-04-01",
        isRtl: false,
      }),
    });
  }

  const allSuccess =
    (!results.whatsapp || results.whatsapp.success) &&
    (!results.email || results.email.success);

  return NextResponse.json({
    success: allSuccess,
    results,
  });
}
