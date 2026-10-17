import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/crypto/safe-compare";
import {
  MAX_REMINDERS,
  REMINDER_INTERVAL_HOURS,
  createAgreementsAdminClient,
  sendAgreementLink,
} from "@/lib/agreements/service";

// Vercel Cron: daily at 06:00 UTC (10:00 Muscat). Reminds tenants who
// haven't signed their building-rules agreement: the first reminder a day
// after the link went out, the second two days after that, then stops (the
// agreement stays pending on the unit page for staff to chase).

export const maxDuration = 300;

interface PendingRow {
  id: string;
  reminder_count: number;
  last_sent_at: string;
}

export async function GET(request: Request) {
  if (!checkBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAgreementsAdminClient();
  const { data, error } = await admin
    .from("tenant_agreements")
    .select("id, reminder_count, last_sent_at")
    .eq("status", "pending")
    .not("last_sent_at", "is", null)
    .lt("reminder_count", MAX_REMINDERS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A little slack so a daily cron doesn't slip a whole day on "23h59m".
  const now = Date.now();
  const due = ((data ?? []) as PendingRow[]).filter((row) => {
    const waitHours = REMINDER_INTERVAL_HOURS[row.reminder_count] - 1;
    return now - new Date(row.last_sent_at).getTime() >= waitHours * 60 * 60 * 1000;
  });

  const origin = new URL(request.url).origin;
  let sent = 0;
  let failed = 0;
  for (const row of due) {
    const result = await sendAgreementLink(admin, row.id, "reminder", origin);
    if (result.ok && (result.outcome.whatsapp.success || result.outcome.email?.success)) sent++;
    else failed++;
  }
  return NextResponse.json({ checked: data?.length ?? 0, due: due.length, sent, failed });
}
