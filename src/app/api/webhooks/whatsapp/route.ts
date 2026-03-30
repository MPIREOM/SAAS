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
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const body = JSON.parse(rawBody);

  // Process entries
  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;

      // Handle incoming messages
      const messages = value?.messages || [];
      for (const msg of messages) {
        // Only process text messages
        if (msg.type !== "text") continue;

        const senderPhone = msg.from; // e.g. "96812345678"
        const messageText = msg.text?.body;

        if (!messageText) continue;

        // Process asynchronously — respond to Meta immediately, reply to user later
        handleIncomingMessage(senderPhone, messageText).catch((err) => {
          console.error("WhatsApp agent error:", err);
        });
      }

      // Delivery status updates (sent, delivered, read, failed) — silently acknowledged
    }
  }

  return NextResponse.json({ success: true });
}

async function handleIncomingMessage(
  senderPhone: string,
  messageText: string
): Promise<void> {
  try {
    // Run the AI agent to process the message
    const reply = await processWhatsAppMessage(messageText, senderPhone);

    // Send the reply back via WhatsApp
    const result = await sendWhatsAppTextMessage(senderPhone, reply);

    if (!result.success) {
      console.error("Failed to send WhatsApp reply:", result.error);
    }
  } catch (error) {
    console.error("Agent processing failed:", error);

    // Try to send an error message to the user
    await sendWhatsAppTextMessage(
      senderPhone,
      "Sorry, something went wrong processing your request. Please try again."
    ).catch(() => {
      // Silently ignore if error message also fails
    });
  }
}
