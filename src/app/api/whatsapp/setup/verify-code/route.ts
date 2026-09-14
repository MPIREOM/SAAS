import { NextRequest, NextResponse } from "next/server";
import { confirmVerificationCode } from "@/lib/whatsapp/setup";
import { requireSuperAdmin } from "../_auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

// The code travels from the setup form to Meta through this server only.
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const result = await confirmVerificationCode(code);
  if (!result.ok) {
    console.error("[WhatsApp Setup] verify-code failed:", result.error);
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  console.log("[WhatsApp Setup] Phone number ownership verified");
  return NextResponse.json(result.data);
}
