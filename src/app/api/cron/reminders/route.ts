import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sendWhatsAppTemplate, buildRentReminderComponents, buildOverdueReminderComponents } from "@/lib/whatsapp/client";
import { sendEmail, buildReminderEmailHtml } from "@/lib/email/client";
import { CURRENCY } from "@/lib/currency";
import { addDays, format, differenceInDays, parseISO } from "date-fns";
import { runAdminSummary, wasAdminSummaryRunToday } from "@/app/api/cron/admin-summary/route";

// Vercel Cron: runs daily at 8:00 AM (configured in vercel.json)
export const maxDuration = 300;

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

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  // Use Oman timezone (UTC+4) for date string, but keep `today` as real UTC for differenceInDays
  const today = new Date();
  const omanNow = new Date(today.getTime() + 4 * 60 * 60 * 1000);
  const todayStr = omanNow.toISOString().split("T")[0];

  // Safety net for the daily admin briefing: that cron is scheduled five
  // hours earlier (03:00 UTC) but Vercel's dispatcher occasionally misses a
  // fire window, leaving the admin without their morning summary. If it
  // hasn't run successfully today, trigger it now before the rest of the
  // reminders run.
  const adminSummaryFallback: { triggered: boolean; status?: string } = { triggered: false };
  try {
    if (!(await wasAdminSummaryRunToday(supabase))) {
      console.log("[reminders] Admin summary hasn't run today — triggering fallback");
      const fallbackResult = await runAdminSummary(supabase, "fallback");
      adminSummaryFallback.triggered = true;
      adminSummaryFallback.status = fallbackResult.status;
    }
  } catch (err) {
    console.error(
      "[reminders] Admin summary fallback failed:",
      err instanceof Error ? err.message : err
    );
  }

  const results = {
    rentUpcoming: 0,
    rentOverdue: 0,
    chequeDue: 0,
    leaseExpiry: 0,
    errors: 0,
  };

  try {
    // Load all active notification templates from DB
    const { data: dbTemplates } = await supabase
      .from("notification_templates")
      .select("*")
      .eq("is_active", true);

    // Index templates by (reminder_type, channel, language) for O(1) lookup
    const templateIndex = new Map<string, NotificationTemplate>();
    if (dbTemplates) {
      for (const t of dbTemplates) {
        const key = `${t.reminder_type}:${t.channel}:${t.language}`;
        templateIndex.set(key, t as NotificationTemplate);
      }
    }

    // Load configurable reminder settings
    const { data: settingsRows } = await supabase.from("reminder_settings").select("*");
    const settingsMap = new Map<string, { days_before: number[]; repeat_interval_days: number | null; is_enabled: boolean }>();
    // Defaults
    settingsMap.set("rent_upcoming", { days_before: [3], repeat_interval_days: null, is_enabled: true });
    settingsMap.set("rent_overdue", { days_before: [1], repeat_interval_days: 1, is_enabled: true });
    settingsMap.set("lease_expiry", { days_before: [60, 30, 7], repeat_interval_days: null, is_enabled: true });
    settingsMap.set("cheque_due", { days_before: [3], repeat_interval_days: null, is_enabled: true });
    if (settingsRows) {
      for (const row of settingsRows) {
        settingsMap.set(row.reminder_type, row as { days_before: number[]; repeat_interval_days: number | null; is_enabled: boolean });
      }
    }

    // Load properties with notifications disabled to skip them
    const { data: disabledProperties } = await supabase
      .from("properties")
      .select("id")
      .eq("notifications_enabled", false);
    const disabledPropertyIds = new Set(
      (disabledProperties || []).map((p) => p.id as string)
    );

    const upcomingSetting = settingsMap.get("rent_upcoming")!;
    const overdueSetting = settingsMap.get("rent_overdue")!;
    const expirySetting = settingsMap.get("lease_expiry")!;

    // 1. Lease-based reminders
    const { data: activeLeases } = await supabase
      .from("leases")
      .select(`
        *,
        tenants(id, full_name, phone, email, language_preference, notifications_enabled),
        units(unit_number, property_id, properties(name))
      `)
      .eq("is_active", true);

    if (activeLeases) {
      for (const lease of activeLeases) {
        try {
          const tenant = lease.tenants as Record<string, unknown>;
          const unit = lease.units as Record<string, unknown>;
          const property = unit?.properties as Record<string, unknown>;
          if (!tenant || !unit) continue;

          // Skip properties with notifications disabled
          const propertyId = unit.property_id as string;
          if (disabledPropertyIds.has(propertyId)) continue;

          // Skip tenants with notifications disabled
          if (tenant.notifications_enabled === false) continue;

          const dueDay = lease.payment_due_day || 1;
          const currentMonth = omanNow.getMonth();
          const currentYear = omanNow.getFullYear();
          const dueDate = new Date(currentYear, currentMonth, dueDay);
          const daysUntilDue = differenceInDays(dueDate, today);

          // Upcoming rent reminder (configurable days before)
          if (upcomingSetting.is_enabled && daysUntilDue > 0 && upcomingSetting.days_before.includes(daysUntilDue)) {
            await sendReminder(supabase, templateIndex, {
              tenantId: tenant.id as string,
              tenantName: tenant.full_name as string,
              phone: tenant.phone as string,
              email: tenant.email as string,
              language: (tenant.language_preference as string) || "en",
              unitNumber: unit.unit_number as string,
              propertyName: (property?.name as string) || "",
              amount: String(lease.monthly_rent),
              dueDate: format(dueDate, "yyyy-MM-dd"),
              reminderType: "rent_upcoming",
            });
            results.rentUpcoming++;
          }

          // Overdue rent reminder — invoice-driven (checks ALL overdue invoices)
          if (overdueSetting.is_enabled) {
            // Fetch all overdue/unpaid invoices for this lease where due_date has passed
            const { data: overdueInvs } = await supabase
              .from("invoices")
              .select("amount, paid_amount, due_date, period_start, period_end")
              .eq("lease_id", lease.id)
              .in("status", ["overdue", "partial", "pending"])
              .lt("due_date", todayStr)
              .order("due_date", { ascending: true });

            if (overdueInvs && overdueInvs.length > 0) {
              // Check when the last overdue reminder was sent for this tenant
              const repeatDays = overdueSetting.repeat_interval_days || 3;
              const { data: lastReminderRows } = await supabase
                .from("reminder_logs")
                .select("sent_at")
                .eq("tenant_id", tenant.id as string)
                .eq("reminder_type", "rent_overdue")
                .eq("status", "sent")
                .order("sent_at", { ascending: false })
                .limit(1);

              const lastReminder = lastReminderRows?.[0] || null;
              const shouldSend = !lastReminder ||
                differenceInDays(today, parseISO(lastReminder.sent_at as string)) >= repeatDays;

              if (shouldSend) {
                const overdueInvoices: OverdueInvoice[] = overdueInvs.map(
                  (inv: Record<string, unknown>) => ({
                    amount: String(Number(inv.amount || 0) - Number(inv.paid_amount || 0)),
                    dueDate: inv.due_date as string,
                    periodLabel: inv.period_start
                      ? `${format(parseISO(inv.period_start as string), "MMM yyyy")}`
                      : format(parseISO(inv.due_date as string), "MMM yyyy"),
                  })
                );

                const totalOverdue = overdueInvoices
                  .reduce((sum, inv) => sum + Number(inv.amount), 0)
                  .toFixed(2);

                await sendReminder(supabase, templateIndex, {
                  tenantId: tenant.id as string,
                  tenantName: tenant.full_name as string,
                  phone: tenant.phone as string,
                  email: tenant.email as string,
                  language: (tenant.language_preference as string) || "en",
                  unitNumber: unit.unit_number as string,
                  propertyName: (property?.name as string) || "",
                  amount: totalOverdue,
                  dueDate: overdueInvs[0].due_date as string,
                  reminderType: "rent_overdue",
                  overdueInvoices,
                  totalOverdue,
                });
                results.rentOverdue++;
              }
            }
          }

          // Lease expiry (configurable days before)
          if (expirySetting.is_enabled) {
            const leaseEnd = parseISO(lease.end_date);
            const daysUntilExpiry = differenceInDays(leaseEnd, today);
            if (daysUntilExpiry > 0 && expirySetting.days_before.includes(daysUntilExpiry)) {
              await sendReminder(supabase, templateIndex, {
                tenantId: tenant.id as string,
                tenantName: tenant.full_name as string,
                phone: tenant.phone as string,
                email: tenant.email as string,
                language: (tenant.language_preference as string) || "en",
                unitNumber: unit.unit_number as string,
                propertyName: (property?.name as string) || "",
                amount: String(lease.monthly_rent),
                dueDate: lease.end_date,
                reminderType: "lease_expiry",
              });
              results.leaseExpiry++;
            }
          }
        } catch (error) {
          console.error("Reminder failed for lease tenant:", error instanceof Error ? error.message : error);
          results.errors++;
        }
      }
    }

    // 2. Cheque due reminders (configurable days before)
    const chequeSetting = settingsMap.get("cheque_due")!;
    if (chequeSetting.is_enabled) {
      const chequeDates = chequeSetting.days_before.map((d) =>
        format(addDays(today, d), "yyyy-MM-dd")
      );
      const { data: dueCheques } = await supabase
        .from("cheques")
        .select(`*, tenants(id, full_name, phone, email, language_preference, notifications_enabled)`)
        .eq("status", "pending")
        .in("cheque_date", chequeDates);

      if (dueCheques) {
        for (const cheque of dueCheques) {
          try {
            const tenant = cheque.tenants as Record<string, unknown>;
            if (!tenant) continue;

            // Skip tenants with notifications disabled
            if (tenant.notifications_enabled === false) continue;

            await sendReminder(supabase, templateIndex, {
              tenantId: tenant.id as string,
              tenantName: tenant.full_name as string,
              phone: tenant.phone as string,
              email: tenant.email as string,
              language: (tenant.language_preference as string) || "en",
              unitNumber: "",
              propertyName: "",
              amount: String(cheque.amount),
              dueDate: cheque.cheque_date as string,
              reminderType: "cheque_due",
              chequeNumber: cheque.cheque_number as string,
            });
            results.chequeDue++;
          } catch (error) {
            console.error("Cheque reminder failed:", error instanceof Error ? error.message : error);
            results.errors++;
          }
        }
      }
    }
  } catch (error) {
    console.error("Reminder cron job error:", error instanceof Error ? error.message : error);
    results.errors++;
  }

  return NextResponse.json({
    success: true,
    timestamp: todayStr,
    results,
    adminSummaryFallback,
  });
}

