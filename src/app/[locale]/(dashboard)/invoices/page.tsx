import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { InvoicesTabs } from "@/components/invoices/invoices-tabs";
import { MarkPaidButton } from "@/components/invoices/mark-paid-button";

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; month?: string }>;
}) {
  const { locale } = await params;
  const { status, month } = await searchParams;
  const t = await getTranslations("invoices");
  const supabase = await createClient();

  // Build query - unit_id is directly on invoices table
  let query = supabase
    .from("invoices")
    .select(`
      *,
      tenants(full_name),
      units(unit_number, properties(name))
    `)
    .order("due_date", { ascending: false });

  // Filter by status
  if (status === "pending") {
    query = query.in("status", ["pending", "overdue"]);
  } else if (status === "paid") {
    query = query.eq("status", "paid");
  }

  // Filter by month (format: YYYY-MM)
  if (month) {
    const [year, mon] = month.split("-").map(Number);
    const monthStart = `${year}-${String(mon).padStart(2, "0")}-01`;
    const lastDay = new Date(year, mon, 0).getDate();
    const monthEnd = `${year}-${String(mon).padStart(2, "0")}-${lastDay}`;
    query = query.gte("due_date", monthStart).lte("due_date", monthEnd);
  }

  const { data: invoices } = await query.limit(200);

  // Get available months for filter
  const { data: monthsRaw } = await supabase
    .from("invoices")
    .select("due_date")
    .order("due_date", { ascending: false });

  const availableMonths = Array.from(
    new Set(
      (monthsRaw || []).map((inv: { due_date: string }) =>
        inv.due_date.substring(0, 7)
      )
    )
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary mt-1">{t("subtitle")}</p>
      </div>

      <InvoicesTabs
        invoices={invoices || []}
        availableMonths={availableMonths}
        currentStatus={status || "all"}
        currentMonth={month || ""}
        locale={locale}
      />

      {invoices && invoices.length > 0 ? (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("dueDate")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("tenant")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("property")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("unit")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("amount")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("status")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("paidAt")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((invoice: Record<string, unknown>) => {
                const tenant = invoice.tenants as Record<
                  string,
                  unknown
                > | null;
                const unit = invoice.units as Record<
                  string,
                  unknown
                > | null;
                const property = unit?.properties as Record<
                  string,
                  unknown
                > | null;
                const invoiceStatus = invoice.status as string;
                const isOverdue = invoiceStatus === "overdue" ||
                  (invoiceStatus === "pending" &&
                    new Date(invoice.due_date as string) < new Date());

                return (
                  <tr
                    key={invoice.id as string}
                    className="hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-text-primary font-mono ltr-nums">
                      {invoice.due_date as string}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary">
                      {(tenant?.full_name as string) || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {(property?.name as string) || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary font-mono">
                      {(unit?.unit_number as string) || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary font-mono ltr-nums">
                      {invoice.amount as number} OMR
                    </td>
                    <td className="px-4 py-3">
                      {invoiceStatus === "paid" ? (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-success/10 text-success">
                          {t("paid")}
                        </span>
                      ) : isOverdue ? (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-destructive/10 text-destructive">
                          {t("overdue")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-warning/10 text-warning">
                          {t("pending")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary font-mono ltr-nums">
                      {(invoice.paid_date as string) || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {invoiceStatus !== "paid" && (
                        <MarkPaidButton
                          invoiceId={invoice.id as string}
                          amount={String(invoice.amount)}
                          tenantName={(tenant?.full_name as string) || "—"}
                          tenantId={invoice.tenant_id as string}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <FileText className="h-10 w-10 text-text-secondary/40 mx-auto mb-3" />
          <h3 className="text-base font-medium text-text-primary mb-1">
            {t("noInvoices")}
          </h3>
          <p className="text-sm text-text-secondary">
            {t("noInvoicesDescription")}
          </p>
        </div>
      )}
    </div>
  );
}
