import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  sanitiseTemplateParam,
  sendWhatsAppDocumentTemplate,
} from "@/lib/notifications/admin-notify";
import { CURRENCY } from "@/lib/currency";
import { getOwnerMonthlyReport } from "@/lib/owners/monthly-report-data";
import { renderMonthlyReportPdf } from "@/lib/owners/monthly-report-pdf";

// PDF rendering takes a few seconds per owner; keep the function generous so
// we can serve a portfolio of 10–20 owners without hitting Vercel's default
// 10s ceiling.
export const maxDuration = 60;

const CRON_NAME = "owner-reports";
const TEMPLATE_NAME = "owner_monthly_report";
const TEMPLATE_LANGUAGE = "en";
const STORAGE_BUCKET = "owner-reports";

function createSupabaseAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

async function logCronRun(
  supabase: SupabaseClient,
  status: "success" | "skipped" | "error",
  summary: Record<string, unknown>,
  errorMessage?: string,
) {
  try {
    await supabase.from("cron_run_logs").insert({
      cron_name: CRON_NAME,
      status,
      summary,
      error_message: errorMessage || null,
    });
  } catch (err) {
    console.error(`[${CRON_NAME}] Failed to write cron_run_logs entry:`, err);
  }
}

function balanceCaption(
  side: "company_owes_owner" | "owner_owes_company" | "settled",
  ownerName: string,
  amount: number,
): string {
  const abs = Math.abs(amount).toFixed(2);
  if (side === "company_owes_owner") return `+${abs} ${CURRENCY.code} (company owes ${ownerName})`;
  if (side === "owner_owes_company") return `-${abs} ${CURRENCY.code} (${ownerName} owes company)`;
  return `Settled (${ownerName})`;
}

export async function runOwnerReports(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  trigger: "scheduled" | "manual" = "scheduled",
) {
  const startedAt = new Date();
  console.log(`[${CRON_NAME}] Starting (${trigger}) at ${startedAt.toISOString()}`);

  try {
    // Recipients: every active owner with a whatsapp_phone. The user
    // explicitly scoped delivery to WhatsApp (no email branch), so owners
    // without a number are silently skipped.
    const { data: ownersRows, error: ownersErr } = await supabase
      .from("owners")
      .select("id, name, whatsapp_phone")
      .eq("is_active", true)
      .not("whatsapp_phone", "is", null);
    if (ownersErr) throw ownersErr;

    const eligible = (ownersRows || []).filter(
      (o: Record<string, unknown>) =>
        typeof o.whatsapp_phone === "string" && o.whatsapp_phone.replace(/[^\d]/g, "").length >= 8,
    );

    if (eligible.length === 0) {
      const summary = { trigger, eligibleOwners: 0, reason: "no_owners_with_whatsapp" };
      await logCronRun(supabase, "skipped", summary);
      return { status: "skipped" as const, summary };
    }

    const perOwner: Array<Record<string, unknown>> = [];
    let sent = 0;
    let errors = 0;

    for (const owner of eligible) {
      const ownerId = owner.id as string;
      const ownerName = (owner.name as string) || "Owner";
      try {
        const report = await getOwnerMonthlyReport(supabase, ownerId);
        if (!report) {
          errors++;
          perOwner.push({ ownerId, ownerName, error: "report_data_unavailable" });
          continue;
        }

        const pdfBuffer = await renderMonthlyReportPdf(report);

        // Path scheme: <ownerId>/<YYYY-MM>/<uuid>.pdf — owner-scoped folder
        // per month so re-runs don't accumulate forever in one prefix, plus
        // a UUID suffix so the public URL is unguessable in practice.
        const filename = `MPIRE-${report.monthLabel.replace(/\s+/g, "-")}.pdf`;
        const objectPath = `${ownerId}/${report.asOf.slice(0, 7)}/${randomUUID()}.pdf`;

        const upload = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(objectPath, pdfBuffer, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (upload.error) {
          errors++;
          perOwner.push({ ownerId, ownerName, error: `upload_failed: ${upload.error.message}` });
          continue;
        }

        const { data: pub } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(objectPath);
        const publicUrl = pub?.publicUrl;
        if (!publicUrl) {
          errors++;
          perOwner.push({ ownerId, ownerName, error: "no_public_url" });
          continue;
        }

        const phone = (owner.whatsapp_phone as string).replace(/[^\d]/g, "");
        const send = await sendWhatsAppDocumentTemplate({
          to: phone,
          templateName: TEMPLATE_NAME,
          languageCode: TEMPLATE_LANGUAGE,
          bodyParameters: [
            ownerName,
            report.monthLabel,
            balanceCaption(report.balance.side, ownerName, report.balance.balance),
          ].map(sanitiseTemplateParam),
          documentLink: publicUrl,
          filename,
        });

        if (send.success) {
          sent++;
          perOwner.push({
            ownerId,
            ownerName,
            phone,
            objectPath,
            defaultedInvoices: report.defaultedInvoices.length,
            expensesCount: report.expenses.length,
            transfersToOwner: report.transfersToOwner.length,
            transfersToCompany: report.transfersToCompany.length,
            balance: report.balance.balance,
          });
        } else {
          errors++;
          perOwner.push({ ownerId, ownerName, phone, error: send.error || "send_failed" });
        }
      } catch (err) {
        errors++;
        perOwner.push({
          ownerId,
          ownerName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const summary: Record<string, unknown> = {
      trigger,
      eligibleOwners: eligible.length,
      sent,
      errors,
      perOwner,
    };
    const status: "success" | "error" = sent > 0 ? "success" : "error";
    console.log(`[${CRON_NAME}] Done: sent=${sent} errors=${errors}`);
    await logCronRun(supabase, status, summary);
    return { status, summary };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[${CRON_NAME}] Unhandled error:`, error);
    await logCronRun(supabase, "error", { trigger }, error);
    return { status: "error" as const, summary: { trigger }, error };
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const result = await runOwnerReports(supabase, "scheduled");
  return NextResponse.json(result);
}
