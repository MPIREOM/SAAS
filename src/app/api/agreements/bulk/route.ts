import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAndSendForLease } from "@/lib/agreements/service";

// Staff: send the building-rules agreement to every current tenant (active
// lease) who hasn't been sent one yet, optionally for one property. Tenants
// who already signed or were already sent the link are left alone, so this
// is safe to run again. Reads go through the user's RLS client.

export const maxDuration = 300;

const schema = z.object({ property_id: z.string().uuid().optional() });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  let query = supabase.from("leases").select("id, units!inner(property_id)").eq("is_active", true);
  if (parsed.data.property_id) query = query.eq("units.property_id", parsed.data.property_id);
  const { data: leases, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let alreadyDone = 0;
  let failed = 0;
  for (const lease of (leases ?? []) as { id: string }[]) {
    try {
      const result = await createAndSendForLease(supabase, lease.id, {
        origin: request.nextUrl.origin,
        createdBy: user.id,
      });
      if (!result.ok) failed++;
      else if (result.sent) sent++;
      else if (result.outcome) failed++;
      else alreadyDone++;
    } catch (err) {
      console.error("[agreements] bulk send failed", { lease: lease.id, err });
      failed++;
    }
  }
  return NextResponse.json({ total: leases?.length ?? 0, sent, already_done: alreadyDone, failed });
}
