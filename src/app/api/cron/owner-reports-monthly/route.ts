import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { runOwnerReports } from "@/app/api/cron/owner-reports/route";
import { checkBearer } from "@/lib/crypto/safe-compare";

// Monthly owner report. Fires on the 1st of each month (see vercel.json) and
// sends every owner the report for the FULL PREVIOUS calendar month — separate
// from the weekly current-month-to-date snapshot at /api/cron/owner-reports.
//
// PDF rendering takes a few seconds per owner; keep the budget generous.
export const maxDuration = 60;

function createSupabaseAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!checkBearer(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Anchor on Muscat-local "now" so the month boundary is right around UTC
  // midnight. Day 0 of the current Muscat month = the last day of the previous
  // month; noon UTC keeps it clear of the +4h shift applied inside
  // getOwnerMonthlyReport, so the report window resolves to the previous month.
  const muscatNow = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const lastDayPrevMonth = new Date(
    Date.UTC(muscatNow.getUTCFullYear(), muscatNow.getUTCMonth(), 0, 12, 0, 0),
  );

  const supabase = createSupabaseAdmin();
  const result = await runOwnerReports(supabase, "scheduled", lastDayPrevMonth);
  return NextResponse.json({
    ...result,
    reportMonthEnding: lastDayPrevMonth.toISOString().slice(0, 10),
  });
}