interface NotificationTemplate {
  id: string;
  name: string;
  reminder_type: string;
  channel: string;
  language: string;
  subject: string | null;
  body_template: string;
  whatsapp_template_name: string | null;
  is_active: boolean;
}

interface OverdueInvoice {
  amount: string;
  dueDate: string;
  periodLabel: string;
}

interface ReminderParams {
  tenantId: string;
  tenantName: string;
  phone: string;
  email: string;
  language: string;
  unitNumber: string;
  propertyName: string;
  amount: string;
  dueDate: string;
  reminderType: "rent_upcoming" | "rent_overdue" | "cheque_due" | "lease_expiry";
  chequeNumber?: string;
  overdueInvoices?: OverdueInvoice[];
  totalOverdue?: string;
}

function buildOverdueDetails(invoices: OverdueInvoice[] | undefined, lang: string): string {
  if (!invoices || invoices.length === 0) return "";
  return invoices
    .map((inv) =>
      lang === "ar"
        ? `- ${inv.periodLabel}: ${inv.amount} ر.ع.`
        : `- ${inv.periodLabel}: ${inv.amount} ${CURRENCY.code}`
    )
    .join("\n");
}

// Meta rejects template parameters containing newlines, tabs, or >4
// consecutive spaces (error #132018), so the WhatsApp template variant
// flattens the list to a single line with bullet separators.
function buildOverdueDetailsInline(invoices: OverdueInvoice[] | undefined, lang: string): string {
  if (!invoices || invoices.length === 0) return "";
  return invoices
    .map((inv) =>
      lang === "ar"
        ? `• ${inv.periodLabel}: ${inv.amount} ر.ع.`
        : `• ${inv.periodLabel}: ${inv.amount} ${CURRENCY.code}`
    )
    .join(" ");
}

