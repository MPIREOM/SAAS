import { NextRequest, NextResponse } from "next/server";
import { registerNumber } from "@/lib/whatsapp/setup";
import { requireSuperAdmin } from "../_auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

// The PIN travels from the setup form to Meta through this server only; it
// is never logged or stored.
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { pin?: unknown };
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const result = await registerNumber(pin);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  console.log("[WhatsApp Setup] Phone number registered for Cloud API");
  return NextResponse.json(result.data);
}
