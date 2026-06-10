import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { format, lastDayOfMonth, startOfMonth, addDays } from "date-fns";
import { checkBearer } from "@/lib/crypto/safe-compare";

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
  // Verify cron secret to prevent unauthorized invocations (constant-time)
  const authHeader = request.headers.get("authorization");
  if (!checkBearer(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();

  // Load invoice settings
  const { data: settings } = await supabase
    .from("invoice_settings")
    .select("auto_generate_enabled, days_before_due")
    .limit(1)
    .single();

  const autoEnabled = settings?.auto_generate_enabled ?? true;
  const daysBefore = settings?.days_before_due ?? 0;

  if (!autoEnabled) {
    return NextResponse.json({
      created: 0,
      message: "Auto-invoice generation is disabled",
    });
  }

  // Use Oman timezone (UTC+4) for date calculations
  const today = new Date();
  const omanToday = new Date(today.getTime() + 4 * 60 * 60 * 1000);
  const currentDay = omanToday.getDate();

  // --- Generate invoices for the CURRENT month ---
  // Get active leases whose payment_due_day has already passed this month
  const { data: currentMonthLeases, error: currentError } = await supabase
    .from("leases")
    .select("id, tenant_id, unit_id, monthly_rent, payment_due_day")
    .eq("is_active", true)
    .lte("payment_due_day", currentDay);

  if (currentError) {
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  }

  const periodStart = format(startOfMonth(omanToday), "yyyy-MM-dd");
  const periodEnd = format(lastDayOfMonth(omanToday), "yyyy-MM-dd");
  let created = 0;
  let skipped = 0;

  for (const lease of currentMonthLeases || []) {
    const dueDay = Math.min(lease.payment_due_day, lastDayOfMonth(omanToday).getDate());
    const dueDate = format(new Date(omanToday.getFullYear(), omanToday.getMonth(), dueDay), "yyyy-MM-dd");

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

  // --- Generate ADVANCE invoices for NEXT month if days_before > 0 ---
  let advanceCreated = 0;
  let advanceSkipped = 0;

  if (daysBefore > 0) {
    // For each active lease, check if we're within the advance window for next month
    const { data: allLeases, error: allError } = await supabase
      .from("leases")
      .select("id, tenant_id, unit_id, monthly_rent, payment_due_day")
      .eq("is_active", true);

    if (!allError && allLeases) {
      // Calculate next month's dates
      const nextMonth = new Date(omanToday.getFullYear(), omanToday.getMonth() + 1, 1);
      const nextPeriodStart = format(startOfMonth(nextMonth), "yyyy-MM-dd");
      const nextPeriodEnd = format(lastDayOfMonth(nextMonth), "yyyy-MM-dd");

      for (const lease of allLeases) {
        // Calculate the actual due date in next month
        const nextDueDay = Math.min(lease.payment_due_day, lastDayOfMonth(nextMonth).getDate());
        const nextDueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), nextDueDay);

        // Check if today is within the advance window
        const advanceDate = addDays(nextDueDate, -daysBefore);
        if (today >= advanceDate) {
          const dueDateStr = format(nextDueDate, "yyyy-MM-dd");

          const { error: insertError } = await supabase.from("invoices").upsert(
            {
              lease_id: lease.id,
              tenant_id: lease.tenant_id,
              unit_id: lease.unit_id,
              amount: lease.monthly_rent,
              due_date: dueDateStr,
              issued_date: format(today, "yyyy-MM-dd"),
              period_start: nextPeriodStart,
              period_end: nextPeriodEnd,
              status: "pending",
            },
            { onConflict: "lease_id,period_start", ignoreDuplicates: true }
          );

          if (insertError) {
            advanceSkipped++;
          } else {
            advanceCreated++;
          }
        }
      }
    }
  }

  // Auto-mark overdue invoices (don't override partial payments)
  const todayStr = omanToday.toISOString().split("T")[0];
  const { error: overdueError } = await supabase
    .from("invoices")
    .update({ status: "overdue" })
    .eq("status", "pending")
    .lt("due_date", todayStr);

  // Auto-cancel pending invoices from inactive leases (moved-out tenants)
  const { data: inactiveLeases } = await supabase
    .from("leases")
    .select("id")
    .eq("is_active", false);

  let cancelledCount = 0;
  if (inactiveLeases && inactiveLeases.length > 0) {
    const inactiveLeaseIds = inactiveLeases.map((l) => l.id);
    const { count } = await supabase
      .from("invoices")
      .update({
        status: "cancelled",
        notes: "Auto-cancelled: lease is no longer active",
        updated_at: new Date().toISOString(),
      })
      .in("lease_id", inactiveLeaseIds)
      .in("status", ["pending", "overdue", "partial"]);
    cancelledCount = count || 0;
  }

  return NextResponse.json({
    created,
    skipped,
    total: (currentMonthLeases || []).length,
    advance: {
      created: advanceCreated,
      skipped: advanceSkipped,
      days_before: daysBefore,
    },
    cancelledFromInactiveLeases: cancelledCount,
    overdueUpdated: !overdueError,
    overdueError: overdueError?.message || null,
  });
}
