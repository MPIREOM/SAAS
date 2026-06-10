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
import { checkBearer } from "@/lib/crypto/safe-compare";

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

    // Super-admin CC: every active admin_notification_recipients row with a
    // WhatsApp number receives a copy of every owner's report. Fetched once
    // since the list is identical for all owners.
    const { data: adminRows, error: adminErr } = await supabase
      .from("admin_notification_recipients")
      .select("name, phone, notify_whatsapp")
      .eq("is_active", true)
      .eq("notify_whatsapp", true);
    if (adminErr) {
      console.error(`[${CRON_NAME}] admin recipients query failed:`, adminErr.message);
    }
    const seenCcPhones = new Set<string>();
    const ccRecipients = (adminRows || [])
      .map((r: Record<string, unknown>) => ({
        name: (r.name as string) || "Admin",
        phone: typeof r.phone === "string" ? r.phone.replace(/[^\d]/g, "") : "",
      }))
      .filter((r: { name: string; phone: string }) => {
        if (r.phone.length < 8 || seenCcPhones.has(r.phone)) return false;
        seenCcPhones.add(r.phone);
        return true;
      });

    const perOwner: Array<Record<string, unknown>> = [];
    let sent = 0;
    let errors = 0;
    let ccSent = 0;
    let ccErrors = 0;

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
        const bodyParameters = [
          ownerName,
          report.monthLabel,
          balanceCaption(report.balance.side, ownerName, report.balance.balance),
        ].map(sanitiseTemplateParam);

        const send = await sendWhatsAppDocumentTemplate({
          to: phone,
          templateName: TEMPLATE_NAME,
          languageCode: TEMPLATE_LANGUAGE,
          bodyParameters,
          documentLink: publicUrl,
          filename,
        });

        // Send a copy to each super-admin recipient. Done independently of the
        // owner send result so the admin still receives the report even when
        // the owner's own number is broken. Skip a recipient whose number is
        // the owner's own number (they already received it above).
        let ccDelivered = 0;
        const ccFailures: Array<Record<string, unknown>> = [];
        for (const cc of ccRecipients) {
          if (cc.phone === phone) continue;
          const ccSend = await sendWhatsAppDocumentTemplate({
            to: cc.phone,
            templateName: TEMPLATE_NAME,
            languageCode: TEMPLATE_LANGUAGE,
            bodyParameters,
            documentLink: publicUrl,
            filename,
          });
          if (ccSend.success) {
            ccSent++;
            ccDelivered++;
          } else {
            ccErrors++;
            ccFailures.push({ phone: cc.phone, error: ccSend.error || "send_failed" });
          }
        }

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
            ccDelivered,
            ...(ccFailures.length > 0 ? { ccFailures } : {}),
          });
        } else {
          errors++;
          perOwner.push({
            ownerId,
            ownerName,
            phone,
            error: send.error || "send_failed",
            ccDelivered,
            ...(ccFailures.length > 0 ? { ccFailures } : {}),
          });
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
      ccRecipients: ccRecipients.length,
      sent,
      errors,
      ccSent,
      ccErrors,
      perOwner,
    };
    const status: "success" | "error" = sent + ccSent > 0 ? "success" : "error";
    console.log(
      `[${CRON_NAME}] Done: sent=${sent} errors=${errors} ccSent=${ccSent} ccErrors=${ccErrors}`,
    );
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
  if (!checkBearer(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const result = await runOwnerReports(supabase, "scheduled");
  return NextResponse.json(result);
}
