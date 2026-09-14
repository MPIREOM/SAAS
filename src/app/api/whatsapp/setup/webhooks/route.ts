import { NextRequest, NextResponse } from "next/server";
import { connectWebhooks } from "@/lib/whatsapp/setup";
import { requireSuperAdmin, requestOrigin } from "../_auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const result = await connectWebhooks(requestOrigin(request));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  console.log("[WhatsApp Setup] Webhooks connected", result.data);
  return NextResponse.json(result.data);
}
