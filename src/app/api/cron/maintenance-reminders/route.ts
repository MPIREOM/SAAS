import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveAppOrigin } from "@/lib/agreements/service";
import { checkBearer } from "@/lib/crypto/safe-compare";
import {
  STUCK_AFTER_REMINDERS,
  isReminderDue,
  nextReminderAt,
  reminderDueAt,
  reminderStage,
  type ReminderCandidate,
  type ReminderStage,
} from "@/lib/maintenance/reminders";
import {
  ADMIN_JOB_STUCK_TEMPLATE,
  adminJobStuckParams,
  categoryLabel,
  requestRef,
  sendTechnicianReminder,
} from "@/lib/maintenance/whatsapp";
import { loadRequest, maintenanceJobPath, type LoadedRequest } from "@/lib/maintenance/workflow";

// Vercel Cron: daily at 04:30 UTC (08:30 Muscat). Reminds the technician of
// each maintenance job he hasn't finished, one WhatsApp message per job with
// the link to its job page: every 2 days while the job is still open, every
// 3 days once it is in progress. Reminders stop when he marks the job
// finished or staff resolve it. On the third unanswered reminder in a stage
// the admins are told, once, that the job is stuck (migration 057).

export const maxDuration = 300;

const CRON_NAME = "maintenance-reminders";

interface JobRow extends ReminderCandidate {
  id: string;
  assigned_to_phone: string | null;
  technician_reminder_count: number;
}

const STANDING: Record<ReminderStage, string> = {
  open: "Not started",
  in_progress: "Started but not finished",
};

async function alertAdmins(db: SupabaseClient, job: LoadedRequest, stage: ReminderStage, count: number, origin: string) {
  const { data: recipients } = await db
    .from("admin_notification_recipients")
    .select("name, email, phone, notify_email, notify_whatsapp")
    .eq("is_active", true);
  if (!recipients?.length) return;

  const { notifyAdmins } = await import("@/lib/notifications/admin-notify");
  const assignedTo = job.assignedToName || "Technician";
  const standing = `${STANDING[stage]} after ${count} reminders`;
  const dashboardLink = `${origin}/en/maintenance/${job.id}`;
  const { ctx } = job;

  await notifyAdmins(
    recipients.map((r) => ({ ...r, notify_email: false })),
    {
      subject: "",
      emailHtml: "",
      whatsappText: [
        `⚠️ *Maintenance job #${requestRef(job.id)} needs attention*`,
        "",
        `📍 *Property:* ${ctx.propertyName}`,
        `🏠 *Unit:* ${ctx.unitNumber}`,
        `🔧 *Category:* ${categoryLabel(ctx.category)}`,
        `👷 *Assigned to:* ${assignedTo}`,
        `📌 *Status:* ${standing}`,
        "",
        "Reminders will keep going until the job is marked on its job page or resolved here.",
        "",
        `🔗 ${dashboardLink}`,
      ].join("\n"),
      whatsappTemplate: {
        name: ADMIN_JOB_STUCK_TEMPLATE.name,
        languageCode: ADMIN_JOB_STUCK_TEMPLATE.language,
        parameters: adminJobStuckParams(ctx, assignedTo, standing, dashboardLink),
        fallbackToText: true,
      },
    }
  );
}

export async function GET(request: Request) {
  if (!checkBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const { data, error } = await db
      .from("maintenance_requests")
      .select(
        "id, status, created_at, assigned_to_phone, technician_started_at, technician_done_at, technician_next_reminder_at, technician_reminder_count"
      )
      .in("status", ["open", "in_progress"])
      .is("technician_done_at", null)
      .not("assigned_to_phone", "is", null)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const origin = (await resolveAppOrigin(db)) ?? new URL(request.url).origin;
    const now = new Date();
    const summary = { due: 0, sent: 0, failed: 0, adminAlerts: 0 };

    for (const row of (data ?? []) as JobRow[]) {
      const stage = reminderStage(row);
      if (!stage || !row.assigned_to_phone) continue;
      if (!isReminderDue(reminderDueAt(row, stage), now)) continue;
      summary.due++;

      // Claim the reminder before sending, so a second run of this cron, or
      // the technician marking the job at the same moment, can't double it.
      const count = row.technician_reminder_count + 1;
      const { data: claimed } = await db
        .from("maintenance_requests")
        .update({ technician_next_reminder_at: nextReminderAt(stage, now), technician_reminder_count: count })
        .eq("id", row.id)
        .eq("status", row.status)
        .is("technician_done_at", null)
        .eq("technician_reminder_count", row.technician_reminder_count)
        .select("id");
      if (!claimed?.length) continue;

      const job = await loadRequest(db, row.id);
      const result =
        job?.technicianToken && job.assignedToPhone
          ? await sendTechnicianReminder(
              job.assignedToPhone,
              job.ctx,
              stage,
              `${origin}${maintenanceJobPath(job.technicianToken)}`
            )
          : { success: false as const };

      if (!result.success || !job) {
        // Not delivered: put the schedule back so tomorrow's run tries again.
        summary.failed++;
        await db
          .from("maintenance_requests")
          .update({
            technician_next_reminder_at: row.technician_next_reminder_at,
            technician_reminder_count: row.technician_reminder_count,
          })
          .eq("id", row.id)
          .eq("technician_reminder_count", count);
        continue;
      }
      summary.sent++;

      if (count === STUCK_AFTER_REMINDERS) {
        try {
          await alertAdmins(db, job, stage, count, origin);
          summary.adminAlerts++;
        } catch (err) {
          console.error("[maintenance-reminders] admin alert failed", err);
        }
      }
    }

    await db.from("cron_run_logs").insert({
      cron_name: CRON_NAME,
      status: summary.due === 0 ? "skipped" : "success",
      summary,
    });
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("cron_run_logs").insert({ cron_name: CRON_NAME, status: "error", summary: {}, error_message: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
