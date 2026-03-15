import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

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

// WhatsApp webhook for delivery status updates (POST)
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Verify webhook signature from Meta
  const signature = request.headers.get("x-hub-signature-256");
  if (!process.env.WHATSAPP_APP_SECRET || !verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const body = JSON.parse(rawBody);

  // Process status updates
  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const statuses = change.value?.statuses || [];
      for (const status of statuses) {
        // Log delivery status: sent, delivered, read, failed
        console.log(
          `WhatsApp status update: ${status.id} -> ${status.status}`
        );
      }
    }
  }

  return NextResponse.json({ success: true });
}
