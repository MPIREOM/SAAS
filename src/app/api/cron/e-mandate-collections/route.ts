import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/crypto/safe-compare";
import { createAdminClient, runDueCollections } from "@/lib/e-mandates/service";

// Vercel Cron: runs daily at 06:00 UTC (10:00 Muscat), well after the
// invoice cron at 00:05 UTC has created this month's rent invoices.
export const maxDuration = 60;

const CRON_NAME = "e-mandate-collections";

export async function GET(request: Request) {
  if (!checkBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  try {
    const summary = await runDueCollections(admin);
    await admin.from("cron_run_logs").insert({
      cron_name: CRON_NAME,
      status: summary.due === 0 && summary.polled === 0 ? "skipped" : "success",
      summary,
    });
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("cron_run_logs").insert({ cron_name: CRON_NAME, status: "error", summary: {}, error_message: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
