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

  // Use .select() so we get the actual updated rows back. Without it,
  // RLS-rejected updates return { error: null, data: null } and look
  // identical to a successful no-op — which is exactly how the missing
  // payments_update policy hid this for ~9 attempts before being noticed.
  const { data: updated, error: updateError } = await supabase
    .from("payments")
    .update({ method })
    .eq("id", id)
    .select("id");
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      {
        error:
          "Update was silently rejected (no rows changed). Likely a row-level security policy is missing or you don't have access to this payment.",
      },
      { status: 403 },
    );
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
