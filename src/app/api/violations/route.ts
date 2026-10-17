import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordViolation } from "@/lib/agreements/service";

// Staff: record a building-rules violation (garbage outside the chute, lost
// / extra gate keys, unapproved holes / alterations) for a unit's current tenant and bill it. Goes through
// the user's RLS client.

const schema = z.object({
  unit_id: z.string().uuid(),
  kind: z.enum(["garbage", "lost_key", "alteration"]),
  quantity: z.number().int().min(1).max(50).optional(),
  amount: z.number().positive().max(10000).optional(),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const result = await recordViolation(supabase, {
    unitId: parsed.data.unit_id,
    kind: parsed.data.kind,
    quantity: parsed.data.quantity,
    amount: parsed.data.amount,
    occurredOn: parsed.data.occurred_on,
    notes: parsed.data.notes,
    userId: user.id,
    source: "dashboard",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
