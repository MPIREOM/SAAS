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

  // Rent is owed once per unit per month. A unit can briefly be covered by two
  // leases for the same month (e.g. an early renewal that overlaps the
  // outgoing lease), so we must dedupe by unit+period, not just by lease.
  // Returns true if a non-cancelled invoice already exists for this unit/month.
  async function unitPeriodAlreadyInvoiced(
    unitId: string,
    periodStartStr: string
  ): Promise<boolean> {
    const { data } = await supabase
      .from("invoices")
      .select("id")
      .eq("unit_id", unitId)
      .eq("period_start", periodStartStr)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle();
    return !!data;
  }

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

  const periodStart = format(startOfMonth(omanToday), "yyyy-MM-dd");
  const periodEnd = format(lastDayOfMonth(omanToday), "yyyy-MM-dd");

  // --- Generate invoices for the CURRENT month ---
  // Get active leases whose payment_due_day has already passed this month.
  // Guard on the lease term: the lease must have started on/before the end of
  // this month and must not have ended before it begins. Without this guard a
  // freshly-renewed lease that starts next month is still billed for the
  // current (pre-start) month — the root cause of phantom invoices showing up
  // for a unit that was already paid up under its previous lease.
  const { data: currentMonthLeases, error: currentError } = await supabase
    .from("leases")
    .select("id, tenant_id, unit_id, monthly_rent, payment_due_day")
    .eq("is_active", true)
    .lte("payment_due_day", currentDay)
    .lte("start_date", periodEnd)
    .gte("end_date", periodStart);

  if (currentError) {
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  }

  let created = 0;
  let skipped = 0;

  for (const lease of currentMonthLeases || []) {
    if (await unitPeriodAlreadyInvoiced(lease.unit_id, periodStart)) {
      skipped++;
      continue;
    }

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
    // Calculate next month's dates up front so we can scope the lease query to
    // the next period's term.
    const nextMonth = new Date(omanToday.getFullYear(), omanToday.getMonth() + 1, 1);
    const nextPeriodStart = format(startOfMonth(nextMonth), "yyyy-MM-dd");
    const nextPeriodEnd = format(lastDayOfMonth(nextMonth), "yyyy-MM-dd");

    // For each active lease whose term covers next month, check if we're within
    // the advance window. The start_date/end_date guard prevents pre-billing a
    // lease for a month outside its term (e.g. a renewal that ends before, or
    // starts after, the next period).
    const { data: allLeases, error: allError } = await supabase
      .from("leases")
      .select("id, tenant_id, unit_id, monthly_rent, payment_due_day")
      .eq("is_active", true)
      .lte("start_date", nextPeriodEnd)
      .gte("end_date", nextPeriodStart);

    if (!allError && allLeases) {
      for (const lease of allLeases) {
        // Calculate the actual due date in next month
        const nextDueDay = Math.min(lease.payment_due_day, lastDayOfMonth(nextMonth).getDate());
        const nextDueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), nextDueDay);

        // Check if today is within the advance window
        const advanceDate = addDays(nextDueDate, -daysBefore);
        if (today >= advanceDate) {
          if (await unitPeriodAlreadyInvoiced(lease.unit_id, nextPeriodStart)) {
            advanceSkipped++;
            continue;
          }

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
