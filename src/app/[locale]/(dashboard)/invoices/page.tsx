import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  FileText,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Receipt,
  Building2,
  Printer,
  CircleDot,
  Ban,
  FileX,
} from "lucide-react";
import { InvoicesTabs } from "@/components/invoices/invoices-tabs";
import { MarkPaidButton } from "@/components/invoices/mark-paid-button";
import { CancelInvoiceButton } from "@/components/invoices/cancel-invoice-button";
import { CreateInvoiceButton } from "@/components/invoices/create-invoice-button";
import { CURRENCY } from "@/lib/currency";

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; month?: string; page?: string; property?: string }>;
}) {
  const { locale } = await params;
  const { status, month, page, property } = await searchParams;
  const t = await getTranslations("invoices");
  const supabase = await createClient();

  // Property-level access control. Restricted users and the property filter
  // both apply through the joined units.property_id column, so the old
  // unit-ID prefetch round-trips are gone.
  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  const accessFilter =
    propertyIds !== null
      ? propertyIds.length > 0
        ? propertyIds
        : ["__no_access__"]
      : null;
  const needsUnitJoin = accessFilter !== null || Boolean(property);

  // Month boundaries for the filter (computed once, shared by all queries)
  let monthStart: string | null = null;
  let monthEnd: string | null = null;
  if (month) {
    const [year, mon] = month.split("-").map(Number);
    monthStart = `${year}-${String(mon).padStart(2, "0")}-01`;
    const lastDay = new Date(year, mon, 0).getDate();
    monthEnd = `${year}-${String(mon).padStart(2, "0")}-${lastDay}`;
  }

  // Fetch properties for filter dropdown
  let propertiesQuery = supabase.from("properties").select("id, name").eq("is_archived", false).order("name");
  if (accessFilter !== null) {
    propertiesQuery = propertiesQuery.in("id", accessFilter);
  }

  // Build query
  let query = supabase
    .from("invoices")
    .select(`
      *,
      tenants(full_name),
      units${needsUnitJoin ? "!inner" : ""}(unit_number, property_id, properties(name))
    `)
    .order("due_date", { ascending: false });

  if (status === "pending") {
    query = query.in("status", ["pending", "overdue", "partial"]);
  } else if (status === "paid") {
    query = query.eq("status", "paid");
  } else if (status === "resolved") {
    query = query.in("status", ["written_off", "cancelled"]);
  }

  if (monthStart && monthEnd) {
    query = query.gte("due_date", monthStart).lte("due_date", monthEnd);
  }

  if (accessFilter !== null) {
    query = query.in("units.property_id", accessFilter);
  }

  if (property) {
    query = query.eq("units.property_id", property);
  }

  // Pagination
  const PAGE_SIZE = 50;
  const currentPage = Math.max(1, parseInt(page || "1", 10));

  // Get total count for pagination
  let countQuery = supabase
    .from("invoices")
    .select(needsUnitJoin ? "*, units!inner(property_id)" : "*", {
      count: "exact",
      head: true,
    });

  if (status === "pending") {
    countQuery = countQuery.in("status", ["pending", "overdue", "partial"]);
  } else if (status === "paid") {
    countQuery = countQuery.eq("status", "paid");
  } else if (status === "resolved") {
    countQuery = countQuery.in("status", ["written_off", "cancelled"]);
  }
  if (monthStart && monthEnd) {
    countQuery = countQuery.gte("due_date", monthStart).lte("due_date", monthEnd);
  }
  if (accessFilter !== null) {
    countQuery = countQuery.in("units.property_id", accessFilter);
  }
  if (property) {
    countQuery = countQuery.eq("units.property_id", property);
  }

  // Build a summary query with the same filters (but no pagination) to get accurate totals
  let summaryQuery = supabase
    .from("invoices")
    .select(
      needsUnitJoin
        ? "amount, status, due_date, paid_amount, units!inner(property_id)"
        : "amount, status, due_date, paid_amount"
    );

  if (status === "pending") {
    summaryQuery = summaryQuery.in("status", ["pending", "overdue", "partial"]);
  } else if (status === "paid") {
    summaryQuery = summaryQuery.eq("status", "paid");
  } else if (status === "resolved") {
    summaryQuery = summaryQuery.in("status", ["written_off", "cancelled"]);
  }
  if (monthStart && monthEnd) {
    summaryQuery = summaryQuery.gte("due_date", monthStart).lte("due_date", monthEnd);
  }
  if (accessFilter !== null) {
    summaryQuery = summaryQuery.in("units.property_id", accessFilter);
  }
  if (property) {
    summaryQuery = summaryQuery.eq("units.property_id", property);
  }

  // Available months for the filter — only show up to current month
  const todayStr = new Date().toISOString().substring(0, 7);
  const monthsQuery = supabase
    .from("invoices")
    .select("due_date")
    .lte("due_date", new Date().toISOString().split("T")[0])
    .order("due_date", { ascending: false });

  // One parallel batch instead of five sequential round-trips
  const [
    { data: properties },
    { count: totalCount },
    { data: invoices },
    { data: summaryInvoices },
    { data: monthsRaw },
  ] = await Promise.all([
    propertiesQuery,
    countQuery,
    query.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1),
    summaryQuery,
    monthsQuery,
  ]);

  const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE);

  const availableMonths = Array.from(
    new Set(
      (monthsRaw || []).map((inv: { due_date: string }) =>
        inv.due_date.substring(0, 7)
      )
    )
  ).filter((m) => m <= todayStr);

  // Compute summary stats from ALL filtered invoices (not just current page).
  // Casts: the conditional select strings defeat the client's literal-type
  // parser; rows are consumed as loosely-typed records below anyway.
  const allInvoices = (invoices || []) as unknown as Record<string, unknown>[];
  const allSummary = (summaryInvoices || []) as unknown as {
    amount: string | number;
    status: string;
    due_date: string;
    paid_amount: string | number | null;
  }[];
  const now = new Date();
  const totalAmount = allSummary.reduce(
    (sum, inv) => sum + Number(inv.amount || 0),
    0
  );
  const paidAmount = allSummary
    .filter((inv) => (inv.status as string) === "paid")
    .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  const pendingCount = allSummary.filter(
    (inv) => (inv.status as string) === "pending"
  ).length;
  const pendingAmount = allSummary
    .filter((inv) => (inv.status as string) === "pending")
    .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  const overdueList = allSummary.filter(
    (inv) =>
      (inv.status as string) === "overdue" ||
      (inv.status as string) === "partial" ||
      ((inv.status as string) === "pending" &&
        new Date(inv.due_date as string) < now)
  );
  const overdueAmount = overdueList.reduce(
    (sum, inv) => sum + Number(inv.amount || 0) - Number(inv.paid_amount || 0),
    0
  );
  const collectionRate =
    totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

  function formatAmount(amount: number) {
    return amount.toLocaleString("en-OM", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(`${locale}-u-nu-latn`, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")}>
        <CreateInvoiceButton />
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
        {/* Total */}
        <div className="group relative bg-surface border border-border rounded-xl p-4 overflow-hidden transition-all duration-300 hover:border-accent/30">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <Receipt className="h-4 w-4 text-accent" />
              </div>
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                {t("total")}
              </span>
            </div>
            <p className="text-xl font-bold text-text-primary font-mono tabular-nums">
              {formatAmount(totalAmount)}
              <span className="text-xs font-sans font-normal text-text-secondary ms-1">
                {CURRENCY.code}
              </span>
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {allSummary.length} {t("title").toLowerCase()}
            </p>
          </div>
        </div>

        {/* Collected */}
        <div className="group relative bg-surface border border-border rounded-xl p-4 overflow-hidden transition-all duration-300 hover:border-success/30">
          <div className="absolute inset-0 bg-gradient-to-br from-success/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                {t("collected")}
              </span>
            </div>
            <p className="text-xl font-bold text-success font-mono tabular-nums">
              {formatAmount(paidAmount)}
              <span className="text-xs font-sans font-normal text-text-secondary ms-1">
                {CURRENCY.code}
              </span>
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <TrendingUp className="h-3 w-3 text-success" />
              <span className="text-xs font-medium text-success">
                {collectionRate}%
              </span>
              <span className="text-xs text-text-secondary">{t("collected").toLowerCase()}</span>
            </div>
          </div>
        </div>

        {/* Pending */}
        <div className="group relative bg-surface border border-border rounded-xl p-4 overflow-hidden transition-all duration-300 hover:border-warning/30">
          <div className="absolute inset-0 bg-gradient-to-br from-warning/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-warning" />
              </div>
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                {t("pending")}
              </span>
            </div>
            <p className="text-xl font-bold text-warning font-mono tabular-nums">
              {formatAmount(pendingAmount)}
              <span className="text-xs font-sans font-normal text-text-secondary ms-1">
                {CURRENCY.code}
              </span>
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {pendingCount} {t("pending").toLowerCase()}
            </p>
          </div>
        </div>

        {/* Overdue */}
        <div className="group relative bg-surface border border-border rounded-xl p-4 overflow-hidden transition-all duration-300 hover:border-destructive/30">
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                {t("overdue")}
              </span>
            </div>
            <p className="text-xl font-bold text-destructive font-mono tabular-nums">
              {formatAmount(overdueAmount)}
              <span className="text-xs font-sans font-normal text-text-secondary ms-1">
                {CURRENCY.code}
              </span>
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {overdueList.length} {t("overdue").toLowerCase()}
            </p>
          </div>
        </div>
      </div>

      {/* Property Filter */}
      {properties && properties.length > 1 && (
        <div className="-mx-4 md:mx-0 px-4 md:px-0 overflow-x-auto md:overflow-visible">
          <div className="flex items-center gap-2 w-max md:w-auto md:flex-wrap">
            <Building2 className="h-4 w-4 text-text-secondary shrink-0" />
            <Link
              href={`/${locale}/invoices${status ? `?status=${status}` : ""}${month ? `${status ? "&" : "?"}month=${month}` : ""}`}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                !property
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
              }`}
            >
              {t("allProperties")}
            </Link>
            {properties.map((p: Record<string, unknown>) => (
              <Link
                key={p.id as string}
                href={`/${locale}/invoices?property=${p.id as string}${status ? `&status=${status}` : ""}${month ? `&month=${month}` : ""}`}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                  property === (p.id as string)
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                }`}
              >
                {p.name as string}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <InvoicesTabs
        invoices={allInvoices}
        availableMonths={availableMonths}
        currentStatus={status || "all"}
        currentMonth={month || ""}
        currentProperty={property || ""}
        locale={locale}
      />

      {/* Table */}
      {allInvoices.length > 0 ? (
        <div className="bg-surface border border-border rounded-xl overflow-hidden animate-fade-in">
          {/* Collection progress bar */}
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary">
                {t("collectionProgress")}
              </span>
              <span className="text-xs font-mono font-medium text-accent tabular-nums">
                {collectionRate}%
              </span>
            </div>
            <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${collectionRate}%`,
                  background:
                    "linear-gradient(90deg, var(--accent), var(--success))",
                }}
              />
            </div>
          </div>

          {/* Desktop table — hidden on mobile in favor of card list below */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-t border-b border-border">
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3">
                    {t("dueDate")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3">
                    {t("tenant")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3">
                    {t("property")} / {t("unit")}
                  </th>
                  <th className="text-end text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3">
                    {t("amount")}
                  </th>
                  <th className="text-center text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3">
                    {t("status")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3">
                    {t("paidAt")}
                  </th>
                  <th className="text-end text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {allInvoices.map(
                  (invoice: Record<string, unknown>, index: number) => {
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
                    const isOverdue =
                      invoiceStatus === "overdue" ||
                      (invoiceStatus === "pending" &&
                        new Date(invoice.due_date as string) < now);
                    const isPaid = invoiceStatus === "paid";
                    const isPartial = invoiceStatus === "partial";
                    const isWrittenOff = invoiceStatus === "written_off";
                    const isCancelled = invoiceStatus === "cancelled";

                    return (
                      <tr
                        key={invoice.id as string}
                        className={`group border-b border-border/20 last:border-0 transition-colors duration-150 ${
                          isOverdue
                            ? "bg-destructive/[0.04] hover:bg-destructive/[0.08]"
                            : "hover:bg-surface-elevated/40"
                        }`}
                        style={{
                          animationDelay: `${index * 20}ms`,
                        }}
                      >
                        {/* Due Date */}
                        <td className="px-5 py-3.5">
                          <span className="text-sm text-text-primary font-mono tabular-nums">
                            {formatDate(invoice.due_date as string)}
                          </span>
                        </td>

                        {/* Tenant */}
                        <td className="px-5 py-3.5">
                          <span className="text-sm font-medium text-text-primary">
                            {(tenant?.full_name as string) || "—"}
                          </span>
                        </td>

                        {/* Property / Unit — merged column */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-text-secondary">
                              {(property?.name as string) || "—"}
                            </span>
                            {unit?.unit_number ? (
                              <>
                                <span className="text-border">/</span>
                                <span className="text-sm font-mono text-text-primary">
                                  {unit?.unit_number as string}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="px-5 py-3.5 text-end">
                          <span
                            className={`text-sm font-semibold font-mono tabular-nums ${
                              isPaid
                                ? "text-text-secondary"
                                : isWrittenOff
                                ? "text-warning line-through"
                                : isCancelled
                                ? "text-text-secondary/50 line-through"
                                : isOverdue
                                ? "text-destructive"
                                : isPartial
                                ? "text-info"
                                : "text-text-primary"
                            }`}
                          >
                            {formatAmount(invoice.amount as number)}
                            <span className="text-[10px] font-normal text-text-secondary ms-0.5">
                              {CURRENCY.code}
                            </span>
                          </span>
                          {isPartial && (
                            <div className="mt-1">
                              <div className="flex items-center justify-end gap-1.5 text-[10px]">
                                <span className="text-success font-medium font-mono">
                                  {formatAmount(Number(invoice.paid_amount || 0))}
                                </span>
                                <span className="text-text-secondary">/</span>
                                <span className="text-text-secondary font-mono">
                                  {formatAmount(Number(invoice.amount))}
                                </span>
                              </div>
                              <div className="h-1 w-full bg-border/50 rounded-full mt-1 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-info transition-all"
                                  style={{ width: `${Math.round((Number(invoice.paid_amount || 0) / Number(invoice.amount)) * 100)}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-destructive font-medium mt-0.5 font-mono">
                                {t("remaining")}: {formatAmount(Number(invoice.amount) - Number(invoice.paid_amount || 0))}
                              </p>
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5 text-center">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md font-semibold bg-success/10 text-success border border-success/20">
                              <CheckCircle2 className="h-3 w-3" />
                              {t("paid")}
                            </span>
                          ) : isWrittenOff ? (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md font-semibold bg-warning/10 text-warning border border-warning/20">
                              <FileX className="h-3 w-3" />
                              {t("writtenOff")}
                            </span>
                          ) : isCancelled ? (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md font-semibold bg-surface-elevated text-text-secondary border border-border/30">
                              <Ban className="h-3 w-3" />
                              {t("cancelled")}
                            </span>
                          ) : isPartial ? (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md font-semibold bg-info/10 text-info border border-info/20">
                              <CircleDot className="h-3 w-3" />
                              {t("partial")}
                            </span>
                          ) : isOverdue ? (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md font-semibold bg-destructive/10 text-destructive border border-destructive/20 animate-pulse">
                              <AlertTriangle className="h-3 w-3" />
                              {t("overdue")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md font-semibold bg-warning/10 text-warning border border-warning/20">
                              <Clock className="h-3 w-3" />
                              {t("pending")}
                            </span>
                          )}
                        </td>

                        {/* Paid Date */}
                        <td className="px-5 py-3.5">
                          <span className="text-sm text-text-secondary font-mono tabular-nums">
                            {invoice.paid_date
                              ? formatDate(invoice.paid_date as string)
                              : "—"}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="px-5 py-3.5 text-end">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/api/invoices/${invoice.id}/pdf`}
                              target="_blank"
                              className="inline-flex items-center gap-1 h-7 px-2 text-text-secondary hover:text-accent text-xs rounded-md border border-border/50 hover:border-accent/30 transition-colors"
                              title={t("viewPdf")}
                            >
                              <Printer className="h-3 w-3" />
                            </Link>
                            {!isPaid && !isWrittenOff && !isCancelled && (
                              <>
                                <CancelInvoiceButton
                                  invoiceId={invoice.id as string}
                                  amount={String(invoice.amount)}
                                  paidAmount={String(invoice.paid_amount || 0)}
                                  tenantName={
                                    (tenant?.full_name as string) || "—"
                                  }
                                />
                                <MarkPaidButton
                                  invoiceId={invoice.id as string}
                                  amount={String(invoice.amount)}
                                  paidAmount={String(invoice.paid_amount || 0)}
                                  tenantName={
                                    (tenant?.full_name as string) || "—"
                                  }
                                  tenantId={invoice.tenant_id as string}
                                  periodStart={
                                    (invoice.period_start as string) || undefined
                                  }
                                  periodEnd={
                                    (invoice.period_end as string) || undefined
                                  }
                                  dueDate={
                                    (invoice.due_date as string) || undefined
                                  }
                                />
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile card list — same data, vertical layout for narrow screens */}
          <ul className="md:hidden divide-y divide-border/30">
            {allInvoices.map((invoice: Record<string, unknown>) => {
              const tenant = invoice.tenants as Record<string, unknown> | null;
              const unit = invoice.units as Record<string, unknown> | null;
              const property = unit?.properties as Record<string, unknown> | null;
              const invoiceStatus = invoice.status as string;
              const isOverdue =
                invoiceStatus === "overdue" ||
                (invoiceStatus === "pending" &&
                  new Date(invoice.due_date as string) < now);
              const isPaid = invoiceStatus === "paid";
              const isPartial = invoiceStatus === "partial";
              const isWrittenOff = invoiceStatus === "written_off";
              const isCancelled = invoiceStatus === "cancelled";

              const statusBadge = isPaid ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                  {t("paid")}
                </Badge>
              ) : isWrittenOff ? (
                <Badge variant="warning" className="gap-1">
                  <FileX aria-hidden="true" className="h-3 w-3" />
                  {t("writtenOff")}
                </Badge>
              ) : isCancelled ? (
                <Badge variant="secondary" className="gap-1">
                  <Ban aria-hidden="true" className="h-3 w-3" />
                  {t("cancelled")}
                </Badge>
              ) : isPartial ? (
                <Badge variant="default" className="gap-1 bg-info/12 text-info border-info/20">
                  <CircleDot aria-hidden="true" className="h-3 w-3" />
                  {t("partial")}
                </Badge>
              ) : isOverdue ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                  {t("overdue")}
                </Badge>
              ) : (
                <Badge variant="warning" className="gap-1">
                  <Clock aria-hidden="true" className="h-3 w-3" />
                  {t("pending")}
                </Badge>
              );

              return (
                <li
                  key={`m-${invoice.id as string}`}
                  className={`p-4 ${isOverdue ? "bg-destructive/5" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {(tenant?.full_name as string) || "—"}
                      </p>
                      <p className="text-xs text-text-secondary truncate mt-0.5">
                        {(property?.name as string) || "—"}
                        {unit?.unit_number ? ` · ${unit.unit_number as string}` : ""}
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p
                        className={`text-sm font-semibold font-mono tabular-nums ${
                          isPaid
                            ? "text-text-secondary"
                            : isWrittenOff
                            ? "text-warning line-through"
                            : isCancelled
                            ? "text-text-secondary/50 line-through"
                            : isOverdue
                            ? "text-destructive"
                            : isPartial
                            ? "text-info"
                            : "text-text-primary"
                        }`}
                      >
                        {formatAmount(invoice.amount as number)}{" "}
                        <span className="text-[10px] font-normal text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </p>
                      <p className="text-[11px] text-text-secondary font-mono tabular-nums mt-0.5">
                        {formatDate(invoice.due_date as string)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {statusBadge}
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/api/invoices/${invoice.id}/pdf`}
                        target="_blank"
                        className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border/50 px-2 text-text-secondary hover:text-accent hover:border-accent/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        aria-label={t("viewPdf")}
                      >
                        <Printer aria-hidden="true" className="h-3.5 w-3.5" />
                      </Link>
                      {!isPaid && !isWrittenOff && !isCancelled && (
                        <>
                          <CancelInvoiceButton
                            invoiceId={invoice.id as string}
                            amount={String(invoice.amount)}
                            paidAmount={String(invoice.paid_amount || 0)}
                            tenantName={(tenant?.full_name as string) || "—"}
                          />
                          <MarkPaidButton
                            invoiceId={invoice.id as string}
                            amount={String(invoice.amount)}
                            paidAmount={String(invoice.paid_amount || 0)}
                            tenantName={(tenant?.full_name as string) || "—"}
                            tenantId={invoice.tenant_id as string}
                            periodStart={(invoice.period_start as string) || undefined}
                            periodEnd={(invoice.period_end as string) || undefined}
                            dueDate={(invoice.due_date as string) || undefined}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-text-secondary">
              {allSummary.length} {t("title").toLowerCase()}
            </span>
            <span className="text-xs font-mono font-medium text-text-secondary tabular-nums">
              {t("total")}: {formatAmount(totalAmount)} {CURRENCY.code}
            </span>
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl={`/${locale}/invoices`}
            searchParams={{
              ...(status ? { status } : {}),
              ...(month ? { month } : {}),
              ...(property ? { property } : {}),
            }}
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl p-16 text-center">
          <div className="mx-auto w-14 h-14 rounded-xl bg-surface-elevated flex items-center justify-center mb-4">
            <FileText className="h-7 w-7 text-text-secondary/40" />
          </div>
          <h3 className="text-base font-semibold text-text-primary font-display mb-1">
            {t("noInvoices")}
          </h3>
          <p className="text-sm text-text-secondary max-w-xs mx-auto">
            {t("noInvoicesDescription")}
          </p>
        </div>
      )}
    </div>
  );
}