/**
 * Replace template variables like {{tenant_name}} with actual values.
 */
function renderTemplate(template: string, params: ReminderParams): string {
  const langCode = params.language === "ar" ? "ar" : "en";
  return template
    .replace(/\{\{tenant_name\}\}/g, params.tenantName)
    .replace(/\{\{amount\}\}/g, params.amount)
    .replace(/\{\{due_date\}\}/g, params.dueDate)
    .replace(/\{\{property\}\}/g, params.propertyName)
    .replace(/\{\{property_name\}\}/g, params.propertyName)
    .replace(/\{\{unit\}\}/g, params.unitNumber)
    .replace(/\{\{unit_number\}\}/g, params.unitNumber)
    .replace(/\{\{cheque_number\}\}/g, params.chequeNumber || "")
    .replace(/\{\{total_overdue\}\}/g, params.totalOverdue || params.amount)
    .replace(/\{\{overdue_details\}\}/g, buildOverdueDetails(params.overdueInvoices, langCode));
}

async function sendReminder(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  templateIndex: Map<string, NotificationTemplate>,
  params: ReminderParams
) {
  // Default WhatsApp template names (registered with Meta)
  const defaultWhatsAppTemplates: Record<string, string> = {
    rent_upcoming: "mpire_rent_upcoming",
    rent_overdue: "mpire_rent_overdue",
    cheque_due: "mpire_cheque_due",
    lease_expiry: "mpire_lease_expiry",
  };

  const langCode = params.language === "ar" ? "ar" : "en";

  // Send WhatsApp
  // Format phone number for WhatsApp API (must be international format with country code)
  const formatPhone = (phone: string): string => {
    const digits = phone.replace(/[^\d]/g, "");
    // Oman numbers: 8 digits without country code, add 968
    if (digits.length === 8) return `+968${digits}`;
    // Already has country code
    if (digits.startsWith("968")) return `+${digits}`;
    return `+${digits}`;
  };

  if (params.phone) {
    // Look up custom WhatsApp template
    const waTemplate = templateIndex.get(
      `${params.reminderType}:whatsapp:${langCode}`
    );

    // Use whatsapp_template_name if set, otherwise fall back to default slug
    const metaTemplateName = waTemplate?.whatsapp_template_name
      || `${defaultWhatsAppTemplates[params.reminderType]}_${langCode}`;

    // All templates are registered as English in Meta, so always use "en"
    const metaLanguageCode = "en";

    const whatsappResult = await sendWhatsAppTemplate({
      to: formatPhone(params.phone),
      templateName: metaTemplateName,
      languageCode: metaLanguageCode,
      components: params.reminderType === "rent_overdue" && params.overdueInvoices?.length
        ? buildOverdueReminderComponents({
            tenantName: params.tenantName,
            unitNumber: params.unitNumber,
            propertyName: params.propertyName,
            totalOverdue: params.totalOverdue || params.amount,
            overdueDetails: buildOverdueDetailsInline(params.overdueInvoices, langCode),
          })
        : buildRentReminderComponents({
            tenantName: params.tenantName,
            unitNumber: params.unitNumber,
            propertyName: params.propertyName,
            amount: params.amount,
            dueDate: params.dueDate,
          }),
    });

    const renderedMessage = waTemplate
      ? renderTemplate(waTemplate.body_template, params)
      : params.reminderType === "rent_overdue"
        ? getDefaultEmailBody(params, langCode)
        : `${params.reminderType} reminder to ${params.tenantName}`;

    await supabase.from("reminder_logs").insert({
      tenant_id: params.tenantId,
      reminder_type: params.reminderType,
      channel: "whatsapp",
      template_name: metaTemplateName,
      message_content: renderedMessage,
      status: whatsappResult.success ? "sent" : "failed",
      sent_at: new Date().toISOString(),
      error_message: whatsappResult.error || null,
    });
  }

  // Send Email
  if (params.email) {
    // Look up custom email template
    const emailTemplate = templateIndex.get(
      `${params.reminderType}:email:${langCode}`
    );

    const subject = emailTemplate?.subject
      ? renderTemplate(emailTemplate.subject, params)
      : getDefaultEmailSubject(params.reminderType, langCode);

    const bodyContent = emailTemplate
      ? renderTemplate(emailTemplate.body_template, params)
      : getDefaultEmailBody(params, langCode);

    const emailResult = await sendEmail({
      to: params.email,
      subject,
      html: buildReminderEmailHtml({
        tenantName: params.tenantName,
        bodyContent: bodyContent.replace(/\n/g, "<br>"),
        isRtl: langCode === "ar",
      }),
    });

    await supabase.from("reminder_logs").insert({
      tenant_id: params.tenantId,
      reminder_type: params.reminderType,
      channel: "email",
      template_name: emailTemplate?.name || `${params.reminderType}_${langCode}`,
      message_content: bodyContent.slice(0, 200),
      status: emailResult.success ? "sent" : "failed",
      sent_at: new Date().toISOString(),
      error_message: emailResult.error || null,
    });
  }
}

