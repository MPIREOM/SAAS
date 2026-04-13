import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { format } from "date-fns";
import { CURRENCY } from "@/lib/currency";
import { notifyAdmins, buildAdminEmailHtml } from "@/lib/notifications/admin-notify";

export const maxDuration = 60;

function createSupabaseAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const today = format(new Date(), "yyyy-MM-dd");
  const todayDisplay = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Fetch all data in parallel
  const [
    invoicesDueRes,
    invoicesOverdueRes,
    chequesDueRes,
    newMaintenanceRes,
    openMaintenanceRes,
    recipientsRes,
  ] = await Promise.all([
    // Invoices due today
    supabase
      .from("invoices")
      .select("amount, tenants(full_name), units(unit_number, properties:property_id(name))")
      .eq("status", "pending")
      .eq("due_date", today),
    // Overdue invoices
    supabase
      .from("invoices")
      .select("amount, due_date, tenants(full_name), units(unit_number, properties:property_id(name))")
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
    // New maintenance requests (created in last 24 hours)
    supabase
      .from("maintenance_requests")
      .select("category, urgency, description, created_at, units(unit_number, properties:property_id(name))")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false }),
    // All open maintenance
    supabase
      .from("maintenance_requests")
      .select("id")
      .in("status", ["open", "in_progress"]),
    // Admin recipients
    supabase
      .from("admin_notification_recipients")
      .select("name, email, phone, notify_email, notify_whatsapp")
      .eq("is_active", true),
  ]);

  // Extra WhatsApp-only recipients configured per user (e.g. the owner) —
  // anyone listed in users.notification_phones gets the daily summary too.
  const { data: extraUsers } = await supabase
    .from("users")
    .select("full_name, notification_phones")
    .eq("is_active", true)
    .not("notification_phones", "is", null);
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
  // Dedupe by phone in case the same number appears in multiple users
  const seenPhones = new Set<string>();
  const dedupedExtras = extraRecipients.filter((r) => {
    if (!r.phone || seenPhones.has(r.phone)) return false;
    seenPhones.add(r.phone);
    return true;
  });

  const invoicesDue = invoicesDueRes.data || [];
  const invoicesOverdue = invoicesOverdueRes.data || [];
  const chequesDue = (chequesDueRes.data || []).filter((c: Record<string, unknown>) => {
    const inv = c.invoices as { status?: string } | null;
    // Skip any cheque whose invoice has already been settled — the cheque
    // record is stale and shouldn't be listed as "to deposit".
    return !inv?.status || !["paid", "cancelled"].includes(inv.status);
  });
  const newMaintenance = newMaintenanceRes.data || [];
  const openMaintenance = openMaintenanceRes.data || [];
  const primaryRecipients = recipientsRes.data || [];

  // Skip any extra (CC) phone that is already a primary recipient.
  const primaryPhones = new Set(
    primaryRecipients
      .map((r: Record<string, unknown>) => ((r.phone as string) || "").replace(/[^\d]/g, ""))
      .filter(Boolean)
  );
  const recipients = [
    ...primaryRecipients,
    ...dedupedExtras.filter((r) => !primaryPhones.has(r.phone)),
  ];

  if (recipients.length === 0) {
    return NextResponse.json({ message: "No recipients configured" });
  }

  // Calculate totals
  const totalDueToday = invoicesDue.reduce((sum: number, i: Record<string, unknown>) => sum + Number(i.amount || 0), 0);
  const totalOverdue = invoicesOverdue.reduce((sum: number, i: Record<string, unknown>) => sum + Number(i.amount || 0), 0);
  const totalCheques = chequesDue.reduce((sum: number, c: Record<string, unknown>) => sum + Number(c.amount || 0), 0);

  // Helper to safely get nested names
  const getTenant = (row: Record<string, unknown>) => ((row.tenants as Record<string, unknown>)?.full_name as string) || "Unknown";
  const getProperty = (row: Record<string, unknown>) => {
    const units = row.units as Record<string, unknown> | null;
    const props = units?.properties as Record<string, unknown> | null;
    return `${props?.name || "?"} — ${units?.unit_number || "?"}`;
  };

  // Build email sections
  const emailSections = [];

  // Invoices due today
  emailSections.push({
    heading: `📋 Invoices Due Today (${invoicesDue.length})`,
    items: invoicesDue.length > 0
      ? [
          ...invoicesDue.slice(0, 10).map((i: Record<string, unknown>) =>
            `${getTenant(i)} — ${getProperty(i)} — <strong>${Number(i.amount).toFixed(2)} ${CURRENCY.code}</strong>`
          ),
          ...(invoicesDue.length > 10 ? [`<em>...and ${invoicesDue.length - 10} more</em>`] : []),
          `<strong>Total: ${totalDueToday.toFixed(2)} ${CURRENCY.code}</strong>`,
        ]
      : [],
  });

  // Overdue invoices
  emailSections.push({
    heading: `🔴 Overdue Invoices (${invoicesOverdue.length})`,
    items: invoicesOverdue.length > 0
      ? [
          ...invoicesOverdue.slice(0, 10).map((i: Record<string, unknown>) => {
            const days = Math.floor((Date.now() - new Date(i.due_date as string).getTime()) / (1000 * 60 * 60 * 24));
            return `${getTenant(i)} — ${getProperty(i)} — <strong>${Number(i.amount).toFixed(2)} ${CURRENCY.code}</strong> (${days}d overdue)`;
          }),
          ...(invoicesOverdue.length > 10 ? [`<em>...and ${invoicesOverdue.length - 10} more</em>`] : []),
          `<strong>Total overdue: ${totalOverdue.toFixed(2)} ${CURRENCY.code}</strong>`,
        ]
      : [],
  });

  // Cheques due
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

  // New maintenance (last 24h)
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

  // Open maintenance count
  emailSections.push({
    heading: `📊 Open Maintenance Total`,
    items: [`${openMaintenance.length} request${openMaintenance.length !== 1 ? "s" : ""} currently open or in progress`],
  });

  // Build WhatsApp text
  const whatsappLines = [
    `📊 *MPIRE Daily Summary*`,
    `📅 ${todayDisplay}`,
    ``,
    `📋 *Invoices Due Today:* ${invoicesDue.length} (${totalDueToday.toFixed(2)} ${CURRENCY.code})`,
    `🔴 *Overdue:* ${invoicesOverdue.length} (${totalOverdue.toFixed(2)} ${CURRENCY.code})`,
    `🏦 *Cheques Due:* ${chequesDue.length} (${totalCheques.toFixed(2)} ${CURRENCY.code})`,
    `🔧 *New Maintenance (24h):* ${newMaintenance.length}`,
    `📊 *Open Maintenance:* ${openMaintenance.length}`,
  ];

  // Add top overdue details
  if (invoicesOverdue.length > 0) {
    whatsappLines.push(``, `*Top Overdue:*`);
    invoicesOverdue.slice(0, 5).forEach((i: Record<string, unknown>) => {
      const days = Math.floor((Date.now() - new Date(i.due_date as string).getTime()) / (1000 * 60 * 60 * 24));
      whatsappLines.push(`• ${getTenant(i)} — ${Number(i.amount).toFixed(2)} ${CURRENCY.code} (${days}d)`);
    });
  }

  if (chequesDue.length > 0) {
    whatsappLines.push(``, `*Cheques to Deposit:*`);
    chequesDue.slice(0, 5).forEach((c: Record<string, unknown>) => {
      whatsappLines.push(`• #${c.cheque_number} — ${getTenant(c)} — ${Number(c.amount).toFixed(2)} ${CURRENCY.code}`);
    });
  }

  // Send notifications
  const result = await notifyAdmins(recipients, {
    subject: `MPIRE Daily Summary — ${invoicesDue.length} due, ${invoicesOverdue.length} overdue, ${chequesDue.length} cheques`,
    emailHtml: buildAdminEmailHtml({
      title: "Good Morning — Daily Summary",
      sections: emailSections,
      footer: "This summary is sent every morning at 8:00 AM. Manage recipients in Settings.",
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
      ],
    },
  });

  return NextResponse.json({
    sent: result,
    summary: {
      invoicesDueToday: invoicesDue.length,
      totalDueToday,
      invoicesOverdue: invoicesOverdue.length,
      totalOverdue,
      chequesDue: chequesDue.length,
      totalCheques,
      newMaintenance: newMaintenance.length,
      openMaintenance: openMaintenance.length,
    },
  });
}
