import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { format, lastDayOfMonth, startOfMonth } from "date-fns";

// Vercel Cron: runs daily at 00:05 AM
export const maxDuration = 60;

function createSupabaseAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  );
}

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized invocations
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const today = new Date();
  const currentDay = today.getDate();

  // Find all active leases where today is the payment due day
  const { data: leases, error } = await supabase
    .from("leases")
    .select("id, tenant_id, unit_id, monthly_rent, payment_due_day")
    .eq("is_active", true)
    .eq("payment_due_day", currentDay);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!leases || leases.length === 0) {
    return NextResponse.json({ created: 0, message: "No leases due today" });
  }

  const dueDate = format(today, "yyyy-MM-dd");
  const periodStart = format(startOfMonth(today), "yyyy-MM-dd");
  const periodEnd = format(lastDayOfMonth(today), "yyyy-MM-dd");
  let created = 0;
  let skipped = 0;

  for (const lease of leases) {
    // Upsert to prevent duplicates (unique index on lease_id + period_start)
    const { error: insertError } = await supabase.from("invoices").upsert(
      {
        lease_id: lease.id,
        tenant_id: lease.tenant_id,
        unit_id: lease.unit_id,
        amount: lease.monthly_rent,
        due_date: dueDate,
        issued_date: dueDate,
        period_start: periodStart,
        period_end: periodEnd,
        status: "pending",
      },
      { onConflict: "lease_id,period_start", ignoreDuplicates: true }
    );

    if (insertError) {
      skipped++;
    } else {
      created++;
    }
  }

  // Auto-mark overdue invoices
  const todayStr = new Date().toISOString().split("T")[0];
  await supabase
    .from("invoices")
    .update({ status: "overdue" })
    .eq("status", "pending")
    .lt("due_date", todayStr);

  return NextResponse.json({ created, skipped, total: leases.length });
}
