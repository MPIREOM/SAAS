import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CURRENCY } from "@/lib/currency";
import { notifyAdmins, buildAdminEmailHtml } from "@/lib/notifications/admin-notify";

export const maxDuration = 60;

export const ADMIN_SUMMARY_CRON = "admin-summary";

function createSupabaseAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

type AdminSummaryResult = {
  status: "success" | "skipped" | "error";
  summary: Record<string, unknown>;
  error?: string;
};

/**
 * Core daily-briefing logic, extracted from the route handler so it can be
 * invoked as a fallback from the reminders cron if the scheduled 03:00 UTC
 * fire is missed by Vercel's dispatcher. Always records a row in
 * `cron_run_logs` so missed runs are detectable after the fact.
 */
export async function runAdminSummary(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  trigger: "scheduled" | "fallback" = "scheduled"
): Promise<AdminSummaryResult> {
  const startedAt = new Date();
  console.log(
    `[admin-summary] Starting (${trigger}) at ${startedAt.toISOString()}`
  );

  try {
    // Use Oman calendar date (UTC+4) so "today" matches the invoices cron
    // and the in-app invoice listing, both of which evaluate due dates in
    // Muscat local time. Using UTC here caused invoices due on the current
    // Muscat day to be missed from the "Due Today" bucket just after
    // midnight Muscat / before 04:00 UTC.
    const omanNow = new Date(startedAt.getTime() + 4 * 60 * 60 * 1000);
    const today = omanNow.toISOString().split("T")[0];
    const todayDisplay = startedAt.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const [
      invoicesDueRes,
      invoicesPendingRes,
      invoicesOverdueRes,
      chequesDueRes,
      newMaintenanceRes,
      openMaintenanceRes,
      recipientsRes,
    ] = await Promise.all([
      supabase
        .from("invoices")
        .select("amount, paid_amount, tenants(full_name), units(unit_number, properties:property_id(name))")
        .in("status", ["pending", "partial"])
        .eq("due_date", today),
      supabase
        .from("invoices")
        .select("amount, paid_amount, due_date, status, tenants(full_name), units(unit_number, properties:property_id(name))")
        .in("status", ["pending", "partial"])
        .order("due_date", { ascending: true }),
      supabase
        .from("invoices")
        .select("amount, paid_amount, due_date, status, tenants(full_name), units(unit_number, properties:property_id(name))")
        .eq("status", "overdue")
        .order("due_date", { ascending: true }),
      // Cheques due today or overdue. We pull the linked invoice status so we
      // can skip cheques whose invoice was already settled by another method
      // (e.g. bank transfer) — mark-paid auto-cancels these, but this filter
      // is a safety net for edge cases or in-flight data.
      supabase
        .from("cheques")
        .select("amount, cheque_number, bank_name, cheque_date, tenants(full_name), invoice_id, invoices(status)")
        .eq("status", "pending")
        .lte("cheque_date", today)
        .order("cheque_date", { ascending: true }),
      supabase
        .from("maintenance_requests")
        .select("category, urgency, description, created_at, units(unit_number, properties:property_id(name))")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false }),
      supabase
        .from("maintenance_requests")
        .select("id")
        .in("status", ["open", "in_progress"]),
      supabase
        .from("admin_notification_recipients")
        .select("name, email, phone, notify_email, notify_whatsapp")
        .eq("is_active", true),
    ]);

    // Log any query errors rather than letting them silently degrade to empty
    // arrays — a failed recipients query, for example, would otherwise be
    // indistinguishable from "no recipients configured".
    for (const [name, res] of [
      ["invoicesDue", invoicesDueRes],
      ["invoicesPending", invoicesPendingRes],
      ["invoicesOverdue", invoicesOverdueRes],
      ["chequesDue", chequesDueRes],
      ["newMaintenance", newMaintenanceRes],
      ["openMaintenance", openMaintenanceRes],
      ["recipients", recipientsRes],
    ] as const) {
      if (res.error) {
        console.error(`[admin-summary] ${name} query failed:`, res.error.message);
      }
    }

    // Extra WhatsApp-only recipients configured per user (e.g. the owner) —
    // anyone listed in users.notification_phones gets the daily summary too.
    const { data: extraUsers, error: extraUsersErr } = await supabase
      .from("users")
      .select("full_name, notification_phones")
      .eq("is_active", true)
      .not("notification_phones", "is", null);
    if (extraUsersErr) {
      console.error("[admin-summary] extra users query failed:", extraUsersErr.message);
    }
    const extraRecipients = (extraUsers || [])
      .flatMap((u: Record<string, unknown>) => {
        const phones = (u.notification_phones as string[] | null) || [];
        const ownerName = (u.full_name as string) || "Owner";
        return phones
          .map((p) => (p || "").replace(/[^\d]/g, ""))
          .filter((p) => p.length >= 8)
          .map((phone) => ({
            name: `${ownerName} (CC)`,
            email: null,
            phone,
            notify_email: false,
            notify_whatsapp: true,
          }));
      });
    const seenPhones = new Set<string>();
    const dedupedExtras = extraRecipients.filter((r) => {
      if (!r.phone || seenPhones.has(r.phone)) return false;
      seenPhones.add(r.phone);
      return true;
    });

    const invoicesDue = invoicesDueRes.data || [];
    // Classify outstanding invoices into Pending vs Overdue buckets to match
    // the invoices page (src/app/[locale]/(dashboard)/invoices/page.tsx):
    //   - Pending: status="pending" AND due_date >= today
    //   - Overdue: status="overdue" OR status="partial" OR
    //              (status="pending" AND due_date < today)
    // The "pending" query also pulls "partial" rows so partially-paid invoices
    // aren't silently dropped from the summary — they land in the Overdue
    // bucket because any remaining balance is effectively outstanding.
    // Reclassification is still needed because the daily invoices cron that
    // flips status="pending" → "overdue" may not have run yet.
    const rawPending = invoicesPendingRes.data || [];
    const rawOverdue = invoicesOverdueRes.data || [];
    const isPastDuePending = (i: Record<string, unknown>) =>
      i.status === "pending" &&
      typeof i.due_date === "string" &&
      (i.due_date as string) < today;
    const reclassifiedAsOverdue = rawPending.filter(
      (i: Record<string, unknown>) => i.status === "partial" || isPastDuePending(i)
    );
    const invoicesPending = rawPending.filter(
      (i: Record<string, unknown>) => i.status === "pending" && !isPastDuePending(i)
    );
    const invoicesOverdue = [...rawOverdue, ...reclassifiedAsOverdue];
    const chequesDue = (chequesDueRes.data || []).filter((c: Record<string, unknown>) => {
      const inv = c.invoices as { status?: string } | null;
      return !inv?.status || !["paid", "cancelled"].includes(inv.status);
    });
    const newMaintenance = newMaintenanceRes.data || [];
    const openMaintenance = openMaintenanceRes.data || [];
    const primaryRecipients = recipientsRes.data || [];

    const primaryPhones = new Set(
      primaryRecipients
        .map((r: Record<string, unknown>) => ((r.phone as string) || "").replace(/[^\d]/g, ""))
        .filter(Boolean)
    );
    const recipients = [
      ...primaryRecipients,
      ...dedupedExtras.filter((r) => !primaryPhones.has(r.phone)),
    ];

    console.log(
      `[admin-summary] Resolved ${recipients.length} recipients ` +
        `(${primaryRecipients.length} primary + ${dedupedExtras.length} CC); ` +
        `${invoicesDue.length} due, ${invoicesPending.length} pending, ${invoicesOverdue.length} overdue, ${chequesDue.length} cheques`
    );

    if (recipients.length === 0) {
      const summary = { trigger, recipients: 0, reason: "no_recipients" };
      await logCronRun(supabase, ADMIN_SUMMARY_CRON, "skipped", summary);
      return { status: "skipped", summary };
    }

    // Outstanding balance = billed amount minus any payments already recorded.
    // For status="pending" invoices paid_amount is typically 0, so this is a
    // no-op; for "partial" invoices it correctly excludes the paid portion.
    const owing = (i: Record<string, unknown>) =>
      Number(i.amount || 0) - Number(i.paid_amount || 0);
    const totalDueToday = invoicesDue.reduce((sum: number, i: Record<string, unknown>) => sum + owing(i), 0);
    const totalPending = invoicesPending.reduce((sum: number, i: Record<string, unknown>) => sum + owing(i), 0);
    const totalOverdue = invoicesOverdue.reduce((sum: number, i: Record<string, unknown>) => sum + owing(i), 0);
    const totalCheques = chequesDue.reduce((sum: number, c: Record<string, unknown>) => sum + Number(c.amount || 0), 0);

    const getTenant = (row: Record<string, unknown>) => ((row.tenants as Record<string, unknown>)?.full_name as string) || "Unknown";
    const getPropertyName = (row: Record<string, unknown>) => {
      const units = row.units as Record<string, unknown> | null;
      const props = units?.properties as Record<string, unknown> | null;
      return (props?.name as string) || "Unknown";
    };
    const getProperty = (row: Record<string, unknown>) => {
      const units = row.units as Record<string, unknown> | null;
      const props = units?.properties as Record<string, unknown> | null;
      return `${props?.name || "?"} — ${units?.unit_number || "?"}`;
    };

    const overdueByProperty = new Map<string, { count: number; total: number }>();
    invoicesOverdue.forEach((i: Record<string, unknown>) => {
      const name = getPropertyName(i);
      const entry = overdueByProperty.get(name) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += owing(i);
      overdueByProperty.set(name, entry);
    });
    const overdueByPropertySorted = Array.from(overdueByProperty.entries())
      .sort((a, b) => b[1].total - a[1].total);

    const pendingByProperty = new Map<string, { count: number; total: number }>();
    invoicesPending.forEach((i: Record<string, unknown>) => {
      const name = getPropertyName(i);
      const entry = pendingByProperty.get(name) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += owing(i);
      pendingByProperty.set(name, entry);
    });
    const pendingByPropertySorted = Array.from(pendingByProperty.entries())
      .sort((a, b) => b[1].total - a[1].total);

    const emailSections = [];

    emailSections.push({
      heading: `📋 Invoices Due Today (${invoicesDue.length})`,
      items: invoicesDue.length > 0
        ? [
            ...invoicesDue.slice(0, 10).map((i: Record<string, unknown>) =>
              `${getTenant(i)} — ${getProperty(i)} — <strong>${owing(i).toFixed(2)} ${CURRENCY.code}</strong>`
            ),
            ...(invoicesDue.length > 10 ? [`<em>...and ${invoicesDue.length - 10} more</em>`] : []),
            `<strong>Total: ${totalDueToday.toFixed(2)} ${CURRENCY.code}</strong>`,
          ]
        : [],
    });

    emailSections.push({
      heading: `🟡 Pending Invoices (${invoicesPending.length})`,
      items: invoicesPending.length > 0
        ? [
            `<em>By property:</em>`,
            ...pendingByPropertySorted.map(([name, { count, total }]) =>
              `&nbsp;&nbsp;• ${name}: ${count} invoice${count !== 1 ? "s" : ""} — <strong>${total.toFixed(2)} ${CURRENCY.code}</strong>`
            ),
            `<em>Details:</em>`,
            ...invoicesPending.slice(0, 10).map((i: Record<string, unknown>) =>
              `${getTenant(i)} — ${getProperty(i)} — <strong>${owing(i).toFixed(2)} ${CURRENCY.code}</strong> (due ${i.due_date})`
            ),
            ...(invoicesPending.length > 10 ? [`<em>...and ${invoicesPending.length - 10} more</em>`] : []),
            `<strong>Total pending: ${totalPending.toFixed(2)} ${CURRENCY.code}</strong>`,
          ]
        : [],
    });

    emailSections.push({
      heading: `🔴 Overdue Invoices (${invoicesOverdue.length})`,
      items: invoicesOverdue.length > 0
        ? [
            `<em>By property:</em>`,
            ...overdueByPropertySorted.map(([name, { count, total }]) =>
              `&nbsp;&nbsp;• ${name}: ${count} invoice${count !== 1 ? "s" : ""} — <strong>${total.toFixed(2)} ${CURRENCY.code}</strong>`
            ),
            `<em>Details:</em>`,
            ...invoicesOverdue.slice(0, 10).map((i: Record<string, unknown>) => {
              const days = Math.floor((Date.now() - new Date(i.due_date as string).getTime()) / (1000 * 60 * 60 * 24));
              return `${getTenant(i)} — ${getProperty(i)} — <strong>${owing(i).toFixed(2)} ${CURRENCY.code}</strong> (${days}d overdue)`;
            }),
            ...(invoicesOverdue.length > 10 ? [`<em>...and ${invoicesOverdue.length - 10} more</em>`] : []),
            `<strong>Total overdue: ${totalOverdue.toFixed(2)} ${CURRENCY.code}</strong>`,
          ]
        : [],
    });

    emailSections.push({
      heading: `🏦 Cheques Due (${chequesDue.length})`,
      items: chequesDue.length > 0
        ? [
            ...chequesDue.slice(0, 10).map((c: Record<string, unknown>) =>
              `#${c.cheque_number} — ${getTenant(c)} — ${c.bank_name} — <strong>${Number(c.amount).toFixed(2)} ${CURRENCY.code}</strong>`
            ),
            ...(chequesDue.length > 10 ? [`<em>...and ${chequesDue.length - 10} more</em>`] : []),
            `<strong>Total: ${totalCheques.toFixed(2)} ${CURRENCY.code}</strong>`,
          ]
        : [],
    });

    emailSections.push({
      heading: `🔧 New Maintenance Requests (${newMaintenance.length})`,
      items: newMaintenance.length > 0
        ? newMaintenance.slice(0, 10).map((m: Record<string, unknown>) => {
            const units = m.units as Record<string, unknown> | null;
            const props = units?.properties as Record<string, unknown> | null;
            return `${props?.name || "?"} — ${units?.unit_number || "?"} — <strong>${(m.urgency as string || "").toUpperCase()}</strong> ${m.category} — ${(m.description as string || "").slice(0, 60)}`;
          })
        : [],
    });

    emailSections.push({
      heading: `📊 Open Maintenance Total`,
      items: [`${openMaintenance.length} request${openMaintenance.length !== 1 ? "s" : ""} currently open or in progress`],
    });

    // Per-property overdue breakdown — rendered into the plaintext
    // WhatsApp fallback and email. Multi-line form.
    const overdueBreakdownLines = overdueByPropertySorted.map(([name, { count, total }]) =>
      `   • ${name}: ${count} invoice${count !== 1 ? "s" : ""} (${total.toFixed(2)} ${CURRENCY.code})`
    );
    const pendingBreakdownLines = pendingByPropertySorted.map(([name, { count, total }]) =>
      `   • ${name}: ${count} invoice${count !== 1 ? "s" : ""} (${total.toFixed(2)} ${CURRENCY.code})`
    );
    // {{10}} of the daily_briefs template. Meta rejects template params
    // containing newlines, tabs, or >4 consecutive spaces, and rejects
    // empty params, so we collapse to single-space-separated bullets and
    // fall back to " " when nothing is outstanding. Pending + overdue are
    // merged into one total per property so the same property name doesn't
    // appear twice in the message.
    const outstandingByProperty = new Map<string, { count: number; total: number }>();
    for (const source of [pendingByProperty, overdueByProperty]) {
      for (const [name, { count, total }] of source) {
        const entry = outstandingByProperty.get(name) || { count: 0, total: 0 };
        entry.count += count;
        entry.total += total;
        outstandingByProperty.set(name, entry);
      }
    }
    const outstandingByPropertySorted = Array.from(outstandingByProperty.entries())
      .sort((a, b) => b[1].total - a[1].total);
    const outstandingBreakdownInline =
      outstandingByPropertySorted
        .map(([name, { count, total }]) =>
          `• ${name}: ${count} inv (${total.toFixed(2)} ${CURRENCY.code})`
        )
        .join(" ") || " ";

    const whatsappLines = [
      `📊 *MPIRE Daily Summary*`,
      `📅 ${todayDisplay}`,
      ``,
      `📋 *Invoices Due Today:* ${invoicesDue.length} (${totalDueToday.toFixed(2)} ${CURRENCY.code})`,
      `🟡 *Pending:* ${invoicesPending.length} (${totalPending.toFixed(2)} ${CURRENCY.code})`,
      ...pendingBreakdownLines,
      `🔴 *Overdue:* ${invoicesOverdue.length} (${totalOverdue.toFixed(2)} ${CURRENCY.code})`,
      ...overdueBreakdownLines,
      `🏦 *Cheques Due:* ${chequesDue.length} (${totalCheques.toFixed(2)} ${CURRENCY.code})`,
      `🔧 *New Maintenance (24h):* ${newMaintenance.length}`,
      `📊 *Open Maintenance:* ${openMaintenance.length}`,
    ];

    if (invoicesPending.length > 0) {
      whatsappLines.push(``, `*Top Pending:*`);
      invoicesPending.slice(0, 5).forEach((i: Record<string, unknown>) => {
        whatsappLines.push(`• ${getTenant(i)} — ${owing(i).toFixed(2)} ${CURRENCY.code} (due ${i.due_date})`);
      });
    }

    if (invoicesOverdue.length > 0) {
      whatsappLines.push(``, `*Top Overdue:*`);
      invoicesOverdue.slice(0, 5).forEach((i: Record<string, unknown>) => {
        const days = Math.floor((Date.now() - new Date(i.due_date as string).getTime()) / (1000 * 60 * 60 * 24));
        whatsappLines.push(`• ${getTenant(i)} — ${owing(i).toFixed(2)} ${CURRENCY.code} (${days}d)`);
      });
    }

    if (chequesDue.length > 0) {
      whatsappLines.push(``, `*Cheques to Deposit:*`);
      chequesDue.slice(0, 5).forEach((c: Record<string, unknown>) => {
        whatsappLines.push(`• #${c.cheque_number} — ${getTenant(c)} — ${Number(c.amount).toFixed(2)} ${CURRENCY.code}`);
      });
    }

    const sendResult = await notifyAdmins(recipients, {
      subject: `MPIRE Daily Summary — ${invoicesDue.length} due, ${invoicesPending.length} pending, ${invoicesOverdue.length} overdue, ${chequesDue.length} cheques`,
      emailHtml: buildAdminEmailHtml({
        title: "Good Morning — Daily Summary",
        sections: emailSections,
        footer: "This summary is sent every morning at 7:00 Muscat time. Manage recipients in Settings.",
      }),
      whatsappText: whatsappLines.join("\n"),
      whatsappTemplate: {
        name: "daily_briefs",
        languageCode: "en",
        parameters: [
          todayDisplay,
          String(invoicesDue.length),
          totalDueToday.toFixed(2),
          String(invoicesOverdue.length),
          totalOverdue.toFixed(2),
          String(chequesDue.length),
          totalCheques.toFixed(2),
          String(newMaintenance.length),
          String(openMaintenance.length),
          // {{10}} — per-property pending + overdue breakdown, single-line
          // form (Meta rejects newlines/tabs/>4 spaces in template params).
          outstandingBreakdownInline,
        ],
      },
    });

    const summary = {
      trigger,
      recipients: recipients.length,
      emailsSent: sendResult.emailsSent,
      whatsappSent: sendResult.whatsappSent,
      errors: sendResult.errors,
      invoicesDueToday: invoicesDue.length,
      totalDueToday,
      invoicesPending: invoicesPending.length,
      totalPending,
      invoicesOverdue: invoicesOverdue.length,
      totalOverdue,
      chequesDue: chequesDue.length,
      totalCheques,
      newMaintenance: newMaintenance.length,
      openMaintenance: openMaintenance.length,
    };

    const status: "success" | "error" = sendResult.emailsSent + sendResult.whatsappSent > 0 ? "success" : "error";
    console.log(`[admin-summary] Done: ${JSON.stringify(summary)}`);
    await logCronRun(supabase, ADMIN_SUMMARY_CRON, status, summary);
    return { status, summary };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[admin-summary] Unhandled error:`, error);
    await logCronRun(supabase, ADMIN_SUMMARY_CRON, "error", { trigger }, error);
    return { status: "error", summary: { trigger }, error };
  }
}

async function logCronRun(
  supabase: SupabaseClient,
  cronName: string,
  status: "success" | "skipped" | "error",
  summary: Record<string, unknown>,
  errorMessage?: string
) {
  try {
    await supabase.from("cron_run_logs").insert({
      cron_name: cronName,
      status,
      summary,
      error_message: errorMessage || null,
    });
  } catch (err) {
    console.error(`[admin-summary] Failed to write cron_run_logs entry:`, err);
  }
}

/**
 * Check whether the admin-summary cron has successfully run today (Muscat
 * time). Used by the reminders cron to decide whether to re-trigger the
 * briefing when Vercel's 03:00 UTC dispatch has been missed.
 */
export async function wasAdminSummaryRunToday(
  supabase: ReturnType<typeof createSupabaseAdmin>
): Promise<boolean> {
  const now = new Date();
  // Muscat is UTC+4; "today" for the briefing is the Muscat calendar date.
  const omanNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const omanMidnightUtc = new Date(
    Date.UTC(omanNow.getUTCFullYear(), omanNow.getUTCMonth(), omanNow.getUTCDate())
    - 4 * 60 * 60 * 1000
  );
  const { data, error } = await supabase
    .from("cron_run_logs")
    .select("id")
    .eq("cron_name", ADMIN_SUMMARY_CRON)
    .eq("status", "success")
    .gte("ran_at", omanMidnightUtc.toISOString())
    .limit(1);
  if (error) {
    console.error("[admin-summary] wasAdminSummaryRunToday check failed:", error.message);
    return false;
  }
  return (data?.length || 0) > 0;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const result = await runAdminSummary(supabase, "scheduled");
  return NextResponse.json(result);
}
