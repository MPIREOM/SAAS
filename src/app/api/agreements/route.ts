import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAndSendForLease } from "@/lib/agreements/service";

// Staff: create the building-rules agreement for a lease (if it has none)
// and WhatsApp / email the signing link. Called right after a tenant is
// registered, and by the "Resend" button (resend: true). Goes through the
// user's RLS client, so only their own properties are reachable.

const schema = z.object({ lease_id: z.string().uuid(), resend: z.boolean().optional() });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const result = await createAndSendForLease(supabase, parsed.data.lease_id, {
    origin: request.nextUrl.origin,
    createdBy: user.id,
    resend: parsed.data.resend,
  });
  if (!result.ok) {
    const status = result.error === "lease_not_found" ? 404 : result.error === "lease_not_active" ? 409 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({
    agreement_id: result.agreementId,
    created: result.created,
    status: result.status,
    sent: result.sent,
    whatsapp: result.outcome?.whatsapp ?? null,
    email: result.outcome?.email ?? null,
  });
}
