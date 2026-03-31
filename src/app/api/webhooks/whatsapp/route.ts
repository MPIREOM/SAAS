import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { processWhatsAppMessage } from "@/lib/whatsapp/agent";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/client";

// Verify Meta webhook signature (X-Hub-Signature-256 header)
function verifySignature(body: string, signature: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signature) return false;

  const expectedSig =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(body).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig)
  );
}

// WhatsApp webhook verification (GET)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// WhatsApp webhook for incoming messages and delivery status updates (POST)
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Verify webhook signature from Meta
  const signature = request.headers.get("x-hub-signature-256");
  if (
    !process.env.WHATSAPP_APP_SECRET ||
    !verifySignature(rawBody, signature)
  ) {
    console.error("[WhatsApp Webhook] Signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const body = JSON.parse(rawBody);
  console.log("[WhatsApp Webhook] Received payload:", JSON.stringify(body, null, 2));

  // Process entries
  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;

      // Handle incoming messages
      const messages = value?.messages || [];
      for (const msg of messages) {
        console.log("[WhatsApp Webhook] Message type:", msg.type, "from:", msg.from);

        // Only process text messages
        if (msg.type !== "text") continue;

        const senderPhone = msg.from;
        const messageText = msg.text?.body;

        if (!messageText) continue;

        console.log("[WhatsApp Webhook] Processing message:", messageText, "from:", senderPhone);

        // Process synchronously — wait for the reply before returning
        // This avoids Vercel serverless function killing the async task
        try {
          const reply = await processWhatsAppMessage(messageText, senderPhone);
          console.log("[WhatsApp Webhook] Agent reply:", reply);

          const result = await sendWhatsAppTextMessage(senderPhone, reply);
          if (!result.success) {
            console.error("[WhatsApp Webhook] Failed to send reply:", result.error);
          } else {
            console.log("[WhatsApp Webhook] Reply sent successfully, messageId:", result.messageId);
          }
        } catch (error) {
          console.error("[WhatsApp Webhook] Agent processing failed:", error);
          await sendWhatsAppTextMessage(
            senderPhone,
            "Sorry, something went wrong processing your request. Please try again."
          ).catch(() => {});
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