// ── Default fallbacks (used when no custom template exists) ──

function getDefaultEmailSubject(type: string, lang: string): string {
  const subjects: Record<string, Record<string, string>> = {
    rent_upcoming: {
      en: "Rent Payment Reminder - MPIRE",
      ar: "\u062A\u0630\u0643\u064A\u0631 \u0628\u062F\u0641\u0639 \u0627\u0644\u0625\u064A\u062C\u0627\u0631 - MPIRE",
    },
    rent_overdue: {
      en: "Overdue Rent Notice - MPIRE",
      ar: "\u0625\u0634\u0639\u0627\u0631 \u062A\u0623\u062E\u0631 \u0627\u0644\u0625\u064A\u062C\u0627\u0631 - MPIRE",
    },
    cheque_due: {
      en: "Cheque Due Reminder - MPIRE",
      ar: "\u062A\u0630\u0643\u064A\u0631 \u0628\u0627\u0633\u062A\u062D\u0642\u0627\u0642 \u0627\u0644\u0634\u064A\u0643 - MPIRE",
    },
    lease_expiry: {
      en: "Lease Expiry Notice - MPIRE",
      ar: "\u0625\u0634\u0639\u0627\u0631 \u0627\u0646\u062A\u0647\u0627\u0621 \u0639\u0642\u062F \u0627\u0644\u0625\u064A\u062C\u0627\u0631 - MPIRE",
    },
  };
  return subjects[type]?.[lang] || subjects[type]?.en || "MPIRE Notification";
}

