import { NextRequest, NextResponse } from "next/server";

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
  const body = await request.json();

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
