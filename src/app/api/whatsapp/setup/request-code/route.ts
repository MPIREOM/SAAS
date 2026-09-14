import { NextRequest, NextResponse } from "next/server";
import { sendVerificationCode } from "@/lib/whatsapp/setup";
import { requireSuperAdmin } from "../_auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { method?: unknown };
  const method = body.method === "VOICE" ? "VOICE" : "SMS";
  const result = await sendVerificationCode(method);
  if (!result.ok) {
    console.error("[WhatsApp Setup] request-code failed:", result.error);
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  console.log("[WhatsApp Setup] Verification code requested via", method);
  return NextResponse.json(result.data);
}