function getDefaultEmailBody(params: ReminderParams, lang: string): string {
  if (lang === "ar") {
    switch (params.reminderType) {
      case "rent_upcoming":
        return `\u0639\u0632\u064A\u0632\u064A/\u0639\u0632\u064A\u0632\u062A\u064A ${params.tenantName}\u060C\n\n\u0647\u0630\u0627 \u062A\u0630\u0643\u064A\u0631 \u0628\u0623\u0646 \u0625\u064A\u062C\u0627\u0631 \u0627\u0644\u0648\u062D\u062F\u0629 ${params.unitNumber} \u0641\u064A ${params.propertyName} \u0628\u0645\u0628\u0644\u063A ${params.amount} \u0631.\u0639. \u064A\u0633\u062A\u062D\u0642 \u0641\u064A ${params.dueDate}.\n\n\u064A\u0631\u062C\u0649 \u0627\u0644\u062A\u0623\u0643\u062F \u0645\u0646 \u0627\u0644\u062F\u0641\u0639 \u0641\u064A \u0627\u0644\u0645\u0648\u0639\u062F \u0627\u0644\u0645\u062D\u062F\u062F.`;
      case "rent_overdue": {
        const detailsAr = buildOverdueDetails(params.overdueInvoices, "ar");
        let msgAr = `\u0639\u0632\u064A\u0632\u064A/\u0639\u0632\u064A\u0632\u062A\u064A ${params.tenantName}\u060C\n\n\u0646\u0648\u062F \u0625\u0628\u0644\u0627\u063A\u0643\u0645 \u0628\u0623\u0646 \u0625\u064A\u062C\u0627\u0631 \u0627\u0644\u0648\u062D\u062F\u0629 ${params.unitNumber} \u0641\u064A ${params.propertyName} \u0645\u062A\u0623\u062E\u0631.`;
        if (detailsAr) {
          msgAr += `\n\n\u0627\u0644\u0645\u0628\u0627\u0644\u063A \u0627\u0644\u0645\u0633\u062A\u062D\u0642\u0629:\n${detailsAr}\n\n\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A: ${params.totalOverdue || params.amount} \u0631.\u0639.`;
        } else {
          msgAr += ` \u0628\u0645\u0628\u0644\u063A ${params.amount} \u0631.\u0639. \u0643\u0627\u0646 \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642 ${params.dueDate}.`;
        }
        msgAr += `\n\n\u064A\u0631\u062C\u0649 \u062A\u0633\u0648\u064A\u0629 \u0627\u0644\u0645\u0628\u0644\u063A \u0641\u064A \u0623\u0642\u0631\u0628 \u0648\u0642\u062A \u0645\u0645\u0643\u0646.`;
        return msgAr;
      }
      case "cheque_due":
        return `\u0639\u0632\u064A\u0632\u064A/\u0639\u0632\u064A\u0632\u062A\u064A ${params.tenantName}\u060C\n\n\u0647\u0630\u0627 \u062A\u0630\u0643\u064A\u0631 \u0628\u0623\u0646 \u0627\u0644\u0634\u064A\u0643 \u0631\u0642\u0645 ${params.chequeNumber || ""} \u0628\u0645\u0628\u0644\u063A ${params.amount} \u0631.\u0639. \u064A\u0633\u062A\u062D\u0642 \u0641\u064A ${params.dueDate}.\n\n\u064A\u0631\u062C\u0649 \u0627\u0644\u062A\u0623\u0643\u062F \u0645\u0646 \u062A\u0648\u0641\u0631 \u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u0643\u0627\u0641\u064A.`;
      case "lease_expiry":
        return `\u0639\u0632\u064A\u0632\u064A/\u0639\u0632\u064A\u0632\u062A\u064A ${params.tenantName}\u060C\n\n\u0646\u0648\u062F \u0625\u0628\u0644\u0627\u063A\u0643\u0645 \u0628\u0623\u0646 \u0639\u0642\u062F \u0625\u064A\u062C\u0627\u0631 \u0627\u0644\u0648\u062D\u062F\u0629 ${params.unitNumber} \u0641\u064A ${params.propertyName} \u064A\u0646\u062A\u0647\u064A \u0641\u064A ${params.dueDate}.\n\n\u064A\u0631\u062C\u0649 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639\u0646\u0627 \u0644\u0645\u0646\u0627\u0642\u0634\u0629 \u062A\u062C\u062F\u064A\u062F \u0627\u0644\u0639\u0642\u062F.`;
      default:
        return "";
    }
  }

  switch (params.reminderType) {
    case "rent_upcoming":
      return `Dear ${params.tenantName},\n\nThis is a reminder that your rent of ${params.amount} ${CURRENCY.code} for unit ${params.unitNumber} at ${params.propertyName} is due on ${params.dueDate}.\n\nPlease ensure timely payment.`;
    case "rent_overdue": {
      const detailsEn = buildOverdueDetails(params.overdueInvoices, "en");
      let msgEn = `Dear ${params.tenantName},\n\nYour rent for unit ${params.unitNumber} at ${params.propertyName} is overdue.`;
      if (detailsEn) {
        msgEn += `\n\nOutstanding amounts:\n${detailsEn}\n\nTotal due: ${params.totalOverdue || params.amount} ${CURRENCY.code}`;
      } else {
        msgEn += ` The amount of ${params.amount} ${CURRENCY.code} was due on ${params.dueDate}.`;
      }
      msgEn += `\n\nPlease settle the amount at your earliest convenience.`;
      return msgEn;
    }
    case "cheque_due":
      return `Dear ${params.tenantName},\n\nThis is a reminder that cheque #${params.chequeNumber || ""} for ${params.amount} ${CURRENCY.code} is due on ${params.dueDate}.\n\nPlease ensure sufficient funds are available.`;
    case "lease_expiry":
      return `Dear ${params.tenantName},\n\nYour lease for unit ${params.unitNumber} at ${params.propertyName} is expiring on ${params.dueDate}.\n\nPlease contact us to discuss renewal options.`;
    default:
      return "";
  }
}
