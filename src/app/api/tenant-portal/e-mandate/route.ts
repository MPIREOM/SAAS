import { NextRequest, NextResponse } from "next/server";
import { confirmMandateOtp, createAdminClient, getMandateForPortal } from "@/lib/e-mandates/service";

// Public, bearer-token endpoints used by the tenant portal OTP page. The token
// is a 32-byte random value that only ever appears in the link we send the
// tenant; the service caps OTP attempts and expires the link.

// POST { token } → mandate summary (masked)
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) return NextResponse.json({ error: "Token required" }, { status: 400 });
  const result = await getMandateForPortal(createAdminClient(), body.token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json(result.data);
}

// PUT { token, otp } → confirm with the bank
export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: string; otp?: string } | null;
  if (!body?.token || !body.otp) return NextResponse.json({ error: "Token and OTP required" }, { status: 400 });
  const result = await confirmMandateOtp(createAdminClient(), body.token, String(body.otp));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json(result.data);
}
