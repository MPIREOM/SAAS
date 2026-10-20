import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Super admin: add bought gate keys to a building's stock (restock) or set
// it to a physical count. adjust_gate_key_stock (054) checks the role and
// logs the movement. Sales come out of stock through the violation trigger.

const schema = z.object({
  kind: z.enum(["restock", "count"]),
  quantity: z.number().int().min(0).max(10000),
  notes: z.string().max(500).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  if (parsed.data.kind === "restock" && parsed.data.quantity < 1) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { data: stock, error } = await supabase.rpc("adjust_gate_key_stock", {
    p_property_id: id,
    p_kind: parsed.data.kind,
    p_quantity: parsed.data.quantity,
    p_notes: parsed.data.notes?.trim() || null,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 400;
    return NextResponse.json({ error: status === 403 ? "forbidden" : error.message }, { status });
  }

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "update",
    entity_type: "property",
    entity_id: id,
    metadata: { gate_key_stock: stock, kind: parsed.data.kind, quantity: parsed.data.quantity },
  });

  return NextResponse.json({ stock });
}
