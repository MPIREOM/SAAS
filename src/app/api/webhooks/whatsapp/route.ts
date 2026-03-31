import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
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

// Deduplicate messages using a database table to persist across serverless invocations
async function isMessageProcessed(messageId: string): Promise<boolean> {
  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Try to insert — if it already exists (unique constraint), the message was already processed
  const { error } = await supabase
    .from("whatsapp_processed_messages")
    .insert({ message_id: messageId });

  if (error) {
    // Unique violation = already processed
    if (error.code === "23505") return true;
    // Other errors — log but allow processing (better to double-reply than not reply)
    console.warn("[WhatsApp Webhook] Dedup check failed:", error.message);
    return false;
  }

  return false; // Successfully inserted = new message
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

        const messageId = msg.id;
        const senderPhone = msg.from;
        const messageText = msg.text?.body;

        if (!messageText || !messageId) continue;

        // Deduplicate — skip if we've already processed this message
        const alreadyProcessed = await isMessageProcessed(messageId);
        if (alreadyProcessed) {
          console.log("[WhatsApp Webhook] Skipping duplicate message:", messageId);
          continue;
        }

        console.log("[WhatsApp Webhook] Processing message:", messageText, "from:", senderPhone, "id:", messageId);

        try {
          const reply = await processWhatsAppMessage(messageText, senderPhone);
          console.log("[WhatsApp Webhook] Agent reply:", reply.substring(0, 200));

          const result = await sendWhatsAppTextMessage(senderPhone, reply);
          if (!result.success) {
            console.error("[WhatsApp Webhook] Failed to send reply:", result.error);
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
