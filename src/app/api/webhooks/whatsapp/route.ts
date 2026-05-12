import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { processWhatsAppMessage, type InlineImage } from "@/lib/whatsapp/agent";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/client";
import {
  downloadWhatsAppMedia,
  extensionForMime,
  type DownloadedMedia,
} from "@/lib/whatsapp/media";

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

// Download an inbound image, drop it into the expense-receipts bucket
// under a temp path, and create a pending_receipt_attachments row keyed
// by a short token. The token is then handed to the agent in the user's
// message text so it can be passed to add_expense. We also return the
// downloaded bytes so the caller can hand them to the agent as a vision
// block — that way Claude reads the receipt directly instead of having
// to guess the amount from the caption.
type StashedReceipt = { token: string; media: DownloadedMedia };

async function stashIncomingReceipt(
  mediaId: string,
  userPhone: string,
): Promise<StashedReceipt | null> {
  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const media = await downloadWhatsAppMedia(mediaId);
  if (!media) return null;

  const token = crypto.randomBytes(8).toString("hex");
  const ext = extensionForMime(media.mimeType);
  const tempPath = `pending/${userPhone}/${Date.now()}-${token}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("expense-receipts")
    .upload(tempPath, new Uint8Array(media.bytes), {
      contentType: media.mimeType,
      upsert: false,
    });
  if (uploadErr) {
    console.error("[WhatsApp Webhook] Receipt upload failed:", uploadErr.message);
    return null;
  }

  const { error: insertErr } = await supabase
    .from("pending_receipt_attachments")
    .insert({
      token,
      user_phone: userPhone,
      storage_path: tempPath,
      mime_type: media.mimeType,
      file_size: media.fileSize,
      whatsapp_media_id: mediaId,
    });
  if (insertErr) {
    console.error(
      "[WhatsApp Webhook] Receipt row insert failed:",
      insertErr.message,
    );
    // Clean up the orphaned object so we don't leak storage.
    await supabase.storage.from("expense-receipts").remove([tempPath]);
    return null;
  }

  return { token, media };
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

      // Handle incoming messages — text and image (image is treated as a
      // receipt photo for an expense the user is about to describe).
      const messages = value?.messages || [];
      for (const msg of messages) {
        if (msg.type !== "text" && msg.type !== "image") continue;

        const messageId = msg.id;
        const senderPhone = msg.from;
        if (!messageId) continue;

        // Deduplicate — skip if we've already processed this message
        const alreadyProcessed = await isMessageProcessed(messageId);
        if (alreadyProcessed) {
          console.log("[WhatsApp Webhook] Skipping duplicate message:", messageId);
          continue;
        }

        // Build the text we hand to the agent. For an image, we either use
        // its caption verbatim or a stub like "[image attached]" so the
        // assistant has SOMETHING to react to. The pending-receipt token is
        // appended on its own line so the system prompt's regex hint can
        // pick it out.
        let messageText: string | null = null;
        let pendingToken: string | null = null;
        let inlineImage: InlineImage | null = null;

        if (msg.type === "text") {
          messageText = msg.text?.body || null;
        } else if (msg.type === "image") {
          const mediaId = msg.image?.id as string | undefined;
          const caption = (msg.image?.caption as string | undefined) || "";

          if (mediaId) {
            try {
              const stashed = await stashIncomingReceipt(mediaId, senderPhone);
              if (stashed) {
                pendingToken = stashed.token;
                inlineImage = {
                  mimeType: stashed.media.mimeType,
                  base64: Buffer.from(stashed.media.bytes).toString("base64"),
                };
              }
            } catch (err) {
              console.error("[WhatsApp Webhook] Receipt stash failed:", err);
            }
          }

          messageText = caption || "[image attached]";
          if (pendingToken) {
            messageText += `\n\nPENDING_RECEIPT_TOKEN: ${pendingToken}`;
          }
        }

        if (!messageText) continue;

        console.log(
          "[WhatsApp Webhook] Processing message:",
          messageText.substring(0, 200),
          "from:",
          senderPhone,
          "id:",
          messageId,
          inlineImage ? "(with image)" : "",
        );

        try {
          const reply = await processWhatsAppMessage(
            messageText,
            senderPhone,
            inlineImage,
          );
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
