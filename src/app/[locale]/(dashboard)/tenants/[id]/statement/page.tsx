import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FileText, Printer, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { CURRENCY } from "@/lib/currency";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";

interface LedgerEntry {
  date: string;
  description: string;
  charge: number;
  payment: number;
  balance: number;
  type: "charge" | "payment";
}

export default async function TenantStatementPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: tenantId } = await params;
  const t = await getTranslations("tenants");
  const tc = await getTranslations("common");
  const tr = await getTranslations("reports");
  const supabase = await createClient();

  // Fetch tenant
  const { data: tenant } = await supabase
    .from("tenants")
    .select("full_name, phone, email")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title={t("notFound")}
        className="my-8"
      />
    );
  }

  // Fetch all invoices for this tenant
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, amount, paid_amount, due_date, status, period_start, period_end, units!inner(unit_number, properties!inner(name))")
    .eq("tenant_id", tenantId)
    .order("due_date", { ascending: true });

  // Fetch all payments for this tenant
  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, payment_date, method, reference_number")
    .eq("tenant_id", tenantId)
    .order("payment_date", { ascending: true });

  // Build ledger entries
  const entries: LedgerEntry[] = [];

  const formatMethod = (m: string) => m === "bank_transfer" ? "Bank Transfer" : m === "cash" ? "Cash" : m === "cheque" ? "Cheque" : m === "direct_debit" ? "Direct Debit" : m;

  (invoices || []).forEach((inv) => {
    const unit = inv.units as unknown as { unit_number: string; properties: { name: string } };
    const paidAmt = parseFloat((inv.paid_amount as string) || "0");
    const totalAmt = parseFloat(inv.amount as string);
    const statusNote = inv.status === "partial"
      ? ` [Partial: ${paidAmt.toLocaleString()}/${totalAmt.toLocaleString()} ${CURRENCY.code}]`
      : inv.status === "overdue"
      ? " [Overdue]"
      : "";
    entries.push({
      date: inv.due_date,
      description: `Rent - ${unit.properties.name} Unit ${unit.unit_number}${inv.period_start ? ` (${inv.period_start} to ${inv.period_end})` : ""}${statusNote}`,
      charge: totalAmt,
      payment: 0,
      balance: 0,
      type: "charge",
    });
  });

  (payments || []).forEach((pay) => {
    entries.push({
      date: pay.payment_date,
      description: `Payment (${formatMethod(pay.method || "")})${pay.reference_number ? ` - Ref: ${pay.reference_number}` : ""}`,
      charge: 0,
      payment: parseFloat(pay.amount as string),
      balance: 0,
      type: "payment",
    });
  });

  // Sort by date
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate running balance
  let runningBalance = 0;
  entries.forEach((entry) => {
    runningBalance += entry.charge - entry.payment;
    entry.balance = Math.round(runningBalance * 100) / 100;
  });

  const totalCharges = entries.reduce((sum, e) => sum + e.charge, 0);
  const totalPayments = entries.reduce((sum, e) => sum + e.payment, 0);
  const outstandingBalance = Math.round((totalCharges - totalPayments) * 100) / 100;

  const summaryCards = [
    {
      label: t("totalCharges"),
      value: totalCharges,
      icon: TrendingUp,
      valueClass: "text-text-primary",
      cardClass: "border-border",
      iconClass: "text-text-secondary bg-surface-elevated",
    },
    {
      label: t("totalPayments"),
      value: totalPayments,
      icon: TrendingDown,
      valueClass: "text-success",
      cardClass: "border-border",
      iconClass: "text-success bg-success-tint",
    },
    {
      label: t("outstandingBalance"),
      value: outstandingBalance,
      icon: Scale,
      valueClass: outstandingBalance > 0 ? "text-destructive" : "text-success",
      cardClass:
        outstandingBalance > 0 ? "border-destructive/30" : "border-success/30",
      iconClass:
        outstandingBalance > 0
          ? "text-destructive bg-destructive-tint"
          : "text-success bg-success-tint",
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <PageHeader
        title={t("statement")}
        description={tenant.full_name}
        breadcrumbs={[
          { label: t("title"), href: `/${locale}/tenants` },
          { label: tenant.full_name, href: `/${locale}/tenants/${tenantId}` },
          { label: t("statement") },
        ]}
      >
        <Link
          href="#"
          className={buttonVariants({ variant: "secondary" })}
          title={tr("printHint")}
        >
          <Printer aria-hidden="true" className="h-4 w-4" />
          {tr("printReport")}
        </Link>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`bg-surface border rounded-xl p-4 ${card.cardClass}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[12.5px] font-medium text-text-secondary">
                  {card.label}
                </p>
                <div className={`p-1.5 rounded-lg ${card.iconClass}`}>
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                </div>
              </div>
              <p
                className={`text-2xl font-bold tabular-nums ltr-nums ${card.valueClass}`}
              >
                {card.value.toLocaleString()}
                <span className="text-xs font-sans font-normal text-text-secondary ms-1.5">
                  {CURRENCY.code}
                </span>
              </p>
            </div>
          );
        })}
      </div>

      {/* Ledger */}
      {entries.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title={t("noTransactions")}
        />
      ) : (
        <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">{tc("date")}</TableHead>
                  <TableHead className="px-4">{tc("description")}</TableHead>
                  <TableHead className="px-4 text-end">{t("charge")}</TableHead>
                  <TableHead className="px-4 text-end">{t("payment")}</TableHead>
                  <TableHead className="px-4 text-end">{t("balance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-4 whitespace-nowrap tabular-nums ltr-nums text-xs text-text-secondary">
                      {format(new Date(entry.date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="px-4 text-text-primary">
                      {entry.description}
                    </TableCell>
                    <TableCell className="px-4 text-end tabular-nums ltr-nums">
                      {entry.charge > 0 ? (
                        <span className="text-text-primary">
                          {entry.charge.toLocaleString()}{" "}
                          <span className="text-xs font-medium text-text-secondary">
                            {CURRENCY.code}
                          </span>
                        </span>
                      ) : (
                        <span className="text-text-tertiary">{"—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 text-end tabular-nums ltr-nums">
                      {entry.payment > 0 ? (
                        <span className="text-success">
                          {entry.payment.toLocaleString()}{" "}
                          <span className="text-xs font-medium text-text-secondary">
                            {CURRENCY.code}
                          </span>
                        </span>
                      ) : (
                        <span className="text-text-tertiary">{"—"}</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`px-4 text-end tabular-nums ltr-nums font-semibold ${
                        entry.balance > 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {entry.balance.toLocaleString()}{" "}
                      <span className="text-xs font-medium text-text-secondary">
                        {CURRENCY.code}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-border bg-surface-elevated hover:bg-surface-elevated">
                  <TableCell className="px-4 font-semibold text-text-primary" colSpan={2}>
                    {tc("total")}
                  </TableCell>
                  <TableCell className="px-4 text-end tabular-nums ltr-nums font-bold text-text-primary">
                    {totalCharges.toLocaleString()}{" "}
                    <span className="text-xs font-medium text-text-secondary">
                      {CURRENCY.code}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 text-end tabular-nums ltr-nums font-bold text-success">
                    {totalPayments.toLocaleString()}{" "}
                    <span className="text-xs font-medium text-text-secondary">
                      {CURRENCY.code}
                    </span>
                  </TableCell>
                  <TableCell
                    className={`px-4 text-end tabular-nums ltr-nums font-bold ${
                      outstandingBalance > 0 ? "text-destructive" : "text-success"
                    }`}
                  >
                    {outstandingBalance.toLocaleString()}{" "}
                    <span className="text-xs font-medium text-text-secondary">
                      {CURRENCY.code}
                    </span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <ul className="md:hidden divide-y divide-border">
            {entries.map((entry, i) => (
              <li key={`m-${i}`} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary leading-snug">
                      {entry.description}
                    </p>
                    <p className="text-xs text-text-secondary tabular-nums ltr-nums mt-1">
                      {format(new Date(entry.date), "dd MMM yyyy")}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-semibold tabular-nums ltr-nums text-end shrink-0 ${
                      entry.type === "payment" ? "text-success" : "text-text-primary"
                    }`}
                  >
                    {entry.type === "payment"
                      ? entry.payment.toLocaleString()
                      : entry.charge.toLocaleString()}{" "}
                    <span className="text-xs font-normal text-text-secondary">
                      {CURRENCY.code}
                    </span>
                  </p>
                </div>
                <p className="mt-2 text-xs text-text-secondary">
                  {t("balance")} ·{" "}
                  <span
                    className={`tabular-nums ltr-nums font-semibold ${
                      entry.balance > 0 ? "text-destructive" : "text-success"
                    }`}
                  >
                    {entry.balance.toLocaleString()} {CURRENCY.code}
                  </span>
                </p>
              </li>
            ))}
            <li className="p-4 bg-surface-elevated flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-text-primary">
                {tc("total")}
              </p>
              <p
                className={`text-sm font-bold tabular-nums ltr-nums text-end ${
                  outstandingBalance > 0 ? "text-destructive" : "text-success"
                }`}
              >
                {outstandingBalance.toLocaleString()} {CURRENCY.code}
              </p>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
