import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import {
  cancelMandate,
  collectForMandate,
  createAdminClient,
  omanNow,
  resendMandateOtp,
  type MandateRow,
} from "@/lib/e-mandates/service";

type Action = "cancel" | "collect" | "resend_otp";

// POST /api/e-mandates/[id]  { action: "cancel" | "collect" | "resend_otp", reason? }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { action?: Action; reason?: string } | null;
  const action = body?.action;
  if (action !== "cancel" && action !== "collect" && action !== "resend_otp") {
    return NextResponse.json({ error: "action must be cancel, collect or resend_otp" }, { status: 400 });
  }

  // Authorisation via RLS: invisible mandate → 404.
  const { data: visible } = await supabase.from("e_mandates").select("id").eq("id", id).maybeSingle();
  if (!visible) return NextResponse.json({ error: "Mandate not found" }, { status: 404 });

  const admin = createAdminClient();

  if (action === "cancel") {
    const reason = (body?.reason || "Cancelled by property manager").slice(0, 200);
    const result = await cancelMandate(admin, id, reason);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    await logAudit(supabase, { action: "cancel_mandate", entity_type: "e_mandate", entity_id: id, metadata: { reason } });
    return NextResponse.json({ mandate: result.data });
  }

  if (action === "resend_otp") {
    const result = await resendMandateOtp(admin, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    return NextResponse.json({ otp_token: result.data.otpToken });
  }

  // collect: pull the oldest unpaid rent invoice now, outside the schedule.
  const { data: row } = await admin.from("e_mandates").select("*").eq("id", id).single();
  if (!row) return NextResponse.json({ error: "Mandate not found" }, { status: 404 });
  const outcome = await collectForMandate(admin, row as MandateRow, format(omanNow(), "yyyy-MM-dd"));
  await logAudit(supabase, { action: "collect_mandate", entity_type: "e_mandate", entity_id: id, metadata: outcome });
  return NextResponse.json(outcome, { status: outcome.outcome === "skipped" ? 409 : 200 });
}
