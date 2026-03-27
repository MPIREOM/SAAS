import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { phoneNumber, templateName, languageCode, parameters } = await request.json();

  if (!phoneNumber) {
    return NextResponse.json(
      { error: "Phone number is required" },
      { status: 400 }
    );
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return NextResponse.json(
      {
        error: "WhatsApp credentials not configured",
        details:
          "Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in your environment variables",
      },
      { status: 500 }
    );
  }

  // Clean phone number - ensure it starts with +
  const cleanPhone = phoneNumber.replace(/[^\d+]/g, "");
  const formattedPhone = cleanPhone.startsWith("+")
    ? cleanPhone
    : "+" + cleanPhone;

  const template = templateName || "hello_world";
  const language = languageCode || "en_US";

  const templatePayload: Record<string, unknown> = {
    name: template,
    language: { code: language },
  };

  // Add template components if parameters are provided
  if (parameters && Array.isArray(parameters) && parameters.length > 0) {
    templatePayload.components = [
      {
        type: "body",
        parameters: parameters.map((p: string) => ({
          type: "text",
          text: p,
        })),
      },
    ];
  }

  const body = {
    messaging_product: "whatsapp",
    to: formattedPhone,
    type: "template",
    template: templatePayload,
  };

  try {
    const response = await fetch(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data.error?.message || `HTTP ${response.status}`,
          errorCode: data.error?.code,
          errorType: data.error?.type,
          details: data.error,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data.messages?.[0]?.id,
      contacts: data.contacts,
      sentTo: formattedPhone,
      template,
      language,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
