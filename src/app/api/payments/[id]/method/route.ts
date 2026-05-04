import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const ALLOWED_METHODS = ["cash", "bank_transfer", "cheque"] as const;
type PaymentMethod = (typeof ALLOWED_METHODS)[number];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { method?: string }
    | null;
  const method = body?.method;
  if (!method || !ALLOWED_METHODS.includes(method as PaymentMethod)) {
    return NextResponse.json(
      {
        error: `method must be one of: ${ALLOWED_METHODS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const { data: existing, error: fetchError } = await supabase
    .from("payments")
    .select("id, method, amount, tenant_id, lease_id, payment_date")
    .eq("id", id)
    .single();
  if (fetchError || !existing) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (existing.method === method) {
    return NextResponse.json({ success: true, unchanged: true });
  }

  const { error: updateError } = await supabase
    .from("payments")
    .update({ method })
    .eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logAudit(supabase, {
    action: "update",
    entity_type: "payment",
    entity_id: id,
    metadata: {
      field: "method",
      previous_method: existing.method,
      new_method: method,
      amount: existing.amount,
      payment_date: existing.payment_date,
    },
  });

  return NextResponse.json({ success: true });
}
