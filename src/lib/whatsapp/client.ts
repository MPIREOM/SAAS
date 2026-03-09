const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

interface WhatsAppTemplateMessage {
  to: string;
  templateName: string;
  languageCode: string;
  components?: TemplateComponent[];
}

interface TemplateComponent {
  type: "body" | "header";
  parameters: TemplateParameter[];
}

interface TemplateParameter {
  type: "text";
  text: string;
}

interface WhatsAppResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export async function sendWhatsAppTemplate(
  message: WhatsAppTemplateMessage
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return { success: false, error: "WhatsApp credentials not configured" };
  }

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: message.to,
    type: "template",
    template: {
      name: message.templateName,
      language: { code: message.languageCode },
      ...(message.components && { components: message.components }),
    },
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

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error?.message || `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as WhatsAppResponse;
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function buildRentReminderComponents(params: {
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  amount: string;
  dueDate: string;
}): TemplateComponent[] {
  return [
    {
      type: "body",
      parameters: [
        { type: "text", text: params.tenantName },
        { type: "text", text: params.unitNumber },
        { type: "text", text: params.propertyName },
        { type: "text", text: params.amount },
        { type: "text", text: params.dueDate },
      ],
    },
  ];
}
