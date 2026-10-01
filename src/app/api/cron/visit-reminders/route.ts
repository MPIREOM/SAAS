import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/crypto/safe-compare";
import type { TenantRecipient } from "@/lib/maintenance/whatsapp";
import { createVisitsAdminClient } from "@/lib/visits/service";
import { muscatDate } from "@/lib/visits/slots";
import { sendVisitReminder } from "@/lib/visits/whatsapp";

// Vercel Cron: daily at 14:00 UTC (18:00 Muscat). WhatsApps every tenant
// booked for tomorrow (Muscat date) on an open visit, once per booking;
// rescheduling clears reminder_sent_at so a moved booking is reminded again.

export const maxDuration = 300;

const CRON_NAME = "visit-reminders";

interface ReminderRow {
  id: string;
  slot_start: string;
  manage_token: string;
  units: { unit_number: string } | null;
  tenants: TenantRecipient | null;
  visit_campaigns: {
    title: string;
    notes: string | null;
    status: string;
    start_date: string;
    end_date: string;
    slot_minutes: number;
    public_origin: string | null;
    properties: { name: string } | null;
  } | null;
}

export async function GET(request: Request) {
  if (!checkBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createVisitsAdminClient();
  try {
    const tomorrow = muscatDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const from = new Date(`${tomorrow}T00:00:00+04:00`);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

    const { data, error } = await admin
      .from("visit_bookings")
      .select(
        "id, slot_start, manage_token, units(unit_number), tenants(full_name, phone, language_preference, notifications_enabled), visit_campaigns(title, notes, status, start_date, end_date, slot_minutes, public_origin, properties(name))"
      )
      .eq("status", "booked")
      .is("reminder_sent_at", null)
      .gte("slot_start", from.toISOString())
      .lt("slot_start", to.toISOString());
    if (error) throw new Error(error.message);

    const fallbackOrigin = new URL(request.url).origin;
    const summary = { due: 0, sent: 0, skipped: 0, failed: 0 };
    for (const row of (data || []) as unknown as ReminderRow[]) {
      const campaign = row.visit_campaigns;
      if (!campaign || campaign.status !== "open") continue;
      summary.due++;
      if (!row.tenants) {
        summary.skipped++;
        continue;
      }
      const result = await sendVisitReminder(row.tenants, {
        title: campaign.title,
        notes: campaign.notes,
        propertyName: campaign.properties?.name ?? "",
        unitNumber: row.units?.unit_number ?? "",
        origin: campaign.public_origin || fallbackOrigin,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        slot_minutes: campaign.slot_minutes,
        slotStart: row.slot_start,
        manageToken: row.manage_token,
      });
      if (result.success) {
        summary.sent++;
        await admin.from("visit_bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", row.id);
      } else if (result.error === "tenant has no phone" || result.error === "tenant notifications disabled") {
        summary.skipped++;
      } else {
        summary.failed++;
      }
    }

    await admin.from("cron_run_logs").insert({
      cron_name: CRON_NAME,
      status: summary.due === 0 ? "skipped" : "success",
      summary,
    });
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("cron_run_logs").insert({ cron_name: CRON_NAME, status: "error", summary: {}, error_message: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
