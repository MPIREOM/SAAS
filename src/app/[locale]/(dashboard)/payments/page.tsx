import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { CreditCard, Plus, AlertTriangle } from "lucide-react";

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("payments");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  const { data: payments } = await supabase
    .from("payments")
    .select(`
      *,
      tenants(full_name),
      leases(
        unit_id,
        units(unit_number, property_id, properties(name))
      )
    `)
    .order("payment_date", { ascending: false })
    .limit(100);

  const methodLabels: Record<string, string> = {
    cash: t("methods.cash"),
    bank_transfer: t("methods.bankTransfer"),
    cheque: t("methods.cheque"),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {t("title")}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {t("subtitle")}
          </p>
        </div>
        <Link
          href={`/${locale}/payments/new`}
          className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("logPayment")}
        </Link>
      </div>

      {payments && payments.length > 0 ? (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("date")}
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
                  {t("method")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("reference")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((payment: Record<string, unknown>) => {
                const tenant = payment.tenants as Record<string, unknown> | null;
                const lease = payment.leases as Record<string, unknown> | null;
                const unit = lease?.units as Record<string, unknown> | null;
                const property = unit?.properties as Record<string, unknown> | null;

                return (
                  <tr
                    key={payment.id as string}
                    className="hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-text-primary font-mono ltr-nums">
                      {payment.payment_date as string}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary">
                      {tenant?.full_name as string || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {property?.name as string || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary font-mono">
                      {unit?.unit_number as string || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary font-mono ltr-nums">
                      {payment.amount as number} OMR
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary capitalize">
                      {methodLabels[(payment.method as string) || "cash"] || String(payment.method)}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary font-mono">
                      {(payment.reference_number as string) || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <CreditCard className="h-10 w-10 text-text-secondary/40 mx-auto mb-3" />
          <h3 className="text-base font-medium text-text-primary mb-1">
            {t("noPayments")}
          </h3>
          <p className="text-sm text-text-secondary mb-4">
            {t("noPaymentsDescription")}
          </p>
          <Link
            href={`/${locale}/payments/new`}
            className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("logPayment")}
          </Link>
        </div>
      )}
    </div>
  );
}
