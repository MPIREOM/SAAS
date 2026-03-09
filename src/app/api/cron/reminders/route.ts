import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sendWhatsAppTemplate, buildRentReminderComponents } from "@/lib/whatsapp/client";
import { sendEmail, buildReminderEmailHtml } from "@/lib/email/client";
import { addDays, subDays, format, differenceInDays, parseISO } from "date-fns";

// Vercel Cron: runs daily at 8:00 AM (configured in vercel.json)
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

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  const results = {
    rentUpcoming: 0,
    rentOverdue: 0,
    chequeDue: 0,
    leaseExpiry: 0,
    errors: 0,
  };

  try {
    // 1. Upcoming rent reminders (3 days before due date)
    const { data: activeLeases } = await supabase
      .from("leases")
      .select(`
        *,
        tenants(id, full_name, phone, email, language_preference),
        units(unit_number, property_id, properties(name))
      `)
      .eq("is_active", true);

    if (activeLeases) {
      for (const lease of activeLeases) {
        const tenant = lease.tenants as Record<string, unknown>;
        const unit = lease.units as Record<string, unknown>;
        const property = unit?.properties as Record<string, unknown>;
        if (!tenant || !unit) continue;

        const dueDay = lease.payment_due_day || 1;
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const dueDate = new Date(currentYear, currentMonth, dueDay);
        const daysUntilDue = differenceInDays(dueDate, today);

        // Upcoming: 3 days before
        if (daysUntilDue === 3) {
          await sendReminder(supabase, {
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

        // Overdue: 1 day after, then every 3 days
        if (daysUntilDue < 0 && (Math.abs(daysUntilDue) === 1 || Math.abs(daysUntilDue) % 3 === 0)) {
          // Check if payment exists for this month
          const monthStart = format(new Date(currentYear, currentMonth, 1), "yyyy-MM-dd");
          const monthEnd = format(new Date(currentYear, currentMonth + 1, 0), "yyyy-MM-dd");

          const { count } = await supabase
            .from("payments")
            .select("*", { count: "exact", head: true })
            .eq("lease_id", lease.id)
            .gte("payment_date", monthStart)
            .lte("payment_date", monthEnd);

          if (!count || count === 0) {
            await sendReminder(supabase, {
              tenantId: tenant.id as string,
              tenantName: tenant.full_name as string,
              phone: tenant.phone as string,
              email: tenant.email as string,
              language: (tenant.language_preference as string) || "en",
              unitNumber: unit.unit_number as string,
              propertyName: (property?.name as string) || "",
              amount: String(lease.monthly_rent),
              dueDate: format(dueDate, "yyyy-MM-dd"),
              reminderType: "rent_overdue",
            });
            results.rentOverdue++;
          }
        }

        // Lease expiry: 60, 30, 7 days before
        const leaseEnd = parseISO(lease.end_date);
        const daysUntilExpiry = differenceInDays(leaseEnd, today);
        if ([60, 30, 7].includes(daysUntilExpiry)) {
          await sendReminder(supabase, {
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
    }

    // 2. Cheque due reminders (3 days before cheque date)
    const threeDaysFromNow = format(addDays(today, 3), "yyyy-MM-dd");
    const { data: dueCheques } = await supabase
      .from("cheques")
      .select(`*, tenants(id, full_name, phone, email, language_preference)`)
      .eq("status", "pending")
      .eq("cheque_date", threeDaysFromNow);

    if (dueCheques) {
      for (const cheque of dueCheques) {
        const tenant = cheque.tenants as Record<string, unknown>;
        if (!tenant) continue;

        await sendReminder(supabase, {
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
      }
    }
  } catch (error) {
    results.errors++;
    console.error("Cron reminder error:", error);
  }

  return NextResponse.json({
    success: true,
    timestamp: todayStr,
    results,
  });
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
}

async function sendReminder(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  params: ReminderParams
) {
  const templateMap: Record<string, string> = {
    rent_upcoming: "mpire_rent_upcoming",
    rent_overdue: "mpire_rent_overdue",
    cheque_due: "mpire_cheque_due",
    lease_expiry: "mpire_lease_expiry",
  };

  const langCode = params.language === "ar" ? "ar" : "en";
  const templateName = templateMap[params.reminderType];

  // Send WhatsApp
  if (params.phone) {
    const whatsappResult = await sendWhatsAppTemplate({
      to: params.phone.replace(/\D/g, ""),
      templateName: `${templateName}_${langCode}`,
      languageCode: langCode,
      components: buildRentReminderComponents({
        tenantName: params.tenantName,
        unitNumber: params.unitNumber,
        propertyName: params.propertyName,
        amount: params.amount,
        dueDate: params.dueDate,
      }),
    });

    await supabase.from("reminder_logs").insert({
      tenant_id: params.tenantId,
      reminder_type: params.reminderType,
      channel: "whatsapp",
      template_name: `${templateName}_${langCode}`,
      message_content: `${params.reminderType} reminder to ${params.tenantName}`,
      status: whatsappResult.success ? "sent" : "failed",
      sent_at: new Date().toISOString(),
      error_message: whatsappResult.error || null,
    });
  }

  // Send Email
  if (params.email) {
    const emailResult = await sendEmail({
      to: params.email,
      subject: getEmailSubject(params.reminderType, langCode),
      html: buildReminderEmailHtml({
        tenantName: params.tenantName,
        bodyContent: getEmailBody(params, langCode),
        isRtl: langCode === "ar",
      }),
    });

    await supabase.from("reminder_logs").insert({
      tenant_id: params.tenantId,
      reminder_type: params.reminderType,
      channel: "email",
      template_name: `${templateName}_${langCode}`,
      message_content: `${params.reminderType} email to ${params.tenantName}`,
      status: emailResult.success ? "sent" : "failed",
      sent_at: new Date().toISOString(),
      error_message: emailResult.error || null,
    });
  }
}

function getEmailSubject(type: string, lang: string): string {
  const subjects: Record<string, Record<string, string>> = {
    rent_upcoming: {
      en: "Rent Payment Reminder - MPIRE",
      ar: "تذكير بدفع الإيجار - MPIRE",
    },
    rent_overdue: {
      en: "Overdue Rent Notice - MPIRE",
      ar: "إشعار تأخر الإيجار - MPIRE",
    },
    cheque_due: {
      en: "Cheque Due Reminder - MPIRE",
      ar: "تذكير باستحقاق الشيك - MPIRE",
    },
    lease_expiry: {
      en: "Lease Expiry Notice - MPIRE",
      ar: "إشعار انتهاء عقد الإيجار - MPIRE",
    },
  };
  return subjects[type]?.[lang] || subjects[type]?.en || "MPIRE Notification";
}

function getEmailBody(params: ReminderParams, lang: string): string {
  if (lang === "ar") {
    switch (params.reminderType) {
      case "rent_upcoming":
        return `عزيزي/عزيزتي ${params.tenantName}،<br><br>هذا تذكير بأن إيجار الوحدة ${params.unitNumber} في ${params.propertyName} بمبلغ ${params.amount} ر.ع. يستحق في ${params.dueDate}.<br><br>يرجى التأكد من الدفع في الموعد المحدد.`;
      case "rent_overdue":
        return `عزيزي/عزيزتي ${params.tenantName}،<br><br>نود إبلاغكم بأن إيجار الوحدة ${params.unitNumber} في ${params.propertyName} بمبلغ ${params.amount} ر.ع. متأخر. كان تاريخ الاستحقاق ${params.dueDate}.<br><br>يرجى تسوية المبلغ في أقرب وقت ممكن.`;
      case "cheque_due":
        return `عزيزي/عزيزتي ${params.tenantName}،<br><br>هذا تذكير بأن الشيك رقم ${params.chequeNumber || ""} بمبلغ ${params.amount} ر.ع. يستحق في ${params.dueDate}.<br><br>يرجى التأكد من توفر الرصيد الكافي.`;
      case "lease_expiry":
        return `عزيزي/عزيزتي ${params.tenantName}،<br><br>نود إبلاغكم بأن عقد إيجار الوحدة ${params.unitNumber} في ${params.propertyName} ينتهي في ${params.dueDate}.<br><br>يرجى التواصل معنا لمناقشة تجديد العقد.`;
      default:
        return "";
    }
  }

  switch (params.reminderType) {
    case "rent_upcoming":
      return `Dear ${params.tenantName},<br><br>This is a reminder that your rent of ${params.amount} OMR for unit ${params.unitNumber} at ${params.propertyName} is due on ${params.dueDate}.<br><br>Please ensure timely payment.`;
    case "rent_overdue":
      return `Dear ${params.tenantName},<br><br>Your rent of ${params.amount} OMR for unit ${params.unitNumber} at ${params.propertyName} is overdue. The due date was ${params.dueDate}.<br><br>Please settle the amount at your earliest convenience.`;
    case "cheque_due":
      return `Dear ${params.tenantName},<br><br>This is a reminder that cheque #${params.chequeNumber || ""} for ${params.amount} OMR is due on ${params.dueDate}.<br><br>Please ensure sufficient funds are available.`;
    case "lease_expiry":
      return `Dear ${params.tenantName},<br><br>Your lease for unit ${params.unitNumber} at ${params.propertyName} is expiring on ${params.dueDate}.<br><br>Please contact us to discuss renewal options.`;
    default:
      return "";
  }
}
